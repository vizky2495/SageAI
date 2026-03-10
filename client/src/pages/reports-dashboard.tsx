import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  Plus,
  X,
  GripVertical,
  BarChart3,
  PieChart,
  TrendingUp,
  Table2,
  AreaChart as AreaChartIcon,
  Layers,
  Download,
  Settings2,
  RotateCcw,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  Edit3,
  Check,
  Copy,
  Trash2,
  LayoutGrid,
  Hash,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RPieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  useFunnelData,
  sum,
  formatCompact,
  stageMeta,
  type StageKey,
  type NormalizedRow,
} from "@/hooks/use-funnel-data";
import TopNav from "@/components/top-nav";

type WidgetSize = "sm" | "md" | "lg";
type ChartType = "bar" | "stacked-bar" | "pie" | "table" | "kpi" | "area" | "metric" | "heatmap";
type Dimension = "stage" | "channel" | "product" | "contentType" | "campaign" | "cta";
type Measure = "count" | "pageViews" | "leads" | "sqos";

interface WidgetConfig {
  id: string;
  chartType: ChartType;
  title: string;
  dimension: Dimension;
  measure: Measure;
  secondaryMeasure?: Measure;
  stageFilter?: StageKey | "";
  size: WidgetSize;
  colSpan?: number;
  heightPx?: number;
}

interface ReportPage {
  id: string;
  name: string;
  widgets: WidgetConfig[];
}

const DIMENSION_LABELS: Record<Dimension, string> = {
  stage: "Funnel Stage",
  channel: "Channel",
  product: "Product",
  contentType: "Content Type",
  campaign: "Campaign",
  cta: "CTA",
};

const MEASURE_LABELS: Record<Measure, string> = {
  count: "Content Count",
  pageViews: "Page Views",
  leads: "Leads",
  sqos: "SQOs",
};

const CHART_TYPE_META: Record<ChartType, { label: string; icon: React.ElementType; description: string }> = {
  bar: { label: "Bar Chart", icon: BarChart3, description: "Compare values across categories" },
  "stacked-bar": { label: "Stacked Bar", icon: Layers, description: "Compare with stage breakdown" },
  pie: { label: "Donut Chart", icon: PieChart, description: "Show proportional distribution" },
  table: { label: "Data Table", icon: Table2, description: "Sortable tabular view of data" },
  kpi: { label: "KPI Cards", icon: TrendingUp, description: "Key metrics at a glance" },
  area: { label: "Area Chart", icon: AreaChartIcon, description: "Show trends and flow" },
  metric: { label: "Scorecard", icon: Hash, description: "Single big-number metric" },
  heatmap: { label: "Matrix", icon: LayoutGrid, description: "Cross-tabulation heatmap" },
};

const PALETTE = [
  "hsl(145, 70%, 50%)",
  "hsl(200, 80%, 55%)",
  "hsl(270, 70%, 60%)",
  "hsl(340, 75%, 55%)",
  "hsl(45, 90%, 55%)",
  "hsl(170, 65%, 45%)",
  "hsl(20, 80%, 55%)",
  "hsl(230, 60%, 55%)",
];

const STAGE_COLORS: Record<string, string> = {
  TOFU: "hsl(145, 70%, 50%)",
  MOFU: "hsl(200, 80%, 55%)",
  BOFU: "hsl(270, 70%, 60%)",
  UNKNOWN: "hsl(var(--muted-foreground))",
};

const SIZE_CLASSES: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1 lg:col-span-1",
  lg: "col-span-1 md:col-span-2",
};

const DEFAULT_WIDGET_HEIGHT = 280;
const MIN_WIDGET_HEIGHT = 180;
const MAX_WIDGET_HEIGHT = 700;
const HEADER_HEIGHT = 44;

function getEffectiveColSpan(w: WidgetConfig): number {
  if (w.colSpan) return w.colSpan;
  if (w.size === "lg") return 2;
  return 1;
}

function getEffectiveHeight(w: WidgetConfig): number {
  return w.heightPx || DEFAULT_WIDGET_HEIGHT;
}

function getContentHeight(w: WidgetConfig): number {
  return getEffectiveHeight(w) - HEADER_HEIGHT;
}

const STORAGE_KEY = "cia_reports_v2";

function getDimensionValue(row: NormalizedRow, dim: Dimension): string {
  switch (dim) {
    case "stage": return row.stage || "UNKNOWN";
    case "channel": return row.utmChannel || "(unattributed)";
    case "product": return row.productFranchise || "(unattributed)";
    case "contentType": return row.contentType || "(unknown)";
    case "campaign": return row.campaignName || "(none)";
    case "cta": return row.cta || "(none)";
    default: return "(unknown)";
  }
}

function getMeasureValue(row: NormalizedRow, m: Measure): number {
  switch (m) {
    case "count": return 1;
    case "pageViews": return row.pageViews || 0;
    case "leads": return row.newContacts || 0;
    case "sqos": return row.sqos || 0;
    default: return 0;
  }
}

function aggregateData(rows: NormalizedRow[], dimension: Dimension, measure: Measure, stageFilter?: string) {
  let filtered = rows;
  if (stageFilter && stageFilter !== "") {
    filtered = rows.filter((r) => r.stage === stageFilter);
  }

  const map = new Map<string, number>();
  for (const r of filtered) {
    const key = getDimensionValue(r, dimension);
    map.set(key, (map.get(key) || 0) + getMeasureValue(r, measure));
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function aggregateStackedData(rows: NormalizedRow[], dimension: Dimension, measure: Measure) {
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = getDimensionValue(r, dimension);
    const stage = r.stage || "UNKNOWN";
    if (!map.has(key)) map.set(key, { TOFU: 0, MOFU: 0, BOFU: 0, UNKNOWN: 0 });
    const entry = map.get(key)!;
    entry[stage] = (entry[stage] || 0) + getMeasureValue(r, measure);
  }
  return Array.from(map.entries())
    .map(([name, stages]) => ({ name, ...stages } as { name: string; TOFU: number; MOFU: number; BOFU: number; UNKNOWN: number }))
    .sort((a, b) => {
      const totalB = a.TOFU + a.MOFU + a.BOFU;
      const totalA = b.TOFU + b.MOFU + b.BOFU;
      return totalA - totalB;
    })
    .slice(0, 12);
}

function aggregateHeatmapData(rows: NormalizedRow[], dimension: Dimension, measure: Measure) {
  const stages: StageKey[] = ["TOFU", "MOFU", "BOFU"];
  const dimMap = new Map<string, Record<string, number>>();

  for (const r of rows) {
    const key = getDimensionValue(r, dimension);
    const stage = r.stage || "UNKNOWN";
    if (!stages.includes(stage as StageKey)) continue;
    if (!dimMap.has(key)) dimMap.set(key, {});
    const entry = dimMap.get(key)!;
    entry[stage] = (entry[stage] || 0) + getMeasureValue(r, measure);
  }

  const dimKeys = Array.from(dimMap.keys()).slice(0, 10);
  let maxVal = 0;
  const cells: { dim: string; stage: string; value: number }[] = [];
  for (const dk of dimKeys) {
    for (const s of stages) {
      const val = dimMap.get(dk)?.[s] || 0;
      cells.push({ dim: dk, stage: s, value: val });
      if (val > maxVal) maxVal = val;
    }
  }
  return { cells, dimKeys, stages, maxVal };
}

function exportWidgetCSV(data: Array<Record<string, any>>, title: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        return typeof val === "string" && val.includes(",") ? `"${val}"` : val;
      }).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAllData(rows: NormalizedRow[]) {
  const data = rows.map((r) => ({
    ID: r.id,
    Content: r.content,
    Stage: r.stage,
    Channel: r.utmChannel || "",
    Product: r.productFranchise || "",
    ContentType: r.contentType || "",
    Campaign: r.campaignName || "",
    CTA: r.cta || "",
    PageViews: r.pageViews || 0,
    Leads: r.newContacts || 0,
    SQOs: r.sqos || 0,
  }));
  exportWidgetCSV(data, "CIA_Full_Data_Export");
}

const DEFAULT_PAGES: ReportPage[] = [
  {
    id: "overview",
    name: "Overview",
    widgets: [
      { id: "w1", chartType: "kpi", title: "Key Metrics", dimension: "stage", measure: "count", size: "lg" },
      { id: "w2", chartType: "pie", title: "Stage Distribution", dimension: "stage", measure: "count", size: "md" },
      { id: "w3", chartType: "bar", title: "Channel Performance", dimension: "channel", measure: "pageViews", size: "lg" },
      { id: "w4", chartType: "area", title: "Funnel Flow", dimension: "stage", measure: "pageViews", secondaryMeasure: "leads", size: "lg" },
    ],
  },
  {
    id: "breakdown",
    name: "Deep Dive",
    widgets: [
      { id: "w5", chartType: "stacked-bar", title: "Channel × Stage", dimension: "channel", measure: "leads", size: "lg" },
      { id: "w6", chartType: "heatmap", title: "Product × Stage Matrix", dimension: "product", measure: "pageViews", size: "lg" },
      { id: "w7", chartType: "table", title: "Top Content", dimension: "contentType", measure: "pageViews", size: "lg" },
      { id: "w8", chartType: "pie", title: "Content Type Mix", dimension: "contentType", measure: "count", size: "md" },
    ],
  },
];

function loadSavedState(): ReportPage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_PAGES;
}

function saveState(pages: ReportPage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

function BarChartWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const data = useMemo(() => aggregateData(rows, config.dimension, config.measure, config.stageFilter).slice(0, 10), [rows, config]);

  return (
    <div style={{ height: getContentHeight(config) }} data-testid={`widget-bar-${config.id}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="value" name={MEASURE_LABELS[config.measure]} radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={config.dimension === "stage" ? STAGE_COLORS[data[i].name] || PALETTE[i % PALETTE.length] : PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedBarWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const data = useMemo(() => aggregateStackedData(rows, config.dimension, config.measure), [rows, config]);

  return (
    <div style={{ height: getContentHeight(config) }} data-testid={`widget-stacked-${config.id}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="TOFU" stackId="a" fill={STAGE_COLORS.TOFU} radius={[0, 0, 0, 0]} />
          <Bar dataKey="MOFU" stackId="a" fill={STAGE_COLORS.MOFU} radius={[0, 0, 0, 0]} />
          <Bar dataKey="BOFU" stackId="a" fill={STAGE_COLORS.BOFU} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const data = useMemo(() => {
    const raw = aggregateData(rows, config.dimension, config.measure, config.stageFilter).slice(0, 8);
    return raw.map((d, i) => ({
      ...d,
      fill: config.dimension === "stage" ? STAGE_COLORS[d.name] || PALETTE[i] : PALETTE[i % PALETTE.length],
    }));
  }, [rows, config]);

  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex items-center gap-4 h-full" data-testid={`widget-pie-${config.id}`}>
      <div className="shrink-0" style={{ width: Math.min(140, getContentHeight(config) - 16), height: Math.min(140, getContentHeight(config) - 16) }}>
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          </RPieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: getContentHeight(config) - 16 }}>
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="truncate">{d.name}</span>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <span className="text-muted-foreground">{formatCompact(d.value)}</span>
              <span className="text-muted-foreground/50 w-8 text-right">{total ? `${((d.value / total) * 100).toFixed(0)}%` : "0%"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const [sortCol, setSortCol] = useState<string>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const data = useMemo(() => {
    let filtered = rows;
    if (config.stageFilter) filtered = rows.filter((r) => r.stage === config.stageFilter);

    const map = new Map<string, { name: string; count: number; pageViews: number; leads: number; sqos: number }>();
    for (const r of filtered) {
      const key = getDimensionValue(r, config.dimension);
      const curr = map.get(key) || { name: key, count: 0, pageViews: 0, leads: 0, sqos: 0 };
      curr.count += 1;
      curr.pageViews += r.pageViews || 0;
      curr.leads += r.newContacts || 0;
      curr.sqos += r.sqos || 0;
      map.set(key, curr);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr.slice(0, 20);
  }, [rows, config, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const cols = [
    { key: "name", label: DIMENSION_LABELS[config.dimension], align: "left" as const },
    { key: "count", label: "Count", align: "right" as const },
    { key: "pageViews", label: "Views", align: "right" as const },
    { key: "leads", label: "Leads", align: "right" as const },
    { key: "sqos", label: "SQOs", align: "right" as const },
  ];

  return (
    <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: getContentHeight(config) }} data-testid={`widget-table-${config.id}`}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card/90 backdrop-blur">
          <tr className="border-b border-border/30 text-muted-foreground/60">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`py-2 font-medium cursor-pointer hover:text-foreground transition-colors ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "name" ? "pl-1" : ""}`}
                onClick={() => c.key !== "name" && toggleSort(c.key)}
                data-testid={`th-${c.key}`}
              >
                {c.label} {sortCol === c.key ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-border/10 hover:bg-muted/20 transition-colors" data-testid={`row-table-${config.id}-${i}`}>
              <td className="py-1.5 pl-1 max-w-[180px] truncate font-medium">{r.name}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatCompact(r.count)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatCompact(r.pageViews)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatCompact(r.leads)}</td>
              <td className="py-1.5 text-right text-muted-foreground">{formatCompact(r.sqos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiWidget({ rows, byStage }: { rows: NormalizedRow[]; byStage: Record<string, NormalizedRow[]> }) {
  const metrics = [
    { label: "Total Content", value: formatCompact(rows.length), sub: "assets", color: "text-foreground" },
    { label: "Page Views", value: formatCompact(sum(rows, "pageViews")), sub: "total", color: "text-sky-400" },
    { label: "Leads", value: formatCompact(sum(rows, "newContacts")), sub: "generated", color: "text-emerald-400" },
    { label: "SQOs", value: formatCompact(sum(rows, "sqos")), sub: "qualified", color: "text-violet-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="widget-kpi">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-xl border border-border/30 bg-background/50 p-3 text-center" data-testid={`kpi-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
          <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{m.label}</div>
          <div className="text-[10px] text-muted-foreground/50">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}

function AreaChartWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const data = useMemo(() => {
    let agg = aggregateData(rows, config.dimension, config.measure, config.stageFilter).slice(0, 10);
    if (config.dimension === "stage") {
      const stageOrder = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];
      agg = agg.sort((a, b) => stageOrder.indexOf(a.name) - stageOrder.indexOf(b.name));
    } else {
      agg = agg.reverse();
    }
    if (config.secondaryMeasure) {
      const agg2 = aggregateData(rows, config.dimension, config.secondaryMeasure, config.stageFilter);
      const map2 = new Map(agg2.map((d) => [d.name, d.value]));
      return agg.map((d) => ({ ...d, secondary: map2.get(d.name) || 0 }));
    }
    return agg;
  }, [rows, config]);

  return (
    <div style={{ height: getContentHeight(config) }} data-testid={`widget-area-${config.id}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <defs>
            <linearGradient id={`grad1-${config.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PALETTE[0]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`grad2-${config.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PALETTE[1]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={PALETTE[1]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="value" name={MEASURE_LABELS[config.measure]} stroke={PALETTE[0]} fill={`url(#grad1-${config.id})`} strokeWidth={2} />
          {config.secondaryMeasure && (
            <Area type="monotone" dataKey="secondary" name={MEASURE_LABELS[config.secondaryMeasure]} stroke={PALETTE[1]} fill={`url(#grad2-${config.id})`} strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const value = useMemo(() => {
    let filtered = rows;
    if (config.stageFilter) filtered = rows.filter((r) => r.stage === config.stageFilter);
    if (config.measure === "count") return filtered.length;
    return filtered.reduce((acc, r) => acc + getMeasureValue(r, config.measure), 0);
  }, [rows, config]);

  return (
    <div className="flex flex-col items-center justify-center py-4 gap-1" data-testid={`widget-metric-${config.id}`}>
      <div className="text-3xl font-bold bg-gradient-to-r from-primary to-emerald-300 bg-clip-text text-transparent">{formatCompact(value)}</div>
      <div className="text-sm text-muted-foreground">{MEASURE_LABELS[config.measure]}</div>
      {config.stageFilter && (
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${stageMeta[config.stageFilter as StageKey]?.tone || ""}`}>
          {config.stageFilter}
        </span>
      )}
    </div>
  );
}

function HeatmapWidget({ rows, config }: { rows: NormalizedRow[]; config: WidgetConfig }) {
  const { cells, dimKeys, stages, maxVal } = useMemo(
    () => aggregateHeatmapData(rows, config.dimension, config.measure),
    [rows, config]
  );

  function getColor(val: number) {
    const intensity = maxVal > 0 ? val / maxVal : 0;
    return `hsl(145, 70%, ${85 - intensity * 55}%)`;
  }

  return (
    <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: getContentHeight(config) }} data-testid={`widget-heatmap-${config.id}`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left py-2 font-medium text-muted-foreground/60 pl-1">{DIMENSION_LABELS[config.dimension]}</th>
            {stages.map((s) => (
              <th key={s} className="text-center py-2 font-medium text-muted-foreground/60 w-20">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dimKeys.map((dk) => (
            <tr key={dk} className="border-b border-border/10">
              <td className="py-1.5 pl-1 max-w-[150px] truncate font-medium">{dk}</td>
              {stages.map((s) => {
                const cell = cells.find((c) => c.dim === dk && c.stage === s);
                const val = cell?.value || 0;
                return (
                  <td key={s} className="py-1.5 text-center">
                    <div
                      className="mx-auto rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{
                        backgroundColor: val > 0 ? getColor(val) : "transparent",
                        color: val > 0 && val / maxVal > 0.5 ? "hsl(145, 20%, 15%)" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {val > 0 ? formatCompact(val) : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WidgetContent({ config, rows, byStage }: { config: WidgetConfig; rows: NormalizedRow[]; byStage: Record<string, NormalizedRow[]> }) {
  switch (config.chartType) {
    case "bar": return <BarChartWidget rows={rows} config={config} />;
    case "stacked-bar": return <StackedBarWidget rows={rows} config={config} />;
    case "pie": return <PieWidget rows={rows} config={config} />;
    case "table": return <TableWidget rows={rows} config={config} />;
    case "kpi": return <KpiWidget rows={rows} byStage={byStage} />;
    case "area": return <AreaChartWidget rows={rows} config={config} />;
    case "metric": return <MetricWidget rows={rows} config={config} />;
    case "heatmap": return <HeatmapWidget rows={rows} config={config} />;
    default: return <div className="text-sm text-muted-foreground">Unknown widget type</div>;
  }
}

function getWidgetExportData(rows: NormalizedRow[], config: WidgetConfig): Array<Record<string, any>> {
  const dimLabel = DIMENSION_LABELS[config.dimension];

  if (config.chartType === "stacked-bar") {
    const stacked = aggregateStackedData(rows, config.dimension, config.measure);
    return stacked.map((d) => ({
      [dimLabel]: d.name,
      [`TOFU ${MEASURE_LABELS[config.measure]}`]: d.TOFU,
      [`MOFU ${MEASURE_LABELS[config.measure]}`]: d.MOFU,
      [`BOFU ${MEASURE_LABELS[config.measure]}`]: d.BOFU,
    }));
  }

  if (config.chartType === "heatmap") {
    const { cells, dimKeys, stages } = aggregateHeatmapData(rows, config.dimension, config.measure);
    return dimKeys.map((dk) => {
      const row: Record<string, any> = { [dimLabel]: dk };
      for (const s of stages) {
        const cell = cells.find((c) => c.dim === dk && c.stage === s);
        row[s] = cell?.value || 0;
      }
      return row;
    });
  }

  if (config.chartType === "table") {
    let filtered = rows;
    if (config.stageFilter) filtered = rows.filter((r) => r.stage === config.stageFilter);
    const map = new Map<string, { name: string; count: number; pageViews: number; leads: number; sqos: number }>();
    for (const r of filtered) {
      const key = getDimensionValue(r, config.dimension);
      const curr = map.get(key) || { name: key, count: 0, pageViews: 0, leads: 0, sqos: 0 };
      curr.count += 1;
      curr.pageViews += r.pageViews || 0;
      curr.leads += r.newContacts || 0;
      curr.sqos += r.sqos || 0;
      map.set(key, curr);
    }
    return Array.from(map.values()).map((d) => ({
      [dimLabel]: d.name, Count: d.count, "Page Views": d.pageViews, Leads: d.leads, SQOs: d.sqos,
    }));
  }

  if (config.chartType === "area" && config.secondaryMeasure) {
    const data = aggregateData(rows, config.dimension, config.measure, config.stageFilter);
    const data2 = aggregateData(rows, config.dimension, config.secondaryMeasure, config.stageFilter);
    const map2 = new Map(data2.map((d) => [d.name, d.value]));
    return data.map((d) => ({
      [dimLabel]: d.name,
      [MEASURE_LABELS[config.measure]]: d.value,
      [MEASURE_LABELS[config.secondaryMeasure!]]: map2.get(d.name) || 0,
    }));
  }

  const data = aggregateData(rows, config.dimension, config.measure, config.stageFilter);
  return data.map((d) => ({ [dimLabel]: d.name, [MEASURE_LABELS[config.measure]]: d.value }));
}

function AddWidgetModal({ onAdd, onClose }: { onAdd: (config: Omit<WidgetConfig, "id">) => void; onClose: () => void }) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [dimension, setDimension] = useState<Dimension>("channel");
  const [measure, setMeasure] = useState<Measure>("pageViews");
  const [secondaryMeasure, setSecondaryMeasure] = useState<Measure | "">("");
  const [stageFilter, setStageFilter] = useState<StageKey | "">("");
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<WidgetSize>("md");

  const autoTitle = useMemo(() => {
    if (chartType === "kpi") return "Key Metrics";
    const mLabel = MEASURE_LABELS[measure];
    const dLabel = DIMENSION_LABELS[dimension];
    return `${mLabel} by ${dLabel}`;
  }, [chartType, dimension, measure]);

  const handleAdd = () => {
    onAdd({
      chartType,
      title: title.trim() || autoTitle,
      dimension,
      measure,
      secondaryMeasure: secondaryMeasure || undefined,
      stageFilter: stageFilter || undefined,
      size,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="modal-add-widget"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        className="w-full max-w-lg rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <h2 className="text-sm font-semibold">Add Visualization</h2>
          <button onClick={onClose} className="text-muted-foreground/40 hover:text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Chart Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.entries(CHART_TYPE_META) as [ChartType, typeof CHART_TYPE_META[ChartType]][]).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setChartType(key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                      chartType === key
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/30 hover:border-border/60 hover:bg-muted/20"
                    }`}
                    data-testid={`chart-type-${key}`}
                  >
                    <Icon className={`h-4 w-4 ${chartType === key ? "text-primary" : "text-muted-foreground/60"}`} />
                    <span className="text-[10px] font-medium">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {chartType !== "kpi" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Dimension (Group By)</label>
                  <select
                    value={dimension}
                    onChange={(e) => setDimension(e.target.value as Dimension)}
                    className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                    data-testid="select-dimension"
                  >
                    {Object.entries(DIMENSION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Measure (Value)</label>
                  <select
                    value={measure}
                    onChange={(e) => setMeasure(e.target.value as Measure)}
                    className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                    data-testid="select-measure"
                  >
                    {Object.entries(MEASURE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {chartType === "area" && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Secondary Measure (Optional)</label>
                  <select
                    value={secondaryMeasure}
                    onChange={(e) => setSecondaryMeasure(e.target.value as Measure | "")}
                    className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                    data-testid="select-secondary-measure"
                  >
                    <option value="">None</option>
                    {Object.entries(MEASURE_LABELS).filter(([k]) => k !== measure).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {chartType !== "stacked-bar" && chartType !== "heatmap" && (
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Stage Filter (Optional)</label>
                  <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value as StageKey | "")}
                    className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                    data-testid="select-stage-filter"
                  >
                    <option value="">All Stages</option>
                    <option value="TOFU">TOFU</option>
                    <option value="MOFU">MOFU</option>
                    <option value="BOFU">BOFU</option>
                  </select>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={autoTitle}
                className="w-full rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/30"
                data-testid="input-widget-title"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Size</label>
              <div className="flex gap-1.5">
                {(["sm", "md", "lg"] as WidgetSize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${
                      size === s ? "border-primary bg-primary/5 text-primary" : "border-border/30 text-muted-foreground hover:border-border/60"
                    }`}
                    data-testid={`size-${s}`}
                  >
                    {s === "sm" ? "Small" : s === "md" ? "Medium" : "Wide"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={handleAdd} className="text-xs" data-testid="btn-confirm-add-widget">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add to Dashboard
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SortableWidget({
  config,
  rows,
  byStage,
  gridRef,
  onRemove,
  onResize,
  onSetSize,
  onDownload,
}: {
  config: WidgetConfig;
  rows: NormalizedRow[];
  byStage: Record<string, NormalizedRow[]>;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onRemove: (id: string) => void;
  onResize: (id: string) => void;
  onSetSize: (id: string, colSpan: number, heightPx: number) => void;
  onDownload: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });
  const [isResizing, setIsResizing] = useState(false);
  const [previewSpan, setPreviewSpan] = useState<number | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const effectiveSpan = previewSpan ?? getEffectiveColSpan(config);
  const effectiveHeight = previewHeight ?? getEffectiveHeight(config);

  const spanClasses = effectiveSpan === 3
    ? "col-span-1 md:col-span-2 lg:col-span-3"
    : effectiveSpan === 2
    ? "col-span-1 md:col-span-2"
    : "col-span-1";

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? undefined : transition,
    height: effectiveHeight,
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const widgetEl = widgetRef.current;
    const gridEl = gridRef.current;
    if (!widgetEl || !gridEl) return;

    const rect = widgetEl.getBoundingClientRect();
    const gridStyles = window.getComputedStyle(gridEl);
    const cols = gridStyles.getPropertyValue("grid-template-columns").split(" ");
    const colWidth = cols.length > 0 ? parseFloat(cols[0]) : rect.width;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;

    setIsResizing(true);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    let lastSpan = getEffectiveColSpan(config);
    let lastHeight = getEffectiveHeight(config);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      lastSpan = Math.max(1, Math.min(3, Math.round((startWidth + dx) / colWidth)));
      lastHeight = Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, Math.round((startHeight + dy) / 10) * 10));

      setPreviewSpan(lastSpan);
      setPreviewHeight(lastHeight);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
      setPreviewSpan(null);
      setPreviewHeight(null);
      onSetSize(config.id, lastSpan, lastHeight);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [config, gridRef, onSetSize]);

  const meta = CHART_TYPE_META[config.chartType];
  const Icon = meta.icon;

  const spanLabel = effectiveSpan === 1 ? "1 col" : effectiveSpan === 2 ? "2 cols" : "3 cols (full)";

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (widgetRef as any).current = node;
      }}
      style={style}
      className={`relative group ${spanClasses} ${isDragging ? "opacity-40 z-50" : ""}`}
    >
      <motion.div
        layout={!isResizing}
        className={`h-full rounded-2xl border bg-card/60 backdrop-blur overflow-hidden ${isResizing ? "border-[#00D657]/50 ring-1 ring-[#00D657]/20" : "border-border/40"}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <button
              className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors touch-none"
              {...attributes}
              {...listeners}
              data-testid={`drag-handle-${config.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
            <h3 className="text-xs font-semibold text-muted-foreground">{config.title}</h3>
            {config.stageFilter && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${stageMeta[config.stageFilter as StageKey]?.tone || ""}`}>
                {config.stageFilter}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-0.5 transition-opacity ${isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {isResizing && (
              <span className="text-[9px] text-[#00D657] font-medium mr-1">{spanLabel} / {effectiveHeight}px</span>
            )}
            <button
              onClick={() => onDownload(config.id)}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
              title="Download data"
              data-testid={`download-${config.id}`}
            >
              <Download className="h-3 w-3" />
            </button>
            <button
              onClick={() => onResize(config.id)}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
              title={getEffectiveColSpan(config) >= 2 ? "Make smaller" : "Make wider"}
              data-testid={`resize-${config.id}`}
            >
              {getEffectiveColSpan(config) >= 2 ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
            <button
              onClick={() => onRemove(config.id)}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Remove widget"
              data-testid={`remove-${config.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-hidden" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
          <WidgetContent config={{ ...config, heightPx: effectiveHeight }} rows={rows} byStage={byStage} />
        </div>
      </motion.div>

      <div
        onMouseDown={handleResizeStart}
        className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-10 transition-opacity ${isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        title="Drag to resize"
        data-testid={`resize-handle-${config.id}`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className="text-muted-foreground/40 hover:text-[#00D657] transition-colors">
          <path d="M 14 20 L 20 14 M 10 20 L 20 10 M 6 20 L 20 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function PageTab({
  page,
  isActive,
  onSelect,
  onRename,
  onDelete,
  canDelete,
}: {
  page: ReportPage;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const confirmRename = () => {
    if (name.trim()) onRename(name.trim());
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all group ${
        isActive
          ? "bg-primary/10 text-primary border border-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent"
      }`}
      data-testid={`tab-page-${page.id}`}
    >
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setEditing(false); }}
            onBlur={confirmRename}
            className="w-20 bg-transparent outline-none text-xs border-b border-primary/50"
            onClick={(e) => e.stopPropagation()}
            data-testid={`input-rename-${page.id}`}
          />
          <button onClick={(e) => { e.stopPropagation(); confirmRename(); }}><Check className="h-3 w-3" /></button>
        </div>
      ) : (
        <>
          <span>{page.name}</span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="p-0.5 rounded hover:bg-muted/50"
              data-testid={`btn-rename-${page.id}`}
            >
              <Edit3 className="h-2.5 w-2.5" />
            </button>
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-0.5 rounded hover:bg-rose-500/20 hover:text-rose-400"
                data-testid={`btn-delete-page-${page.id}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsDashboard() {
  const { rows, dataLoading, byStage } = useFunnelData();
  const [pages, setPages] = useState<ReportPage[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedState();
    setPages(saved);
    setActivePageId(saved[0]?.id || "");
  }, []);

  useEffect(() => {
    if (pages.length > 0) saveState(pages);
  }, [pages]);

  const activePage = pages.find((p) => p.id === activePageId) || pages[0];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id && activePage) {
      setPages((prev) => prev.map((p) => {
        if (p.id !== activePage.id) return p;
        const ids = p.widgets.map((w) => w.id);
        const oldIndex = ids.indexOf(String(active.id));
        const newIndex = ids.indexOf(String(over.id));
        return { ...p, widgets: arrayMove(p.widgets, oldIndex, newIndex) };
      }));
    }
  }, [activePage]);

  const addWidget = useCallback((config: Omit<WidgetConfig, "id">) => {
    if (!activePage) return;
    const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setPages((prev) => prev.map((p) =>
      p.id === activePage.id ? { ...p, widgets: [...p.widgets, { ...config, id }] } : p
    ));
  }, [activePage]);

  const removeWidget = useCallback((widgetId: string) => {
    if (!activePage) return;
    setPages((prev) => prev.map((p) =>
      p.id === activePage.id ? { ...p, widgets: p.widgets.filter((w) => w.id !== widgetId) } : p
    ));
  }, [activePage]);

  const resizeWidget = useCallback((widgetId: string) => {
    if (!activePage) return;
    setPages((prev) => prev.map((p) =>
      p.id === activePage.id
        ? {
            ...p,
            widgets: p.widgets.map((w) => {
              if (w.id !== widgetId) return w;
              const currentSpan = getEffectiveColSpan(w);
              const nextSpan = currentSpan >= 3 ? 1 : currentSpan + 1;
              const nextSize: WidgetSize = nextSpan >= 2 ? "lg" : "md";
              return { ...w, size: nextSize, colSpan: nextSpan };
            }),
          }
        : p
    ));
  }, [activePage]);

  const setWidgetSize = useCallback((widgetId: string, colSpan: number, heightPx: number) => {
    if (!activePage) return;
    setPages((prev) => prev.map((p) =>
      p.id === activePage.id
        ? {
            ...p,
            widgets: p.widgets.map((w) => {
              if (w.id !== widgetId) return w;
              const newSize: WidgetSize = colSpan >= 2 ? "lg" : "md";
              return { ...w, size: newSize, colSpan, heightPx };
            }),
          }
        : p
    ));
  }, [activePage]);

  const gridRef = useRef<HTMLDivElement>(null);

  const downloadWidget = useCallback((widgetId: string) => {
    if (!activePage) return;
    const widget = activePage.widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    const data = getWidgetExportData(rows, widget);
    exportWidgetCSV(data, widget.title);
  }, [activePage, rows]);

  const addPage = useCallback(() => {
    const id = `page_${Date.now()}`;
    const newPage: ReportPage = { id, name: `Report ${pages.length + 1}`, widgets: [] };
    setPages((prev) => [...prev, newPage]);
    setActivePageId(id);
  }, [pages.length]);

  const renamePage = useCallback((pageId: string, name: string) => {
    setPages((prev) => prev.map((p) => p.id === pageId ? { ...p, name } : p));
  }, []);

  const deletePage = useCallback((pageId: string) => {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== pageId);
      if (activePageId === pageId && next.length > 0) setActivePageId(next[0].id);
      return next;
    });
  }, [activePageId]);

  const resetAll = useCallback(() => {
    setPages(DEFAULT_PAGES);
    setActivePageId(DEFAULT_PAGES[0].id);
  }, []);

  const duplicatePage = useCallback((pageId: string) => {
    const source = pages.find((p) => p.id === pageId);
    if (!source) return;
    const id = `page_${Date.now()}`;
    const newPage: ReportPage = {
      id,
      name: `${source.name} (Copy)`,
      widgets: source.widgets.map((w) => ({ ...w, id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageId(id);
  }, [pages]);

  const widgetIds = activePage?.widgets.map((w) => w.id) || [];
  const activeDragWidget = activeId ? activePage?.widgets.find((w) => w.id === activeId) : null;

  return (
    <div className="min-h-screen bg-background" data-testid="reports-dashboard">
      <TopNav />

      <div className="sticky top-12 z-20 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {pages.map((p) => (
              <PageTab
                key={p.id}
                page={p}
                isActive={p.id === activePageId}
                onSelect={() => setActivePageId(p.id)}
                onRename={(name) => renamePage(p.id, name)}
                onDelete={() => deletePage(p.id)}
                canDelete={pages.length > 1}
              />
            ))}
            <button
              onClick={addPage}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/20 transition-colors border border-dashed border-border/30"
              data-testid="btn-add-page"
            >
              <Plus className="h-3 w-3" />
              <span>Page</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportAllData(rows)}
              className="h-7 text-[11px] text-muted-foreground"
              data-testid="btn-export-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              Extract Data
            </Button>
            {activePage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => duplicatePage(activePage.id)}
                className="h-7 text-[11px] text-muted-foreground"
                data-testid="btn-duplicate-page"
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Duplicate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="h-7 text-[11px] text-muted-foreground"
              data-testid="btn-reset-layout"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddWidget(true)}
              className="h-7 text-[11px]"
              data-testid="btn-add-widget"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add View
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full"
            />
            <p className="text-sm text-muted-foreground/60">Loading data…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">No data yet. Upload content data from the Admin page to populate your reports.</p>
            <Link href="/admin">
              <Button variant="outline" size="sm" className="text-xs mt-2" data-testid="link-reports-admin">
                Go to Admin
              </Button>
            </Link>
          </div>
        ) : !activePage || activePage.widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <Settings2 className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">This page is empty. Add views to build your report.</p>
            <Button size="sm" onClick={() => setShowAddWidget(true)} className="text-xs mt-2" data-testid="btn-empty-add">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add View
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
              <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gridAutoRows: "min-content" }}>
                <AnimatePresence>
                  {activePage.widgets.map((w) => (
                    <SortableWidget
                      key={w.id}
                      config={w}
                      rows={rows}
                      byStage={byStage}
                      gridRef={gridRef}
                      onRemove={removeWidget}
                      onResize={resizeWidget}
                      onSetSize={setWidgetSize}
                      onDownload={downloadWidget}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDragWidget ? (
                <div className="rounded-2xl border border-primary/30 bg-card/90 shadow-xl p-4 opacity-80">
                  <div className="flex items-center gap-2">
                    {(() => { const I = CHART_TYPE_META[activeDragWidget.chartType].icon; return <I className="h-4 w-4 text-primary" />; })()}
                    <span className="text-sm font-semibold">{activeDragWidget.title}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <AnimatePresence>
        {showAddWidget && (
          <AddWidgetModal onAdd={addWidget} onClose={() => setShowAddWidget(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
