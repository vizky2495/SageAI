import { storage } from "./storage";
import type {
  JourneyInteraction,
  InsertContactJourney,
  InsertJourneyPattern,
  InsertStageTransition,
  InsertAssetJourneyStat,
  InsertJourneyStageFlow,
} from "@shared/schema";

export interface JourneyBuildProgress {
  status: "idle" | "building" | "complete" | "error";
  phase: string;
  currentStep: number;
  totalSteps: number;
  message: string;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  result: {
    contactsProcessed: number;
    patternsFound: number;
    transitionsFound: number;
    assetStatsComputed: number;
  } | null;
}

let buildProgress: JourneyBuildProgress = {
  status: "idle",
  phase: "",
  currentStep: 0,
  totalSteps: 0,
  message: "",
  startedAt: null,
  completedAt: null,
  error: null,
  result: null,
};

export function getJourneyBuildProgress(): JourneyBuildProgress {
  return { ...buildProgress };
}

function updateProgress(updates: Partial<JourneyBuildProgress>) {
  buildProgress = { ...buildProgress, ...updates };
}

function determineOutcome(interactions: JourneyInteraction[]): { outcome: string; outcomeDate: Date | null } {
  for (const ix of [...interactions].reverse()) {
    const type = (ix.interactionType || "").toLowerCase();
    const status = (ix.leadStatus || "").toLowerCase();
    if (type.includes("trial") || type.includes("demo_request")) {
      return { outcome: "sqo", outcomeDate: ix.interactionTimestamp };
    }
    if (status.includes("sqo") || status.includes("sql") || status.includes("opportunity")) {
      return { outcome: "sqo", outcomeDate: ix.interactionTimestamp };
    }
    if (status.includes("mql") || status.includes("marketing qualified")) {
      return { outcome: "mql", outcomeDate: ix.interactionTimestamp };
    }
    if (status.includes("lead") || type.includes("form_submit")) {
      return { outcome: "lead", outcomeDate: ix.interactionTimestamp };
    }
  }
  return { outcome: "unknown", outcomeDate: null };
}

function getMostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  return best;
}

export async function buildJourneySummaries(batchId?: string): Promise<void> {
  if (buildProgress.status === "building") {
    console.log("Journey build already in progress, queuing rebuild after completion");
    return;
  }

  updateProgress({
    status: "building",
    phase: "Fetching contacts",
    currentStep: 0,
    totalSteps: 5,
    message: "Fetching distinct contacts...",
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    result: null,
  });

  try {
    const allContactHashes = await storage.getDistinctContactHashes();
    const totalContacts = allContactHashes.length;

    updateProgress({
      phase: "Building contact journeys",
      currentStep: 1,
      message: `Processing 0 of ${totalContacts.toLocaleString()} contacts...`,
    });

    await storage.clearContactJourneys();

    const CONTACT_BATCH_SIZE = 1000;
    const allContactJourneys: InsertContactJourney[] = [];
    const perAssetStages: Array<{ contactHash: string; assetStages: Array<{ assetId: string; stage: string }>; outcome: string; firstTouchDate: Date | null; lastTouchDate: Date | null }> = [];
    let contactsProcessed = 0;

    for (let i = 0; i < allContactHashes.length; i += CONTACT_BATCH_SIZE) {
      const batch = allContactHashes.slice(i, i + CONTACT_BATCH_SIZE);
      const interactions = await storage.getJourneyInteractionsByContacts(batch);

      const byContact = new Map<string, JourneyInteraction[]>();
      for (const ix of interactions) {
        const list = byContact.get(ix.contactHash) || [];
        list.push(ix);
        byContact.set(ix.contactHash, list);
      }

      for (const [contactHash, ixList] of byContact) {
        const sorted = ixList.sort((a, b) => {
          const ta = a.interactionTimestamp?.getTime() || 0;
          const tb = b.interactionTimestamp?.getTime() || 0;
          return ta - tb;
        });

        const orderedAssetIds = sorted.map(ix => ix.assetId).filter((v): v is string => !!v);
        const orderedStages = sorted.map(ix => ix.funnelStage || "UNKNOWN");

        const stageSequence = orderedStages.reduce<string[]>((acc, s) => {
          if (acc.length === 0 || acc[acc.length - 1] !== s) acc.push(s);
          return acc;
        }, []);
        const patternStages = stageSequence.length > 0 ? stageSequence.join("→") : "UNKNOWN";

        const assetStageMap = new Map<string, string>();
        for (const ix of sorted) {
          if (ix.assetId && ix.funnelStage) {
            assetStageMap.set(ix.assetId, ix.funnelStage);
          }
        }
        const assetStagePairs = orderedAssetIds.map(a => {
          const stage = assetStageMap.get(a) || "UNKNOWN";
          return `${stage} ${a}`;
        });
        const assetPatternParts = assetStagePairs.reduce<string[]>((acc, p) => {
          if (acc.length === 0 || acc[acc.length - 1] !== p) acc.push(p);
          return acc;
        }, []);
        const patternString = assetPatternParts.length > 0 ? assetPatternParts.join(" → ") : "UNKNOWN";

        const uniqueAssets = [...new Set(orderedAssetIds)];
        const channels = [...new Set(sorted.map(ix => ix.channel).filter((v): v is string => !!v))];

        const firstTs = sorted.find(ix => ix.interactionTimestamp)?.interactionTimestamp || null;
        const lastTs = [...sorted].reverse().find(ix => ix.interactionTimestamp)?.interactionTimestamp || null;
        const durationDays = firstTs && lastTs
          ? Math.round((lastTs.getTime() - firstTs.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const { outcome, outcomeDate } = determineOutcome(sorted);

        allContactJourneys.push({
          contactHash,
          journeySequence: orderedAssetIds,
          journeyStages: stageSequence,
          journeyPattern: patternStages,
          firstTouchDate: firstTs,
          lastTouchDate: lastTs,
          journeyDurationDays: durationDays,
          totalInteractions: sorted.length,
          uniqueAssetsTouched: uniqueAssets.length,
          channelsUsed: channels,
          outcome,
          outcomeDate,
          product: getMostCommon(sorted.map(ix => ix.product)),
          country: getMostCommon(sorted.map(ix => ix.country)),
          industry: null,
          uploadBatchId: batchId || null,
        });

        const assetStagesForContact = orderedAssetIds.map((assetId, idx) => ({
          assetId,
          stage: orderedStages[idx] || "UNKNOWN",
        }));
        perAssetStages.push({
          contactHash,
          assetStages: assetStagesForContact,
          outcome: outcome || "unknown",
          firstTouchDate: firstTs,
          lastTouchDate: lastTs,
        });
      }

      contactsProcessed += batch.length;
      updateProgress({
        message: `Processing ${contactsProcessed.toLocaleString()} of ${totalContacts.toLocaleString()} contacts...`,
      });
    }

    await storage.bulkInsertContactJourneys(allContactJourneys);

    updateProgress({
      phase: "Aggregating journey patterns",
      currentStep: 2,
      message: "Computing journey patterns...",
    });

    await storage.clearJourneyPatterns();

    const patternMap = new Map<string, InsertContactJourney[]>();
    for (const cj of allContactJourneys) {
      const key = cj.journeyPattern;
      const existing = patternMap.get(key) || [];
      existing.push(cj);
      patternMap.set(key, existing);
    }

    const patternInserts: InsertJourneyPattern[] = [];
    for (const [stagePattern, contacts] of patternMap) {
      const sqoCount = contacts.filter(c => c.outcome === "sqo").length;
      const durations = contacts.map(c => c.journeyDurationDays).filter((v): v is number => v !== null && v !== undefined);
      const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
      const entryAssets = contacts.map(c => c.journeySequence[0]).filter(Boolean);
      const exitAssets = contacts.map(c => c.journeySequence[c.journeySequence.length - 1]).filter(Boolean);
      const allChannels = [...new Set(contacts.flatMap(c => c.channelsUsed || []))];

      const topEntry = getMostCommon(entryAssets);
      const topExit = getMostCommon(exitAssets);
      const stageArr = stagePattern.split("→");
      const descriptivePattern = stageArr.map((stage, idx) => {
        if (idx === 0 && topEntry) return `${stage} ${topEntry}`;
        if (idx === stageArr.length - 1 && topExit) return `${stage} ${topExit}`;
        return stage;
      }).join(" → ");

      patternInserts.push({
        patternString: descriptivePattern,
        patternStages: stagePattern,
        contactCount: contacts.length,
        sqoCount,
        conversionRate: contacts.length > 0 ? sqoCount / contacts.length : 0,
        avgDurationDays: avgDuration,
        topEntryAsset: topEntry,
        topExitAsset: topExit,
        channels: allChannels,
      });
    }
    await storage.bulkInsertJourneyPatterns(patternInserts);

    updateProgress({
      phase: "Computing stage transitions",
      currentStep: 3,
      message: "Building stage transition data...",
    });

    await storage.clearStageTransitions();

    const transitionMap = new Map<string, {
      fromStage: string;
      toStage: string;
      fromAssetId: string | null;
      toAssetId: string | null;
      contacts: Set<string>;
      daysBetween: number[];
    }>();

    for (const cj of allContactJourneys) {
      const stages = cj.journeyStages;
      for (let s = 0; s < stages.length - 1; s++) {
        const key = `${stages[s]}|${stages[s + 1]}`;
        const existing = transitionMap.get(key) || {
          fromStage: stages[s],
          toStage: stages[s + 1],
          fromAssetId: null,
          toAssetId: null,
          contacts: new Set<string>(),
          daysBetween: [],
        };
        existing.contacts.add(cj.contactHash);
        if (cj.journeyDurationDays !== null && cj.journeyDurationDays !== undefined && stages.length > 1) {
          existing.daysBetween.push(cj.journeyDurationDays / (stages.length - 1));
        }
        transitionMap.set(key, existing);
      }
    }

    const transitionInserts: InsertStageTransition[] = [];
    for (const t of transitionMap.values()) {
      const avgDays = t.daysBetween.length > 0 ? t.daysBetween.reduce((a, b) => a + b, 0) / t.daysBetween.length : null;
      transitionInserts.push({
        fromStage: t.fromStage,
        toStage: t.toStage,
        fromAssetId: t.fromAssetId,
        toAssetId: t.toAssetId,
        contactCount: t.contacts.size,
        avgDaysBetween: avgDays,
        conversionRateAtNextStage: null,
      });
    }
    await storage.bulkInsertStageTransitions(transitionInserts);

    updateProgress({
      phase: "Computing asset journey stats",
      currentStep: 4,
      message: "Computing per-asset journey stats...",
    });

    await storage.clearAssetJourneyStats();

    const assetStats = new Map<string, {
      appearances: number;
      positions: number[];
      nextAssets: string[];
      prevAssets: string[];
      journeyLengths: number[];
      sqoJourneys: number;
      totalJourneys: number;
      lastInJourney: number;
      firstInJourney: number;
      contacts: Set<string>;
      stages: string[];
    }>();

    for (const pas of perAssetStages) {
      const seq = pas.assetStages;
      for (let p = 0; p < seq.length; p++) {
        const { assetId, stage } = seq[p];
        if (!assetId) continue;
        const stat = assetStats.get(assetId) || {
          appearances: 0, positions: [], nextAssets: [], prevAssets: [],
          journeyLengths: [], sqoJourneys: 0, totalJourneys: 0, lastInJourney: 0,
          firstInJourney: 0, contacts: new Set<string>(), stages: [],
        };
        stat.appearances++;
        stat.positions.push(p + 1);
        stat.journeyLengths.push(seq.length);
        stat.totalJourneys++;
        stat.contacts.add(pas.contactHash);
        stat.stages.push(stage);
        if (pas.outcome === "sqo") stat.sqoJourneys++;
        if (p < seq.length - 1 && seq[p + 1]) stat.nextAssets.push(seq[p + 1].assetId);
        if (p > 0 && seq[p - 1]) stat.prevAssets.push(seq[p - 1].assetId);
        if (p === seq.length - 1) stat.lastInJourney++;
        if (p === 0) stat.firstInJourney++;
        assetStats.set(assetId, stat);
      }
    }

    const assetStageMap = new Map<string, string>();
    for (const [assetId, stat] of assetStats) {
      assetStageMap.set(assetId, getMostCommon(stat.stages) || "UNKNOWN");
    }

    const assetInserts: InsertAssetJourneyStat[] = [];
    for (const [assetId, stat] of assetStats) {
      const avgPos = stat.positions.reduce((a, b) => a + b, 0) / stat.positions.length;
      const avgLen = stat.journeyLengths.reduce((a, b) => a + b, 0) / stat.journeyLengths.length;
      const dominantStage = getMostCommon(stat.stages) || "UNKNOWN";
      const middleCount = stat.appearances - stat.firstInJourney - stat.lastInJourney;
      assetInserts.push({
        assetId,
        totalJourneyAppearances: stat.appearances,
        avgPositionInJourney: Math.round(avgPos * 10) / 10,
        mostCommonNextAsset: getMostCommon(stat.nextAssets),
        mostCommonPrevAsset: getMostCommon(stat.prevAssets),
        journeyConversionRate: stat.totalJourneys > 0 ? Math.round((stat.sqoJourneys / stat.totalJourneys) * 1000) / 1000 : 0,
        avgJourneyLengthWhenIncluded: Math.round(avgLen * 10) / 10,
        dropOffRate: stat.totalJourneys > 0 ? Math.round((stat.lastInJourney / stat.totalJourneys) * 1000) / 1000 : 0,
        funnelStage: dominantStage,
        uniqueContacts: stat.contacts.size,
        entryCount: stat.firstInJourney,
        exitCount: stat.lastInJourney,
        passThroughCount: Math.max(0, middleCount),
      });
    }
    await storage.bulkInsertAssetJourneyStats(assetInserts);

    updateProgress({
      phase: "Computing asset-to-asset flows",
      currentStep: 5,
      message: "Computing asset-to-asset transition flows...",
    });

    await storage.deleteJourneyStageFlows();

    const flowMap = new Map<string, { fromAssetId: string; fromStage: string; toAssetId: string; toStage: string; contacts: Set<string>; daysBetween: number[] }>();

    for (const pas of perAssetStages) {
      const seq = pas.assetStages;
      if (seq.length < 2) continue;

      for (let p = 0; p < seq.length - 1; p++) {
        const from = seq[p];
        const to = seq[p + 1];
        if (!from.assetId || !to.assetId) continue;

        const key = `${from.assetId}|${to.assetId}`;

        const existing = flowMap.get(key) || {
          fromAssetId: from.assetId,
          fromStage: from.stage,
          toAssetId: to.assetId,
          toStage: to.stage,
          contacts: new Set<string>(),
          daysBetween: [],
        };

        existing.contacts.add(pas.contactHash);

        if (pas.firstTouchDate && pas.lastTouchDate && seq.length > 1) {
          const totalDays = (pas.lastTouchDate.getTime() - pas.firstTouchDate.getTime()) / (1000 * 60 * 60 * 24);
          const stepDays = totalDays / (seq.length - 1);
          existing.daysBetween.push(stepDays);
        }

        flowMap.set(key, existing);
      }
    }

    const flowInserts: InsertJourneyStageFlow[] = [];
    for (const [, flow] of flowMap) {
      if (flow.contacts.size < 1) continue;
      const avgDays = flow.daysBetween.length > 0
        ? Math.round((flow.daysBetween.reduce((a, b) => a + b, 0) / flow.daysBetween.length) * 10) / 10
        : null;
      flowInserts.push({
        fromAssetId: flow.fromAssetId,
        fromStage: flow.fromStage,
        toAssetId: flow.toAssetId,
        toStage: flow.toStage,
        contactCount: flow.contacts.size,
        avgDaysBetween: avgDays,
      });
    }
    await storage.bulkInsertJourneyStageFlows(flowInserts);

    updateProgress({
      status: "complete",
      phase: "Done",
      message: `Journey summaries built: ${allContactJourneys.length.toLocaleString()} contacts, ${patternInserts.length} patterns, ${transitionInserts.length} transitions, ${assetInserts.length} asset stats, ${flowInserts.length} flows`,
      completedAt: Date.now(),
      result: {
        contactsProcessed: allContactJourneys.length,
        patternsFound: patternInserts.length,
        transitionsFound: transitionInserts.length,
        assetStatsComputed: assetInserts.length,
      },
    });
  } catch (err: any) {
    updateProgress({
      status: "error",
      phase: "Error",
      message: err.message || "Unknown error building journey summaries",
      error: err.message || "Unknown error",
      completedAt: Date.now(),
    });
    throw err;
  }
}

export function resetJourneyBuildProgress() {
  buildProgress = {
    status: "idle",
    phase: "",
    currentStep: 0,
    totalSteps: 0,
    message: "",
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
  };
}
