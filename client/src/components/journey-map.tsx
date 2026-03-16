import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, TrendingUp, TrendingDown, Minus, BarChart3, GitBranch, Zap, Clock, Users, Search, ChevronDown, ChevronUp, ArrowLeftRight, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; order: number }> = {
  TOFU: { label: "TOFU", color: "#00D657", bg: "rgba(0,214,87,0.12)", border: "rgba(0,214,87,0.4)", order: 1 },
  MOFU: { label: "MOFU", color: "#67E8F9", bg: "rgba(103,232,249,0.12)", border: "rgba(103,232,249,0.4)", order: 2 },
  BOFU: { label: "BOFU", color: "#A78BFA", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.4)", order: 3 },
  UNKNOWN: { label: "Unclassified", color: "#9CA3AF", bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.3)", order: 4 },
};

function getStageConfig(stage: string) {
  return STAGE_CONFIG[stage] || STAGE_CONFIG.UNKNOWN;
}

interface Transition {
  fromStage: string;
  toStage: string;
  contactCount: number;
  avgDaysBetween: number | null;
}

interface Pattern {
  patternString: string;
  patternStages: string;
  contactCount: number;
  conversionRate: number;
  topEntryAsset?: string;
  topExitAsset?: string;
  avgDurationDays?: number;
}

interface AssetStat {
  assetId: string;
  totalJourneyAppearances: number;
  avgPositionInJourney: number;
  mostCommonNextAsset: string | null;
  mostCommonPrevAsset: string | null;
  journeyConversionRate: number;
  avgJourneyLengthWhenIncluded: number;
  dropOffRate: number;
}

interface JourneyMapProps {
  transitions: Transition[];
  topPatterns: Pattern[];
  topAssetStats?: AssetStat[];
  totalInteractions: number;
  status: {
    contactJourneyCount: number;
    patternCount: number;
    transitionCount: number;
    assetStatCount: number;
  };
}

function formatAssetName(assetId: string): string {
  if (!assetId) return "";
  const parts = assetId.replace(/^CL_/, "").split("_");
  if (parts.length > 4) {
    return parts.slice(-2).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  return parts.slice(-1)[0]?.replace(/([a-z])([A-Z])/g, "$1 $2") || assetId;
}

function StageBadge({ stage, size = "sm" }: { stage: string; size?: "sm" | "md" }) {
  const cfg = getStageConfig(stage);
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${size === "md" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]"}`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
      data-testid={`badge-stage-${stage.toLowerCase()}`}
    >
      {cfg.label}
    </span>
  );
}

function SankeyFlow({ transitions }: { transitions: Transition[] }) {
  const stages = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];

  const stageVolumes = useMemo(() => {
    const vols: Record<string, number> = {};
    for (const s of stages) vols[s] = 0;
    for (const t of transitions) {
      vols[t.fromStage] = (vols[t.fromStage] || 0) + t.contactCount;
      vols[t.toStage] = (vols[t.toStage] || 0) + t.contactCount;
    }
    return vols;
  }, [transitions]);

  const maxVolume = Math.max(...Object.values(stageVolumes), 1);

  const forwardTransitions = useMemo(() =>
    transitions
      .filter(t => {
        const from = STAGE_CONFIG[t.fromStage]?.order ?? 5;
        const to = STAGE_CONFIG[t.toStage]?.order ?? 5;
        return to > from;
      })
      .sort((a, b) => b.contactCount - a.contactCount), [transitions]);

  const backwardTransitions = useMemo(() =>
    transitions
      .filter(t => {
        const from = STAGE_CONFIG[t.fromStage]?.order ?? 5;
        const to = STAGE_CONFIG[t.toStage]?.order ?? 5;
        return to < from;
      })
      .sort((a, b) => b.contactCount - a.contactCount), [transitions]);

  const maxTrans = Math.max(...transitions.map(t => t.contactCount), 1);

  return (
    <div className="space-y-6" data-testid="sankey-flow">
      <div className="rounded-xl border border-border/20 bg-muted/5 p-3 mb-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What am I looking at?</span> Each box below represents a funnel stage. The number inside shows how many contacts moved into or out of that stage. Below the boxes, you'll see the actual paths contacts took — forward moves (progressing down the funnel) and backward moves (re-engaging with earlier-stage content). The bar width shows relative volume, and the time shown is the average days between stages.
        </p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {stages.map(stage => {
          const cfg = getStageConfig(stage);
          const vol = stageVolumes[stage] || 0;
          const barPct = (vol / maxVolume) * 100;
          return (
            <motion.div
              key={stage}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: cfg.order * 0.08 }}
              className="rounded-xl p-4 text-center"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              data-testid={`stage-node-${stage.toLowerCase()}`}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: cfg.color }}>{cfg.label}</p>
              <p className="text-2xl font-bold" style={{ color: cfg.color }}>{vol.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">total flow</p>
              <div className="mt-2 h-1.5 rounded-full bg-black/20 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: cfg.color }} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#00D657]" />
            <h4 className="text-xs font-semibold">Forward Progression</h4>
            <span className="text-[10px] text-muted-foreground">({forwardTransitions.length} paths)</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 ml-6">Contacts moving deeper into the funnel — from awareness toward purchase intent. Larger bars mean more people taking that path.</p>
        </div>
        <div className="grid gap-2">
          {forwardTransitions.map((t, i) => {
            const fromCfg = getStageConfig(t.fromStage);
            const toCfg = getStageConfig(t.toStage);
            const widthPct = Math.max((t.contactCount / maxTrans) * 100, 8);
            return (
              <motion.div
                key={`fwd-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
                data-testid={`transition-forward-${i}`}
              >
                <StageBadge stage={t.fromStage} />
                <div className="flex-1 relative h-6 flex items-center">
                  <div
                    className="h-3 rounded-full relative overflow-hidden"
                    style={{ width: `${widthPct}%`, minWidth: 40 }}
                  >
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${fromCfg.color}40, ${toCfg.color}60)`,
                      }}
                    />
                  </div>
                  <ArrowRight className="h-3 w-3 ml-1 shrink-0" style={{ color: toCfg.color }} />
                </div>
                <StageBadge stage={t.toStage} />
                <div className="text-right min-w-[100px] shrink-0">
                  <span className="text-xs font-semibold">{t.contactCount.toLocaleString()}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">
                    {t.avgDaysBetween != null ? `${t.avgDaysBetween.toFixed(1)}d` : ""}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {backwardTransitions.length > 0 && (
        <div className="space-y-3">
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-400" />
              <h4 className="text-xs font-semibold">Regression / Re-engagement</h4>
              <span className="text-[10px] text-muted-foreground">({backwardTransitions.length} paths)</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 ml-6">Contacts returning to an earlier funnel stage. This can mean they're revisiting educational content after evaluating, or re-engaging after going quiet. High numbers here may signal nurturing gaps.</p>
          </div>
          <div className="grid gap-2">
            {backwardTransitions.map((t, i) => {
              const fromCfg = getStageConfig(t.fromStage);
              const toCfg = getStageConfig(t.toStage);
              const widthPct = Math.max((t.contactCount / maxTrans) * 100, 8);
              return (
                <motion.div
                  key={`bwd-${i}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3"
                  data-testid={`transition-backward-${i}`}
                >
                  <StageBadge stage={t.fromStage} />
                  <div className="flex-1 relative h-6 flex items-center">
                    <div
                      className="h-2 rounded-full relative overflow-hidden"
                      style={{ width: `${widthPct}%`, minWidth: 40 }}
                    >
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${fromCfg.color}30, ${toCfg.color}40)`,
                        }}
                      />
                    </div>
                    <ArrowRight className="h-3 w-3 ml-1 shrink-0 text-amber-400/60" />
                  </div>
                  <StageBadge stage={t.toStage} />
                  <div className="text-right min-w-[100px] shrink-0">
                    <span className="text-xs font-semibold text-amber-400">{t.contactCount.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {t.avgDaysBetween != null ? `${t.avgDaysBetween.toFixed(1)}d` : ""}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PatternList({ patterns }: { patterns: Pattern[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const maxContacts = Math.max(...patterns.map(p => p.contactCount), 1);

  return (
    <div className="space-y-2" data-testid="pattern-list">
      <div className="rounded-xl border border-border/20 bg-muted/5 p-3 mb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What am I looking at?</span> A journey pattern is the exact sequence of funnel stages a group of contacts followed — for example, TOFU then MOFU then BOFU. Each row shows one pattern, how many contacts followed it, and the average time it took. Click any pattern to see which specific content assets were the entry and exit points. Patterns with more contacts represent your most common buyer journeys.
        </p>
      </div>
      {patterns.slice(0, 15).map((p, i) => {
        const stages = p.patternStages.split("→").map(s => s.trim());
        const pct = (p.contactCount / maxContacts) * 100;
        const expanded = expandedIdx === i;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-xl border border-border/30 bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer"
            onClick={() => setExpandedIdx(expanded ? null : i)}
            data-testid={`pattern-row-${i}`}
          >
            <div className="p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {stages.map((s, si) => (
                    <span key={si} className="flex items-center gap-1">
                      <StageBadge stage={s} />
                      {si < stages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold">{p.contactCount.toLocaleString()}</span>
                  </div>
                  {p.avgDurationDays != null && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{p.avgDurationDays.toFixed(1)}d</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
                <div className="h-full rounded-full bg-[#00D657]/40 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {expanded && (
              <div className="px-3 pb-3 border-t border-border/20 pt-2 space-y-1.5">
                {p.topEntryAsset && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="font-mono text-xs truncate">{formatAssetName(p.topEntryAsset)}</span>
                  </div>
                )}
                {p.topExitAsset && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">Exit:</span>
                    <span className="font-mono text-xs truncate">{formatAssetName(p.topExitAsset)}</span>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/70 font-mono break-all">{p.patternString}</div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function TopAssets({ assets }: { assets: AssetStat[] }) {
  const maxApp = Math.max(...assets.map(a => a.totalJourneyAppearances || 0), 1);

  return (
    <div className="space-y-2" data-testid="top-assets-list">
      <div className="rounded-xl border border-border/20 bg-muted/5 p-3 mb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What am I looking at?</span> These are the content assets that appear most often in contact journeys. "Appearances" is how many journeys included this asset. "Avg position" tells you where in the journey it typically sits (1 = first touch, higher = later). "Drop-off" is the percentage of contacts whose journey ended after this asset — a high drop-off (red) means contacts stop engaging after viewing it, while a low drop-off (green) means they continue to the next piece of content.
        </p>
      </div>
      {assets.slice(0, 15).map((a, i) => {
        const appearances = a.totalJourneyAppearances || 0;
        const pct = (appearances / maxApp) * 100;
        const dropOff = a.dropOffRate ?? 0;
        const dropOffColor = dropOff > 0.8 ? "text-red-400" : dropOff > 0.5 ? "text-amber-400" : "text-[#00D657]";

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-xl border border-border/30 bg-muted/5 p-3"
            data-testid={`asset-row-${i}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{formatAssetName(a.assetId)}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{a.assetId}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold">{appearances.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">appearances</p>
              </div>
            </div>
            <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
              <div className="h-full rounded-full bg-[#00D657]/40 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px]">
              <span className="text-muted-foreground">
                Avg position: <span className="font-semibold text-foreground">{(a.avgPositionInJourney ?? 0).toFixed(1)}</span>
              </span>
              <span className="text-muted-foreground">
                Avg journey len: <span className="font-semibold text-foreground">{(a.avgJourneyLengthWhenIncluded ?? 0).toFixed(1)}</span>
              </span>
              <span className="text-muted-foreground">
                Drop-off: <span className={`font-semibold ${dropOffColor}`}>{(dropOff * 100).toFixed(0)}%</span>
              </span>
            </div>
            {a.mostCommonNextAsset && a.mostCommonNextAsset !== a.assetId && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <ArrowRight className="h-2.5 w-2.5" />
                <span>Next: <span className="font-mono">{formatAssetName(a.mostCommonNextAsset)}</span></span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

interface ContentTransition {
  fromAsset: string;
  fromStage: string;
  toAsset: string;
  toStage: string;
  contactCount: number;
  avgDaysBetween: number | null;
}

interface AssetNeighbors {
  cameFrom: Array<{ assetId: string; stage: string; count: number }>;
  wentTo: Array<{ assetId: string; stage: string; count: number }>;
}

function ContentPaths() {
  const [fromStageFilter, setFromStageFilter] = useState<string>("");
  const [toStageFilter, setToStageFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleSearch = useCallback((val: string) => {
    setSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (fromStageFilter) p.set("fromStage", fromStageFilter);
    if (toStageFilter) p.set("toStage", toStageFilter);
    if (debouncedSearch) p.set("search", debouncedSearch);
    p.set("limit", "50");
    return p.toString();
  }, [fromStageFilter, toStageFilter, debouncedSearch]);

  const { data: transitions, isLoading, isError } = useQuery<ContentTransition[]>({
    queryKey: ["/api/journey/content-transitions", queryParams],
    queryFn: async () => {
      const res = await authFetch(`/api/journey/content-transitions?${queryParams}`);
      if (!res.ok) throw new Error("Failed to load content transitions");
      return res.json();
    },
    staleTime: 120_000,
    retry: 1,
  });

  const { data: neighbors, isLoading: neighborsLoading } = useQuery<AssetNeighbors>({
    queryKey: ["/api/journey/asset-neighbors", expandedAsset],
    queryFn: async () => {
      const res = await authFetch(`/api/journey/asset-neighbors/${encodeURIComponent(expandedAsset!)}`);
      if (!res.ok) throw new Error("Failed to load asset neighbors");
      return res.json();
    },
    enabled: !!expandedAsset,
    staleTime: 120_000,
    retry: 1,
  });

  const maxContacts = useMemo(() => {
    if (!transitions?.length) return 1;
    return Math.max(...transitions.map(t => t.contactCount), 1);
  }, [transitions]);

  const stageOptions = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];

  return (
    <div className="space-y-3" data-testid="content-paths">
      <div className="rounded-xl border border-border/20 bg-muted/5 p-3 mb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What am I looking at?</span> Content paths show which assets contacts viewed in sequence. Each row is one content-to-content transition — the "From" asset was viewed first, then the "To" asset. The contact count tells you how many people followed that exact path. Use this to understand how content pieces connect and which sequences are most common in your funnel.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search asset names..."
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted/10 border-border/30"
            data-testid="input-search-paths"
          />
          {searchText && (
            <button onClick={() => { setSearchText(""); setDebouncedSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <select
          value={fromStageFilter}
          onChange={(e) => setFromStageFilter(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-border/30 bg-muted/10 text-foreground"
          data-testid="select-from-stage"
        >
          <option value="">From: All stages</option>
          {stageOptions.map(s => (
            <option key={s} value={s}>{getStageConfig(s).label}</option>
          ))}
        </select>
        <select
          value={toStageFilter}
          onChange={(e) => setToStageFilter(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-border/30 bg-muted/10 text-foreground"
          data-testid="select-to-stage"
        >
          <option value="">To: All stages</option>
          {stageOptions.map(s => (
            <option key={s} value={s}>{getStageConfig(s).label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Computing content transitions...</span>
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400 text-xs">Failed to load content transitions. Please try again.</div>
      ) : !transitions?.length ? (
        <div className="text-center py-12 text-muted-foreground text-xs">No content transitions found for the current filters.</div>
      ) : (
        <div className="space-y-1.5">
          {transitions.map((t, i) => {
            const pct = (t.contactCount / maxContacts) * 100;
            const isExpanded = expandedAsset === t.fromAsset || expandedAsset === t.toAsset;

            return (
              <div key={`${t.fromAsset}-${t.toAsset}-${i}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className="rounded-xl border border-border/30 bg-muted/5 hover:bg-muted/10 transition-colors p-3"
                  data-testid={`content-path-row-${i}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <button
                        className="text-left w-full group"
                        onClick={() => setExpandedAsset(expandedAsset === t.fromAsset ? null : t.fromAsset)}
                        data-testid={`btn-expand-from-${i}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <StageBadge stage={t.fromStage} />
                          <span className="text-xs font-medium truncate group-hover:text-[#00D657] transition-colors">
                            {formatAssetName(t.fromAsset)}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5 ml-1">{t.fromAsset}</p>
                      </button>
                    </div>

                    <div className="shrink-0 flex flex-col items-center px-2">
                      <ArrowRight className="h-4 w-4 text-[#00D657]/60" />
                      {t.avgDaysBetween != null && (
                        <span className="text-[9px] text-muted-foreground mt-0.5">{Number(t.avgDaysBetween).toFixed(1)}d</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <button
                        className="text-left w-full group"
                        onClick={() => setExpandedAsset(expandedAsset === t.toAsset ? null : t.toAsset)}
                        data-testid={`btn-expand-to-${i}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <StageBadge stage={t.toStage} />
                          <span className="text-xs font-medium truncate group-hover:text-[#00D657] transition-colors">
                            {formatAssetName(t.toAsset)}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5 ml-1">{t.toAsset}</p>
                      </button>
                    </div>

                    <div className="shrink-0 text-right min-w-[60px]">
                      <p className="text-sm font-bold text-[#00D657]">{t.contactCount.toLocaleString()}</p>
                      <p className="text-[9px] text-muted-foreground">contacts</p>
                    </div>
                  </div>

                  <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
                    <div className="h-full rounded-full bg-[#00D657]/40 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </motion.div>

                <AnimatePresence>
                  {(expandedAsset === t.fromAsset || expandedAsset === t.toAsset) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <AssetDrillDown
                        assetId={expandedAsset!}
                        neighbors={neighbors}
                        isLoading={neighborsLoading}
                        onClose={() => setExpandedAsset(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssetDrillDown({
  assetId,
  neighbors,
  isLoading,
  onClose,
}: {
  assetId: string;
  neighbors?: AssetNeighbors;
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="ml-4 mr-2 my-1.5 rounded-xl border border-[#00D657]/20 bg-[#00D657]/[0.03] p-4" data-testid="asset-drill-down">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-[#00D657]" />
          <span className="text-xs font-semibold">{formatAssetName(assetId)}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" data-testid="btn-close-drilldown">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground font-mono mb-3 truncate">{assetId}</p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Loading neighbors...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h5 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Came from
            </h5>
            {neighbors?.cameFrom.length ? (
              <div className="space-y-1.5">
                {neighbors.cameFrom.map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs" data-testid={`came-from-${i}`}>
                    <StageBadge stage={n.stage} />
                    <span className="truncate flex-1">{formatAssetName(n.assetId)}</span>
                    <span className="font-semibold shrink-0 text-[#00D657]">{n.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60">No upstream assets found</p>
            )}
          </div>
          <div>
            <h5 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Went to
            </h5>
            {neighbors?.wentTo.length ? (
              <div className="space-y-1.5">
                {neighbors.wentTo.map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs" data-testid={`went-to-${i}`}>
                    <StageBadge stage={n.stage} />
                    <span className="truncate flex-1">{formatAssetName(n.assetId)}</span>
                    <span className="font-semibold shrink-0 text-[#00D657]">{n.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60">No downstream assets found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JourneyMap({ transitions, topPatterns, topAssetStats, totalInteractions, status }: JourneyMapProps) {
  return (
    <div className="space-y-6" data-testid="journey-map">
      <div className="rounded-xl border border-[#00D657]/20 bg-[#00D657]/[0.04] p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Journey Overview</span> — This map shows how your contacts move through your marketing funnel based on the Eloqua activity data you uploaded. Each contact's content interactions are grouped into a journey, classified by funnel stage (TOFU = awareness, MOFU = consideration, BOFU = decision). Use the tabs below to explore stage-to-stage flow, common journey sequences, and which content assets drive the most engagement.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/30 bg-muted/10 p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1.5 text-[#00D657]" />
          <p className="text-2xl font-bold" data-testid="text-jm-contacts">{status.contactJourneyCount.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Unique Contacts</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">People with tracked journeys</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-muted/10 p-4 text-center">
          <GitBranch className="h-5 w-5 mx-auto mb-1.5 text-[#67E8F9]" />
          <p className="text-2xl font-bold" data-testid="text-jm-patterns">{status.patternCount.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Journey Patterns</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">Distinct stage sequences found</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-muted/10 p-4 text-center">
          <Zap className="h-5 w-5 mx-auto mb-1.5 text-[#A78BFA]" />
          <p className="text-2xl font-bold" data-testid="text-jm-transitions">{status.transitionCount.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Stage Transitions</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">Stage-to-stage movement paths</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-muted/10 p-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto mb-1.5 text-amber-400" />
          <p className="text-2xl font-bold" data-testid="text-jm-interactions">{totalInteractions.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Total Interactions</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">All content touchpoints recorded</p>
        </div>
      </div>

      <Card className="rounded-2xl border border-border/40 bg-card/70 p-5 shadow-sm backdrop-blur">
        <Tabs defaultValue="flow">
          <TabsList className="mb-4">
            <TabsTrigger value="flow" data-testid="tab-flow">Stage Flow</TabsTrigger>
            <TabsTrigger value="patterns" data-testid="tab-patterns">Journey Patterns</TabsTrigger>
            {topAssetStats && topAssetStats.length > 0 && (
              <TabsTrigger value="assets" data-testid="tab-assets">Top Assets</TabsTrigger>
            )}
            <TabsTrigger value="content-paths" data-testid="tab-content-paths">Content Paths</TabsTrigger>
          </TabsList>

          <TabsContent value="flow">
            <SankeyFlow transitions={transitions} />
          </TabsContent>

          <TabsContent value="patterns">
            <PatternList patterns={topPatterns} />
          </TabsContent>

          {topAssetStats && topAssetStats.length > 0 && (
            <TabsContent value="assets">
              <TopAssets assets={topAssetStats} />
            </TabsContent>
          )}

          <TabsContent value="content-paths">
            <ContentPaths />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
