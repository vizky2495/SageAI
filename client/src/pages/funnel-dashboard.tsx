import TopNav from "@/components/top-nav";
import PageChat from "@/components/page-chat";
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
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
} from "@/hooks/use-funnel-data";

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

  const topChannels = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; sqos: number }>();
    for (const r of rows) {
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
  }, [rows]);

  const topProducts = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; sqos: number }>();
    for (const r of rows) {
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
  }, [rows]);

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
    <div className="flex flex-col h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
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
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-tofu-notes">
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
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-mofu-notes">
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
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-bofu-notes">
                {uploadDiagnostics
                  ? `${uploadDiagnostics.stageBreakdown.BOFU ?? 0} unique content IDs classified as Bottom-of-Funnel`
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
              </Card>
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
      </div>

      <PageChat
        agent="cia"
        agentName="CIA Agent"
        description="Ask me about your marketing data, funnel performance, channel analysis, or any KPI."
        placeholder="Ask about KPIs, trends, channel performance..."
        accentColor="text-[#00D657]"
        accentBg="bg-[#00D657]"
        accentRing="ring-[#00D657]/50"
        variant="sidebar"
        fallbackSuggestions={[
          "What is the content breakdown across funnel stages?",
          "Show me the channel distribution",
          "Which product has the most content?",
          "What are the top content assets by time on page?",
        ]}
      />
      </div>
    </div>
  );
}
