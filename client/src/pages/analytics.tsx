import TopNav from "@/components/top-nav";
import PageChat from "@/components/page-chat";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Filter,
  Loader2,
  BarChart3,
  Table as TableIcon,
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

  const [stageFilter, setStageFilter] = useState<FunnelStage | "ALL">("ALL");
  const [dimension, setDimension] = useState<"utmChannel" | "productFranchise" | "contentType">("utmChannel");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [productStageExpand, setProductStageExpand] = useState<{ product: string; stage: string } | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string>("ALL");
  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");
  const [industryStageExpand, setIndustryStageExpand] = useState<{ industry: string; stage: string } | null>(null);
  const [channelStageExpand, setChannelStageExpand] = useState<{ channel: string; stage: string } | null>(null);

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
    const roll = new Map<string, { key: string; count: number; engaged: number; views: number; newUsers: number; returningUsers: number; contacts: number; mqls: number; qdcs: number; sqos: number; tofu: number; mofu: number; bofu: number }>();
    for (const r of filtered) {
      const key = (r[dimension] as string | undefined) || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, engaged: 0, views: 0, newUsers: 0, returningUsers: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.engaged += r.engagedSessions ?? 0;
      cur.views += r.pageViews ?? 0;
      cur.newUsers += r.newUsers ?? 0;
      cur.returningUsers += r.returningUsers ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values())
      .sort((a, b) => b.sqos + b.mqls + b.contacts + b.newUsers + b.views + b.engaged - (a.sqos + a.mqls + a.contacts + a.newUsers + a.views + a.engaged))
      .slice(0, 10);
  }, [filtered, dimension]);

  const productList = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { if (r.productFranchise) s.add(r.productFranchise); }
    return Array.from(s).sort();
  }, [rows]);

  const productMixData = useMemo(() => {
    const roll = new Map<string, { key: string; count: number; views: number; contacts: number; mqls: number; qdcs: number; sqos: number; tofu: number; mofu: number; bofu: number }>();
    const source = productFilter === "ALL" ? filtered : filtered.filter((r) => r.productFranchise === productFilter);
    for (const r of source) {
      const key = r.productFranchise || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values()).sort((a, b) => b.count + b.sqos + b.mqls - (a.count + a.sqos + a.mqls)).slice(0, 12);
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
    const roll = new Map<string, { key: string; count: number; views: number; contacts: number; mqls: number; qdcs: number; sqos: number; tofu: number; mofu: number; bofu: number }>();
    const source = industryFilter === "ALL" ? filtered : filtered.filter((r) => r.industry === industryFilter);
    for (const r of source) {
      const key = r.industry || "(unattributed)";
      const cur = roll.get(key) || { key, count: 0, views: 0, contacts: 0, mqls: 0, qdcs: 0, sqos: 0, tofu: 0, mofu: 0, bofu: 0 };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }
    return Array.from(roll.values()).sort((a, b) => b.count + b.sqos + b.mqls - (a.count + a.sqos + a.mqls)).slice(0, 12);
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

          <div className="grid gap-4 lg:grid-cols-3 mb-4">
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

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-channel-mix">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" data-testid="text-channel-mix-title">Channel mix</div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-channel-mix-subtitle">Breakdown by UTM channel.</div>
                </div>
                <Badge variant="secondary" className="rounded-xl" data-testid="badge-channel-count">{dimensionData.length} {dimensionData.length === 1 ? "channel" : "channels"}</Badge>
              </div>
              <Separator className="my-3" />
              <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
                {dimensionData.map((d) => {
                  const isExpanded = (s: string) => channelStageExpand?.channel === d.key && channelStageExpand?.stage === s;
                  const toggleStage = (s: string, e: React.MouseEvent) => { e.stopPropagation(); setChannelStageExpand(isExpanded(s) ? null : { channel: d.key, stage: s }); };
                  const stageButtons = [
                    { stage: "TOFU", count: d.tofu, color: "text-emerald-400", activeColor: "bg-emerald-400/20 ring-1 ring-emerald-400/40" },
                    { stage: "MOFU", count: d.mofu, color: "text-sky-400", activeColor: "bg-sky-400/20 ring-1 ring-sky-400/40" },
                    { stage: "BOFU", count: d.bofu, color: "text-orange-400", activeColor: "bg-orange-400/20 ring-1 ring-orange-400/40" },
                  ];
                  const expandedStage = stageButtons.find((sb) => isExpanded(sb.stage));
                  return (
                    <div key={d.key}>
                      <div className="w-full rounded-xl border bg-card/60 px-3 py-2.5 text-left transition hover:shadow hover:bg-card/80 cursor-pointer overflow-hidden" data-testid={`row-channel-${d.key.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{d.key}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            {uploadDiagnostics ? (
                              <><span>{formatCompact(d.views)} views</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            ) : (
                              <><span>{formatCompact(d.mqls)} MQLs</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{d.count} assets</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          {stageButtons.map((sb) => (
                            <button key={sb.stage} className={`rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-muted/50 ${sb.color} ${isExpanded(sb.stage) ? sb.activeColor : ""}`} onClick={(e) => toggleStage(sb.stage, e)} title={`Show ${sb.stage} content IDs for ${d.key}`} data-testid={`btn-channel-stage-${d.key.replace(/\s+/g, "-").toLowerCase()}-${sb.stage.toLowerCase()}`}>
                              {sb.count} {sb.stage}
                            </button>
                          ))}
                        </div>
                      </div>
                      {expandedStage && (
                        <div className="mt-1 mb-1 ml-3 rounded-xl border bg-card/40 p-3" data-testid={`drilldown-channel-${d.key.replace(/\s+/g, "-").toLowerCase()}-${expandedStage.stage.toLowerCase()}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${expandedStage.color} border-current/20`}>{expandedStage.stage}</Badge>
                              <span className="text-xs text-muted-foreground">{channelStageContentIds.length} content {channelStageContentIds.length === 1 ? "asset" : "assets"}</span>
                            </div>
                            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setChannelStageExpand(null)} data-testid="btn-close-channel-drilldown">Close</button>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto space-y-1">
                            {channelStageContentIds.map((item, idx) => (
                              <div key={`${item.content}-${idx}`} className="flex items-center justify-between rounded-lg border bg-card/60 px-2.5 py-1.5 text-xs" data-testid={`channel-drilldown-item-${idx}`}>
                                <div className="min-w-0 flex-1 truncate font-medium" title={item.content}>{item.content}</div>
                                <div className="flex items-center gap-2 text-muted-foreground shrink-0 ml-2">
                                  {item.product && <span>{item.product}</span>}
                                  {item.cta && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span>{item.cta}</span></>)}
                                  {item.sqos > 0 && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(item.sqos)} SQOs</span></>)}
                                </div>
                              </div>
                            ))}
                            {channelStageContentIds.length === 0 && (<div className="text-center text-xs text-muted-foreground py-3">No content assets found.</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-product-mix">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" data-testid="text-product-mix-title">Product mix</div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-product-mix-subtitle">Breakdown by PRODUCT_FRANCHISE__C.</div>
                </div>
                <Badge variant="secondary" className="rounded-xl" data-testid="badge-product-count">{productMixData.length} {productMixData.length === 1 ? "product" : "products"}</Badge>
              </div>
              <Separator className="my-3" />
              <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
                {productMixData.map((d) => {
                  const isExpanded = (s: string) => productStageExpand?.product === d.key && productStageExpand?.stage === s;
                  const toggleStage = (s: string, e: React.MouseEvent) => { e.stopPropagation(); setProductStageExpand(isExpanded(s) ? null : { product: d.key, stage: s }); };
                  const stageButtons = [
                    { stage: "TOFU", count: d.tofu, color: "text-emerald-400", activeColor: "bg-emerald-400/20 ring-1 ring-emerald-400/40" },
                    { stage: "MOFU", count: d.mofu, color: "text-sky-400", activeColor: "bg-sky-400/20 ring-1 ring-sky-400/40" },
                    { stage: "BOFU", count: d.bofu, color: "text-orange-400", activeColor: "bg-orange-400/20 ring-1 ring-orange-400/40" },
                  ];
                  const expandedStage = stageButtons.find((sb) => isExpanded(sb.stage));
                  return (
                    <div key={d.key}>
                      <div className={`w-full rounded-xl border bg-card/60 px-3 py-2.5 text-left transition hover:shadow hover:bg-card/80 cursor-pointer overflow-hidden ${productFilter === d.key ? "ring-1 ring-primary/40" : ""}`} onClick={() => setProductFilter(d.key === productFilter ? "ALL" : d.key)} data-testid={`row-product-${d.key.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{d.key}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            {uploadDiagnostics ? (
                              <><span>{formatCompact(d.views)} views</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            ) : (
                              <><span>{formatCompact(d.mqls)} MQLs</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{d.count} assets</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          {stageButtons.map((sb) => (
                            <button key={sb.stage} className={`rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-muted/50 ${sb.color} ${isExpanded(sb.stage) ? sb.activeColor : ""}`} onClick={(e) => toggleStage(sb.stage, e)} title={`Show ${sb.stage} content IDs for ${d.key}`} data-testid={`btn-product-stage-${d.key.replace(/\s+/g, "-").toLowerCase()}-${sb.stage.toLowerCase()}`}>
                              {sb.count} {sb.stage}
                            </button>
                          ))}
                        </div>
                      </div>
                      {expandedStage && (
                        <div className="mt-1 mb-1 ml-3 rounded-xl border bg-card/40 p-3" data-testid={`drilldown-${d.key.replace(/\s+/g, "-").toLowerCase()}-${expandedStage.stage.toLowerCase()}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${expandedStage.color} border-current/20`}>{expandedStage.stage}</Badge>
                              <span className="text-xs text-muted-foreground">{productStageContentIds.length} content {productStageContentIds.length === 1 ? "asset" : "assets"}</span>
                            </div>
                            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setProductStageExpand(null)} data-testid="btn-close-product-drilldown">Close</button>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto space-y-1">
                            {productStageContentIds.map((item, idx) => (
                              <div key={`${item.content}-${idx}`} className="flex items-center justify-between rounded-lg border bg-card/60 px-2.5 py-1.5 text-xs" data-testid={`product-drilldown-item-${idx}`}>
                                <div className="min-w-0 flex-1 truncate font-medium" title={item.content}>{item.content}</div>
                                <div className="flex items-center gap-2 text-muted-foreground shrink-0 ml-2">
                                  {item.channel && <span>{item.channel}</span>}
                                  {item.cta && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span>{item.cta}</span></>)}
                                  {item.sqos > 0 && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(item.sqos)} SQOs</span></>)}
                                </div>
                              </div>
                            ))}
                            {productStageContentIds.length === 0 && (<div className="text-center text-xs text-muted-foreground py-3">No content assets found.</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur overflow-hidden" data-testid="card-industry-mix">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" data-testid="text-industry-mix-title">Industry mix</div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-industry-mix-subtitle">Breakdown by industry / vertical.</div>
                </div>
                <Badge variant="secondary" className="rounded-xl" data-testid="badge-industry-count">{industryMixData.length} {industryMixData.length === 1 ? "industry" : "industries"}</Badge>
              </div>
              <Separator className="my-3" />
              <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
                {industryMixData.map((d) => {
                  const isExpanded = (s: string) => industryStageExpand?.industry === d.key && industryStageExpand?.stage === s;
                  const toggleStage = (s: string, e: React.MouseEvent) => { e.stopPropagation(); setIndustryStageExpand(isExpanded(s) ? null : { industry: d.key, stage: s }); };
                  const stageButtons = [
                    { stage: "TOFU", count: d.tofu, color: "text-emerald-400", activeColor: "bg-emerald-400/20 ring-1 ring-emerald-400/40" },
                    { stage: "MOFU", count: d.mofu, color: "text-sky-400", activeColor: "bg-sky-400/20 ring-1 ring-sky-400/40" },
                    { stage: "BOFU", count: d.bofu, color: "text-orange-400", activeColor: "bg-orange-400/20 ring-1 ring-orange-400/40" },
                  ];
                  const expandedStage = stageButtons.find((sb) => isExpanded(sb.stage));
                  return (
                    <div key={d.key}>
                      <div className={`w-full rounded-xl border bg-card/60 px-3 py-2.5 text-left transition hover:shadow hover:bg-card/80 cursor-pointer overflow-hidden ${industryFilter === d.key ? "ring-1 ring-primary/40" : ""}`} onClick={() => setIndustryFilter(d.key === industryFilter ? "ALL" : d.key)} data-testid={`row-industry-${d.key.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-medium">{d.key}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            {uploadDiagnostics ? (
                              <><span>{formatCompact(d.views)} views</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            ) : (
                              <><span>{formatCompact(d.mqls)} MQLs</span><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span></>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{d.count} assets</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          {stageButtons.map((sb) => (
                            <button key={sb.stage} className={`rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer hover:bg-muted/50 ${sb.color} ${isExpanded(sb.stage) ? sb.activeColor : ""}`} onClick={(e) => toggleStage(sb.stage, e)} title={`Show ${sb.stage} content IDs for ${d.key}`} data-testid={`btn-industry-stage-${d.key.replace(/\s+/g, "-").toLowerCase()}-${sb.stage.toLowerCase()}`}>
                              {sb.count} {sb.stage}
                            </button>
                          ))}
                        </div>
                      </div>
                      {expandedStage && (
                        <div className="mt-1 mb-1 ml-3 rounded-xl border bg-card/40 p-3" data-testid={`drilldown-industry-${d.key.replace(/\s+/g, "-").toLowerCase()}-${expandedStage.stage.toLowerCase()}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${expandedStage.color} border-current/20`}>{expandedStage.stage}</Badge>
                              <span className="text-xs text-muted-foreground">{industryStageContentIds.length} content {industryStageContentIds.length === 1 ? "asset" : "assets"}</span>
                            </div>
                            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setIndustryStageExpand(null)} data-testid="btn-close-industry-drilldown">Close</button>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto space-y-1">
                            {industryStageContentIds.map((item, idx) => (
                              <div key={`${item.content}-${idx}`} className="flex items-center justify-between rounded-lg border bg-card/60 px-2.5 py-1.5 text-xs" data-testid={`industry-drilldown-item-${idx}`}>
                                <div className="min-w-0 flex-1 truncate font-medium" title={item.content}>{item.content}</div>
                                <div className="flex items-center gap-2 text-muted-foreground shrink-0 ml-2">
                                  {item.product && <span>{item.product}</span>}
                                  {item.channel && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span>{item.channel}</span></>)}
                                  {item.sqos > 0 && (<><span className="h-1 w-1 rounded-full bg-muted-foreground/40" /><span className="font-medium text-foreground">{formatCompact(item.sqos)} SQOs</span></>)}
                                </div>
                              </div>
                            ))}
                            {industryStageContentIds.length === 0 && (<div className="text-center text-xs text-muted-foreground py-3">No content assets found.</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Tabs defaultValue="cta-analysis" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl border bg-card/60 p-1 shadow-sm backdrop-blur">
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
          </Tabs>
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
