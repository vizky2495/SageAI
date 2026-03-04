import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/queryClient";
import {
  Upload,
  FileText,
  X,
  Loader2,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  Tag,
  TrendingUp,
  BarChart3,
  Layers,
  Target,
  Lightbulb,
  RefreshCw,
  Zap,
  ShieldCheck,
  Search,
  Database,
} from "lucide-react";

interface Classification {
  contentType: string;
  stage: string;
  product: string;
  industry: string;
  topic: string;
  confidence: number;
}

interface Benchmark {
  contentId: string;
  name: string;
  stage: string;
  type: string;
  product: string;
  channel: string;
  cta: string;
  pageviews: number;
  downloads: number;
  leads: number;
  sqos: number;
  avgTime: number;
  relevanceScore: number;
}

interface MetricStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

interface AggregateBenchmarks {
  sampleSize: number;
  totalPoolSize: number;
  pageviews: MetricStats;
  downloads: MetricStats;
  leads: MetricStats;
  sqos: MetricStats;
  timeOnPage: MetricStats;
  avgCtaCount: number;
}

interface Recommendation {
  priority: number;
  text: string;
  contentId: string;
}

interface ReusabilityItem {
  contentId: string;
  overlap: number;
  cannibalizationRisk: string;
  repurposingOpportunity: string;
}

interface Analysis {
  isFallbackAnalysis: boolean;
  readinessScore: number;
  readinessBreakdown: {
    structure: number;
    ctas: number;
    topicDepth: number;
    format: number;
  };
  performanceForecast: {
    metric: string;
    projectedRange: [number, number];
    confidence: string;
  };
  recommendations: Recommendation[];
  reusability: ReusabilityItem[];
  topAction: string;
}

interface PdfResult {
  filename: string;
  pageCount: number;
  wordCount: number;
  text: string;
  classification: Classification;
  isFallback: boolean;
  benchmarks: Benchmark[];
  aggregateBenchmarks: AggregateBenchmarks | null;
  analysis: Analysis | null;
}

interface AssetPickerItem {
  id: string;
  contentId: string;
  name: string | null;
  stage: string;
  product: string | null;
  channel: string | null;
  cta: string | null;
  type: string | null;
  pageviews: number;
  downloads: number;
  leads: number;
  sqos: number;
  avgTime: number;
}

interface ManualMetrics {
  pageviews: string;
  downloads: string;
  leads: string;
  sqos: string;
  avgTime: string;
}

type SlotAMode = "picker" | "upload";

interface SlotAState {
  mode: SlotAMode;
  selectedAsset: AssetPickerItem | null;
  file: File | null;
  pdfResult: PdfResult | null;
  manualMetrics: ManualMetrics;
  loading: boolean;
  error: string | null;
}

interface ManualContentB {
  title: string;
  contentType: string;
  stage: string;
  product: string;
  description: string;
}

interface SlotBState {
  file: File | null;
  result: PdfResult | null;
  loading: boolean;
  error: string | null;
  isImageOnly: boolean;
  showManualEntry: boolean;
  manualContent: ManualContentB;
}

const EMPTY_SLOT_A: SlotAState = {
  mode: "picker",
  selectedAsset: null,
  file: null,
  pdfResult: null,
  manualMetrics: { pageviews: "", downloads: "", leads: "", sqos: "", avgTime: "" },
  loading: false,
  error: null,
};

const EMPTY_MANUAL_B: ManualContentB = { title: "", contentType: "", stage: "", product: "", description: "" };
const EMPTY_SLOT_B: SlotBState = { file: null, result: null, loading: false, error: null, isImageOnly: false, showManualEntry: false, manualContent: EMPTY_MANUAL_B };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const stageBadgeColors: Record<string, string> = {
  TOFU: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  MOFU: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  BOFU: "bg-violet-500/15 text-violet-400 border-violet-500/25",
};

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString();
}

function ReadinessRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-emerald-400" : score >= 40 ? "text-amber-400" : "text-rose-400";
  const strokeColor = score >= 70 ? "stroke-emerald-400" : score >= 40 ? "stroke-amber-400" : "stroke-rose-400";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor"
          className="text-muted/20" strokeWidth={4}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={4}
          className={strokeColor}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span className={`absolute text-sm font-bold ${color}`} data-testid="text-readiness-score">
        {score}
      </span>
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-emerald-400" : value >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-[10px] font-semibold tabular-nums w-7 text-right">{value}</span>
    </div>
  );
}

function MetricPill({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2 text-center">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${accent || ""}`}>{formatNum(value)}</span>
    </div>
  );
}

function AssetPicker({
  onSelect,
  onSwitchToUpload,
}: {
  onSelect: (asset: AssetPickerItem) => void;
  onSwitchToUpload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssetPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/assets/search-picker?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content A</span>
        <span className="text-[10px] text-muted-foreground">— Existing Content</span>
      </div>

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search by content ID, title, or product..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-muted/20 border border-border/40 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            data-testid="input-asset-search"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground/50" />}
        </div>

        <AnimatePresence>
          {open && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border/40 bg-card shadow-xl"
            >
              {results.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    onSelect(asset);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors border-b border-border/10 last:border-0"
                  data-testid={`picker-asset-${asset.id}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate flex-1">{asset.name || asset.contentId}</span>
                    <Badge className={`${stageBadgeColors[asset.stage] || "bg-muted"} border text-[9px] shrink-0`}>
                      {asset.stage}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {asset.type && <span className="text-foreground/70 font-medium">{asset.type}</span>}
                    <span>{formatNum(asset.pageviews)} views</span>
                    <span>{formatNum(asset.leads)} leads</span>
                    <span>{formatNum(asset.sqos)} SQOs</span>
                    {asset.product && <span className="truncate">{asset.product}</span>}
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {query.length >= 2 && !loading && results.length === 0 && open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-border/40 bg-card shadow-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">No matching content found</p>
          </div>
        )}
      </div>

      <button
        onClick={onSwitchToUpload}
        className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
        data-testid="btn-switch-upload"
      >
        <Upload className="h-3 w-3" />
        Upload a PDF with manual metrics instead
      </button>
    </div>
  );
}

function SelectedAssetCard({
  asset,
  onClear,
}: {
  asset: AssetPickerItem;
  onClear: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content A</span>
          <span className="text-[10px] text-muted-foreground">— Existing Content</span>
        </div>
        <button
          onClick={onClear}
          className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
          data-testid="btn-clear-content-a"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="rounded-xl bg-muted/10 border border-border/30 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/30 shrink-0">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" data-testid="text-selected-asset-name">
              {asset.name || asset.contentId}
            </p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{asset.contentId}</p>
          </div>
          <Badge className={`${stageBadgeColors[asset.stage] || "bg-muted"} border text-[10px] shrink-0`}>
            {asset.stage}
          </Badge>
        </div>

        {(asset.type || asset.product) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" />
            {asset.type && <span className="font-medium text-foreground/80">{asset.type}</span>}
            {asset.type && asset.product && <span className="text-muted-foreground/50">·</span>}
            {asset.product && <span>{asset.product}</span>}
            {asset.channel && <span className="text-muted-foreground/50">· {asset.channel}</span>}
          </div>
        )}

        <div className="grid grid-cols-5 gap-1.5">
          <MetricPill label="Views" value={asset.pageviews} />
          <MetricPill label="Downloads" value={asset.downloads} />
          <MetricPill label="Leads" value={asset.leads} />
          <MetricPill label="SQOs" value={asset.sqos} />
          <MetricPill label="Avg Time" value={asset.avgTime} />
        </div>
      </div>
    </div>
  );
}

function UploadWithMetrics({
  slotA,
  setSlotA,
}: {
  slotA: SlotAState;
  setSlotA: (s: SlotAState) => void;
}) {
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSlotA({ ...slotA, file, error: null });
      }
      e.target.value = "";
    },
    [slotA, setSlotA]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) setSlotA({ ...slotA, file, error: null });
    },
    [slotA, setSlotA]
  );

  const updateMetric = (key: keyof ManualMetrics, value: string) => {
    setSlotA({
      ...slotA,
      manualMetrics: { ...slotA.manualMetrics, [key]: value },
    });
  };

  const metricsReady = slotA.file && Object.values(slotA.manualMetrics).some(v => v.trim() !== "");

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content A</span>
          <span className="text-[10px] text-muted-foreground">— Upload with Metrics</span>
        </div>
        <button
          onClick={() => setSlotA(EMPTY_SLOT_A)}
          className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
          data-testid="btn-clear-upload-a"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {!slotA.file ? (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all"
          data-testid="dropzone-content-a-upload"
        >
          <Upload className="h-6 w-6 text-emerald-400 opacity-60" />
          <div className="text-center">
            <span className="text-sm font-medium">Upload PDF</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Drop a PDF or click to browse</p>
          </div>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
        </label>
      ) : (
        <div className="rounded-xl bg-muted/10 border border-border/30 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium truncate">{slotA.file.name}</span>
            <button onClick={() => setSlotA({ ...slotA, file: null })} className="ml-auto">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
              Performance Metrics
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {(["pageviews", "downloads", "leads", "sqos", "avgTime"] as const).map(key => (
                <div key={key}>
                  <label className="text-[9px] text-muted-foreground block mb-0.5 capitalize">
                    {key === "avgTime" ? "Avg Time" : key === "sqos" ? "SQOs" : key}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={slotA.manualMetrics[key]}
                    onChange={(e) => updateMetric(key, e.target.value)}
                    placeholder="0"
                    className="w-full h-8 px-2 rounded-md bg-muted/30 border border-border/40 text-xs tabular-nums placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    data-testid={`input-metric-${key}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {metricsReady && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Ready to compare</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setSlotA({ ...EMPTY_SLOT_A, mode: "picker" })}
        className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
        data-testid="btn-switch-picker"
      >
        <Search className="h-3 w-3" />
        Search existing content instead
      </button>
    </div>
  );
}

const CONTENT_TYPES_B = ["Whitepaper", "eBook", "Case Study", "Datasheet", "Guide", "Infographic", "Brochure", "Checklist", "Report", "Flyer", "Document"];
const STAGES_B = ["TOFU", "MOFU", "BOFU"];

function ManualContentForm({
  manual,
  onChange,
  onSubmit,
  onCancel,
}: {
  manual: ManualContentB;
  onChange: (m: ManualContentB) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const labelClass = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1";
  const inputClass = "w-full h-8 px-2.5 rounded-md bg-muted/30 border border-border/40 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all";
  const selectClass = inputClass;
  const ready = manual.title.trim() && manual.contentType && manual.stage;

  return (
    <div className="rounded-xl bg-muted/10 border border-border/30 p-3 space-y-2.5">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-sky-400" />
        <span className="text-xs font-semibold">Enter content details manually</span>
      </div>
      <div>
        <label className={labelClass}>Content Title *</label>
        <input type="text" value={manual.title} onChange={e => onChange({ ...manual, title: e.target.value })} placeholder="e.g., Sage Intacct Migration Guide" className={inputClass} data-testid="input-manual-title" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Content Type *</label>
          <select value={manual.contentType} onChange={e => onChange({ ...manual, contentType: e.target.value })} className={selectClass} data-testid="select-manual-content-type">
            <option value="">Select...</option>
            {CONTENT_TYPES_B.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Funnel Stage *</label>
          <select value={manual.stage} onChange={e => onChange({ ...manual, stage: e.target.value })} className={selectClass} data-testid="select-manual-stage">
            <option value="">Select...</option>
            {STAGES_B.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Product Focus</label>
        <input type="text" value={manual.product} onChange={e => onChange({ ...manual, product: e.target.value })} placeholder="e.g., Sage Intacct" className={inputClass} data-testid="input-manual-product" />
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <textarea value={manual.description} onChange={e => onChange({ ...manual, description: e.target.value })} placeholder="Brief summary of the content..." rows={3} className={`${inputClass} h-auto py-2`} data-testid="input-manual-description" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={onSubmit} disabled={!ready} className="rounded-lg bg-[#00D657] hover:bg-[#00C04E] text-black text-xs font-medium h-8 px-3" data-testid="btn-manual-submit">
          Use These Details
        </Button>
        <Button onClick={onCancel} variant="outline" className="rounded-lg text-xs h-8 px-3" data-testid="btn-manual-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NewContentUpload({
  slotB,
  setSlotB,
  extractPdf,
  onClear,
}: {
  slotB: SlotBState;
  setSlotB: (s: SlotBState) => void;
  extractPdf: (file: File) => void;
  onClear: () => void;
}) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) extractPdf(file);
    },
    [extractPdf]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) extractPdf(file);
      e.target.value = "";
    },
    [extractPdf]
  );

  const handleManualSubmit = () => {
    const m = slotB.manualContent;
    const manualResult: PdfResult = {
      filename: m.title || "Manual Entry",
      pageCount: 0,
      wordCount: m.description.split(/\s+/).filter(Boolean).length,
      text: m.description,
      classification: {
        contentType: m.contentType,
        stage: m.stage,
        product: m.product || "General",
        industry: "General",
        topic: m.title,
        confidence: 1.0,
      },
      isFallback: true,
      benchmarks: [],
      aggregateBenchmarks: null,
      analysis: null,
    };
    setSlotB({ ...EMPTY_SLOT_B, result: manualResult });
  };

  if (slotB.result) {
    const r = slotB.result;
    const c = r.classification;
    const stageColor = stageBadgeColors[c.stage] || "bg-muted text-muted-foreground border-border";
    const previewText = r.text.slice(0, 300);
    const hasMore = r.text.length > 300;

    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content B</span>
            <span className="text-[10px] text-muted-foreground">— New Content</span>
          </div>
          <button
            onClick={onClear}
            className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
            data-testid="btn-clear-content-b"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-sky-400" />
              <span className="text-sm font-medium truncate">{r.filename}</span>
            </div>
            {r.pageCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px]">{r.pageCount}p</Badge>
                <Badge variant="outline" className="text-[10px]">{r.wordCount.toLocaleString()}w</Badge>
              </div>
            )}
          </div>

          {r.isFallback && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>AI classification unavailable — using rule-based fallback</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Content Type</span>
              <span className="text-sm font-semibold">{c.contentType}</span>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Funnel Stage</span>
              <Badge className={`${stageColor} border text-[10px]`}>{c.stage}</Badge>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Product</span>
              <span className="text-xs font-medium">{c.product}</span>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Industry</span>
              <span className="text-xs font-medium">{c.industry}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">{c.topic}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">
              {Math.round(c.confidence * 100)}% confidence
            </span>
          </div>

          {r.text && r.text.length > 0 && (
            <>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline self-start"
                data-testid="btn-details-content-b"
              >
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showDetails ? "Hide extracted text" : "Show extracted text"}
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl bg-muted/10 border border-border/30 p-3">
                      <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                        {textExpanded ? r.text : previewText}
                        {!textExpanded && hasMore && "..."}
                      </p>
                      {hasMore && (
                        <button
                          onClick={() => setTextExpanded(!textExpanded)}
                          className="flex items-center gap-1 mt-2 text-[11px] font-medium text-primary hover:underline"
                        >
                          {textExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {textExpanded ? "Show less" : "Show full text"}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    );
  }

  if (slotB.showManualEntry) {
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content B</span>
            <span className="text-[10px] text-muted-foreground">— Manual Entry</span>
          </div>
          <button
            onClick={onClear}
            className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
            data-testid="btn-clear-manual-b"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <ManualContentForm
          manual={slotB.manualContent}
          onChange={(m) => setSlotB({ ...slotB, manualContent: m })}
          onSubmit={handleManualSubmit}
          onCancel={onClear}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content B</span>
        <span className="text-[10px] text-muted-foreground">— New Content</span>
      </div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-8 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all ${
          slotB.loading ? "pointer-events-none opacity-60" : ""
        }`}
        data-testid="dropzone-content-b"
      >
        {slotB.loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Analyzing content...</span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-sky-400 opacity-60" />
            <div className="text-center">
              <span className="text-sm font-medium">New Content</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Drop a PDF or click to browse</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </>
        )}
      </label>
      {slotB.error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 space-y-2"
          data-testid="text-error-content-b"
        >
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {slotB.error}
          </div>
          <button
            onClick={() => setSlotB({ ...slotB, showManualEntry: true, error: null })}
            className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
            data-testid="btn-enter-manually"
          >
            <FileText className="h-3 w-3" />
            Enter details manually instead
          </button>
        </motion.div>
      )}
      {!slotB.error && !slotB.loading && (
        <button
          onClick={() => setSlotB({ ...slotB, showManualEntry: true })}
          className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          data-testid="btn-enter-manually-alt"
        >
          <FileText className="h-3 w-3" />
          Enter details manually instead
        </button>
      )}
    </div>
  );
}

function ComparisonResults({
  contentA,
  contentB,
}: {
  contentA: { name: string; stage: string; product: string | null; metrics: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number } };
  contentB: PdfResult;
}) {
  const bAnalysis = contentB.analysis;
  const aMetrics = contentA.metrics;
  const bClassification = contentB.classification;

  const primaryMetric = bClassification.stage === "BOFU" ? "sqos" : bClassification.stage === "MOFU" ? "leads" : "pageviews";
  const bForecast = bAnalysis?.performanceForecast;
  const bProjectedMid = bForecast ? Math.round((bForecast.projectedRange[0] + bForecast.projectedRange[1]) / 2) : 0;

  const riskColors: Record<string, string> = {
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    high: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-4"
    >
      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="comparison-results">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Performance Comparison</h3>
          <Badge className={`${stageBadgeColors[bClassification.stage] || "bg-muted"} border text-[10px] ml-auto`}>
            {bClassification.stage}
          </Badge>
        </div>

        <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/20 bg-muted/20">
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Metric</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-emerald-400 uppercase">Content A (Actual)</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-sky-400 uppercase">Content B (Estimated)</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {([
                { key: "pageviews", label: "Pageviews" },
                { key: "downloads", label: "Downloads" },
                { key: "leads", label: "Leads" },
                { key: "sqos", label: "SQOs" },
                { key: "avgTime", label: "Avg Time (s)" },
              ] as const).map(({ key, label }) => {
                const aVal = aMetrics[key];
                let bVal = 0;
                if (bForecast && key === primaryMetric) {
                  bVal = bProjectedMid;
                } else if (contentB.aggregateBenchmarks) {
                  const benchKey = key === "avgTime" ? "timeOnPage" : key;
                  bVal = Math.round((contentB.aggregateBenchmarks as any)[benchKey]?.median || 0);
                }
                const delta = aVal > 0 ? Math.round(((bVal - aVal) / aVal) * 100) : 0;
                const deltaColor = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground";

                return (
                  <tr key={key} className={key === primaryMetric ? "bg-primary/5" : ""}>
                    <td className="px-4 py-2 font-medium">
                      {label}
                      {key === primaryMetric && (
                        <Badge variant="outline" className="text-[8px] ml-1.5 text-primary border-primary/30">primary</Badge>
                      )}
                    </td>
                    <td className="text-right px-3 py-2 tabular-nums font-semibold">{formatNum(aVal)}</td>
                    <td className="text-right px-3 py-2 tabular-nums font-semibold">
                      {bForecast && key === primaryMetric
                        ? `${formatNum(bForecast.projectedRange[0])}–${formatNum(bForecast.projectedRange[1])}`
                        : formatNum(bVal)
                      }
                    </td>
                    <td className={`text-right px-3 py-2 tabular-nums font-semibold ${deltaColor}`}>
                      {delta > 0 ? "+" : ""}{delta}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {contentA.stage !== bClassification.stage && (
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5 mb-4">
            <Layers className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              Content A is {contentA.stage} while Content B is {bClassification.stage}. Estimates are based on {bClassification.stage} stage benchmarks.
            </p>
          </div>
        )}
      </Card>

      {bAnalysis && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="analysis-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Content B Analysis</h3>
            {bAnalysis.isFallbackAnalysis && (
              <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[9px] ml-auto">
                Benchmark-based
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-muted/10 border border-border/30 p-4">
              <div className="flex items-start gap-4">
                <ReadinessRing score={bAnalysis.readinessScore} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign Readiness</span>
                  </div>
                  <div className="space-y-1.5">
                    <BreakdownBar label="Structure" value={bAnalysis.readinessBreakdown.structure} />
                    <BreakdownBar label="CTAs" value={bAnalysis.readinessBreakdown.ctas} />
                    <BreakdownBar label="Topic" value={bAnalysis.readinessBreakdown.topicDepth} />
                    <BreakdownBar label="Format" value={bAnalysis.readinessBreakdown.format} />
                  </div>
                </div>
              </div>
            </div>

            {bForecast && (
              <div className="rounded-xl bg-muted/10 border border-border/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance Forecast</span>
                  <Badge variant="outline" className={`text-[9px] ml-auto ${
                    bForecast.confidence === "high" ? "text-emerald-400 border-emerald-500/30" :
                    bForecast.confidence === "medium" ? "text-amber-400 border-amber-500/30" :
                    "text-muted-foreground"
                  }`}>
                    {bForecast.confidence} confidence
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums">
                    {bForecast.projectedRange[0].toLocaleString()} — {bForecast.projectedRange[1].toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    projected {bForecast.metric}
                  </span>
                </div>
              </div>
            )}

            {bAnalysis.recommendations.length > 0 && (
              <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommendations</span>
                </div>
                <div className="divide-y divide-border/20">
                  {bAnalysis.recommendations.sort((a, b) => a.priority - b.priority).map((r, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-start gap-2.5">
                      <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full h-5 w-5 flex items-center justify-center shrink-0 mt-0.5">
                        {r.priority}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed">{r.text}</p>
                        <Badge variant="outline" className="text-[9px] mt-1 text-muted-foreground">{r.contentId}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bAnalysis.reusability.length > 0 && (
              <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
                  <RefreshCw className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reusability Assessment</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/20">
                        <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Content ID</th>
                        <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Overlap</th>
                        <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Cannibalization</th>
                        <th className="text-center px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Repurpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bAnalysis.reusability.map((r, i) => (
                        <tr key={i} className="border-b border-border/10 last:border-0">
                          <td className="px-4 py-1.5 font-medium max-w-[140px] truncate">{r.contentId}</td>
                          <td className="text-center px-2 py-1.5 tabular-nums">{r.overlap}%</td>
                          <td className="text-center px-2 py-1.5">
                            <Badge variant="outline" className={`text-[9px] border ${riskColors[r.cannibalizationRisk] || ""}`}>
                              {r.cannibalizationRisk}
                            </Badge>
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <Badge variant="outline" className={`text-[9px] border ${riskColors[r.repurposingOpportunity] || ""}`}>
                              {r.repurposingOpportunity}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-2.5">
              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs font-medium leading-relaxed" data-testid="text-top-action">
                {bAnalysis.topAction}
              </p>
            </div>
          </div>
        </Card>
      )}

      {contentB.benchmarks.length > 0 && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="matching-content-card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Matching Content from Dataset</span>
            <Badge variant="outline" className="text-[9px] ml-auto">{contentB.benchmarks.length} matches</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20">
                  <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Content</th>
                  <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Match</th>
                  <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Views</th>
                  <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Leads</th>
                  <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">SQOs</th>
                </tr>
              </thead>
              <tbody>
                {contentB.benchmarks.map((b, i) => (
                  <tr key={i} className="border-b border-border/10 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-1.5 max-w-[180px] truncate" title={b.name || b.contentId}>
                      {b.name || b.contentId}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <Badge variant="outline" className={`text-[9px] tabular-nums ${b.relevanceScore >= 50 ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                        {b.relevanceScore}%
                      </Badge>
                    </td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{b.pageviews.toLocaleString()}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{b.leads.toLocaleString()}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{b.sqos.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {contentB.aggregateBenchmarks && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="aggregate-benchmarks">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage Benchmarks</span>
            <Badge variant="outline" className="text-[9px] ml-auto">
              {contentB.aggregateBenchmarks.sampleSize} of {contentB.aggregateBenchmarks.totalPoolSize} assets
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "pageviews", label: "Pageviews" },
              { key: "downloads", label: "Downloads" },
              { key: "leads", label: "Leads" },
              { key: "sqos", label: "SQOs" },
              { key: "timeOnPage", label: "Avg Time on Page" },
            ] as const).map(({ key, label }) => {
              const stats = contentB.aggregateBenchmarks![key];
              return (
                <div key={key} className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</span>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div><span className="text-muted-foreground/60">Min</span><br/><span className="font-semibold tabular-nums">{stats.min.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground/60">Max</span><br/><span className="font-semibold tabular-nums">{stats.max.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground/60">Mean</span><br/><span className="font-semibold tabular-nums">{stats.mean.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground/60">Median</span><br/><span className="font-semibold tabular-nums">{stats.median.toLocaleString()}</span></div>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Avg CTA Count</span>
              <span className="text-sm font-bold tabular-nums">{contentB.aggregateBenchmarks.avgCtaCount}</span>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}

export default function ContentComparison() {
  const [slotA, setSlotA] = useState<SlotAState>(EMPTY_SLOT_A);
  const [slotB, setSlotB] = useState<SlotBState>(EMPTY_SLOT_B);
  const [expanded, setExpanded] = useState(false);

  const MAX_FILE_SIZE_MB = 50;

  const extractPdfB = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setSlotB({ ...EMPTY_SLOT_B, file, error: "Only PDF files are supported." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setSlotB({ ...EMPTY_SLOT_B, file, error: `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.` });
      return;
    }
    setSlotB({ ...EMPTY_SLOT_B, file, loading: true });
    try {
      const base64 = await fileToBase64(file);
      const res = await authFetch("/api/assets/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlotB({ ...EMPTY_SLOT_B, file, error: data.error || "Extraction failed.", isImageOnly: !!data.isImageOnly });
        return;
      }
      setSlotB({ ...EMPTY_SLOT_B, file, result: data });
    } catch {
      setSlotB({ ...EMPTY_SLOT_B, file, error: "Something went wrong. You can enter the details manually." });
    }
  }, []);

  const contentAReady = slotA.selectedAsset || (slotA.file && slotA.mode === "upload");
  const contentBReady = slotB.result;
  const bothReady = contentAReady && contentBReady;

  const getContentAInfo = () => {
    if (slotA.selectedAsset) {
      return {
        name: slotA.selectedAsset.name || slotA.selectedAsset.contentId,
        stage: slotA.selectedAsset.stage,
        product: slotA.selectedAsset.product,
        metrics: {
          pageviews: slotA.selectedAsset.pageviews,
          downloads: slotA.selectedAsset.downloads,
          leads: slotA.selectedAsset.leads,
          sqos: slotA.selectedAsset.sqos,
          avgTime: slotA.selectedAsset.avgTime,
        },
      };
    }
    if (slotA.file && slotA.mode === "upload") {
      return {
        name: slotA.file.name,
        stage: "UNKNOWN",
        product: null,
        metrics: {
          pageviews: parseInt(slotA.manualMetrics.pageviews) || 0,
          downloads: parseInt(slotA.manualMetrics.downloads) || 0,
          leads: parseInt(slotA.manualMetrics.leads) || 0,
          sqos: parseInt(slotA.manualMetrics.sqos) || 0,
          avgTime: parseInt(slotA.manualMetrics.avgTime) || 0,
        },
      };
    }
    return null;
  };

  return (
    <Card className="rounded-2xl border bg-card/80 backdrop-blur shadow-sm" data-testid="content-comparison-tool">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors rounded-2xl"
        data-testid="btn-toggle-comparison"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold">Content Comparison</h3>
            <p className="text-[11px] text-muted-foreground">Compare existing content against new content to estimate performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bothReady && (
            <Badge variant="secondary" className="border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Ready
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div className="flex gap-4 flex-col sm:flex-row">
                {slotA.mode === "picker" && !slotA.selectedAsset && (
                  <AssetPicker
                    onSelect={(asset) => setSlotA({ ...slotA, selectedAsset: asset })}
                    onSwitchToUpload={() => setSlotA({ ...EMPTY_SLOT_A, mode: "upload" })}
                  />
                )}
                {slotA.mode === "picker" && slotA.selectedAsset && (
                  <SelectedAssetCard
                    asset={slotA.selectedAsset}
                    onClear={() => setSlotA(EMPTY_SLOT_A)}
                  />
                )}
                {slotA.mode === "upload" && (
                  <UploadWithMetrics slotA={slotA} setSlotA={setSlotA} />
                )}

                <div className="hidden sm:flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center">
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>

                <NewContentUpload
                  slotB={slotB}
                  setSlotB={setSlotB}
                  extractPdf={extractPdfB}
                  onClear={() => setSlotB(EMPTY_SLOT_B)}
                />
              </div>

              {bothReady && getContentAInfo() && (
                <ComparisonResults
                  contentA={getContentAInfo()!}
                  contentB={slotB.result!}
                />
              )}

              {(contentAReady || contentBReady) && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSlotA(EMPTY_SLOT_A); setSlotB(EMPTY_SLOT_B); }}
                    className="text-xs"
                    data-testid="btn-reset-comparison"
                  >
                    Reset Both
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
