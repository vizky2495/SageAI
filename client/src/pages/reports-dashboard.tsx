import { useState, useMemo, useCallback, useEffect } from "react";
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
  Users,
  FileText,
  Layers,
  Target,
  Activity,
  Settings2,
  RotateCcw,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
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

type WidgetSize = "sm" | "md" | "lg";

interface WidgetDef {
  id: string;
  type: string;
  title: string;
  icon: React.ElementType;
  size: WidgetSize;
  description: string;
}

const WIDGET_CATALOG: WidgetDef[] = [
  { id: "kpi-overview", type: "kpi-overview", title: "KPI Overview", icon: TrendingUp, size: "lg", description: "Key metrics across all funnel stages" },
  { id: "stage-distribution", type: "stage-distribution", title: "Stage Distribution", icon: PieChart, size: "md", description: "Content distribution by funnel stage" },
  { id: "channel-performance", type: "channel-performance", title: "Channel Performance", icon: BarChart3, size: "lg", description: "Performance metrics by marketing channel" },
  { id: "product-breakdown", type: "product-breakdown", title: "Product Breakdown", icon: Layers, size: "md", description: "Content performance by product" },
  { id: "content-type-mix", type: "content-type-mix", title: "Content Type Mix", icon: FileText, size: "md", description: "Distribution of content types" },
  { id: "top-content", type: "top-content", title: "Top Content", icon: Target, size: "lg", description: "Highest performing content assets" },
  { id: "leads-by-stage", type: "leads-by-stage", title: "Leads by Stage", icon: Users, size: "md", description: "Lead generation across funnel stages" },
  { id: "funnel-flow", type: "funnel-flow", title: "Funnel Flow", icon: Activity, size: "lg", description: "Content flow through funnel stages" },
];

const STORAGE_KEY = "cia_report_layout";

function getDefaultLayout(): string[] {
  return ["kpi-overview", "stage-distribution", "channel-performance", "content-type-mix", "top-content", "funnel-flow"];
}

const VALID_IDS = new Set(WIDGET_CATALOG.map((w) => w.id));

function loadLayout(): { widgets: string[]; sizes: Record<string, WidgetSize> } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const validWidgets = (parsed.widgets || []).filter((id: string) => VALID_IDS.has(id));
      const validSizes: Record<string, WidgetSize> = {};
      for (const [k, v] of Object.entries(parsed.sizes || {})) {
        if (VALID_IDS.has(k) && (v === "sm" || v === "md" || v === "lg")) validSizes[k] = v as WidgetSize;
      }
      return { widgets: validWidgets, sizes: validSizes };
    }
  } catch {}
  return { widgets: getDefaultLayout(), sizes: {} };
}

function saveLayout(widgets: string[], sizes: Record<string, WidgetSize>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets, sizes }));
}

const SIZE_CLASSES: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1 md:col-span-1",
  lg: "col-span-1 md:col-span-2",
};

const STAGE_COLORS: Record<string, string> = {
  TOFU: "hsl(var(--chart-1))",
  MOFU: "hsl(var(--chart-2))",
  BOFU: "hsl(var(--chart-3))",
  UNKNOWN: "hsl(var(--muted-foreground))",
};

const CHANNEL_COLORS = [
  "hsl(145, 70%, 50%)",
  "hsl(200, 80%, 55%)",
  "hsl(270, 70%, 60%)",
  "hsl(340, 75%, 55%)",
  "hsl(45, 90%, 55%)",
  "hsl(170, 65%, 45%)",
  "hsl(20, 80%, 55%)",
  "hsl(230, 60%, 55%)",
];

function KpiOverviewWidget({ rows, byStage }: { rows: NormalizedRow[]; byStage: Record<string, NormalizedRow[]> }) {
  const metrics = [
    { label: "Total Content", value: formatCompact(rows.length), sub: "assets", color: "text-foreground" },
    { label: "Page Views", value: formatCompact(sum(rows, "pageViews")), sub: "total", color: "text-sky-400" },
    { label: "Leads", value: formatCompact(sum(rows, "newContacts")), sub: "generated", color: "text-emerald-400" },
    { label: "SQOs", value: formatCompact(sum(rows, "sqos")), sub: "qualified", color: "text-violet-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="widget-kpi-overview">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-xl border border-border/30 bg-background/50 p-3 text-center" data-testid={`kpi-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
          <div className={`text-xl font-bold ${m.color}`} data-testid={`kpi-value-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>{m.value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{m.label}</div>
          <div className="text-[10px] text-muted-foreground/50">{m.sub}</div>
        </div>
      ))}
    </div>
  );
}

function StageDistributionWidget({ byStage }: { byStage: Record<string, NormalizedRow[]> }) {
  const data = (["TOFU", "MOFU", "BOFU"] as StageKey[]).map((s) => ({
    name: s,
    value: byStage[s]?.length || 0,
    fill: STAGE_COLORS[s],
  }));
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex items-center gap-4" data-testid="widget-stage-distribution">
      <div className="w-28 h-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
          </RPieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
              <span className="font-medium">{d.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{d.value}</span>
              <span className="text-muted-foreground/50 w-10 text-right">{total ? `${((d.value / total) * 100).toFixed(0)}%` : "0%"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelPerformanceWidget({ rows }: { rows: NormalizedRow[] }) {
  const channelData = useMemo(() => {
    const map = new Map<string, { views: number; leads: number; sqos: number; count: number }>();
    for (const r of rows) {
      const ch = r.utmChannel || "(unattributed)";
      const curr = map.get(ch) || { views: 0, leads: 0, sqos: 0, count: 0 };
      curr.views += r.pageViews || 0;
      curr.leads += r.newContacts || 0;
      curr.sqos += r.sqos || 0;
      curr.count += 1;
      map.set(ch, curr);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: name.length > 14 ? name.slice(0, 12) + "…" : name, fullName: name, ...d }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);
  }, [rows]);

  return (
    <div className="h-52" data-testid="widget-channel-performance">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={channelData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Bar dataKey="views" name="Views" fill="hsl(145, 70%, 50%)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="leads" name="Leads" fill="hsl(200, 80%, 55%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductBreakdownWidget({ rows }: { rows: NormalizedRow[] }) {
  const productData = useMemo(() => {
    const map = new Map<string, { views: number; leads: number; count: number }>();
    for (const r of rows) {
      const p = r.productFranchise || "(unattributed)";
      const curr = map.get(p) || { views: 0, leads: 0, count: 0 };
      curr.views += r.pageViews || 0;
      curr.leads += r.newContacts || 0;
      curr.count += 1;
      map.set(p, curr);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, ...d }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6);
  }, [rows]);

  return (
    <div data-testid="widget-product-breakdown">
      <div className="flex flex-col gap-2">
        {productData.map((p, i) => {
          const maxViews = productData[0]?.views || 1;
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-24 truncate font-medium text-muted-foreground">{p.name}</span>
              <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden relative">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.views / maxViews) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                />
              </div>
              <span className="w-12 text-right text-muted-foreground/70">{formatCompact(p.views)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContentTypeMixWidget({ rows }: { rows: NormalizedRow[] }) {
  const typeData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const t = r.contentType || "(unknown)";
      map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, fill: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  const total = typeData.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex items-center gap-4" data-testid="widget-content-type-mix">
      <div className="w-28 h-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            <Pie data={typeData} cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={2} dataKey="value" strokeWidth={0}>
              {typeData.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
          </RPieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0 max-h-28 overflow-y-auto">
        {typeData.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="truncate">{d.name}</span>
            </div>
            <span className="text-muted-foreground/60 ml-2 shrink-0">{total ? `${((d.value / total) * 100).toFixed(0)}%` : "0%"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopContentWidget({ rows }: { rows: NormalizedRow[] }) {
  const top = useMemo(() => {
    return [...rows]
      .sort((a, b) => (b.pageViews || 0) - (a.pageViews || 0))
      .slice(0, 5);
  }, [rows]);

  return (
    <div className="overflow-x-auto" data-testid="widget-top-content">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/30 text-muted-foreground/60">
            <th className="text-left py-2 font-medium">Content</th>
            <th className="text-left py-2 font-medium">Stage</th>
            <th className="text-right py-2 font-medium">Views</th>
            <th className="text-right py-2 font-medium">Leads</th>
            <th className="text-right py-2 font-medium">SQOs</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r, i) => (
            <tr key={i} className="border-b border-border/10" data-testid={`row-top-content-${i}`}>
              <td className="py-2 max-w-[200px] truncate font-medium" data-testid={`text-content-name-${i}`}>{r.content || r.id}</td>
              <td className="py-2">
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${stageMeta[r.stage].tone}`}>
                  {r.stage}
                </span>
              </td>
              <td className="py-2 text-right text-muted-foreground">{formatCompact(r.pageViews || 0)}</td>
              <td className="py-2 text-right text-muted-foreground">{formatCompact(r.newContacts || 0)}</td>
              <td className="py-2 text-right text-muted-foreground">{formatCompact(r.sqos || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadsByStageWidget({ byStage }: { byStage: Record<string, NormalizedRow[]> }) {
  const data = (["TOFU", "MOFU", "BOFU"] as StageKey[]).map((s) => ({
    stage: s,
    leads: sum(byStage[s] || [], "newContacts"),
    sqos: sum(byStage[s] || [], "sqos"),
    fill: STAGE_COLORS[s],
  }));

  return (
    <div className="h-44" data-testid="widget-leads-by-stage">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="leads" name="Leads" radius={[3, 3, 0, 0]}>
            {data.map((d) => <Cell key={d.stage} fill={d.fill} />)}
          </Bar>
          <Bar dataKey="sqos" name="SQOs" fill="hsl(270, 70%, 60%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FunnelFlowWidget({ byStage }: { byStage: Record<string, NormalizedRow[]> }) {
  const data = useMemo(() => {
    return (["TOFU", "MOFU", "BOFU"] as StageKey[]).map((s) => ({
      stage: s,
      assets: byStage[s]?.length || 0,
      views: sum(byStage[s] || [], "pageViews"),
      leads: sum(byStage[s] || [], "newContacts"),
    }));
  }, [byStage]);

  return (
    <div className="h-48" data-testid="widget-funnel-flow">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <defs>
            <linearGradient id="funnelViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(145, 70%, 50%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(145, 70%, 50%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="funnelLeads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
          <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <ReTooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="views" name="Page Views" stroke="hsl(145, 70%, 50%)" fill="url(#funnelViews)" strokeWidth={2} />
          <Area type="monotone" dataKey="leads" name="Leads" stroke="hsl(200, 80%, 55%)" fill="url(#funnelLeads)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SortableWidget({
  widgetId,
  def,
  size,
  rows,
  byStage,
  onRemove,
  onResize,
}: {
  widgetId: string;
  def: WidgetDef;
  size: WidgetSize;
  rows: NormalizedRow[];
  byStage: Record<string, NormalizedRow[]>;
  onRemove: (id: string) => void;
  onResize: (id: string, size: WidgetSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widgetId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = def.icon;

  const renderContent = () => {
    switch (def.type) {
      case "kpi-overview": return <KpiOverviewWidget rows={rows} byStage={byStage} />;
      case "stage-distribution": return <StageDistributionWidget byStage={byStage} />;
      case "channel-performance": return <ChannelPerformanceWidget rows={rows} />;
      case "product-breakdown": return <ProductBreakdownWidget rows={rows} />;
      case "content-type-mix": return <ContentTypeMixWidget rows={rows} />;
      case "top-content": return <TopContentWidget rows={rows} />;
      case "leads-by-stage": return <LeadsByStageWidget byStage={byStage} />;
      case "funnel-flow": return <FunnelFlowWidget byStage={byStage} />;
      default: return <div className="text-sm text-muted-foreground">Unknown widget</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${SIZE_CLASSES[size]} ${isDragging ? "opacity-40 z-50" : ""}`}
    >
      <motion.div
        layout
        className="h-full rounded-2xl border border-border/40 bg-card/60 backdrop-blur overflow-hidden group"
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
              data-testid={`drag-handle-${widgetId}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
            <h3 className="text-xs font-semibold text-muted-foreground">{def.title}</h3>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onResize(widgetId, size === "lg" ? "md" : "lg")}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
              title={size === "lg" ? "Make smaller" : "Make wider"}
              data-testid={`resize-${widgetId}`}
            >
              {size === "lg" ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
            <button
              onClick={() => onRemove(widgetId)}
              className="p-1 rounded-md text-muted-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Remove widget"
              data-testid={`remove-${widgetId}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="p-4">
          {renderContent()}
        </div>
      </motion.div>
    </div>
  );
}

export default function ReportsDashboard() {
  const { rows, dataLoading, byStage } = useFunnelData();
  const [layout, setLayout] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, WidgetSize>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadLayout();
    setLayout(saved.widgets);
    setSizes(saved.sizes);
  }, []);

  useEffect(() => {
    if (layout.length > 0) saveLayout(layout, sizes);
  }, [layout, sizes]);

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
    if (over && active.id !== over.id) {
      setLayout((prev) => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const addWidget = useCallback((id: string) => {
    if (!layout.includes(id)) {
      const def = WIDGET_CATALOG.find((w) => w.id === id);
      setLayout((prev) => [...prev, id]);
      if (def) setSizes((prev) => ({ ...prev, [id]: def.size }));
    }
  }, [layout]);

  const removeWidget = useCallback((id: string) => {
    setLayout((prev) => prev.filter((w) => w !== id));
  }, []);

  const resizeWidget = useCallback((id: string, size: WidgetSize) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  const resetLayout = useCallback(() => {
    const defaults = getDefaultLayout();
    setLayout(defaults);
    setSizes({});
  }, []);

  const availableToAdd = WIDGET_CATALOG.filter((w) => !layout.includes(w.id));

  const getWidgetSize = useCallback((id: string): WidgetSize => {
    if (sizes[id]) return sizes[id];
    const def = WIDGET_CATALOG.find((w) => w.id === id);
    return def?.size || "md";
  }, [sizes]);

  const activeDef = activeId ? WIDGET_CATALOG.find((w) => w.id === activeId) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/performance" data-testid="link-reports-back">
            <div className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm font-[650] tracking-tight">Performance</span>
            </div>
          </Link>

          <h1 className="text-sm font-semibold">My Reports</h1>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetLayout}
              className="h-8 text-xs text-muted-foreground"
              data-testid="btn-reset-layout"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPicker(!showPicker)}
              className="h-8 text-xs"
              data-testid="btn-add-widget"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Widget
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Available Widgets</h3>
                  <button
                    onClick={() => setShowPicker(false)}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    data-testid="btn-close-picker"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {availableToAdd.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 py-4 text-center">All widgets are already on your dashboard.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {availableToAdd.map((w) => {
                      const WIcon = w.icon;
                      return (
                        <button
                          key={w.id}
                          onClick={() => { addWidget(w.id); setShowPicker(false); }}
                          className="flex flex-col items-start gap-1.5 rounded-xl border border-border/30 bg-background/50 p-3 text-left hover:bg-background/80 hover:border-border/60 transition-all"
                          data-testid={`widget-picker-${w.id}`}
                        >
                          <WIcon className="h-4 w-4 text-muted-foreground/60" />
                          <span className="text-xs font-medium">{w.title}</span>
                          <span className="text-[10px] text-muted-foreground/50 leading-snug">{w.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            <p className="text-sm text-muted-foreground/50">No data yet. Upload content data from the Admin page to populate widgets.</p>
            <Link href="/admin">
              <Button variant="outline" size="sm" className="text-xs mt-2" data-testid="link-reports-admin">
                Go to Admin
              </Button>
            </Link>
          </div>
        ) : layout.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <Settings2 className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">Your dashboard is empty. Add widgets to build your report.</p>
            <Button size="sm" onClick={() => setShowPicker(true)} className="text-xs mt-2" data-testid="btn-empty-add">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Widgets
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={layout} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {layout.map((id) => {
                    const def = WIDGET_CATALOG.find((w) => w.id === id);
                    if (!def) return null;
                    return (
                      <SortableWidget
                        key={id}
                        widgetId={id}
                        def={def}
                        size={getWidgetSize(id)}
                        rows={rows}
                        byStage={byStage}
                        onRemove={removeWidget}
                        onResize={resizeWidget}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDef ? (
                <div className="rounded-2xl border border-primary/30 bg-card/90 shadow-xl p-4 opacity-80">
                  <div className="flex items-center gap-2">
                    <activeDef.icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{activeDef.title}</span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
