import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, TrendingUp, TrendingDown, Minus, BarChart3, GitBranch, Zap, Clock, Users, Search, ChevronDown, ChevronUp, ArrowLeftRight, Loader2, X, Network, Trophy, Target, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";

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
  funnelStage?: string | null;
  uniqueContacts?: number | null;
  entryCount?: number | null;
  exitCount?: number | null;
  passThroughCount?: number | null;
}

interface StageFlow {
  fromAssetId: string;
  fromStage: string;
  toAssetId: string;
  toStage: string;
  contactCount: number;
  avgDaysBetween: number | null;
}

interface JourneyMapProps {
  transitions: Transition[];
  topPatterns: Pattern[];
  topAssetStats?: AssetStat[];
  stageFlows?: StageFlow[];
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

interface SankeyNode {
  id: string;
  name: string;
  stage: string;
  stageOrder: number;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
  avgDays: number | null;
}

function D3SankeyDiagram({ initialFlows }: { initialFlows?: StageFlow[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [minContacts, setMinContacts] = useState(3);

  const { data: apiFlows } = useQuery<StageFlow[]>({
    queryKey: ["/api/journey/stage-flows", minContacts],
    queryFn: async () => {
      const res = await authFetch(`/api/journey/stage-flows?minContacts=${minContacts}`);
      if (!res.ok) throw new Error("Failed to load stage flows");
      return res.json();
    },
    staleTime: 120_000,
    retry: 1,
  });

  const flows = apiFlows || initialFlows || [];
  const filtered = useMemo(() => flows.filter(f => f.contactCount >= minContacts), [flows, minContacts]);

  const { nodes, links, sankeyData } = useMemo(() => {
    const nodeMap = new Map<string, SankeyNode>();
    for (const f of filtered) {
      if (!nodeMap.has(f.fromAssetId)) {
        const stage = f.fromStage || "UNKNOWN";
        nodeMap.set(f.fromAssetId, { id: f.fromAssetId, name: formatAssetName(f.fromAssetId), stage, stageOrder: STAGE_CONFIG[stage]?.order ?? 4 });
      }
      if (!nodeMap.has(f.toAssetId)) {
        const stage = f.toStage || "UNKNOWN";
        nodeMap.set(f.toAssetId, { id: f.toAssetId, name: formatAssetName(f.toAssetId), stage, stageOrder: STAGE_CONFIG[stage]?.order ?? 4 });
      }
    }

    const nodesArr = [...nodeMap.values()].sort((a, b) => a.stageOrder - b.stageOrder || a.name.localeCompare(b.name));
    const nodeIdxMap = new Map<string, number>();
    nodesArr.forEach((n, i) => nodeIdxMap.set(n.id, i));

    const linkMap = new Map<string, SankeyLink>();
    for (const f of filtered) {
      const srcIdx = nodeIdxMap.get(f.fromAssetId);
      const tgtIdx = nodeIdxMap.get(f.toAssetId);
      if (srcIdx !== undefined && tgtIdx !== undefined && srcIdx !== tgtIdx) {
        const fwdKey = `${Math.min(srcIdx, tgtIdx)}-${Math.max(srcIdx, tgtIdx)}`;
        const existing = linkMap.get(fwdKey);
        if (!existing || f.contactCount > existing.value) {
          linkMap.set(fwdKey, { source: srcIdx, target: tgtIdx, value: f.contactCount, avgDays: f.avgDaysBetween });
        }
      }
    }
    const linksArr = [...linkMap.values()];

    if (nodesArr.length === 0 || linksArr.length === 0) {
      return { nodes: nodesArr, links: linksArr, sankeyData: null };
    }

    const width = 900;
    const stageColumns: Record<string, number> = {};
    const stages = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];
    const stageWidth = (width - 200) / stages.length;
    stages.forEach((s, i) => { stageColumns[s] = 40 + i * stageWidth; });

    const stageOrderOf = (idx: number) => nodesArr[idx]?.stageOrder ?? 4;
    const forwardLinks = linksArr.filter(l => {
      const srcOrder = stageOrderOf(l.source as number);
      const tgtOrder = stageOrderOf(l.target as number);
      return srcOrder <= tgtOrder;
    });

    const finalLinks = forwardLinks.length > 0 ? forwardLinks : linksArr.slice(0, 50);

    if (finalLinks.length === 0) {
      return { nodes: nodesArr, links: linksArr, sankeyData: null };
    }

    const usedNodeIdxs = new Set<number>();
    for (const l of finalLinks) {
      usedNodeIdxs.add(l.source as number);
      usedNodeIdxs.add(l.target as number);
    }
    const prunedNodes = nodesArr.filter((_, i) => usedNodeIdxs.has(i));
    const newIdxMap = new Map<number, number>();
    prunedNodes.forEach((n, newIdx) => {
      const oldIdx = nodesArr.indexOf(n);
      newIdxMap.set(oldIdx, newIdx);
    });
    const remappedLinks = finalLinks
      .map(l => ({
        source: newIdxMap.get(l.source as number)!,
        target: newIdxMap.get(l.target as number)!,
        value: l.value,
        avgDays: l.avgDays,
      }))
      .filter(l => l.source !== undefined && l.target !== undefined && l.source !== l.target);

    try {
      const h = Math.max(400, prunedNodes.length * 28);
      const sankeyGen = sankey<SankeyNode, SankeyLink>()
        .nodeWidth(16)
        .nodePadding(14)
        .extent([[40, 20], [width - 160, h - 20]])
        .nodeAlign(sankeyLeft)
        .iterations(6);

      const data = sankeyGen({
        nodes: prunedNodes.map(n => ({ ...n })),
        links: remappedLinks.map(l => ({ ...l })),
      });

      for (const node of data.nodes) {
        const sn = node as any;
        const stage = (sn as SankeyNode).stage || "UNKNOWN";
        sn.x0 = stageColumns[stage] || stageColumns["UNKNOWN"];
        sn.x1 = sn.x0 + 16;
      }

      return { nodes: prunedNodes, links: remappedLinks, sankeyData: data };
    } catch (e) {
      console.error("Sankey layout error:", e);
      return { nodes: prunedNodes, links: remappedLinks, sankeyData: null };
    }
  }, [filtered]);

  if (!sankeyData || !sankeyData.nodes.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No asset flows found with {minContacts}+ contacts. Try lowering the minimum.
      </div>
    );
  }

  const width = 900;
  const height = Math.max(400, nodes.length * 28);
  const linkPathGen = sankeyLinkHorizontal();

  const stageLabels = [
    { label: "TOFU", x: 40, color: "#00D657" },
    { label: "MOFU", x: 40 + (width - 200) / 4, color: "#67E8F9" },
    { label: "BOFU", x: 40 + 2 * (width - 200) / 4, color: "#A78BFA" },
    { label: "Unclassified", x: 40 + 3 * (width - 200) / 4, color: "#9CA3AF" },
  ];

  return (
    <div className="space-y-3" data-testid="d3-sankey-diagram">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-[#00D657]" />
          <h4 className="text-sm font-semibold">Asset Flow Sankey</h4>
          <span className="text-[10px] text-muted-foreground">{sankeyData.nodes.length} assets, {sankeyData.links.length} flows</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground whitespace-nowrap">Min contacts:</label>
          <input type="range" min={1} max={50} value={minContacts}
            onChange={(e) => setMinContacts(Number(e.target.value))}
            className="w-[80px] h-1 accent-[#00D657]"
            data-testid="slider-sankey-min-contacts" />
          <span className="text-[10px] font-semibold w-[20px]">{minContacts}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/20 bg-black/20">
        <svg ref={svgRef} width={width} height={height + 30} viewBox={`0 0 ${width} ${height + 30}`} className="w-full">
          {stageLabels.map((sl) => (
            <g key={sl.label}>
              <text x={sl.x + 8} y={14} fill={sl.color} fontSize={11} fontWeight={600} textAnchor="start">{sl.label}</text>
              <line x1={sl.x} y1={22} x2={sl.x} y2={height + 10} stroke={sl.color} strokeWidth={1} opacity={0.15} strokeDasharray="4,4" />
            </g>
          ))}

          {sankeyData.links.map((link: any, i: number) => {
            const d = linkPathGen(link);
            if (!d) return null;
            const srcNode = link.source as any;
            const tgtNode = link.target as any;
            const srcStage = srcNode.stage || "UNKNOWN";
            const tgtStage = tgtNode.stage || "UNKNOWN";
            const srcOrd = STAGE_CONFIG[srcStage]?.order ?? 4;
            const tgtOrd = STAGE_CONFIG[tgtStage]?.order ?? 4;
            let color = "#F59E0B";
            if (srcOrd < tgtOrd) color = "#00D657";
            else if (srcOrd > tgtOrd) color = "#EF4444";

            const isHovered = hoveredLink === i;
            const isNodeHovered = hoveredNode !== null && (srcNode.id === hoveredNode || tgtNode.id === hoveredNode);
            const dimmed = (hoveredNode !== null || hoveredLink !== null) && !isHovered && !isNodeHovered;

            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(1, link.width || 1)}
                strokeOpacity={dimmed ? 0.08 : isHovered || isNodeHovered ? 0.7 : 0.3}
                onMouseEnter={() => setHoveredLink(i)}
                onMouseLeave={() => setHoveredLink(null)}
                className="transition-all duration-200 cursor-pointer"
              />
            );
          })}

          {sankeyData.nodes.map((node: any, i: number) => {
            const stage = node.stage || "UNKNOWN";
            const cfg = getStageConfig(stage);
            const nodeHeight = Math.max(4, (node.y1 || 0) - (node.y0 || 0));
            const isHovered = hoveredNode === node.id;
            const dimmed = hoveredNode !== null && !isHovered;

            return (
              <g
                key={node.id || i}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={(node.x1 || 0) - (node.x0 || 0)}
                  height={nodeHeight}
                  fill={cfg.color}
                  fillOpacity={dimmed ? 0.2 : isHovered ? 1 : 0.7}
                  rx={2}
                  className="transition-all duration-200"
                />
                <text
                  x={(node.x1 || 0) + 6}
                  y={((node.y0 || 0) + (node.y1 || 0)) / 2}
                  dy="0.35em"
                  fill={dimmed ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.85)"}
                  fontSize={10}
                  className="transition-all duration-200"
                >
                  {node.name}
                </text>
              </g>
            );
          })}

          {hoveredLink !== null && sankeyData.links[hoveredLink] && (() => {
            const link = sankeyData.links[hoveredLink] as any;
            const srcNode = link.source as any;
            const tgtNode = link.target as any;
            const midX = ((srcNode.x1 || 0) + (tgtNode.x0 || 0)) / 2;
            const midY = ((link.y0 || 0) + (link.y1 || 0)) / 2;
            return (
              <g>
                <rect x={midX - 80} y={midY - 28} width={160} height={36} rx={6} fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.1)" />
                <text x={midX} y={midY - 12} textAnchor="middle" fill="white" fontSize={10} fontWeight={600}>
                  {link.value} contacts
                </text>
                <text x={midX} y={midY + 2} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={9}>
                  {srcNode.name} → {tgtNode.name}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-[#00D657] inline-block" /> Forward</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" /> Lateral</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-red-400 inline-block" /> Regression</span>
      </div>
    </div>
  );
}

function EnhancedPatterns({ patterns }: { patterns: Pattern[] }) {
  const [sortBy, setSortBy] = useState<"contacts" | "conversion" | "duration">("contacts");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const arr = [...patterns];
    if (sortBy === "conversion") arr.sort((a, b) => b.conversionRate - a.conversionRate);
    else if (sortBy === "duration") arr.sort((a, b) => (a.avgDurationDays ?? 999) - (b.avgDurationDays ?? 999));
    else arr.sort((a, b) => b.contactCount - a.contactCount);
    return arr;
  }, [patterns, sortBy]);

  const maxContacts = Math.max(...sorted.map(p => p.contactCount), 1);

  return (
    <div className="space-y-4" data-testid="enhanced-patterns">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[#67E8F9]" />
          <h4 className="text-sm font-semibold">Journey Patterns</h4>
          <span className="text-[10px] text-muted-foreground">{sorted.length} patterns</span>
        </div>
        <div className="flex gap-1">
          {(["contacts", "conversion", "duration"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${sortBy === s ? "bg-[#00D657]/20 text-[#00D657] font-semibold" : "text-muted-foreground hover:bg-muted/20"}`}
              data-testid={`btn-sort-${s}`}
            >
              {s === "contacts" ? "Most Popular" : s === "conversion" ? "Best Converting" : "Fastest"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {sorted.slice(0, 30).map((p, i) => {
          const stages = p.patternStages.split("→").map(s => s.trim());
          const convPct = Math.round(p.conversionRate * 100);
          const pct = (p.contactCount / maxContacts) * 100;
          const isExpanded = expandedIdx === i;

          return (
            <motion.div
              key={p.patternString + i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
            >
              <div
                className={`rounded-xl border p-3 cursor-pointer transition-colors ${isExpanded ? "border-[#67E8F9]/30 bg-[#67E8F9]/[0.03]" : "border-border/30 bg-muted/5 hover:bg-muted/10"}`}
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                data-testid={`pattern-row-${i}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                    {stages.map((s, si) => (
                      <span key={si} className="flex items-center gap-0.5">
                        <StageBadge stage={s} />
                        {si < stages.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" />}
                      </span>
                    ))}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold">{p.contactCount.toLocaleString()}</span>
                    <span className="text-[9px] text-muted-foreground ml-1">contacts</span>
                  </div>
                  <div className="shrink-0 w-[60px] text-right">
                    <span className={`text-sm font-bold ${convPct > 20 ? "text-[#00D657]" : convPct > 5 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {convPct}%
                    </span>
                    <p className="text-[9px] text-muted-foreground">conversion</p>
                  </div>
                  {p.avgDurationDays != null && (
                    <div className="shrink-0 w-[50px] text-right">
                      <span className="text-xs font-semibold">{Number(p.avgDurationDays).toFixed(0)}d</span>
                      <p className="text-[9px] text-muted-foreground">avg</p>
                    </div>
                  )}
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>

                <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 bg-[#67E8F9]/40" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-4 mr-2 my-1.5 rounded-xl border border-[#67E8F9]/20 bg-[#67E8F9]/[0.03] p-4 space-y-3">
                      <div className="text-xs space-y-1.5">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Full path:</span>{" "}
                          <span className="font-mono text-[10px]">{p.patternString}</span>
                        </p>
                        {p.topEntryAsset && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Entry asset:</span> {formatAssetName(p.topEntryAsset)}
                          </p>
                        )}
                        {p.topExitAsset && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Exit asset:</span> {formatAssetName(p.topExitAsset)}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-[#67E8F9]" />
                            <span>{p.contactCount.toLocaleString()} contacts</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Target className="h-3 w-3 text-[#00D657]" />
                            <span>{convPct}% converted to SQO</span>
                          </div>
                          {p.avgDurationDays != null && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-amber-400" />
                              <span>{Number(p.avgDurationDays).toFixed(1)} days avg</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function EnhancedTopAssets({ assets }: { assets: AssetStat[] }) {
  const [sortBy, setSortBy] = useState<"appearances" | "conversion" | "dropoff">("appearances");
  const [stageFilter, setStageFilter] = useState<string>("");

  const filtered = useMemo(() => {
    let arr = [...assets];
    if (stageFilter) arr = arr.filter(a => a.funnelStage === stageFilter);
    if (sortBy === "conversion") arr.sort((a, b) => b.journeyConversionRate - a.journeyConversionRate);
    else if (sortBy === "dropoff") arr.sort((a, b) => b.dropOffRate - a.dropOffRate);
    else arr.sort((a, b) => b.totalJourneyAppearances - a.totalJourneyAppearances);
    return arr;
  }, [assets, sortBy, stageFilter]);

  const maxAppearances = Math.max(...filtered.map(a => a.totalJourneyAppearances), 1);

  const stageBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const stage = a.funnelStage || "UNKNOWN";
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [assets]);

  return (
    <div className="space-y-4" data-testid="enhanced-top-assets">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h4 className="text-sm font-semibold">Top Assets</h4>
          <span className="text-[10px] text-muted-foreground">{filtered.length} assets</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["appearances", "conversion", "dropoff"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${sortBy === s ? "bg-[#00D657]/20 text-[#00D657] font-semibold" : "text-muted-foreground hover:bg-muted/20"}`}
              data-testid={`btn-sort-asset-${s}`}
            >
              {s === "appearances" ? "Most Seen" : s === "conversion" ? "Best Converting" : "Highest Drop-off"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStageFilter("")}
          className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${!stageFilter ? "bg-white/10 font-semibold" : "text-muted-foreground hover:bg-muted/20"}`}
          data-testid="btn-filter-all-stages"
        >
          All ({assets.length})
        </button>
        {["TOFU", "MOFU", "BOFU", "UNKNOWN"].map(s => {
          const cnt = stageBreakdown[s] || 0;
          if (cnt === 0) return null;
          const cfg = getStageConfig(s);
          return (
            <button key={s} onClick={() => setStageFilter(stageFilter === s ? "" : s)}
              className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${stageFilter === s ? "font-semibold" : "hover:bg-muted/20"}`}
              style={{ color: stageFilter === s ? cfg.color : undefined, backgroundColor: stageFilter === s ? cfg.bg : undefined }}
              data-testid={`btn-filter-stage-${s.toLowerCase()}`}
            >
              {cfg.label} ({cnt})
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {filtered.slice(0, 30).map((a, i) => {
          const convPct = Math.round(a.journeyConversionRate * 100);
          const dropPct = Math.round(a.dropOffRate * 100);
          const pct = (a.totalJourneyAppearances / maxAppearances) * 100;
          const stage = a.funnelStage || "UNKNOWN";

          return (
            <motion.div
              key={a.assetId}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
              className="rounded-xl border border-border/30 bg-muted/5 hover:bg-muted/10 p-3 transition-colors"
              data-testid={`asset-row-${i}`}
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-6 text-center text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <StageBadge stage={stage} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{formatAssetName(a.assetId)}</p>
                  <p className="text-[9px] text-muted-foreground font-mono truncate">{a.assetId}</p>
                </div>

                <div className="shrink-0 grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-sm font-bold">{a.totalJourneyAppearances.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">appearances</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold">{a.uniqueContacts?.toLocaleString() ?? "—"}</p>
                    <p className="text-[9px] text-muted-foreground">contacts</p>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${convPct > 20 ? "text-[#00D657]" : convPct > 5 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {convPct}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">conversion</p>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${dropPct > 70 ? "text-red-400" : dropPct > 40 ? "text-amber-400" : "text-[#00D657]"}`}>
                      {dropPct}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">drop-off</p>
                  </div>
                </div>
              </div>

              <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: getStageConfig(stage).color + "66" }} />
              </div>

              <div className="mt-2 flex items-center gap-3 text-[9px] text-muted-foreground">
                <span>Avg position: <span className="font-semibold text-foreground">{a.avgPositionInJourney}</span></span>
                {a.entryCount != null && <span>Entry: <span className="font-semibold text-foreground">{a.entryCount}</span></span>}
                {a.exitCount != null && <span>Exit: <span className="font-semibold text-foreground">{a.exitCount}</span></span>}
                {a.mostCommonNextAsset && <span>Next: <span className="font-semibold text-foreground">{formatAssetName(a.mostCommonNextAsset)}</span></span>}
                {a.mostCommonPrevAsset && <span>Prev: <span className="font-semibold text-foreground">{formatAssetName(a.mostCommonPrevAsset)}</span></span>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

interface ContentTransition {
  fromAsset: string; fromStage: string; toAsset: string; toStage: string;
  contactCount: number; avgDaysBetween: number | null; dropOffRate: number;
}

interface TransitionContext {
  upstream: Array<{ assetId: string; stage: string; count: number }>;
  downstream: Array<{ assetId: string; stage: string; count: number }>;
}

interface PathInsights {
  dropOffPoints: Array<{ assetId: string; stage: string; dropOffRate: number; appearances: number }>;
  accelerators: Array<{ assetId: string; stage: string; forwardCount: number; avgDays: number }>;
  regressionTriggers: Array<{ assetId: string; stage: string; regressionCount: number }>;
  fastTrackPaths: Array<{ pattern: string; contactCount: number; avgDays: number; entryAsset: string; exitAsset: string }>;
}

const STAGE_ORDER: Record<string, number> = { TOFU: 1, MOFU: 2, BOFU: 3, UNKNOWN: 0 };

function getTransitionColor(fromStage: string, toStage: string): string {
  const fromOrd = STAGE_ORDER[fromStage] ?? 0;
  const toOrd = STAGE_ORDER[toStage] ?? 0;
  if (fromOrd > 0 && toOrd > 0 && toOrd > fromOrd) return "#00D657";
  if (fromOrd > 0 && toOrd > 0 && toOrd < fromOrd) return "#EF4444";
  return "#F59E0B";
}

function getTransitionLabel(fromStage: string, toStage: string): string {
  const fromOrd = STAGE_ORDER[fromStage] ?? 0;
  const toOrd = STAGE_ORDER[toStage] ?? 0;
  if (fromOrd > 0 && toOrd > 0 && toOrd > fromOrd) return "Forward";
  if (fromOrd > 0 && toOrd > 0 && toOrd < fromOrd) return "Regression";
  return "Lateral";
}

function dropOffColor(rate: number): string {
  if (rate > 0.7) return "text-red-400";
  if (rate > 0.4) return "text-amber-400";
  return "text-[#00D657]";
}

function generateInsightLine(t: ContentTransition): string {
  const dropPct = Math.round((t.dropOffRate || 0) * 100);
  const continuePct = 100 - dropPct;
  const direction = getTransitionLabel(t.fromStage, t.toStage);

  if (dropPct > 70) return `${dropPct}% of contacts drop off after this transition — potential nurture gap between these two assets.`;
  if (dropPct < 30 && direction === "Forward") return `${continuePct}% of contacts continue onward after this forward transition — strong handoff.`;
  if (direction === "Regression") return `This is a backward move (${t.fromStage} to ${t.toStage}). ${dropPct}% drop off here.`;
  return `${continuePct}% of contacts continue their journey after this ${direction.toLowerCase()} transition.`;
}

function ContentFlowDiagram({ transitions }: { transitions: ContentTransition[] }) {
  const top20 = transitions.slice(0, 20);
  const maxContacts = Math.max(...top20.map(t => t.contactCount), 1);

  return (
    <div className="space-y-3" data-testid="content-flow-diagram">
      <div className="flex items-center gap-2 mb-2">
        <ArrowLeftRight className="h-4 w-4 text-[#00D657]" />
        <h4 className="text-sm font-semibold">Top Content Flows</h4>
        <span className="text-[10px] text-muted-foreground">Top 20 most-traveled paths</span>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-[#00D657] inline-block" /> Forward</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" /> Lateral</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-red-400 inline-block" /> Regression</span>
      </div>
      <div className="space-y-1">
        {top20.map((t, i) => {
          const pct = (t.contactCount / maxContacts) * 100;
          const color = getTransitionColor(t.fromStage, t.toStage);
          return (
            <motion.div
              key={`flow-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-2 group"
              data-testid={`flow-path-${i}`}
            >
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <StageBadge stage={t.fromStage} />
                <span className="text-[10px] truncate max-w-[120px]">{formatAssetName(t.fromAsset)}</span>
                <ArrowRight className="h-3 w-3 shrink-0" style={{ color }} />
                <StageBadge stage={t.toStage} />
                <span className="text-[10px] truncate max-w-[120px]">{formatAssetName(t.toAsset)}</span>
              </div>
              <div className="w-[200px] shrink-0 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: `${color}80` }}
                  />
                </div>
                <span className="text-[10px] font-semibold w-[40px] text-right" style={{ color }}>{t.contactCount.toLocaleString()}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function TransitionRow({ t, i, maxContacts, onExpand, isExpanded, context, contextLoading, contextError }: {
  t: ContentTransition; i: number; maxContacts: number; onExpand: () => void; isExpanded: boolean;
  context?: TransitionContext; contextLoading: boolean; contextError?: boolean;
}) {
  const pct = (t.contactCount / maxContacts) * 100;
  const color = getTransitionColor(t.fromStage, t.toStage);
  const dRate = Number(t.dropOffRate) || 0;

  return (
    <div data-testid={`content-path-row-${i}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.02, 0.5) }}
        className={`rounded-xl border hover:bg-muted/10 transition-colors p-3 cursor-pointer ${isExpanded ? "border-[#00D657]/30 bg-[#00D657]/[0.03]" : "border-border/30 bg-muted/5"}`}
        onClick={onExpand}
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <StageBadge stage={t.fromStage} />
              <span className="text-xs font-medium truncate">{formatAssetName(t.fromAsset)}</span>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5 ml-1">{t.fromAsset}</p>
          </div>

          <div className="shrink-0 flex flex-col items-center px-2">
            <ArrowRight className="h-4 w-4" style={{ color }} />
            {t.avgDaysBetween != null && (
              <span className="text-[9px] text-muted-foreground mt-0.5">{Number(t.avgDaysBetween).toFixed(1)}d</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <StageBadge stage={t.toStage} />
              <span className="text-xs font-medium truncate">{formatAssetName(t.toAsset)}</span>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5 ml-1">{t.toAsset}</p>
          </div>

          <div className="shrink-0 text-right min-w-[50px]">
            <p className="text-sm font-bold" style={{ color }}>{t.contactCount.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">contacts</p>
          </div>

          <div className="shrink-0 text-right min-w-[50px]">
            <p className={`text-sm font-bold ${dropOffColor(dRate)}`}>{Math.round(dRate * 100)}%</p>
            <p className="text-[9px] text-muted-foreground">drop-off</p>
          </div>

          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </div>

        <div className="mt-2 h-1 rounded-full bg-black/20 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: `${color}66` }} />
        </div>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-4 mr-2 my-1.5 rounded-xl border border-[#00D657]/20 bg-[#00D657]/[0.03] p-4 space-y-3" data-testid="transition-drill-down">
              <p className="text-xs text-muted-foreground italic">{generateInsightLine(t)}</p>

              {contextLoading ? (
                <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Loading context...</span>
                </div>
              ) : contextError ? (
                <div className="text-center py-3 text-red-400 text-xs">Failed to load context data.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" /> Before "{formatAssetName(t.fromAsset)}"
                    </h5>
                    {context?.upstream?.length ? (
                      <div className="space-y-1.5">
                        {context.upstream.map((n, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs">
                            <StageBadge stage={n.stage} />
                            <span className="truncate flex-1">{formatAssetName(n.assetId)}</span>
                            <span className="font-semibold shrink-0 text-[#00D657]">{n.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[10px] text-muted-foreground/60">No upstream assets found</p>}
                  </div>
                  <div>
                    <h5 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> After "{formatAssetName(t.toAsset)}"
                    </h5>
                    {context?.downstream?.length ? (
                      <div className="space-y-1.5">
                        {context.downstream.map((n, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs">
                            <StageBadge stage={n.stage} />
                            <span className="truncate flex-1">{formatAssetName(n.assetId)}</span>
                            <span className="font-semibold shrink-0 text-[#00D657]">{n.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[10px] text-muted-foreground/60">No downstream assets found</p>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InsightCards({ insights }: { insights: PathInsights }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="insight-cards">
      <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-red-400/20 flex items-center justify-center text-red-400 text-xs">!</div>
          <h5 className="text-xs font-semibold">Biggest Drop-off Points</h5>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">Journey ends here most often</p>
        {insights.dropOffPoints.length ? (
          <div className="space-y-2">
            {insights.dropOffPoints.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5" data-testid={`dropoff-card-${i}`}>
                <StageBadge stage={d.stage} />
                <span className="text-[11px] truncate flex-1">{formatAssetName(d.assetId)}</span>
                <span className={`text-[11px] font-bold ${dropOffColor(Number(d.dropOffRate))}`}>{Math.round(Number(d.dropOffRate) * 100)}%</span>
                <span className="text-[9px] text-muted-foreground">({Number(d.appearances).toLocaleString()})</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground/60">No data</p>}
      </div>

      <div className="rounded-xl border border-[#00D657]/20 bg-[#00D657]/[0.04] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-[#00D657]/20 flex items-center justify-center text-[#00D657] text-xs">+</div>
          <h5 className="text-xs font-semibold">Strongest Accelerators</h5>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">Reliably moves contacts forward within 7 days</p>
        {insights.accelerators.length ? (
          <div className="space-y-2">
            {insights.accelerators.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5" data-testid={`accelerator-card-${i}`}>
                <StageBadge stage={a.stage} />
                <span className="text-[11px] truncate flex-1">{formatAssetName(a.assetId)}</span>
                <span className="text-[11px] font-bold text-[#00D657]">{a.forwardCount}</span>
                <span className="text-[9px] text-muted-foreground">({Number(a.avgDays).toFixed(1)}d avg)</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground/60">No data</p>}
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 text-xs font-bold">&#8634;</div>
          <h5 className="text-xs font-semibold">Regression Triggers</h5>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">Most commonly precedes a backward stage move</p>
        {insights.regressionTriggers.length ? (
          <div className="space-y-2">
            {insights.regressionTriggers.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5" data-testid={`regression-card-${i}`}>
                <StageBadge stage={r.stage} />
                <span className="text-[11px] truncate flex-1">{formatAssetName(r.assetId)}</span>
                <span className="text-[11px] font-bold text-amber-400">{r.regressionCount} contacts</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground/60">No data</p>}
      </div>

      <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/[0.04] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA]">
            <Zap className="h-3 w-3" />
          </div>
          <h5 className="text-xs font-semibold">Fast-Track Paths</h5>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">Fastest TOFU-to-BOFU sequences</p>
        {insights.fastTrackPaths.length ? (
          <div className="space-y-2">
            {insights.fastTrackPaths.map((f, i) => {
              const stages = f.pattern.split("\u2192").map((s: string) => s.trim());
              return (
                <div key={i} data-testid={`fasttrack-card-${i}`}>
                  <div className="flex items-center gap-1 flex-wrap">
                    {stages.map((s: string, si: number) => (
                      <span key={si} className="flex items-center gap-0.5">
                        <StageBadge stage={s} />
                        {si < stages.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" />}
                      </span>
                    ))}
                    <span className="text-[11px] font-bold text-[#A78BFA] ml-1">{Number(f.avgDays).toFixed(1)}d</span>
                    <span className="text-[9px] text-muted-foreground">({f.contactCount} contacts)</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-[10px] text-muted-foreground/60">No data</p>}
      </div>
    </div>
  );
}

function ContentPaths() {
  const [fromStageFilter, setFromStageFilter] = useState<string>("");
  const [toStageFilter, setToStageFilter] = useState<string>("");
  const [transitionType, setTransitionType] = useState<string>("");
  const [minContacts, setMinContacts] = useState(5);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  useEffect(() => { setExpandedIdx(null); }, [fromStageFilter, toStageFilter, transitionType, minContacts, debouncedSearch]);

  const handleSearch = useCallback((val: string) => {
    setSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (fromStageFilter) p.set("fromStage", fromStageFilter);
    if (toStageFilter) p.set("toStage", toStageFilter);
    if (transitionType) p.set("transitionType", transitionType);
    if (debouncedSearch) p.set("search", debouncedSearch);
    p.set("minContacts", String(minContacts));
    p.set("limit", "100");
    return p.toString();
  }, [fromStageFilter, toStageFilter, transitionType, debouncedSearch, minContacts]);

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

  const expandedTransition = expandedIdx !== null && transitions ? transitions[expandedIdx] : null;

  const { data: context, isLoading: contextLoading, isError: contextError } = useQuery<TransitionContext>({
    queryKey: ["/api/journey/transition-context", expandedTransition?.fromAsset, expandedTransition?.toAsset],
    queryFn: async () => {
      const res = await authFetch(`/api/journey/transition-context?fromAsset=${encodeURIComponent(expandedTransition!.fromAsset)}&toAsset=${encodeURIComponent(expandedTransition!.toAsset)}`);
      if (!res.ok) throw new Error("Failed to load context");
      return res.json();
    },
    enabled: !!expandedTransition,
    staleTime: 120_000,
    retry: 1,
  });

  const { data: insights, isLoading: insightsLoading, isError: insightsError } = useQuery<PathInsights>({
    queryKey: ["/api/journey/content-path-insights"],
    queryFn: async () => {
      const res = await authFetch("/api/journey/content-path-insights");
      if (!res.ok) throw new Error("Failed to load insights");
      return res.json();
    },
    staleTime: 120_000,
    retry: 1,
  });

  const maxContacts = useMemo(() => {
    if (!transitions?.length) return 1;
    return Math.max(...transitions.map(t => t.contactCount), 1);
  }, [transitions]);

  const stageOptions = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];

  return (
    <div className="space-y-6" data-testid="content-paths">
      <div className="rounded-xl border border-border/20 bg-muted/5 p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">What am I looking at?</span> Content Paths answers: "What content are people consuming in sequence, and where are they dropping off or progressing?" The flow diagram shows top paths, the table shows every transition with drop-off rates, and the insight cards surface actionable patterns.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Computing content transitions...</span>
        </div>
      ) : isError ? (
        <div className="text-center py-16 text-red-400 text-sm">Failed to load content transitions. Please try again.</div>
      ) : !transitions?.length ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No content transitions found.</div>
      ) : (
        <>
          <ContentFlowDiagram transitions={transitions} />

          <div className="border-t border-border/20 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-[#00D657]" />
              <h4 className="text-sm font-semibold">Content Transition Table</h4>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[160px]">
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
              <select value={fromStageFilter} onChange={(e) => setFromStageFilter(e.target.value)}
                className="h-8 px-2 text-xs rounded-md border border-border/30 bg-muted/10 text-foreground" data-testid="select-from-stage">
                <option value="">From: All</option>
                {stageOptions.map(s => <option key={s} value={s}>{getStageConfig(s).label}</option>)}
              </select>
              <select value={toStageFilter} onChange={(e) => setToStageFilter(e.target.value)}
                className="h-8 px-2 text-xs rounded-md border border-border/30 bg-muted/10 text-foreground" data-testid="select-to-stage">
                <option value="">To: All</option>
                {stageOptions.map(s => <option key={s} value={s}>{getStageConfig(s).label}</option>)}
              </select>
              <select value={transitionType} onChange={(e) => setTransitionType(e.target.value)}
                className="h-8 px-2 text-xs rounded-md border border-border/30 bg-muted/10 text-foreground" data-testid="select-transition-type">
                <option value="">All types</option>
                <option value="forward">Forward only</option>
                <option value="regression">Regression only</option>
                <option value="lateral">Lateral only</option>
              </select>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-muted-foreground whitespace-nowrap">Min contacts:</label>
                <input type="range" min={1} max={100} value={minContacts}
                  onChange={(e) => setMinContacts(Number(e.target.value))}
                  className="w-[80px] h-1 accent-[#00D657]"
                  data-testid="slider-min-contacts" />
                <span className="text-[10px] font-semibold w-[24px]">{minContacts}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {transitions.map((t, i) => (
                <TransitionRow
                  key={`${t.fromAsset}-${t.toAsset}-${i}`}
                  t={t} i={i} maxContacts={maxContacts}
                  onExpand={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  isExpanded={expandedIdx === i}
                  context={expandedIdx === i ? context : undefined}
                  contextLoading={expandedIdx === i && contextLoading}
                  contextError={expandedIdx === i && contextError}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-border/20 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-[#A78BFA]" />
              <h4 className="text-sm font-semibold">Asset Intelligence</h4>
              <span className="text-[10px] text-muted-foreground">Auto-surfaced insights from your content data</span>
            </div>
            {insightsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Computing insights...</span>
              </div>
            ) : insightsError ? (
              <div className="text-center py-8 text-red-400 text-xs">Failed to load asset intelligence data.</div>
            ) : insights ? (
              <InsightCards insights={insights} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function JourneyMap({ transitions, topPatterns, topAssetStats, stageFlows, totalInteractions, status }: JourneyMapProps) {
  return (
    <div className="space-y-6" data-testid="journey-map">
      <div className="rounded-xl border border-[#00D657]/20 bg-[#00D657]/[0.04] p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Journey Overview</span> — This map shows how your contacts move through your marketing funnel based on the Eloqua activity data you uploaded. Each contact's content interactions are grouped into a journey, classified by funnel stage (TOFU = awareness, MOFU = consideration, BOFU = decision). Use the tabs below to explore asset-level flows, content paths, journey patterns, and top-performing assets.
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
        <Tabs defaultValue="asset-flow">
          <TabsList className="mb-4">
            <TabsTrigger value="asset-flow" data-testid="tab-asset-flow">
              <Network className="h-3.5 w-3.5 mr-1" />
              Asset Flow
            </TabsTrigger>
            <TabsTrigger value="content-paths" data-testid="tab-content-paths">
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
              Content Paths
            </TabsTrigger>
            <TabsTrigger value="patterns" data-testid="tab-patterns">
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              Journey Patterns
            </TabsTrigger>
            {topAssetStats && topAssetStats.length > 0 && (
              <TabsTrigger value="assets" data-testid="tab-assets">
                <Trophy className="h-3.5 w-3.5 mr-1" />
                Top Assets
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="asset-flow">
            <D3SankeyDiagram initialFlows={stageFlows} />
          </TabsContent>

          <TabsContent value="content-paths">
            <ContentPaths />
          </TabsContent>

          <TabsContent value="patterns">
            <EnhancedPatterns patterns={topPatterns} />
          </TabsContent>

          {topAssetStats && topAssetStats.length > 0 && (
            <TabsContent value="assets">
              <EnhancedTopAssets assets={topAssetStats} />
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  );
}
