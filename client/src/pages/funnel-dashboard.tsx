import TopNav from "@/components/top-nav";
import PageChat from "@/components/page-chat";
import AiInsightsBar from "@/components/ai-insights-bar";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Loader2,
  LineChart,
  BarChart3,
  Library,
  ArrowRight,
  TrendingUp,
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  MessageSquarePlus,
  ExternalLink,
  X,
  Eye,
  Download,
  Users,
  Clock,
  FileText,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/queryClient";
import { POSITIVE_TAGS, NEGATIVE_TAGS } from "@shared/schema";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useFunnelData,
  sum,
  pct,
  formatCompact,
  formatPct,
  stageMeta,
  filterRowsByDateRange,
  dateRangeLabels,
  type StageKey,
  type FunnelStage,
  type DateRangePreset,
} from "@/hooks/use-funnel-data";

interface RecentFeedbackEntry {
  id: number;
  contentId: string;
  author: string;
  tags: string[];
  note: string | null;
  salesforceRef: string | null;
  createdAt: string;
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RecentFeedbackSection() {
  const { data: entries, isLoading } = useQuery<RecentFeedbackEntry[]>({
    queryKey: ["sales-feedback-recent"],
    queryFn: async () => {
      const res = await authFetch("/api/sales-feedback/recent?limit=5");
      if (!res.ok) throw new Error("Failed to fetch recent feedback");
      return res.json();
    },
  });

  if (isLoading || !entries || entries.length === 0) return null;

  return (
    <Card className="rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur" data-testid="section-recent-feedback">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg border bg-card shadow-sm">
          <MessageSquarePlus className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">Recent Sales Feedback</div>
          <div className="text-[11px] text-muted-foreground">Latest notes from the team</div>
        </div>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-border/40 bg-secondary/10 p-2.5 space-y-1"
            data-testid={`recent-feedback-${entry.id}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/90 truncate max-w-[140px]" title={entry.contentId}>
                {entry.contentId}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{entry.author}</span>
                <span className="text-[10px] text-muted-foreground">{formatRelativeDate(entry.createdAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {entry.tags.map((tag) => {
                const isPos = POSITIVE_TAGS.has(tag);
                const isNeg = NEGATIVE_TAGS.has(tag);
                const cls = isPos
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isNeg
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-secondary text-foreground/70 border-border";
                return (
                  <span key={tag} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
                    {tag}
                  </span>
                );
              })}
            </div>
            {entry.note && (
              <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-2">{entry.note}</p>
            )}
            {entry.salesforceRef && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ExternalLink className="h-2.5 w-2.5" />
                <span>Opp: {entry.salesforceRef}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function FunnelDashboard() {
  const { rows, dataLoading, uploadDiagnostics } = useFunnelData();
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const dateFiltered = useMemo(() => filterRowsByDateRange(rows, dateRange), [rows, dateRange]);
  const filtered = useMemo(() => stageFilter ? dateFiltered.filter(r => r.stage === stageFilter) : dateFiltered, [dateFiltered, stageFilter]);

  const byStageAll = useMemo(() => {
    const groups: Record<string, typeof dateFiltered> = { TOFU: [], MOFU: [], BOFU: [], UNKNOWN: [] };
    for (const r of dateFiltered) groups[r.stage].push(r);
    return groups;
  }, [dateFiltered]);

  const tofuBase = byStageAll.TOFU;
  const mofuBase = byStageAll.MOFU;
  const bofuBase = byStageAll.BOFU;

  const tofuEngaged = sum(tofuBase, "engagedSessions");
  const tofuSessions = sum(tofuBase, "sessions");
  const tofuNewUsers = sum(tofuBase, "newUsers");
  const tofuNewContacts = sum(tofuBase, "newContacts");
  const tofuHero = tofuNewUsers || tofuNewContacts;
  const tofuDenom = tofuEngaged || tofuSessions;
  const tofuConv = pct(tofuHero, tofuDenom);

  const mofuContacts = sum(mofuBase, "formSubmissions") || sum(mofuBase, "newContacts");
  const mofuNewContacts = sum(mofuBase, "newContacts");
  const mofuMqls = sum(mofuBase, "mqls");
  const mofuQdcs = sum(mofuBase, "qdcs");
  const mofuConv = pct(mofuMqls, mofuContacts || mofuNewContacts || 0);

  const bofuSqos = sum(bofuBase, "sqos");
  const bofuQdcs = sum(bofuBase, "qdcs");

  const qualityMqlScores = mofuBase
    .filter((r) => (r.mqls ?? 0) > 0 && typeof r.leadScore === "number")
    .map((r) => r.leadScore as number);
  const avgMqlScore =
    qualityMqlScores.length > 0
      ? qualityMqlScores.reduce((a, b) => a + b, 0) / qualityMqlScores.length
      : undefined;

  const funnelSeries = useMemo(() => {
    if (uploadDiagnostics) {
      return [
        { stage: "TOFU", "Content Assets": byStageAll.TOFU.length, "Page Views": sum(byStageAll.TOFU, "pageViews"), "Downloads": sum(byStageAll.TOFU, "downloads"), "Leads": sum(byStageAll.TOFU, "newContacts") },
        { stage: "MOFU", "Content Assets": byStageAll.MOFU.length, "Page Views": sum(byStageAll.MOFU, "pageViews"), "Downloads": sum(byStageAll.MOFU, "downloads"), "Leads": sum(byStageAll.MOFU, "newContacts") },
        { stage: "BOFU", "Content Assets": byStageAll.BOFU.length, "Page Views": sum(byStageAll.BOFU, "pageViews"), "Downloads": sum(byStageAll.BOFU, "downloads"), "Leads": sum(byStageAll.BOFU, "newContacts") },
      ];
    }
    return [
      { stage: "TOFU", "Engaged Sessions": tofuEngaged, "New Contacts": tofuNewContacts },
      { stage: "MOFU", "Engaged Sessions": sum(mofuBase, "engagedSessions"), "New Contacts": mofuNewContacts, "MQLs": mofuMqls },
      { stage: "BOFU", "SQOs": bofuSqos },
    ];
  }, [tofuEngaged, tofuNewContacts, mofuBase, mofuNewContacts, mofuMqls, bofuSqos, uploadDiagnostics, byStageAll]);

  interface DrilldownItem {
    key: string;
    count: number;
    views: number;
    sqos: number;
    leads: number;
    downloads: number;
    avgTime: number;
    stageBreakdown: { TOFU: number; MOFU: number; BOFU: number; UNKNOWN: number };
    topAssets: { content: string; views: number; sqos: number }[];
  }

  const buildDrilldown = (items: typeof filtered, keyFn: (r: typeof filtered[0]) => string): DrilldownItem[] => {
    const roll = new Map<string, {
      key: string; count: number; views: number; sqos: number; leads: number; downloads: number;
      timeTotal: number; timeCount: number;
      stageBreakdown: { TOFU: number; MOFU: number; BOFU: number; UNKNOWN: number };
      assetMap: Map<string, { content: string; views: number; sqos: number }>;
    }>();
    for (const r of items) {
      const key = keyFn(r);
      let cur = roll.get(key);
      if (!cur) {
        cur = { key, count: 0, views: 0, sqos: 0, leads: 0, downloads: 0, timeTotal: 0, timeCount: 0, stageBreakdown: { TOFU: 0, MOFU: 0, BOFU: 0, UNKNOWN: 0 }, assetMap: new Map() };
        roll.set(key, cur);
      }
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.sqos += r.sqos ?? 0;
      cur.leads += r.newContacts ?? 0;
      cur.downloads += r.downloads ?? 0;
      if (typeof r.timeSpentSeconds === "number") { cur.timeTotal += r.timeSpentSeconds; cur.timeCount += 1; }
      if (r.stage in cur.stageBreakdown) cur.stageBreakdown[r.stage as keyof typeof cur.stageBreakdown] += 1;
      const cid = r.content || r.id;
      const existing = cur.assetMap.get(cid);
      if (existing) { existing.views += r.pageViews ?? 0; existing.sqos += r.sqos ?? 0; }
      else cur.assetMap.set(cid, { content: cid, views: r.pageViews ?? 0, sqos: r.sqos ?? 0 });
    }
    return Array.from(roll.values()).map(c => ({
      key: c.key, count: c.count, views: c.views, sqos: c.sqos, leads: c.leads, downloads: c.downloads,
      avgTime: c.timeCount > 0 ? Math.round(c.timeTotal / c.timeCount) : 0,
      stageBreakdown: c.stageBreakdown,
      topAssets: Array.from(c.assetMap.values()).sort((a, b) => b.views - a.views).slice(0, 5),
    })).sort((a, b) => b.count - a.count).slice(0, 5);
  };

  const topChannels = useMemo(() => buildDrilldown(filtered, r => r.utmChannel || "(unattributed)"), [filtered]);
  const topProducts = useMemo(() => buildDrilldown(filtered, r => r.productFranchise || "(unattributed)"), [filtered]);

  const [drilldownOpen, setDrilldownOpen] = useState<{ type: "channel" | "product"; item: DrilldownItem } | null>(null);

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
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-balance text-2xl font-[650] tracking-tight" data-testid="text-title">
                      Content Intelligence Analyst
                    </h1>
                    <Badge variant="secondary" className="border bg-card/70 backdrop-blur" data-testid="badge-mode">
                      Overview
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground" data-testid="text-subtitle">
                    High-level funnel performance across TOFU, MOFU, and BOFU stages.
                  </p>
                </div>
              </div>
              {rows.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangePreset)}>
                      <SelectTrigger className="h-8 w-[140px] rounded-xl text-xs" data-testid="select-date-range">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(dateRangeLabels) as [DateRangePreset, string][]).map(([key, label]) => (
                          <SelectItem key={key} value={key} data-testid={`option-date-range-${key}`}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="text-asset-count">
                    {dateRange === "all"
                      ? `${rows.length.toLocaleString()} content assets loaded`
                      : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} assets`}
                  </div>
                </div>
              )}
            </div>

            {rows.length === 0 && (
              <Card className="rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur text-center" data-testid="no-data-card">
                <div className="text-sm text-muted-foreground">
                  No data available yet. An admin needs to upload data via the{" "}
                  <a href="/admin" className="text-foreground underline underline-offset-2 hover:text-chart-1 transition" data-testid="link-admin">
                    admin panel
                  </a>.
                </div>
              </Card>
            )}
          </header>

          <AiInsightsBar page="performance" />

          {stageFilter && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="secondary" className="rounded-xl text-xs">
                Filtered to {stageFilter}
              </Badge>
              <button
                onClick={() => setStageFilter(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                data-testid="btn-clear-stage-filter"
              >
                Clear filter
              </button>
            </div>
          )}

          <div className={`mt-4 grid gap-3 md:grid-cols-3 ${stageFilter ? "" : ""}`}>
            <Card
              className={`rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${stageFilter === "TOFU" ? "ring-2 ring-primary/50 border-primary/40" : stageFilter && stageFilter !== "TOFU" ? "opacity-50" : ""}`}
              onClick={() => setStageFilter(prev => prev === "TOFU" ? null : "TOFU")}
              data-testid="card-stage-tofu"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">TOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-tofu-hero">
                    {formatCompact(uploadDiagnostics ? byStageAll.TOFU.length : tofuHero)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "New users / contacts"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.TOFU.tone}`} data-testid="badge-tofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(byStageAll.TOFU.length, dateFiltered.length))} of total`
                    : `${formatPct(tofuConv)} new-user rate`}
                </Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-tofu-notes">
                {uploadDiagnostics
                  ? `${byStageAll.TOFU.length} unique content IDs classified as Top-of-Funnel`
                  : `Hero metric uses ${tofuNewUsers ? "new users" : "new contacts"}. Denominator uses ${tofuEngaged ? "engaged sessions" : "sessions"}.`}
              </div>
            </Card>

            <Card
              className={`rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${stageFilter === "MOFU" ? "ring-2 ring-primary/50 border-primary/40" : stageFilter && stageFilter !== "MOFU" ? "opacity-50" : ""}`}
              onClick={() => setStageFilter(prev => prev === "MOFU" ? null : "MOFU")}
              data-testid="card-stage-mofu"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">MOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-mofu-mqls">
                    {formatCompact(uploadDiagnostics ? byStageAll.MOFU.length : mofuMqls)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "MQLs"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.MOFU.tone}`} data-testid="badge-mofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(byStageAll.MOFU.length, dateFiltered.length))} of total`
                    : `${formatPct(mofuConv)} MQL rate`}
                </Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-mofu-notes">
                {uploadDiagnostics
                  ? `${byStageAll.MOFU.length} unique content IDs classified as Middle-of-Funnel`
                  : <>
                      {avgMqlScore !== undefined
                        ? `Avg MQL lead score: ${avgMqlScore.toFixed(1)}`
                        : "Lead score not available"}
                      {mofuQdcs ? ` \u00b7 QDCs: ${formatCompact(mofuQdcs)}` : " \u00b7 QDC not tracked"}
                    </>}
              </div>
            </Card>

            <Card
              className={`rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${stageFilter === "BOFU" ? "ring-2 ring-primary/50 border-primary/40" : stageFilter && stageFilter !== "BOFU" ? "opacity-50" : ""}`}
              onClick={() => setStageFilter(prev => prev === "BOFU" ? null : "BOFU")}
              data-testid="card-stage-bofu"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">BOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-bofu-sqos">
                    {formatCompact(uploadDiagnostics ? byStageAll.BOFU.length : bofuSqos)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "SQOs"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.BOFU.tone}`} data-testid="badge-bofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(byStageAll.BOFU.length, dateFiltered.length))} of total`
                    : bofuQdcs ? `${formatCompact(bofuQdcs)} QDCs` : "QDC not tracked"}
                </Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-bofu-notes">
                {uploadDiagnostics
                  ? `${byStageAll.BOFU.length} unique content IDs classified as Bottom-of-Funnel`
                  : bofuQdcs ? `QDC \u2192 SQO: ${formatPct(pct(bofuSqos, bofuQdcs))}` : "QDC \u2192 SQO conversion is skipped (no QDC data)."}
              </div>
            </Card>
          </div>

          {rows.length > 0 && (
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="card-funnel-chart">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium" data-testid="text-funnel-chart-title">Funnel progression</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {uploadDiagnostics ? "Content assets, page views, downloads, and leads by stage" : "Key metrics across the funnel"}
                  </div>
                </div>
                <Badge variant="secondary" className="rounded-xl">
                  <TrendingUp className="mr-1.5 h-3 w-3" />
                  {byStageAll.TOFU.length + byStageAll.MOFU.length + byStageAll.BOFU.length} classified
                </Badge>
              </div>
              <div className="h-[260px]" data-testid="chart-funnel">
                {uploadDiagnostics ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelSeries} margin={{ left: 0, right: 16, top: 8, bottom: 4 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} tickFormatter={(v: number) => formatCompact(v)} />
                      <ReTooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 12, fontSize: 12, color: "#fff" }}
                        labelStyle={{ color: "#999", fontWeight: 600, marginBottom: 4 }}
                        formatter={(value: number) => formatCompact(value)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                      <Bar dataKey="Content Assets" fill="#00D657" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Page Views" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Downloads" fill="#67E8F9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Leads" fill="#006362" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelSeries} margin={{ left: 0, right: 16, top: 8, bottom: 4 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                      <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} tickFormatter={(v: number) => formatCompact(v)} />
                      <ReTooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 12, fontSize: 12, color: "#fff" }}
                        labelStyle={{ color: "#999", fontWeight: 600, marginBottom: 4 }}
                        formatter={(value: number) => formatCompact(value)}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                      <Bar dataKey="Engaged Sessions" fill="#00D657" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="New Contacts" fill="#00A65C" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="MQLs" fill="#006362" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          )}

          {rows.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-top-channels-overview">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Top channels</div>
                  <Badge variant="secondary" className="rounded-xl">{topChannels.length}</Badge>
                </div>
                <div className="grid gap-2">
                  {topChannels.map((ch) => (
                    <button
                      key={ch.key}
                      onClick={() => setDrilldownOpen({ type: "channel", item: ch })}
                      className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-sm w-full text-left hover:bg-card/90 hover:border-primary/30 transition-colors cursor-pointer group"
                      data-testid={`overview-channel-${ch.key.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <div className="truncate font-medium">{ch.key}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                        <span>{ch.count} assets</span>
                        <span>{formatCompact(ch.views)} views</span>
                        <span className="font-medium text-foreground">{formatCompact(ch.sqos)} SQOs</span>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
                <Link href="/analytics" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2 border-t border-border/30" data-testid="link-view-all-channels">
                  View all channels <ArrowRight className="h-3 w-3" />
                </Link>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-top-products-overview">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Top products</div>
                  <Badge variant="secondary" className="rounded-xl">{topProducts.length}</Badge>
                </div>
                <div className="grid gap-2">
                  {topProducts.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setDrilldownOpen({ type: "product", item: p })}
                      className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-sm w-full text-left hover:bg-card/90 hover:border-primary/30 transition-colors cursor-pointer group"
                      data-testid={`overview-product-${p.key.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <div className="truncate font-medium">{p.key}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                        <span>{p.count} assets</span>
                        <span>{formatCompact(p.views)} views</span>
                        <span className="font-medium text-foreground">{formatCompact(p.sqos)} SQOs</span>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
                <Link href="/analytics" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2 border-t border-border/30" data-testid="link-view-all-products">
                  View all products <ArrowRight className="h-3 w-3" />
                </Link>
              </Card>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/analytics" data-testid="link-analytics-page-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border bg-card shadow-sm">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-[650]">Deep Dive Analytics</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Filters, CTA breakdown, channel/product/industry mix with drilldowns
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Card>
            </Link>

            <Link href="/content-library" data-testid="link-content-library-page-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border bg-card shadow-sm">
                    <Library className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-[650]">Content Library</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Browse all content assets by stage, search by content ID, preview URLs
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Card>
            </Link>

            <Link href="/content-library" data-testid="link-content-comparison-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border bg-card shadow-sm">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-[650]">Content Comparison</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Compare 2–5 content pieces side-by-side with AI-powered resonance analysis
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Card>
            </Link>

            <Link href="/reports" data-testid="link-my-reports-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border bg-card shadow-sm">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-[650]">My Reports</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Build your own dashboard — drag, drop, and resize widgets to track what matters to you
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Card>
            </Link>
          </div>
        </motion.div>
      </div>

      {drilldownOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${drilldownOpen.type === "channel" ? "Channel" : "Product"} details: ${drilldownOpen.item.key}`}
          onKeyDown={(e) => { if (e.key === "Escape") setDrilldownOpen(null); }}
          data-testid="drilldown-overlay"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrilldownOpen(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border bg-card shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            data-testid={`drilldown-popup-${drilldownOpen.type}`}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-card/80 backdrop-blur shrink-0">
              <div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {drilldownOpen.type === "channel" ? "Channel" : "Product"}
                </div>
                <div className="text-lg font-semibold mt-0.5">{drilldownOpen.item.key}</div>
              </div>
              <button
                onClick={() => setDrilldownOpen(null)}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted transition-colors"
                aria-label="Close drilldown"
                data-testid="button-close-drilldown"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-assets">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <FileText className="h-3.5 w-3.5" /> Assets
                  </div>
                  <div className="text-xl font-semibold">{drilldownOpen.item.count}</div>
                </div>
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-views">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Eye className="h-3.5 w-3.5" /> Page Views
                  </div>
                  <div className="text-xl font-semibold">{formatCompact(drilldownOpen.item.views)}</div>
                </div>
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-leads">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Users className="h-3.5 w-3.5" /> Leads
                  </div>
                  <div className="text-xl font-semibold">{formatCompact(drilldownOpen.item.leads)}</div>
                </div>
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-sqos">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="h-3.5 w-3.5" /> SQOs
                  </div>
                  <div className="text-xl font-semibold">{formatCompact(drilldownOpen.item.sqos)}</div>
                </div>
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-downloads">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Download className="h-3.5 w-3.5" /> Downloads
                  </div>
                  <div className="text-xl font-semibold">{formatCompact(drilldownOpen.item.downloads)}</div>
                </div>
                <div className="rounded-xl border bg-card/60 p-3" data-testid="drilldown-stat-avgtime">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3.5 w-3.5" /> Avg Time
                  </div>
                  <div className="text-xl font-semibold">
                    {drilldownOpen.item.avgTime > 0
                      ? drilldownOpen.item.avgTime >= 60
                        ? `${Math.floor(drilldownOpen.item.avgTime / 60)}m ${drilldownOpen.item.avgTime % 60}s`
                        : `${drilldownOpen.item.avgTime}s`
                      : "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Funnel Breakdown</div>
                <div className="flex gap-1 h-6 rounded-lg overflow-hidden border">
                  {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                    const val = drilldownOpen.item.stageBreakdown[stage];
                    const knownTotal = drilldownOpen.item.stageBreakdown.TOFU + drilldownOpen.item.stageBreakdown.MOFU + drilldownOpen.item.stageBreakdown.BOFU;
                    const pctVal = knownTotal > 0 ? (val / knownTotal) * 100 : 0;
                    if (pctVal === 0) return null;
                    const colors = { TOFU: "bg-[#00D657]", MOFU: "bg-[#4ECDC4]", BOFU: "bg-[#9B59B6]" };
                    return (
                      <div
                        key={stage}
                        className={`${colors[stage]} flex items-center justify-center text-[10px] font-semibold text-white`}
                        style={{ width: `${pctVal}%`, minWidth: pctVal > 0 ? "28px" : 0 }}
                        title={`${stage}: ${val} (${Math.round(pctVal)}%)`}
                        data-testid={`drilldown-stage-bar-${stage.toLowerCase()}`}
                      >
                        {pctVal >= 10 ? `${stage} ${Math.round(pctVal)}%` : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                  {(["TOFU", "MOFU", "BOFU"] as const).map((stage) => {
                    const val = drilldownOpen.item.stageBreakdown[stage];
                    if (val === 0) return null;
                    const dotColors = { TOFU: "bg-[#00D657]", MOFU: "bg-[#4ECDC4]", BOFU: "bg-[#9B59B6]" };
                    return (
                      <span key={stage} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${dotColors[stage]}`} />
                        {stage} {val}
                      </span>
                    );
                  })}
                  {drilldownOpen.item.stageBreakdown.UNKNOWN > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      Unclassified {drilldownOpen.item.stageBreakdown.UNKNOWN}
                    </span>
                  )}
                </div>
              </div>

              {drilldownOpen.item.topAssets.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Top Assets</div>
                  <div className="space-y-1.5">
                    {drilldownOpen.item.topAssets.map((asset, i) => (
                      <div key={asset.content} className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2 text-xs" data-testid={`drilldown-asset-${i}`}>
                        <div className="truncate font-medium max-w-[55%]" title={asset.content}>{asset.content}</div>
                        <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                          <span>{formatCompact(asset.views)} views</span>
                          <span className="font-medium text-foreground">{formatCompact(asset.sqos)} SQOs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {drilldownOpen.item.count > 0 && (
                <div className="pt-1">
                  <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Conversion Rate</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {drilldownOpen.item.views > 0
                        ? ((drilldownOpen.item.sqos / drilldownOpen.item.views) * 100).toFixed(2)
                        : "0.00"}%
                    </span>
                    <span className="text-xs text-muted-foreground">Views → SQOs</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

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
