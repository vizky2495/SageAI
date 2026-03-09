import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/queryClient";

export type FunnelStage = "TOFU" | "MOFU" | "BOFU" | "UNKNOWN";
export type StageKey = Exclude<FunnelStage, "UNKNOWN">;

export type NormalizedRow = {
  id: string;
  content: string;
  stage: FunnelStage;
  utmChannel?: string;
  utmMedium?: string;
  utmContent?: string;
  productFranchise?: string;
  industry?: string;
  objective?: string;
  contentType?: string;
  cta?: string;
  campaignName?: string;
  engagedSessions?: number;
  sessions?: number;
  pageViews?: number;
  timeSpentSeconds?: number;
  scrollDepth?: number;
  newUsers?: number;
  returningUsers?: number;
  newsletterSignups?: number;
  nextContentViews?: number;
  newContacts?: number;
  downloads?: number;
  formSubmissions?: number;
  mqls?: number;
  qdcs?: number;
  sqos?: number;
  leadScore?: number;
};

export type TopContentRow = {
  content: string;
  product: string;
  channel: string;
  value: number;
  newContacts: number;
};

export type TopByStage = Record<StageKey, TopContentRow[]>;

export function sum(rows: NormalizedRow[], key: keyof NormalizedRow) {
  return rows.reduce(
    (acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0),
    0,
  );
}

export function pct(n: number, d: number) {
  if (!d) return 0;
  return (n / d) * 100;
}

export function formatCompact(n: number) {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export const stageMeta: Record<FunnelStage, { label: string; tone: string }> = {
  TOFU: { label: "TOFU", tone: "bg-chart-1/12 text-chart-1 border-chart-1/20" },
  MOFU: { label: "MOFU", tone: "bg-chart-2/12 text-chart-2 border-chart-2/20" },
  BOFU: { label: "BOFU", tone: "bg-chart-3/12 text-chart-3 border-chart-3/20" },
  UNKNOWN: { label: "UNKNOWN", tone: "bg-muted text-muted-foreground border-border" },
};

export type UploadDiagnostics = {
  stageBreakdown: Record<string, number>;
  ingested?: number;
};

export function useFunnelData() {
  const [rows, setRows] = useState<NormalizedRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    authFetch("/api/assets/all")
      .then((res) => res.ok ? res.json() : [])
      .then((dbAssets: any[]) => {
        if (cancelled) return;
        if (dbAssets.length > 0) {
          const converted: NormalizedRow[] = dbAssets.map((a, idx) => ({
            id: a.id || `db-${idx}`,
            content: a.contentId || "",
            stage: (a.stage || "UNKNOWN") as FunnelStage,
            utmChannel: a.utmChannel || undefined,
            utmMedium: a.utmMedium || undefined,
            utmContent: a.utmContent || undefined,
            productFranchise: a.productFranchise || undefined,
            industry: a.productCategory || undefined,
            objective: a.objective || undefined,
            contentType: a.typecampaignmember || undefined,
            cta: a.cta || undefined,
            campaignName: a.campaignName || undefined,
            engagedSessions: undefined,
            sessions: undefined,
            pageViews: a.pageviewsSum || 0,
            timeSpentSeconds: a.timeAvg || undefined,
            scrollDepth: undefined,
            newUsers: undefined,
            returningUsers: undefined,
            newsletterSignups: undefined,
            nextContentViews: undefined,
            newContacts: a.uniqueLeads || 0,
            downloads: a.downloadsSum || 0,
            formSubmissions: undefined,
            mqls: undefined,
            qdcs: undefined,
            sqos: a.sqoCount || 0,
            leadScore: undefined,
          }));
          setRows(converted);
          const breakdown: Record<string, number> = {};
          for (const r of converted) {
            breakdown[r.stage] = (breakdown[r.stage] || 0) + 1;
          }
          setUploadDiagnostics({ stageBreakdown: breakdown });
        }
        setDataLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const byStage = useMemo(() => {
    const groups: Record<FunnelStage, NormalizedRow[]> = {
      TOFU: [],
      MOFU: [],
      BOFU: [],
      UNKNOWN: [],
    };
    for (const r of rows) groups[r.stage].push(r);
    return groups;
  }, [rows]);

  return { rows, dataLoading, uploadDiagnostics, byStage };
}
