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
  const [stageFilter, setStageFilter] = useState<FunnelStage | null>(null);

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

  const topChannels = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; sqos: number }>();
    for (const r of filtered) {
      const key = r.utmChannel || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filtered]);

  const topProducts = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; sqos: number }>();
    for (const r of filtered) {
      const key = r.productFranchise || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
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
                    <div key={ch.key} className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-sm" data-testid={`overview-channel-${ch.key.replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="truncate font-medium">{ch.key}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                        <span>{ch.count} assets</span>
                        <span>{formatCompact(ch.views)} views</span>
                        <span className="font-medium text-foreground">{formatCompact(ch.sqos)} SQOs</span>
                      </div>
                    </div>
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
                    <div key={p.key} className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-sm" data-testid={`overview-product-${p.key.replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="truncate font-medium">{p.key}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                        <span>{p.count} assets</span>
                        <span>{formatCompact(p.views)} views</span>
                        <span className="font-medium text-foreground">{formatCompact(p.sqos)} SQOs</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/analytics" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2 border-t border-border/30" data-testid="link-view-all-products">
                  View all products <ArrowRight className="h-3 w-3" />
                </Link>
              </Card>
            </div>
          )}

          <RecentFeedbackSection />

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
