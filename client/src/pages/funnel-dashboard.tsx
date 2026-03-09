import TopNav from "@/components/top-nav";
import PageChat from "@/components/page-chat";
import AiInsightsBar from "@/components/ai-insights-bar";
import { useMemo } from "react";
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
  Eye,
  Users,
  Target,
  Clock,
  ArrowDownRight,
  Zap,
  FileText,
  Globe,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  useFunnelData,
  sum,
  pct,
  formatCompact,
  formatPct,
  stageMeta,
  type StageKey,
  type NormalizedRow,
} from "@/hooks/use-funnel-data";

function avg(rows: NormalizedRow[], key: keyof NormalizedRow): number {
  const vals = rows.filter((r) => typeof r[key] === "number" && (r[key] as number) > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((acc, r) => acc + (r[key] as number), 0) / vals.length;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  testId: string;
}) {
  return (
    <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid={testId}>
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card shadow-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xl font-[650] tracking-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        </div>
      </div>
    </Card>
  );
}

const STAGE_COLORS: Record<string, string> = {
  TOFU: "hsl(var(--chart-1))",
  MOFU: "hsl(var(--chart-2))",
  BOFU: "hsl(var(--chart-3))",
};

export default function FunnelDashboard() {
  const { rows, dataLoading, uploadDiagnostics, byStage } = useFunnelData();

  const tofuBase = byStage.TOFU;
  const mofuBase = byStage.MOFU;
  const bofuBase = byStage.BOFU;

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

  const totalViews = useMemo(() => sum(rows, "pageViews"), [rows]);
  const totalLeads = useMemo(() => sum(rows, "newContacts"), [rows]);
  const totalSqos = useMemo(() => sum(rows, "sqos"), [rows]);
  const avgTimeAll = useMemo(() => avg(rows, "timeSpentSeconds"), [rows]);

  const viewsPerAsset = rows.length > 0 ? Math.round(totalViews / rows.length) : 0;
  const leadsPerAsset = rows.length > 0 ? (totalLeads / rows.length).toFixed(1) : "0";
  const sqoRate = totalLeads > 0 ? pct(totalSqos, totalLeads) : 0;

  const funnelSeries = useMemo(() => {
    if (uploadDiagnostics) {
      return [
        { stage: "TOFU", contentAssets: byStage.TOFU.length, pageViews: sum(byStage.TOFU, "pageViews"), uniqueLeads: sum(byStage.TOFU, "newContacts") },
        { stage: "MOFU", contentAssets: byStage.MOFU.length, pageViews: sum(byStage.MOFU, "pageViews"), uniqueLeads: sum(byStage.MOFU, "newContacts") },
        { stage: "BOFU", contentAssets: byStage.BOFU.length, pageViews: sum(byStage.BOFU, "pageViews"), uniqueLeads: sum(byStage.BOFU, "newContacts"), sqos: sum(byStage.BOFU, "sqos") },
      ];
    }
    return [
      { stage: "TOFU", engagedSessions: tofuEngaged, newContacts: tofuNewContacts },
      { stage: "MOFU", engagedSessions: sum(mofuBase, "engagedSessions"), newContacts: mofuNewContacts, mqls: mofuMqls },
      { stage: "BOFU", sqos: bofuSqos },
    ];
  }, [tofuEngaged, tofuNewContacts, mofuBase, mofuNewContacts, mofuMqls, bofuSqos, uploadDiagnostics, byStage]);

  const stagePerformance = useMemo(() => {
    return (["TOFU", "MOFU", "BOFU"] as StageKey[]).map((stage) => {
      const stageRows = byStage[stage];
      return {
        stage,
        assets: stageRows.length,
        views: sum(stageRows, "pageViews"),
        leads: sum(stageRows, "newContacts"),
        sqos: sum(stageRows, "sqos"),
        avgTime: avg(stageRows, "timeSpentSeconds"),
      };
    });
  }, [byStage]);

  const topChannels = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; leads: number; sqos: number }>();
    for (const r of rows) {
      const key = r.utmChannel || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, leads: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.leads += r.newContacts ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
  }, [rows]);

  const topProducts = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; leads: number; sqos: number }>();
    for (const r of rows) {
      const key = r.productFranchise || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, leads: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.leads += r.newContacts ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
  }, [rows]);

  const topContent = useMemo(() => {
    return [...rows]
      .filter((r) => (r.pageViews ?? 0) > 0 || (r.newContacts ?? 0) > 0 || (r.sqos ?? 0) > 0)
      .sort((a, b) => (b.pageViews ?? 0) - (a.pageViews ?? 0))
      .slice(0, 5)
      .map((r) => ({
        name: r.content || r.id,
        stage: r.stage,
        views: r.pageViews ?? 0,
        leads: r.newContacts ?? 0,
        sqos: r.sqos ?? 0,
        time: r.timeSpentSeconds ?? 0,
        channel: r.utmChannel || "",
        product: r.productFranchise || "",
      }));
  }, [rows]);

  const contentTypeBreakdown = useMemo(() => {
    const roll = new Map<string, { type: string; count: number; views: number; leads: number }>();
    for (const r of rows) {
      const key = r.contentType || "(unspecified)";
      const cur = roll.get(key) || { type: key, count: 0, views: 0, leads: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.leads += r.newContacts ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [rows]);

  const industryBreakdown = useMemo(() => {
    const roll = new Map<string, { industry: string; count: number; views: number; sqos: number }>();
    for (const r of rows) {
      const key = r.industry || "(unspecified)";
      const cur = roll.get(key) || { industry: key, count: 0, views: 0, sqos: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [rows]);

  const stageDistChart = useMemo(() => {
    return (["TOFU", "MOFU", "BOFU"] as StageKey[]).map((stage) => ({
      stage,
      count: byStage[stage].length,
      fill: STAGE_COLORS[stage],
    }));
  }, [byStage]);

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
                <div className="text-xs text-muted-foreground" data-testid="text-asset-count">
                  {rows.length.toLocaleString()} content assets loaded
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

          {rows.length > 0 && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4" data-testid="aggregate-kpis">
              <MetricCard
                icon={Eye}
                label="Total Page Views"
                value={formatCompact(totalViews)}
                sub={`${formatCompact(viewsPerAsset)} avg per asset`}
                testId="metric-total-views"
              />
              <MetricCard
                icon={Users}
                label="Total Leads"
                value={formatCompact(totalLeads)}
                sub={`${leadsPerAsset} avg per asset`}
                testId="metric-total-leads"
              />
              <MetricCard
                icon={Target}
                label="Total SQOs"
                value={formatCompact(totalSqos)}
                sub={sqoRate > 0 ? `${formatPct(sqoRate)} lead-to-SQO` : "Lead-to-SQO N/A"}
                testId="metric-total-sqos"
              />
              <MetricCard
                icon={Clock}
                label="Avg Time on Page"
                value={avgTimeAll > 0 ? `${Math.round(avgTimeAll)}s` : "N/A"}
                sub={avgTimeAll > 0 ? `${(avgTimeAll / 60).toFixed(1)} minutes` : "No time data"}
                testId="metric-avg-time"
              />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">TOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-tofu-hero">
                    {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.TOFU ?? 0) : tofuHero)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "New users / contacts"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.TOFU.tone}`} data-testid="badge-tofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.TOFU ?? 0, rows.length))} of total`
                    : `${formatPct(tofuConv)} new-user rate`}
                </Badge>
              </div>
              {uploadDiagnostics && (
                <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{formatCompact(sum(tofuBase, "pageViews"))} views</span>
                  <span>{formatCompact(sum(tofuBase, "newContacts"))} leads</span>
                  <span>{formatCompact(sum(tofuBase, "sqos"))} SQOs</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-tofu-notes">
                {uploadDiagnostics
                  ? `${uploadDiagnostics.stageBreakdown.TOFU ?? 0} unique content IDs classified as Top-of-Funnel`
                  : `Hero metric uses ${tofuNewUsers ? "new users" : "new contacts"}. Denominator uses ${tofuEngaged ? "engaged sessions" : "sessions"}.`}
              </div>
            </Card>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">MOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-mofu-mqls">
                    {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.MOFU ?? 0) : mofuMqls)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "MQLs"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.MOFU.tone}`} data-testid="badge-mofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.MOFU ?? 0, rows.length))} of total`
                    : `${formatPct(mofuConv)} MQL rate`}
                </Badge>
              </div>
              {uploadDiagnostics && (
                <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{formatCompact(sum(mofuBase, "pageViews"))} views</span>
                  <span>{formatCompact(sum(mofuBase, "newContacts"))} leads</span>
                  <span>{formatCompact(sum(mofuBase, "sqos"))} SQOs</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-mofu-notes">
                {uploadDiagnostics
                  ? `${uploadDiagnostics.stageBreakdown.MOFU ?? 0} unique content IDs classified as Middle-of-Funnel`
                  : <>
                      {avgMqlScore !== undefined
                        ? `Avg MQL lead score: ${avgMqlScore.toFixed(1)}`
                        : "Lead score not available"}
                      {mofuQdcs ? ` \u00b7 QDCs: ${formatCompact(mofuQdcs)}` : " \u00b7 QDC not tracked"}
                    </>}
              </div>
            </Card>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">BOFU</div>
                  <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-bofu-sqos">
                    {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.BOFU ?? 0) : bofuSqos)}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {uploadDiagnostics ? "Content assets" : "SQOs"}
                  </div>
                </div>
                <Badge className={`border ${stageMeta.BOFU.tone}`} data-testid="badge-bofu">
                  {uploadDiagnostics
                    ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.BOFU ?? 0, rows.length))} of total`
                    : bofuQdcs ? `${formatCompact(bofuQdcs)} QDCs` : "QDC not tracked"}
                </Badge>
              </div>
              {uploadDiagnostics && (
                <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{formatCompact(sum(bofuBase, "pageViews"))} views</span>
                  <span>{formatCompact(sum(bofuBase, "newContacts"))} leads</span>
                  <span>{formatCompact(sum(bofuBase, "sqos"))} SQOs</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground" data-testid="text-bofu-notes">
                {uploadDiagnostics
                  ? `${uploadDiagnostics.stageBreakdown.BOFU ?? 0} unique content IDs classified as Bottom-of-Funnel`
                  : bofuQdcs ? `QDC \u2192 SQO: ${formatPct(pct(bofuSqos, bofuQdcs))}` : "QDC \u2192 SQO conversion is skipped (no QDC data)."}
              </div>
            </Card>
          </div>

          {rows.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="md:col-span-2 rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="card-funnel-chart">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium" data-testid="text-funnel-chart-title">Funnel progression</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {uploadDiagnostics ? "Content assets, page views, and leads by stage" : "Key metrics across the funnel"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="rounded-xl">
                    <TrendingUp className="mr-1.5 h-3 w-3" />
                    {byStage.TOFU.length + byStage.MOFU.length + byStage.BOFU.length} classified
                  </Badge>
                </div>
                <div className="h-[220px]" data-testid="chart-funnel">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={funnelSeries} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                      <defs>
                        <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} tickFormatter={(v) => formatCompact(v)} />
                      <ReTooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      />
                      {uploadDiagnostics ? (
                        <>
                          <Area type="monotone" dataKey="contentAssets" name="Content Assets" stroke="hsl(var(--chart-1))" fill="url(#gradAssets)" strokeWidth={2} />
                          <Area type="monotone" dataKey="pageViews" name="Page Views" stroke="hsl(var(--chart-2))" fill="url(#gradViews)" strokeWidth={2} />
                          <Area type="monotone" dataKey="uniqueLeads" name="Unique Leads" stroke="hsl(var(--chart-3))" fill="url(#gradLeads)" strokeWidth={2} />
                        </>
                      ) : (
                        <>
                          <Area type="monotone" dataKey="engagedSessions" name="Engaged Sessions" stroke="hsl(var(--chart-1))" fill="url(#gradAssets)" strokeWidth={2} />
                          <Area type="monotone" dataKey="newContacts" name="New Contacts" stroke="hsl(var(--chart-2))" fill="url(#gradViews)" strokeWidth={2} />
                          <Area type="monotone" dataKey="mqls" name="MQLs" stroke="hsl(var(--chart-3))" fill="url(#gradLeads)" strokeWidth={2} />
                        </>
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="card-stage-distribution">
                <div className="mb-3">
                  <div className="text-sm font-medium">Stage distribution</div>
                  <div className="mt-1 text-xs text-muted-foreground">Assets by funnel stage</div>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageDistChart} margin={{ left: -10, right: 4, top: 4, bottom: 4 }}>
                      <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
                      <ReTooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                      />
                      <Bar dataKey="count" name="Assets" radius={[6, 6, 0, 0]}>
                        {stageDistChart.map((entry) => (
                          <Cell key={entry.stage} fill={entry.fill} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                  {stagePerformance.map((sp) => (
                    <div key={sp.stage}>
                      <div className="font-medium">{formatCompact(sp.views)}</div>
                      <div className="text-muted-foreground">views</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {rows.length > 0 && (
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="card-stage-performance">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Stage performance breakdown</div>
                  <div className="mt-1 text-xs text-muted-foreground">Views, leads, SQOs, and avg time per funnel stage</div>
                </div>
                <Badge variant="secondary" className="rounded-xl">
                  <Zap className="mr-1.5 h-3 w-3" />
                  Detailed
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {stagePerformance.map((sp) => {
                  const maxViews = Math.max(...stagePerformance.map((s) => s.views), 1);
                  const viewPct = (sp.views / maxViews) * 100;
                  return (
                    <div key={sp.stage} className="rounded-xl border bg-card/60 p-3" data-testid={`stage-perf-${sp.stage.toLowerCase()}`}>
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={`border ${stageMeta[sp.stage as StageKey].tone}`}>{sp.stage}</Badge>
                        <span className="text-xs text-muted-foreground">{sp.assets} assets</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Page views</span>
                            <span className="font-medium">{formatCompact(sp.views)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div className="h-full rounded-full bg-chart-1/60 transition-all" style={{ width: `${viewPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Leads</span>
                          <span className="font-medium">{formatCompact(sp.leads)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">SQOs</span>
                          <span className="font-medium">{formatCompact(sp.sqos)}</span>
                        </div>
                        {sp.avgTime > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Avg time</span>
                            <span className="font-medium">{Math.round(sp.avgTime)}s</span>
                          </div>
                        )}
                        {sp.leads > 0 && sp.views > 0 && (
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">View-to-lead</span>
                            <span className="font-medium text-chart-2">{formatPct(pct(sp.leads, sp.views))}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalLeads > 0 && totalViews > 0 && (
                <div className="mt-3 flex items-center gap-6 rounded-xl border bg-card/40 px-4 py-2.5 text-xs" data-testid="conversion-flow">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="h-3.5 w-3.5 text-chart-1" />
                    <span className="text-muted-foreground">Funnel conversion</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCompact(totalViews)} views</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{formatCompact(totalLeads)} leads</span>
                    <span className="text-muted-foreground">({formatPct(pct(totalLeads, totalViews))})</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{formatCompact(totalSqos)} SQOs</span>
                    {totalLeads > 0 && <span className="text-muted-foreground">({formatPct(pct(totalSqos, totalLeads))})</span>}
                  </div>
                </div>
              )}
            </Card>
          )}

          {topContent.length > 0 && (
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-top-content">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-medium">Top performing content</div>
                  <div className="mt-1 text-xs text-muted-foreground">Highest-traffic assets across all stages</div>
                </div>
                <Badge variant="secondary" className="rounded-xl">Top {topContent.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-top-content">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Content</th>
                      <th className="text-left py-2 pr-4 font-medium">Stage</th>
                      <th className="text-right py-2 pr-4 font-medium">Views</th>
                      <th className="text-right py-2 pr-4 font-medium">Leads</th>
                      <th className="text-right py-2 pr-4 font-medium">SQOs</th>
                      {topContent.some((c) => c.time > 0) && (
                        <th className="text-right py-2 font-medium">Avg Time</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {topContent.map((c, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0" data-testid={`top-content-row-${i}`}>
                        <td className="py-2.5 pr-4">
                          <div className="max-w-[300px] truncate font-medium text-sm">{c.name}</div>
                          {(c.channel || c.product) && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[300px]">
                              {[c.channel, c.product].filter(Boolean).join(" \u00b7 ")}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge className={`border text-[10px] px-1.5 py-0 ${stageMeta[c.stage as StageKey]?.tone || ""}`}>
                            {c.stage}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{formatCompact(c.views)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{formatCompact(c.leads)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium">{formatCompact(c.sqos)}</td>
                        {topContent.some((cc) => cc.time > 0) && (
                          <td className="py-2.5 text-right tabular-nums">{c.time > 0 ? `${Math.round(c.time)}s` : "\u2014"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  {topChannels.map((ch) => {
                    const maxChViews = Math.max(...topChannels.map((c) => c.views), 1);
                    const barW = (ch.views / maxChViews) * 100;
                    return (
                      <div key={ch.key} className="relative rounded-xl border bg-card/60 px-3 py-2.5 text-sm overflow-hidden" data-testid={`overview-channel-${ch.key.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="absolute inset-y-0 left-0 bg-chart-1/8 rounded-xl transition-all" style={{ width: `${barW}%` }} />
                        <div className="relative flex items-center justify-between">
                          <div className="truncate font-medium">{ch.key}</div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                            <span>{ch.count} assets</span>
                            <span>{formatCompact(ch.views)} views</span>
                            <span>{formatCompact(ch.leads)} leads</span>
                            <span className="font-medium text-foreground">{formatCompact(ch.sqos)} SQOs</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-top-products-overview">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Top products</div>
                  <Badge variant="secondary" className="rounded-xl">{topProducts.length}</Badge>
                </div>
                <div className="grid gap-2">
                  {topProducts.map((p) => {
                    const maxPViews = Math.max(...topProducts.map((pp) => pp.views), 1);
                    const barW = (p.views / maxPViews) * 100;
                    return (
                      <div key={p.key} className="relative rounded-xl border bg-card/60 px-3 py-2.5 text-sm overflow-hidden" data-testid={`overview-product-${p.key.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="absolute inset-y-0 left-0 bg-chart-2/8 rounded-xl transition-all" style={{ width: `${barW}%` }} />
                        <div className="relative flex items-center justify-between">
                          <div className="truncate font-medium">{p.key}</div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                            <span>{p.count} assets</span>
                            <span>{formatCompact(p.views)} views</span>
                            <span>{formatCompact(p.leads)} leads</span>
                            <span className="font-medium text-foreground">{formatCompact(p.sqos)} SQOs</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {rows.length > 0 && (contentTypeBreakdown.length > 1 || industryBreakdown.length > 1) && (
            <div className="grid gap-4 md:grid-cols-2">
              {contentTypeBreakdown.length > 1 && (
                <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-content-types">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        Content types
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Distribution by content format</div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl">{contentTypeBreakdown.length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {contentTypeBreakdown.map((ct) => {
                      const maxCt = Math.max(...contentTypeBreakdown.map((c) => c.count), 1);
                      const barW = (ct.count / maxCt) * 100;
                      return (
                        <div key={ct.type} className="relative rounded-xl border bg-card/60 px-3 py-2 text-sm overflow-hidden" data-testid={`content-type-${ct.type.replace(/\s+/g, "-").toLowerCase()}`}>
                          <div className="absolute inset-y-0 left-0 bg-chart-3/8 rounded-xl transition-all" style={{ width: `${barW}%` }} />
                          <div className="relative flex items-center justify-between">
                            <div className="truncate font-medium">{ct.type}</div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                              <span>{ct.count} assets</span>
                              <span>{formatCompact(ct.views)} views</span>
                              <span>{formatCompact(ct.leads)} leads</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {industryBreakdown.length > 1 && (
                <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-industries">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        Industries
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Top industries by asset volume</div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl">{industryBreakdown.length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {industryBreakdown.map((ind) => {
                      const maxInd = Math.max(...industryBreakdown.map((i) => i.count), 1);
                      const barW = (ind.count / maxInd) * 100;
                      return (
                        <div key={ind.industry} className="relative rounded-xl border bg-card/60 px-3 py-2 text-sm overflow-hidden" data-testid={`industry-${ind.industry.replace(/\s+/g, "-").toLowerCase()}`}>
                          <div className="absolute inset-y-0 left-0 bg-primary/8 rounded-xl transition-all" style={{ width: `${barW}%` }} />
                          <div className="relative flex items-center justify-between">
                            <div className="truncate font-medium">{ind.industry}</div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                              <span>{ind.count} assets</span>
                              <span>{formatCompact(ind.views)} views</span>
                              <span className="font-medium text-foreground">{formatCompact(ind.sqos)} SQOs</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Link href="/analytics" data-testid="link-analytics-page-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer">
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
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer">
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

            <Link href="/reports" data-testid="link-my-reports-from-performance">
              <Card className="group rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition hover:shadow-md hover:border-primary/30 cursor-pointer">
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
