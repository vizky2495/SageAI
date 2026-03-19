import TopNav from "@/components/top-nav";
import PageChat from "@/components/page-chat";

import JourneyUpload from "@/components/journey-upload";
import JourneyMap from "@/components/journey-map";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch, queryClient } from "@/lib/queryClient";
import { motion } from "framer-motion";
import {
  Filter,
  Loader2,
  BarChart3,
  Table as TableIcon,
  GitBranch,
  Database,
  ArrowRight,
  Plug,
  Upload,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useFunnelData,
  sum,
  pct,
  formatCompact,
  formatPct,
  stageMeta,
  type FunnelStage,
  type StageKey,
  type NormalizedRow,
  type TopContentRow,
  type TopByStage,
} from "@/hooks/use-funnel-data";

export default function AnalyticsPage() {
  const { rows, dataLoading, uploadDiagnostics } = useFunnelData();
  const [showJourneyUpload, setShowJourneyUpload] = useState(false);

  const { data: journeyBatches, refetch: refetchJourneyBatches } = useQuery<{
    batches: Array<{ batchId: string; uploadDate: string; interactionCount: number }>;
    totalInteractions: number;
  }>({
    queryKey: ["/api/journey/batches"],
    queryFn: async () => {
      const res = await authFetch("/api/journey/batches");
      if (!res.ok) return { batches: [], totalInteractions: 0 };
      return res.json();
    },
  });

  const { data: journeySummaries } = useQuery<{
    status: { contactJourneyCount: number; patternCount: number; transitionCount: number; assetStatCount: number };
    transitions: Array<{ fromStage: string; toStage: string; contactCount: number; avgDaysBetween: number | null }>;
    topPatterns: Array<{ patternString: string; patternStages: string; contactCount: number; conversionRate: number; topEntryAsset?: string; topExitAsset?: string; avgDurationDays?: number }>;
    topAssetStats: Array<{ assetId: string; totalJourneyAppearances: number; avgPositionInJourney: number; mostCommonNextAsset: string | null; mostCommonPrevAsset: string | null; journeyConversionRate: number; avgJourneyLengthWhenIncluded: number; dropOffRate: number; funnelStage?: string | null; uniqueContacts?: number | null; entryCount?: number | null; exitCount?: number | null; passThroughCount?: number | null }>;
    stageFlows?: Array<{ fromAssetId: string; fromStage: string; toAssetId: string; toStage: string; contactCount: number; avgDaysBetween: number | null }>;
    totalInteractions: number;
    buildProgress: { status: string; message: string };
  }>({
    queryKey: ["/api/journey/summaries"],
    queryFn: async () => {
      const res = await authFetch("/api/journey/summaries");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!(journeyBatches && journeyBatches.totalInteractions > 0),
    staleTime: 60_000,
  });

  const [stageFilter, setStageFilter] = useState<FunnelStage | "ALL">("ALL");
  const [dimension, setDimension] = useState<"utmChannel" | "productFranchise" | "contentType">("utmChannel");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [productStageExpand, setProductStageExpand] = useState<{ product: string; stage: string } | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string>("ALL");
  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");
  const [industryStageExpand, setIndustryStageExpand] = useState<{ industry: string; stage: string } | null>(null);
  const [channelStageExpand, setChannelStageExpand] = useState<{ channel: string; stage: string } | null>(null);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedIndustries, setExpandedIndustries] = useState<Set<string>>(new Set());
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllIndustries, setShowAllIndustries] = useState(false);

  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>([]);
  const [ctDropdownOpen, setCtDropdownOpen] = useState(false);
  const [showCtaCharts, setShowCtaCharts] = useState(false);
  const [ctSortCol, setCtSortCol] = useState<"sqos" | "pageViews" | "downloads" | "newContacts" | "content" | "stage" | "utmChannel" | "productFranchise">("sqos");
  const [ctSortDir, setCtSortDir] = useState<"asc" | "desc">("desc");
  const [ctPage, setCtPage] = useState(0);
  const [ctAssetSearch, setCtAssetSearch] = useState("");
  const CT_PAGE_SIZE = 20;

  const campaignList = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.campaignName) s.add(r.campaignName);
    }
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = stageFilter === "ALL" ? rows : rows.filter((r) => r.stage === stageFilter);
    if (contentTypeFilter !== "ALL") {
      result = result.filter((r) => (r.contentType || "(unattributed)") === contentTypeFilter);
    }
    if (campaignFilter !== "ALL") {
      result = result.filter((r) => (r.campaignName || "(unattributed)") === campaignFilter);
    }
    return result;
  }, [rows, stageFilter, contentTypeFilter, campaignFilter]);

  const allContentTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.contentType) set.add(r.contentType);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const ctFiltered = useMemo(() => {
    if (selectedContentTypes.length === 0) return filtered;
    const selected = new Set(selectedContentTypes.map(t => t.toLowerCase()));
    return filtered.filter((r) => {
      const ct = (r.contentType || "").toLowerCase().trim();
      return selected.has(ct);
    });
  }, [filtered, selectedContentTypes]);

  const toggleContentType = (type: string) => {
    setSelectedContentTypes(prev => {
      const exists = prev.includes(type);
      const next = exists ? prev.filter(t => t !== type) : [...prev, type];
      setCtPage(0);
      return next;
    });
  };

  const ctSummaryStats = useMemo(() => ({
    assets: ctFiltered.length,
    views: sum(ctFiltered, "pageViews"),
    downloads: sum(ctFiltered, "downloads"),
    sqos: sum(ctFiltered, "sqos"),
  }), [ctFiltered]);

  const ctStageData = useMemo(() => {
    const stages: Record<string, { count: number; views: number; downloads: number; leads: number; sqos: number }> = {};
    for (const s of ["TOFU", "MOFU", "BOFU", "UNKNOWN"]) {
      stages[s] = { count: 0, views: 0, downloads: 0, leads: 0, sqos: 0 };
    }
    for (const r of ctFiltered) {
      const s = stages[r.stage] || stages.UNKNOWN;
      s.count += 1;
      s.views += r.pageViews ?? 0;
      s.downloads += r.downloads ?? 0;
      s.leads += r.newContacts ?? 0;
      s.sqos += r.sqos ?? 0;
    }
    return stages;
  }, [ctFiltered]);

  const ctSearchFiltered = useMemo(() => {
    if (!ctAssetSearch.trim()) return ctFiltered;
    const q = ctAssetSearch.trim().toLowerCase();
    return ctFiltered.filter(r => (r.content || "").toLowerCase().includes(q));
  }, [ctFiltered, ctAssetSearch]);

  const ctSortedAssets = useMemo(() => {
    const sorted = [...ctSearchFiltered].sort((a, b) => {
      let av: any, bv: any;
      if (ctSortCol === "content") { av = a.content || ""; bv = b.content || ""; }
      else if (ctSortCol === "stage") { av = a.stage; bv = b.stage; }
      else if (ctSortCol === "utmChannel") { av = a.utmChannel || ""; bv = b.utmChannel || ""; }
      else if (ctSortCol === "productFranchise") { av = a.productFranchise || ""; bv = b.productFranchise || ""; }
      else { av = (a as any)[ctSortCol] ?? 0; bv = (b as any)[ctSortCol] ?? 0; }
      if (typeof av === "string") return ctSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return ctSortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [ctSearchFiltered, ctSortCol, ctSortDir]);

  const ctTotalPages = Math.max(1, Math.ceil(ctSortedAssets.length / CT_PAGE_SIZE));
  const ctSafePage = Math.min(ctPage, ctTotalPages - 1);
  const ctPagedAssets = useMemo(() => ctSortedAssets.slice(ctSafePage * CT_PAGE_SIZE, (ctSafePage + 1) * CT_PAGE_SIZE), [ctSortedAssets, ctSafePage]);

  const ctChannelBreakdown = useMemo(() => {
    const roll = new Map<string, { channel: string; count: number; views: number; sqos: number }>();
    for (const r of ctFiltered) {
      const ch = r.utmChannel || "(unattributed)";
      const cur = roll.get(ch) || { channel: ch, count: 0, views: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(ch, cur);
    }
    return Array.from(roll.values()).sort((a, b) => b.views - a.views);
  }, [ctFiltered]);

  const handleCtSort = (col: typeof ctSortCol) => {
    if (ctSortCol === col) setCtSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCtSortCol(col); setCtSortDir("desc"); }
    setCtPage(0);
  };

  const byStage = useMemo(() => {
    const groups: Record<FunnelStage, NormalizedRow[]> = { TOFU: [], MOFU: [], BOFU: [], UNKNOWN: [] };
    for (const r of filtered) groups[r.stage].push(r);
    return groups;
  }, [filtered]);

  const contentTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.contentType || "(unattributed)");
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const topByStage: TopByStage = useMemo(() => {
    const compute = (stage: StageKey) => {
      const base = byStage[stage];
      const metricKey: keyof NormalizedRow = uploadDiagnostics
        ? "pageViews"
        : stage === "TOFU"
          ? (sum(base, "newUsers") ? "newUsers" : "newContacts")
          : stage === "MOFU" ? "mqls" : "sqos";

      const roll = new Map<string, { row: NormalizedRow; value: number; newContacts: number }>();
      for (const r of base) {
        const k = r.content || "(no content)";
        const v = typeof r[metricKey] === "number" ? (r[metricKey] as number) : 0;
        const nc = typeof r.newContacts === "number" ? r.newContacts : 0;
        const prev = roll.get(k);
        if (!prev) roll.set(k, { row: r, value: v, newContacts: nc });
        else roll.set(k, { row: prev.row, value: prev.value + v, newContacts: prev.newContacts + nc });
      }

      return Array.from(roll.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map((x) => ({
          content: x.row.content || "(no content)",
          product: x.row.productFranchise || "—",
          channel: x.row.utmChannel || "—",
          value: x.value,
          newContacts: x.newContacts,
        }));
    };
    return { TOFU: compute("TOFU"), MOFU: compute("MOFU"), BOFU: compute("BOFU") };
  }, [byStage, uploadDiagnostics]);

  const dimensionData = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; engaged: number; views: number; newUsers: number; returningUsers: number; contacts: number; mqls: number; qdcs: number; sqos: number; downloads: number; leads: number; tofu: number; mofu: number; bofu: number }>();
    for (const r of filtered) {
      const key = (r[dimension] as string | undefined) || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, engaged: 0, views: 0, newUsers: 0, returningUsers: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, downloads: 0, leads: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.engaged += r.engagedSessions ?? 0;
      cur.views += r.pageViews ?? 0;
      cur.newUsers += r.newUsers ?? 0;
      cur.returningUsers += r.returningUsers ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      cur.downloads += r.downloads ?? 0;
      cur.leads += r.newContacts ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.sqos + b.mqls + b.contacts + b.newUsers + b.views + b.engaged - (a.sqos + a.mqls + a.contacts + a.newUsers + a.views + a.engaged));
  }, [filtered, dimension]);

  const productList = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { if (r.productFranchise) s.add(r.productFranchise); }
    return Array.from(s).sort();
  }, [rows]);

  const productMixData = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; contacts: number; mqls: number; qdcs: number; sqos: number; downloads: number; leads: number; tofu: number; mofu: number; bofu: number }>();
    const source = productFilter === "ALL" ? filtered : filtered.filter((r) => r.productFranchise === productFilter);
    for (const r of source) {
      const key = r.productFranchise || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, downloads: 0, leads: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      cur.downloads += r.downloads ?? 0;
      cur.leads += r.newContacts ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values()).sort((a, b) => b.count + b.sqos + b.mqls - (a.count + a.sqos + a.mqls));
  }, [filtered, productFilter]);

  const productStageContentIds = useMemo(() => {
    if (!productStageExpand) return [];
    const { product, stage } = productStageExpand;
    return filtered
      .filter((r) => (r.productFranchise || "(unattributed)") === product && r.stage === stage)
      .map((r) => ({ content: r.content, channel: r.utmChannel || "", cta: r.cta || "", views: r.pageViews ?? 0, contacts: r.formSubmissions ?? r.newContacts ?? 0, mqls: r.mqls ?? 0, sqos: r.sqos ?? 0 }))
      .sort((a, b) => b.sqos + b.mqls + b.views - (a.sqos + a.mqls + a.views));
  }, [filtered, productStageExpand]);

  const channelStageContentIds = useMemo(() => {
    if (!channelStageExpand) return [];
    const { channel, stage } = channelStageExpand;
    return filtered
      .filter((r) => ((r[dimension] as string | undefined) || "(unattributed)") === channel && r.stage === stage)
      .map((r) => ({ content: r.content, product: r.productFranchise || "", channel: r.utmChannel || "", cta: r.cta || "", views: r.pageViews ?? 0, contacts: r.formSubmissions ?? r.newContacts ?? 0, mqls: r.mqls ?? 0, sqos: r.sqos ?? 0 }))
      .sort((a, b) => b.sqos + b.mqls + b.views - (a.sqos + a.mqls + a.views));
  }, [filtered, channelStageExpand, dimension]);

  const industryList = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { if (r.industry) s.add(r.industry); }
    return Array.from(s).sort();
  }, [rows]);

  const industryMixData = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; contacts: number; mqls: number; qdcs: number; sqos: number; downloads: number; leads: number; tofu: number; mofu: number; bofu: number }>();
    const source = industryFilter === "ALL" ? filtered : filtered.filter((r) => r.industry === industryFilter);
    for (const r of source) {
      const key = r.industry || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, downloads: 0, leads: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      cur.downloads += r.downloads ?? 0;
      cur.leads += r.newContacts ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values()).sort((a, b) => b.count + b.sqos + b.mqls - (a.count + a.sqos + a.mqls));
  }, [filtered, industryFilter]);

  const industryStageContentIds = useMemo(() => {
    if (!industryStageExpand) return [];
    const { industry, stage } = industryStageExpand;
    return filtered
      .filter((r) => (r.industry || "(unattributed)") === industry && r.stage === stage)
      .map((r) => ({ content: r.content, product: r.productFranchise || "", channel: r.utmChannel || "", cta: r.cta || "", views: r.pageViews ?? 0, contacts: r.formSubmissions ?? r.newContacts ?? 0, mqls: r.mqls ?? 0, sqos: r.sqos ?? 0 }))
      .sort((a, b) => b.sqos + b.mqls + b.views - (a.sqos + a.mqls + a.views));
  }, [filtered, industryStageExpand]);

  const ctaByStage = useMemo(() => {
    const map: Record<string, Map<string, number>> = { TOFU: new Map(), MOFU: new Map(), BOFU: new Map() };
    for (const r of filtered) {
      const ctaVal = r.cta || "(none)";
      const s = r.stage;
      if (s === "TOFU" || s === "MOFU" || s === "BOFU") {
        map[s].set(ctaVal, (map[s].get(ctaVal) || 0) + 1);
      }
    }
    const toArr = (m: Map<string, number>) => Array.from(m.entries()).map(([cta, count]) => ({ cta, count })).sort((a, b) => b.count - a.count);
    return { TOFU: toArr(map.TOFU), MOFU: toArr(map.MOFU), BOFU: toArr(map.BOFU) };
  }, [filtered]);

  const ctaSummary = useMemo(() => {
    const ctaMap = new Map<string, { cta: string; assets: number; tofu: number; mofu: number; bofu: number; pageViews: number; leads: number; sqos: number }>();
    for (const r of filtered) {
      const ctaVal = r.cta || "(none)";
      if (!ctaMap.has(ctaVal)) ctaMap.set(ctaVal, { cta: ctaVal, assets: 0, tofu: 0, mofu: 0, bofu: 0, pageViews: 0, leads: 0, sqos: 0 });
      const entry = ctaMap.get(ctaVal)!;
      entry.assets += 1;
      if (r.stage === "TOFU") entry.tofu += 1;
      else if (r.stage === "MOFU") entry.mofu += 1;
      else if (r.stage === "BOFU") entry.bofu += 1;
      entry.pageViews += r.pageViews || 0;
      entry.leads += r.newContacts || 0;
      entry.sqos += r.sqos || 0;
    }
    return Array.from(ctaMap.values()).sort((a, b) => b.assets - a.assets);
  }, [filtered]);

  if (dataLoading) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
          <div className="absolute inset-0 grain" />
        </div>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-6 py-8 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          <header className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-card shadow-sm">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-balance text-2xl font-[650] tracking-tight" data-testid="text-analytics-title">
                      Deep Dive Analytics
                    </h1>
                    <Badge variant="secondary" className="border bg-card/70 backdrop-blur" data-testid="badge-analytics">
                      Explore
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground" data-testid="text-analytics-subtitle">
                    Filter, drill down, and analyze content performance by channel, product, industry, and CTA.
                  </p>
                </div>
              </div>
              {rows.length > 0 && (
                <div className="text-xs text-muted-foreground" data-testid="text-analytics-count">
                  {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} assets
                </div>
              )}
            </div>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm font-medium" data-testid="text-filters">Filters & views</div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Stage</span>
                  <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as FunnelStage | "ALL")}>
                    <SelectTrigger className="h-8 w-[120px] rounded-xl text-xs" data-testid="select-stage"><SelectValue placeholder="All stages" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" data-testid="option-stage-all">All stages</SelectItem>
                      <SelectItem value="TOFU" data-testid="option-stage-tofu">TOFU</SelectItem>
                      <SelectItem value="MOFU" data-testid="option-stage-mofu">MOFU</SelectItem>
                      <SelectItem value="BOFU" data-testid="option-stage-bofu">BOFU</SelectItem>
                      <SelectItem value="UNKNOWN" data-testid="option-stage-unknown">UNKNOWN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                    <SelectTrigger className="h-8 w-[130px] rounded-xl text-xs" data-testid="select-content-type"><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                      {contentTypeOptions.map((opt) => (
                        <SelectItem key={opt} value={opt} data-testid={`option-content-type-${opt.replace(/\s+/g, "-").toLowerCase()}`}>
                          {opt === "ALL" ? "All types" : opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Channel</span>
                  <Select value={dimension} onValueChange={(v) => setDimension(v as typeof dimension)}>
                    <SelectTrigger className="h-8 w-[130px] rounded-xl text-xs" data-testid="select-channel-dimension"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utmChannel">UTM Channel</SelectItem>
                      <SelectItem value="productFranchise">Product</SelectItem>
                      <SelectItem value="contentType">Content Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Product</span>
                  <Select value={productFilter} onValueChange={setProductFilter}>
                    <SelectTrigger className="h-8 w-[130px] rounded-xl text-xs" data-testid="select-product-filter"><SelectValue placeholder="All products" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" data-testid="option-product-all">All products</SelectItem>
                      {productList.map((p) => (<SelectItem key={p} value={p} data-testid={`option-product-${p.replace(/\s+/g, "-").toLowerCase()}`}>{p}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Industry</span>
                  <Select value={industryFilter} onValueChange={setIndustryFilter}>
                    <SelectTrigger className="h-8 w-[130px] rounded-xl text-xs" data-testid="select-industry-filter"><SelectValue placeholder="All industries" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" data-testid="option-industry-all">All industries</SelectItem>
                      {industryList.map((ind) => (<SelectItem key={ind} value={ind} data-testid={`option-industry-${ind.replace(/\s+/g, "-").toLowerCase()}`}>{ind}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Campaign</span>
                  <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                    <SelectTrigger className="h-8 w-[140px] rounded-xl text-xs" data-testid="select-campaign-filter"><SelectValue placeholder="All campaigns" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" data-testid="option-campaign-all">All campaigns</SelectItem>
                      {campaignList.map((c) => (<SelectItem key={c} value={c} data-testid={`option-campaign-${c.replace(/\s+/g, "-").toLowerCase()}`}>{c}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </header>

          <div className="mt-4 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCtaCharts(v => !v)}
              className="rounded-xl border bg-card/60 hover:bg-muted/50"
              data-testid="btn-toggle-cta-charts"
            >
              <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showCtaCharts ? "rotate-180" : ""}`} />
              {showCtaCharts ? "Hide" : "Show"} CTA Breakdown by Stage
            </Button>
            {showCtaCharts && (
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                {(["TOFU", "MOFU", "BOFU"] as StageKey[]).map((stage) => {
                  const stageColors: Record<string, string> = { TOFU: "hsl(var(--chart-1))", MOFU: "hsl(var(--chart-2))", BOFU: "hsl(var(--chart-3))" };
                  const data = ctaByStage[stage];
                  const chartHeight = Math.max(200, data.length * 32 + 40);
                  return (
                    <Card key={stage} className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid={`card-cta-${stage.toLowerCase()}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" data-testid={`text-cta-stage-title-${stage.toLowerCase()}`}>{stage} — CTA Breakdown</div>
                          <div className="mt-1 text-xs text-muted-foreground">Count of content IDs per CTA type</div>
                        </div>
                        <Badge variant="secondary" className="rounded-xl" data-testid={`badge-cta-stage-${stage.toLowerCase()}`}>{data.reduce((s, d) => s + d.count, 0)} assets</Badge>
                      </div>
                      <div className="mt-3" style={{ height: chartHeight }} data-testid={`chart-cta-${stage.toLowerCase()}`}>
                        {data.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} layout="vertical" barCategoryGap={4} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                              <YAxis type="category" dataKey="cta" tickLine={false} axisLine={false} width={120} tick={{ fontSize: 11 }} />
                              <ReTooltip formatter={(value: number) => [value, "Content IDs"]} />
                              <Bar dataKey="count" name="Content IDs" fill={stageColors[stage]} radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No CTA data for {stage}</div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {(() => {
            const toggleSet = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
              const next = new Set(set);
              if (next.has(key)) next.delete(key); else next.add(key);
              setter(next);
            };
            const stageColors = { TOFU: "#00D657", MOFU: "#4ECDC4", BOFU: "#9B59B6" };
            const MixAccordionCard = ({ d, isCardExpanded, onToggleCard, stageExpandState, onToggleStage, onCloseStage, stageContentIds, mixType }: {
              d: { key: string; count: number; views: number; sqos: number; downloads: number; leads: number; tofu: number; mofu: number; bofu: number };
              isCardExpanded: boolean;
              onToggleCard: () => void;
              stageExpandState: { key: string; stage: string } | null;
              onToggleStage: (stage: string, e: React.MouseEvent) => void;
              onCloseStage: () => void;
              stageContentIds: { content: string; product?: string; channel?: string; cta?: string; views: number; sqos: number }[];
              mixType: string;
            }) => {
              const slug = d.key.replace(/[\s\/]+/g, "-").toLowerCase();
              const total = d.tofu + d.mofu + d.bofu;
              const isStageExpanded = (s: string) => stageExpandState?.key === d.key && stageExpandState?.stage === s;
              const expandedStageData = (["TOFU", "MOFU", "BOFU"] as const).find(s => isStageExpanded(s));
              return (
                <div key={d.key}>
                  <div
                    className={`w-full rounded-xl border transition-all cursor-pointer overflow-hidden ${isCardExpanded ? "bg-card/80 shadow-md border-border" : "bg-card/60 hover:shadow hover:bg-card/80"}`}
                    data-testid={`row-${mixType}-${slug}`}
                  >
                    <div className="px-3 py-2.5" onClick={onToggleCard}>
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isCardExpanded ? "rotate-90" : ""}`} />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{d.key}</div>
                          <div className="flex items-center gap-2 text-xs shrink-0">
                            <span className="text-muted-foreground">{d.count} assets</span>
                            <span className="font-semibold text-foreground">{formatCompact(d.sqos)} SQOs</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isCardExpanded && (
                      <div className="px-3 pb-3 border-t border-border/30">
                        <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                          <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
                            <div className="text-sm font-semibold">{formatCompact(d.views)}</div>
                            <div className="text-[10px] text-muted-foreground">Page Views</div>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
                            <div className="text-sm font-semibold">{formatCompact(d.leads)}</div>
                            <div className="text-[10px] text-muted-foreground">Leads</div>
                          </div>
                          <div className="rounded-lg bg-muted/30 px-2.5 py-2 text-center">
                            <div className="text-sm font-semibold">{formatCompact(d.downloads)}</div>
                            <div className="text-[10px] text-muted-foreground">Downloads</div>
                          </div>
                        </div>

                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Stage Distribution</div>
                        {total > 0 && (
                          <div className="flex gap-0.5 h-5 rounded-lg overflow-hidden mb-2">
                            {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                              const val = stage === "TOFU" ? d.tofu : stage === "MOFU" ? d.mofu : d.bofu;
                              const pct = (val / total) * 100;
                              if (pct === 0) return null;
                              return (
                                <div
                                  key={stage}
                                  className="flex items-center justify-center text-[9px] font-semibold text-white"
                                  style={{ width: `${pct}%`, backgroundColor: stageColors[stage] }}
                                >
                                  {pct >= 15 ? `${Math.round(pct)}%` : ""}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                            const val = stage === "TOFU" ? d.tofu : stage === "MOFU" ? d.mofu : d.bofu;
                            if (val === 0) return null;
                            const active = isStageExpanded(stage);
                            return (
                              <button
                                key={stage}
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer hover:opacity-80 ${active ? "ring-1 ring-offset-1" : ""}`}
                                style={{ backgroundColor: stageColors[stage] + "20", color: stageColors[stage], ...(active ? { ringColor: stageColors[stage] } : {}) }}
                                onClick={(e) => onToggleStage(stage, e)}
                                data-testid={`btn-${mixType}-stage-${slug}-${stage.toLowerCase()}`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stageColors[stage] }} />
                                {val} {stage}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {isCardExpanded && expandedStageData && (
                    <div className="mt-1 mb-1 ml-3 rounded-xl border bg-card/40 p-3" data-testid={`drilldown-${mixType}-${slug}-${expandedStageData.toLowerCase()}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs" style={{ backgroundColor: stageColors[expandedStageData] + "20", color: stageColors[expandedStageData] }}>{expandedStageData}</Badge>
                          <span className="text-xs text-muted-foreground">{stageContentIds.length} content {stageContentIds.length === 1 ? "asset" : "assets"}</span>
                        </div>
                        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={onCloseStage} data-testid={`btn-close-${mixType}-drilldown`}>Close</button>
                      </div>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {stageContentIds.map((item, idx) => (
                          <div key={`${item.content}-${idx}`} className="flex items-center justify-between rounded-lg border bg-card/60 px-2.5 py-1.5 text-xs" data-testid={`${mixType}-drilldown-item-${idx}`}>
                            <div className="min-w-0 flex-1 truncate font-medium" title={item.content}>{item.content}</div>
                            <div className="flex items-center gap-2 text-muted-foreground shrink-0 ml-2">
                              {item.product && <span>{item.product}</span>}
                              {item.channel && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span>{item.channel}</span></>)}
                              {item.sqos > 0 && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(item.sqos)} SQOs</span></>)}
                            </div>
                          </div>
                        ))}
                        {stageContentIds.length === 0 && (<div className="text-center text-xs text-muted-foreground py-3">No content assets found.</div>)}
                      </div>
                    </div>
                  )}
                </div>
              );
            };
            const visibleChannels = showAllChannels ? dimensionData : dimensionData.slice(0, 5);
            const visibleProducts = showAllProducts ? productMixData : productMixData.slice(0, 5);
            const visibleIndustries = showAllIndustries ? industryMixData : industryMixData.slice(0, 5);
            return (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-channel-mix">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium" data-testid="text-channel-mix-title">Channel Mix</div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-channel-mix-subtitle">Breakdown by UTM channel.</div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl" data-testid="badge-channel-count">{dimensionData.length} channels</Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="grid gap-2 max-h-[520px] overflow-y-auto pr-1">
                    {visibleChannels.map((d) => (
                      <MixAccordionCard
                        key={d.key}
                        d={d}
                        isCardExpanded={expandedChannels.has(d.key)}
                        onToggleCard={() => toggleSet(expandedChannels, d.key, setExpandedChannels)}
                        stageExpandState={channelStageExpand ? { key: channelStageExpand.channel, stage: channelStageExpand.stage } : null}
                        onToggleStage={(stage, e) => { e.stopPropagation(); setChannelStageExpand(channelStageExpand?.channel === d.key && channelStageExpand?.stage === stage ? null : { channel: d.key, stage }); }}
                        onCloseStage={() => setChannelStageExpand(null)}
                        stageContentIds={channelStageContentIds}
                        mixType="channel"
                      />
                    ))}
                  </div>
                  {dimensionData.length > 5 && (
                    <button
                      className="mt-2 w-full text-center text-xs text-[#00D657] hover:underline py-1.5 cursor-pointer"
                      onClick={() => setShowAllChannels(v => !v)}
                      data-testid="btn-view-all-channels"
                    >
                      {showAllChannels ? "Show less" : `View all ${dimensionData.length} channels`}
                    </button>
                  )}
                </Card>

                <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-product-mix">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium" data-testid="text-product-mix-title">Product Mix</div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-product-mix-subtitle">Breakdown by product franchise.</div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl" data-testid="badge-product-count">{productMixData.length} products</Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="grid gap-2 max-h-[520px] overflow-y-auto pr-1">
                    {visibleProducts.map((d) => (
                      <MixAccordionCard
                        key={d.key}
                        d={d}
                        isCardExpanded={expandedProducts.has(d.key)}
                        onToggleCard={() => toggleSet(expandedProducts, d.key, setExpandedProducts)}
                        stageExpandState={productStageExpand ? { key: productStageExpand.product, stage: productStageExpand.stage } : null}
                        onToggleStage={(stage, e) => { e.stopPropagation(); setProductStageExpand(productStageExpand?.product === d.key && productStageExpand?.stage === stage ? null : { product: d.key, stage }); }}
                        onCloseStage={() => setProductStageExpand(null)}
                        stageContentIds={productStageContentIds}
                        mixType="product"
                      />
                    ))}
                  </div>
                  {productMixData.length > 5 && (
                    <button
                      className="mt-2 w-full text-center text-xs text-[#00D657] hover:underline py-1.5 cursor-pointer"
                      onClick={() => setShowAllProducts(v => !v)}
                      data-testid="btn-view-all-products"
                    >
                      {showAllProducts ? "Show less" : `View all ${productMixData.length} products`}
                    </button>
                  )}
                </Card>

                <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-industry-mix">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium" data-testid="text-industry-mix-title">Industry Mix</div>
                      <div className="mt-1 text-xs text-muted-foreground" data-testid="text-industry-mix-subtitle">Breakdown by industry / vertical.</div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl" data-testid="badge-industry-count">{industryMixData.length} industries</Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="grid gap-2 max-h-[520px] overflow-y-auto pr-1">
                    {visibleIndustries.map((d) => (
                      <MixAccordionCard
                        key={d.key}
                        d={d}
                        isCardExpanded={expandedIndustries.has(d.key)}
                        onToggleCard={() => toggleSet(expandedIndustries, d.key, setExpandedIndustries)}
                        stageExpandState={industryStageExpand ? { key: industryStageExpand.industry, stage: industryStageExpand.stage } : null}
                        onToggleStage={(stage, e) => { e.stopPropagation(); setIndustryStageExpand(industryStageExpand?.industry === d.key && industryStageExpand?.stage === stage ? null : { industry: d.key, stage }); }}
                        onCloseStage={() => setIndustryStageExpand(null)}
                        stageContentIds={industryStageContentIds}
                        mixType="industry"
                      />
                    ))}
                  </div>
                  {industryMixData.length > 5 && (
                    <button
                      className="mt-2 w-full text-center text-xs text-[#00D657] hover:underline py-1.5 cursor-pointer"
                      onClick={() => setShowAllIndustries(v => !v)}
                      data-testid="btn-view-all-industries"
                    >
                      {showAllIndustries ? "Show less" : `View all ${industryMixData.length} industries`}
                    </button>
                  )}
                </Card>
              </div>
            );
          })()}

          <Tabs defaultValue="by-content-type" className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-2xl border bg-card/60 p-1 shadow-sm backdrop-blur">
              <TabsTrigger value="by-content-type" className="rounded-xl" data-testid="tab-by-content-type">
                <BarChart3 className="mr-2 h-4 w-4" />By Content Type
              </TabsTrigger>
              <TabsTrigger value="cta-analysis" className="rounded-xl" data-testid="tab-cta-analysis">
                <Filter className="mr-2 h-4 w-4" />CTA Analysis
              </TabsTrigger>
              <TabsTrigger value="top-content" className="rounded-xl" data-testid="tab-top-content">
                <TableIcon className="mr-2 h-4 w-4" />Top content
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cta-analysis" className="mt-4">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium" data-testid="text-cta-title">CTA Performance Summary</div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-cta-subtitle">Metrics breakdown per CTA type across all funnel stages.</div>
                  </div>
                  <Badge variant="secondary" className="rounded-xl" data-testid="badge-cta-count">{ctaSummary.length} CTAs</Badge>
                </div>
                <div className="mt-4 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CTA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">TOFU</TableHead>
                        <TableHead className="text-right">MOFU</TableHead>
                        <TableHead className="text-right">BOFU</TableHead>
                        <TableHead className="text-right">Page Views</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">SQOs</TableHead>
                        <TableHead className="text-right">Conv.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctaSummary.map((d, idx) => (
                        <TableRow key={d.cta} className="hover:bg-muted/30" data-testid={`row-cta-${idx}`}>
                          <TableCell><div className="text-sm font-medium" data-testid={`text-cta-name-${idx}`}>{d.cta}</div></TableCell>
                          <TableCell className="text-right text-sm font-[650]" data-testid={`text-cta-assets-${idx}`}>{formatCompact(d.assets)}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-tofu-${idx}`}>{d.tofu || "—"}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-mofu-${idx}`}>{d.mofu || "—"}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-bofu-${idx}`}>{d.bofu || "—"}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-views-${idx}`}>{formatCompact(d.pageViews)}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-leads-${idx}`}>{formatCompact(d.leads)}</TableCell>
                          <TableCell className="text-right text-sm font-[650]" data-testid={`text-cta-sqos-${idx}`}>{formatCompact(d.sqos)}</TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-conv-${idx}`}>{d.leads > 0 ? `${((d.sqos / d.leads) * 100).toFixed(1)}%` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="top-content" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {(["TOFU", "MOFU", "BOFU"] as StageKey[]).map((s) => {
                  const metricLabel = uploadDiagnostics ? "Page Views" : s === "TOFU" ? "Engaged Sessions" : s === "MOFU" ? "MQLs" : "SQOs";
                  return (
                    <Card key={s} className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid={`card-top-${s.toLowerCase()}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" data-testid={`text-top-title-${s.toLowerCase()}`}>Top {s} content</div>
                          <div className="mt-1 text-xs text-muted-foreground" data-testid={`text-top-subtitle-${s.toLowerCase()}`}>Ranked by {metricLabel}.</div>
                        </div>
                        <Badge className={`border ${stageMeta[s].tone}`} data-testid={`badge-top-${s.toLowerCase()}`}>{metricLabel}</Badge>
                      </div>
                      <div className="mt-3">
                        <div className="rounded-2xl border bg-card/60">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[46%]">Content</TableHead>
                                <TableHead className="w-[26%]">Product</TableHead>
                                <TableHead className="text-right">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {topByStage[s].map((r: TopContentRow, idx: number) => (
                                <TableRow key={`${r.content}-${idx}`} className="hover:bg-muted/30" data-testid={`row-top-${s.toLowerCase()}-${idx}`}>
                                  <TableCell>
                                    <div className="max-w-[240px] truncate text-sm font-medium" data-testid={`text-content-${s.toLowerCase()}-${idx}`}>{r.content}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-channel-${s.toLowerCase()}-${idx}`}>{r.channel}</div>
                                  </TableCell>
                                  <TableCell className="text-sm" data-testid={`text-product-${s.toLowerCase()}-${idx}`}>{r.product}</TableCell>
                                  <TableCell className="text-right text-sm font-[650]" data-testid={`text-value-${s.toLowerCase()}-${idx}`}>{formatCompact(r.value)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="by-content-type" className="mt-4 space-y-4">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-visible relative z-20" data-testid="card-content-type-selector">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setCtDropdownOpen(o => !o)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-card/60 hover:bg-muted/50 text-sm font-medium transition-colors min-w-[200px]"
                      data-testid="select-ct-dropdown-trigger"
                    >
                      <span className="flex-1 text-left truncate">
                        {selectedContentTypes.length === 0
                          ? "All Content Types"
                          : selectedContentTypes.length === 1
                            ? selectedContentTypes[0]
                            : `${selectedContentTypes.length} types selected`}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${ctDropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                    {ctDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setCtDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-1 z-50 w-[260px] max-h-[320px] overflow-auto rounded-xl border bg-popover p-1 shadow-lg">
                          <button
                            onClick={() => { setSelectedContentTypes([]); setCtPage(0); }}
                            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors ${selectedContentTypes.length === 0 ? "text-[#00D657] font-medium" : "text-muted-foreground"}`}
                            data-testid="ct-option-all"
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center ${selectedContentTypes.length === 0 ? "bg-[#00D657] border-[#00D657]" : "border-border"}`}>
                              {selectedContentTypes.length === 0 && <Check className="h-3 w-3 text-white" />}
                            </div>
                            All Content Types
                          </button>
                          <div className="h-px bg-border/50 my-1" />
                          {allContentTypes.map((t) => {
                            const checked = selectedContentTypes.includes(t);
                            return (
                              <button
                                key={t}
                                onClick={() => toggleContentType(t)}
                                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors ${checked ? "text-foreground font-medium" : "text-muted-foreground"}`}
                                data-testid={`ct-option-${t.replace(/[\s\/]+/g, "-").toLowerCase()}`}
                              >
                                <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${checked ? "bg-[#00D657] border-[#00D657]" : "border-border"}`}>
                                  {checked && <Check className="h-3 w-3 text-white" />}
                                </div>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {selectedContentTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContentTypes.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#00D657]/10 border border-[#00D657]/30 text-xs font-medium text-[#00D657]"
                        >
                          {t}
                          <button
                            onClick={() => toggleContentType(t)}
                            className="hover:text-foreground transition-colors ml-0.5"
                            data-testid={`ct-remove-${t.replace(/[\s\/]+/g, "-").toLowerCase()}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => { setSelectedContentTypes([]); setCtPage(0); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                        data-testid="ct-clear-all"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="ct-summary-stats">
                {[
                  { label: "Total Assets", value: ctSummaryStats.assets, icon: "📄" },
                  { label: "Page Views", value: ctSummaryStats.views, icon: "👁" },
                  { label: "Downloads", value: ctSummaryStats.downloads, icon: "⬇" },
                  { label: "SQOs", value: ctSummaryStats.sqos, icon: "🎯" },
                ].map((stat) => (
                  <Card key={stat.label} className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid={`ct-stat-${stat.label.replace(/\s+/g, "-").toLowerCase()}`}>
                    <div className="text-2xl font-bold">{formatCompact(stat.value)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                  </Card>
                ))}
              </div>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="ct-stage-distribution">
                <div className="text-sm font-medium mb-3">Stage Distribution</div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="flex gap-1 h-8 rounded-lg overflow-hidden border">
                      {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                        const val = ctStageData[stage]?.count ?? 0;
                        const known = (ctStageData.TOFU?.count ?? 0) + (ctStageData.MOFU?.count ?? 0) + (ctStageData.BOFU?.count ?? 0);
                        const pctVal = known > 0 ? (val / known) * 100 : 0;
                        if (pctVal === 0) return null;
                        const colors: Record<string, string> = { TOFU: "bg-[#00D657]", MOFU: "bg-[#4ECDC4]", BOFU: "bg-[#9B59B6]" };
                        return (
                          <div
                            key={stage}
                            className={`${colors[stage]} flex items-center justify-center text-[10px] font-semibold text-white`}
                            style={{ width: `${pctVal}%`, minWidth: pctVal > 0 ? "32px" : 0 }}
                            data-testid={`ct-stage-bar-${stage.toLowerCase()}`}
                          >
                            {pctVal >= 8 ? `${stage} ${Math.round(pctVal)}%` : stage}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                        const val = ctStageData[stage]?.count ?? 0;
                        if (val === 0) return null;
                        const dots: Record<string, string> = { TOFU: "bg-[#00D657]", MOFU: "bg-[#4ECDC4]", BOFU: "bg-[#9B59B6]" };
                        return (
                          <span key={stage} className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${dots[stage]}`} />
                            {stage}: {val} assets
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Stage</TableHead>
                            <TableHead className="text-right text-xs">Views</TableHead>
                            <TableHead className="text-right text-xs">Downloads</TableHead>
                            <TableHead className="text-right text-xs">Leads</TableHead>
                            <TableHead className="text-right text-xs">SQOs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                            const d = ctStageData[stage];
                            if (!d || d.count === 0) return null;
                            return (
                              <TableRow key={stage} data-testid={`ct-stage-row-${stage.toLowerCase()}`}>
                                <TableCell>
                                  <Badge className={`text-[10px] ${stageMeta[stage as StageKey]?.tone || ""}`}>{stage}</Badge>
                                </TableCell>
                                <TableCell className="text-right text-sm">{formatCompact(d.views)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCompact(d.downloads)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCompact(d.leads)}</TableCell>
                                <TableCell className="text-right text-sm font-[650]">{formatCompact(d.sqos)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="ct-top-assets-table">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Content Assets{selectedContentTypes.length > 0 ? ` — ${selectedContentTypes.join(", ")}` : ""}</div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={ctAssetSearch}
                        onChange={(e) => { setCtAssetSearch(e.target.value); setCtPage(0); }}
                        placeholder="Search assets..."
                        className="h-8 w-[200px] rounded-lg border bg-card/60 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#00D657]/50"
                        data-testid="input-ct-asset-search"
                      />
                      {ctAssetSearch && (
                        <button onClick={() => { setCtAssetSearch(""); setCtPage(0); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Badge variant="secondary" className="rounded-xl">{ctSortedAssets.length} assets</Badge>
                  </div>
                </div>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {([
                          { col: "content" as const, label: "Asset Title" },
                          { col: "stage" as const, label: "Stage" },
                          { col: "utmChannel" as const, label: "Channel" },
                          { col: "productFranchise" as const, label: "Product" },
                          { col: "pageViews" as const, label: "Page Views" },
                          { col: "downloads" as const, label: "Downloads" },
                          { col: "newContacts" as const, label: "Leads" },
                          { col: "sqos" as const, label: "SQOs" },
                        ]).map((h) => (
                          <TableHead
                            key={h.col}
                            className={`cursor-pointer select-none hover:text-foreground transition-colors ${h.col !== "content" && h.col !== "stage" && h.col !== "utmChannel" && h.col !== "productFranchise" ? "text-right" : ""}`}
                            onClick={() => handleCtSort(h.col)}
                            data-testid={`ct-th-${h.col}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {h.label}
                              {ctSortCol === h.col && (
                                <span className="text-[10px]">{ctSortDir === "asc" ? "↑" : "↓"}</span>
                              )}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctPagedAssets.map((r, idx) => (
                        <TableRow key={`${r.content}-${idx}`} className="hover:bg-muted/30" data-testid={`ct-row-${idx}`}>
                          <TableCell><div className="min-w-[300px] text-sm font-medium break-all">{r.content || "(untitled)"}</div></TableCell>
                          <TableCell><Badge className={`text-[10px] ${stageMeta[r.stage as StageKey]?.tone || ""}`}>{r.stage}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.utmChannel || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.productFranchise || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{formatCompact(r.pageViews ?? 0)}</TableCell>
                          <TableCell className="text-right text-sm">{formatCompact(r.downloads ?? 0)}</TableCell>
                          <TableCell className="text-right text-sm">{formatCompact(r.newContacts ?? 0)}</TableCell>
                          <TableCell className="text-right text-sm font-[650]">{formatCompact(r.sqos ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                      {ctPagedAssets.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                            No assets found{ctAssetSearch ? ` matching "${ctAssetSearch}"` : selectedContentTypes.length > 0 ? ` for "${selectedContentTypes.join(", ")}"` : ""}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {ctTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                    <div className="text-xs text-muted-foreground">
                      Page {ctSafePage + 1} of {ctTotalPages} ({ctSortedAssets.length} assets)
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={ctSafePage === 0} onClick={() => setCtPage(p => Math.max(0, p - 1))} data-testid="ct-page-prev">Prev</Button>
                      <Button variant="outline" size="sm" disabled={ctSafePage >= ctTotalPages - 1} onClick={() => setCtPage(p => p + 1)} data-testid="ct-page-next">Next</Button>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="ct-channel-breakdown">
                <div className="text-sm font-medium mb-3">Channel Breakdown</div>
                <div className="space-y-2">
                  {ctChannelBreakdown.map((ch) => {
                    const maxViews = ctChannelBreakdown[0]?.views || 1;
                    return (
                      <div key={ch.channel} className="flex items-center gap-3" data-testid={`ct-channel-${ch.channel.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="w-[140px] truncate text-sm font-medium shrink-0">{ch.channel}</div>
                        <div className="flex-1 h-6 rounded-lg overflow-hidden bg-muted/30 border relative">
                          <div
                            className="h-full bg-[#00D657]/25 rounded-lg transition-all"
                            style={{ width: `${Math.max((ch.views / maxViews) * 100, 2)}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                            {formatCompact(ch.views)} views
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <span>{ch.count} assets</span>
                          <span className="font-medium text-foreground">{formatCompact(ch.sqos)} SQOs</span>
                        </div>
                      </div>
                    );
                  })}
                  {ctChannelBreakdown.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6">No channel data for this content type.</div>
                  )}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="px-4 sm:px-6 lg:px-8 mt-6"
      >
        <Card className="rounded-2xl border border-border/40 bg-card/70 p-6 shadow-sm backdrop-blur relative overflow-hidden" data-testid="card-journey-mapping">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#00D657]/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <div className="flex items-start gap-4 mb-6">
            <div className="h-12 w-12 rounded-xl bg-[#00D657]/10 flex items-center justify-center shrink-0">
              <GitBranch className="h-6 w-6 text-[#00D657]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold" data-testid="text-journey-title">Content Journey Mapping</h3>
                {journeyBatches && journeyBatches.totalInteractions > 0 ? (
                  <Badge variant="outline" className="border-[#00D657]/30 text-[#00D657] text-[10px]" data-testid="badge-journey-status">
                    {journeyBatches.totalInteractions.toLocaleString()} interactions
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]" data-testid="badge-journey-status">Upload Data</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl" data-testid="text-journey-description">
                How contacts interact with your content across TOFU → MOFU → BOFU stages with interaction tracking and asset matching.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  onClick={() => setShowJourneyUpload(true)}
                  variant="outline"
                  size="sm"
                  className="border-[#00D657]/30 text-[#00D657] hover:bg-[#00D657]/10"
                  data-testid="button-upload-journey"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload Data
                </Button>
                {journeyBatches && journeyBatches.batches.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    Last upload: {new Date(journeyBatches.batches[0].uploadDate).toLocaleDateString()} ({journeyBatches.batches[0].interactionCount.toLocaleString()} interactions)
                  </span>
                )}
              </div>
            </div>
          </div>

          {journeySummaries && journeySummaries.status.contactJourneyCount > 0 ? (
            <JourneyMap
              transitions={journeySummaries.transitions}
              topPatterns={journeySummaries.topPatterns}
              topAssetStats={journeySummaries.topAssetStats}
              stageFlows={journeySummaries.stageFlows}
              totalInteractions={journeySummaries.totalInteractions}
              status={journeySummaries.status}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/30 bg-muted/10 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#00D657]" />
                  <span className="text-xs font-medium">Upload & Parse</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Drag and drop TSV, CSV, or XLSX exports from Eloqua with auto-detected delimiters and field mapping.
                </p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/10 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-medium">Data Cleaning</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  SHA-256 hashed emails, deduplication, dirty value removal, and interaction type normalization.
                </p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/10 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <span className="text-xs font-medium">Asset Matching</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Automatically matches asset IDs against your content library for funnel stage and product data.
                </p>
              </div>
            </div>
          )}
        </Card>

        {showJourneyUpload && (
          <JourneyUpload onClose={() => { setShowJourneyUpload(false); refetchJourneyBatches(); queryClient.invalidateQueries({ queryKey: ["/api/journey/summaries"] }); }} />
        )}
      </motion.div>

      <PageChat
        agent="cia"
        agentName="CIA Agent"
        description="Ask me about your marketing data, funnel performance, channel analysis, or any KPI."
        placeholder="Ask about KPIs, trends, channel performance..."
        accentColor="text-[#00D657]"
        accentBg="bg-[#00D657]"
        accentRing="ring-[#00D657]/50"
        fallbackSuggestions={[
          "What is the content breakdown across funnel stages?",
          "Show me the channel distribution",
          "Which product has the most content?",
          "What are the top content assets by time on page?",
        ]}
      />
    </div>
  );
}
