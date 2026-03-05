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
  Check,
  Library,
  PenLine,
  CircleCheck,
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

interface LibraryAsset {
  id: string;
  contentId: string;
  assetName: string;
  contentType: string;
  product: string;
  funnelStage: string;
  country: string;
  industry: string;
  dateCreated: string;
  source: "dataset" | "uploaded";
  description: string;
  pageviewsSum: number;
  timeAvg: number;
  downloadsSum: number;
  uniqueLeads: number;
  sqoCount: number;
  createdAt: string | null;
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

const CONTENT_TYPES = ["Whitepaper", "eBook", "Case Study", "Datasheet", "Guide", "Infographic", "Brochure", "Checklist", "Report", "Flyer", "Document", "Webinar", "Blog Post", "Video"];
const STAGES = ["TOFU", "MOFU", "BOFU"];
const COUNTRIES = ["US", "UK", "Canada", "Germany", "France", "Australia", "India", "Brazil", "South Africa", "Global"];

type ContentApproach = "upload" | "existing" | "manual";

const CONTENT_APPROACHES: { value: ContentApproach; label: string; icon: typeof Upload }[] = [
  { value: "upload", label: "Upload a new PDF — analyze and add to library", icon: Upload },
  { value: "existing", label: "Select existing content from your library", icon: Library },
  { value: "manual", label: "Enter content details manually", icon: PenLine },
];

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

function getAssetStatus(asset: LibraryAsset): { label: string; color: string } {
  const hasPerf = asset.pageviewsSum > 0 || asset.uniqueLeads > 0 || asset.sqoCount > 0;
  if (asset.source === "uploaded" && !hasPerf) return { label: "New", color: "bg-blue-500/15 text-blue-400" };
  if (!asset.dateCreated) return { label: "Active", color: "bg-emerald-500/15 text-emerald-400" };
  const age = Date.now() - new Date(asset.dateCreated).getTime();
  const sixMonths = 180 * 24 * 60 * 60 * 1000;
  const twelveMonths = 365 * 24 * 60 * 60 * 1000;
  if (age < sixMonths) return { label: "Active", color: "bg-emerald-500/15 text-emerald-400" };
  if (age < twelveMonths) return { label: "Aging", color: "bg-amber-500/15 text-amber-400" };
  return { label: "Stale", color: "bg-red-500/15 text-red-400" };
}

function UploadAndSavePanel({
  onAnalyzed,
}: {
  onAnalyzed: (result: PdfResult, savedToLibrary: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [meta, setMeta] = useState({
    assetName: "",
    contentType: "",
    product: "",
    funnelStage: "",
    country: "",
    industry: "",
    description: "",
  });
  const [pdfResult, setPdfResult] = useState<PdfResult | null>(null);
  const MAX_FILE_SIZE_MB = 50;

  const selectClass = "w-full h-9 px-3 rounded-lg bg-muted/30 border border-border/40 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none";
  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setError(null);
      setMeta(prev => ({ ...prev, assetName: prev.assetName || f.name.replace(/\.pdf$/i, "") }));
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
      setMeta(prev => ({ ...prev, assetName: prev.assetName || f.name.replace(/\.pdf$/i, "") }));
    }
    e.target.value = "";
  }, []);

  async function analyzeAndSave() {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await authFetch("/api/assets/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "PDF extraction failed.");
        setLoading(false);
        return;
      }
      setPdfResult(data);

      if (meta.contentType === "" && data.classification?.contentType) {
        setMeta(prev => ({ ...prev, contentType: prev.contentType || data.classification.contentType }));
      }
      if (meta.funnelStage === "" && data.classification?.stage) {
        setMeta(prev => ({ ...prev, funnelStage: prev.funnelStage || data.classification.stage }));
      }
      if (meta.product === "" && data.classification?.product) {
        setMeta(prev => ({ ...prev, product: prev.product || data.classification.product }));
      }
    } catch {
      setError("Something went wrong during analysis.");
    }
    setLoading(false);
  }

  async function saveToLibrary() {
    if (!meta.assetName.trim()) return;
    setSaving(true);
    try {
      await authFetch("/api/content-library/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: meta.assetName.trim(),
          contentType: meta.contentType || pdfResult?.classification?.contentType || "Document",
          product: meta.product || pdfResult?.classification?.product || "General",
          funnelStage: meta.funnelStage || pdfResult?.classification?.stage || "UNKNOWN",
          country: meta.country,
          industry: meta.industry || pdfResult?.classification?.industry || "",
          dateCreated: new Date().toISOString().split("T")[0],
          description: meta.description,
        }),
      });
      setSavedToLibrary(true);
    } catch {
      setError("Failed to save to library.");
    }
    setSaving(false);
  }

  async function handleAnalyzeAndSave() {
    if (!pdfResult) {
      await analyzeAndSave();
    }
  }

  async function handleUseForComparison() {
    if (!pdfResult) return;
    if (!savedToLibrary) {
      await saveToLibrary();
    }
    onAnalyzed(pdfResult, true);
  }

  return (
    <div className="space-y-3" data-testid="upload-save-panel">
      {!file ? (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 cursor-pointer hover:border-primary/50 hover:bg-primary/10 transition-all"
          data-testid="dropzone-upload-pdf"
        >
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <span className="text-sm font-semibold">Upload PDF for analysis</span>
            <p className="text-[11px] text-muted-foreground mt-1">Drop a PDF here or click to browse (max {MAX_FILE_SIZE_MB}MB)</p>
          </div>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
        </label>
      ) : (
        <div className="rounded-xl bg-muted/10 border border-border/30 p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium truncate">{file.name}</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
            <button onClick={() => { setFile(null); setPdfResult(null); setError(null); setSavedToLibrary(false); }} className="ml-1">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2" data-testid="text-upload-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {file && !pdfResult && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Asset Name *</label>
              <input type="text" value={meta.assetName} onChange={e => setMeta(p => ({ ...p, assetName: e.target.value }))} placeholder="e.g., Fund Accounting Best Practices Guide" className={selectClass} data-testid="input-upload-name" />
            </div>
            <div>
              <label className={labelClass}>Content Type</label>
              <select value={meta.contentType} onChange={e => setMeta(p => ({ ...p, contentType: e.target.value }))} className={selectClass} data-testid="select-upload-type">
                <option value="">Auto-detect from PDF</option>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Funnel Stage</label>
              <select value={meta.funnelStage} onChange={e => setMeta(p => ({ ...p, funnelStage: e.target.value }))} className={selectClass} data-testid="select-upload-stage">
                <option value="">Auto-detect from PDF</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Product</label>
              <input type="text" value={meta.product} onChange={e => setMeta(p => ({ ...p, product: e.target.value }))} placeholder="Auto-detect from PDF" className={selectClass} data-testid="input-upload-product" />
            </div>
            <div>
              <label className={labelClass}>Country/Region</label>
              <select value={meta.country} onChange={e => setMeta(p => ({ ...p, country: e.target.value }))} className={selectClass} data-testid="select-upload-country">
                <option value="">Select...</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Industry</label>
              <input type="text" value={meta.industry} onChange={e => setMeta(p => ({ ...p, industry: e.target.value }))} placeholder="e.g., Hospitality, Manufacturing" className={selectClass} data-testid="input-upload-industry" />
            </div>
            <div>
              <label className={labelClass}>Description (optional)</label>
              <input type="text" value={meta.description} onChange={e => setMeta(p => ({ ...p, description: e.target.value }))} placeholder="Brief description..." className={selectClass} data-testid="input-upload-desc" />
            </div>
          </div>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
            <div className="text-[11px] text-blue-400">This content will be analyzed by AI and saved to your content library for future use.</div>
          </div>
          <Button
            onClick={handleAnalyzeAndSave}
            disabled={loading || !meta.assetName.trim()}
            className="w-full rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
            data-testid="btn-analyze-upload"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing PDF...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Analyze & Prepare for Comparison
              </>
            )}
          </Button>
        </>
      )}

      {pdfResult && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CircleCheck className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">Analysis Complete</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{pdfResult.classification.contentType}</span></div>
              <div><span className="text-muted-foreground">Stage:</span> <Badge className={`${stageBadgeColors[pdfResult.classification.stage] || "bg-muted"} border text-[10px]`}>{pdfResult.classification.stage}</Badge></div>
              <div><span className="text-muted-foreground">Product:</span> <span className="font-medium">{pdfResult.classification.product}</span></div>
              <div><span className="text-muted-foreground">Pages:</span> <span className="font-medium">{pdfResult.pageCount}</span></div>
            </div>
            {pdfResult.analysis && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Readiness:</span>
                <span className={`text-sm font-bold ${pdfResult.analysis.readinessScore >= 70 ? "text-emerald-400" : pdfResult.analysis.readinessScore >= 40 ? "text-amber-400" : "text-rose-400"}`}>
                  {pdfResult.analysis.readinessScore}/100
                </span>
              </div>
            )}
          </div>

          {!savedToLibrary && (
            <Button
              onClick={saveToLibrary}
              disabled={saving}
              variant="outline"
              className="w-full rounded-xl"
              data-testid="btn-save-to-library"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Library className="h-4 w-4 mr-2" />
                  Save to Content Library
                </>
              )}
            </Button>
          )}
          {savedToLibrary && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <CircleCheck className="h-3.5 w-3.5" />
              <span>Saved to your content library</span>
            </div>
          )}

          <Button
            onClick={handleUseForComparison}
            className="w-full rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
            data-testid="btn-use-for-comparison"
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Use for Comparison
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function LibraryPickerPanel({
  onSelect,
}: {
  onSelect: (asset: AssetPickerItem) => void;
}) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState("");
  const [filterType, setFilterType] = useState("");

  const selectClass = "h-8 px-2 rounded-lg bg-muted/30 border border-border/40 text-xs focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none";

  useEffect(() => {
    fetchAssets();
  }, [filterStage, filterType]);

  async function fetchAssets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStage) params.set("funnelStage", filterStage);
      if (filterType) params.set("contentType", filterType);
      const res = await authFetch(`/api/content-library?${params.toString()}`);
      const data = await res.json();
      setAssets(data);
    } catch {}
    setLoading(false);
  }

  const filtered = search
    ? assets.filter(a => [a.assetName, a.contentId, a.product, a.contentType].join(" ").toLowerCase().includes(search.toLowerCase()))
    : assets;

  return (
    <div className="space-y-3" data-testid="library-picker-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, product, or type..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border border-border/40 text-xs focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            data-testid="input-library-search"
          />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className={selectClass} data-testid="select-filter-stage">
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectClass} data-testid="select-filter-type">
          <option value="">All Types</option>
          {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border/30 divide-y divide-border/10">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading library...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No matching content found in your library.
          </div>
        ) : (
          filtered.slice(0, 50).map(asset => {
            const status = getAssetStatus(asset);
            return (
              <button
                key={asset.id}
                onClick={() => onSelect({
                  id: asset.id,
                  contentId: asset.contentId,
                  name: asset.assetName,
                  stage: asset.funnelStage,
                  product: asset.product || null,
                  channel: null,
                  cta: null,
                  type: asset.contentType || null,
                  pageviews: asset.pageviewsSum || 0,
                  downloads: asset.downloadsSum || 0,
                  leads: asset.uniqueLeads || 0,
                  sqos: asset.sqoCount || 0,
                  avgTime: asset.timeAvg || 0,
                })}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors flex items-center gap-3"
                data-testid={`library-select-${asset.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{asset.assetName}</span>
                    <Badge className={`${stageBadgeColors[asset.funnelStage] || "bg-muted"} border text-[9px] shrink-0`}>
                      {asset.funnelStage}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground/70">{asset.contentType}</span>
                    {asset.product && <span>{asset.product}</span>}
                    <span className={`${status.color} px-1.5 py-0 rounded-full text-[9px] border`}>{status.label}</span>
                    {asset.source === "uploaded" && <span className="text-blue-400">Uploaded</span>}
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground shrink-0">
                  <span>{formatNum(asset.pageviewsSum || 0)} views</span>
                  <span>{formatNum(asset.uniqueLeads || 0)} leads</span>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {filtered.length} asset{filtered.length !== 1 ? "s" : ""} available
      </div>
    </div>
  );
}

function ManualEntryPanel({
  onSubmit,
}: {
  onSubmit: (result: PdfResult, savedToLibrary: boolean) => void;
}) {
  const [meta, setMeta] = useState({
    title: "",
    contentType: "",
    stage: "",
    product: "",
    industry: "",
    country: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectClass = "w-full h-9 px-3 rounded-lg bg-muted/30 border border-border/40 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none";
  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";

  const [error, setError] = useState<string | null>(null);
  const ready = meta.title.trim() && meta.contentType && meta.stage;

  async function handleSubmit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/content-library/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName: meta.title.trim(),
          contentType: meta.contentType,
          product: meta.product || "General",
          funnelStage: meta.stage,
          country: meta.country,
          industry: meta.industry,
          dateCreated: new Date().toISOString().split("T")[0],
          description: meta.description,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to save to library.");
      }
      setSaved(true);
      setSaving(false);

      const manualResult: PdfResult = {
        filename: meta.title || "Manual Entry",
        pageCount: 0,
        wordCount: meta.description.split(/\s+/).filter(Boolean).length,
        text: meta.description,
        classification: {
          contentType: meta.contentType,
          stage: meta.stage,
          product: meta.product || "General",
          industry: meta.industry || "General",
          topic: meta.title,
          confidence: 1.0,
        },
        isFallback: true,
        benchmarks: [],
        aggregateBenchmarks: null,
        analysis: null,
      };
      onSubmit(manualResult, true);
    } catch (err: any) {
      setError(err.message || "Failed to save to library. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="manual-entry-panel">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Content Title *</label>
          <input type="text" value={meta.title} onChange={e => setMeta(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Sage Intacct Migration Guide" className={selectClass} data-testid="input-manual-title" />
        </div>
        <div>
          <label className={labelClass}>Content Type *</label>
          <select value={meta.contentType} onChange={e => setMeta(p => ({ ...p, contentType: e.target.value }))} className={selectClass} data-testid="select-manual-type">
            <option value="">Select...</option>
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Funnel Stage *</label>
          <select value={meta.stage} onChange={e => setMeta(p => ({ ...p, stage: e.target.value }))} className={selectClass} data-testid="select-manual-stage">
            <option value="">Select...</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Product</label>
          <input type="text" value={meta.product} onChange={e => setMeta(p => ({ ...p, product: e.target.value }))} placeholder="e.g., Sage Intacct" className={selectClass} data-testid="input-manual-product" />
        </div>
        <div>
          <label className={labelClass}>Country/Region</label>
          <select value={meta.country} onChange={e => setMeta(p => ({ ...p, country: e.target.value }))} className={selectClass} data-testid="select-manual-country">
            <option value="">Select...</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Industry</label>
          <input type="text" value={meta.industry} onChange={e => setMeta(p => ({ ...p, industry: e.target.value }))} placeholder="e.g., Hospitality, Manufacturing" className={selectClass} data-testid="input-manual-industry" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Description / Content Summary</label>
        <textarea
          value={meta.description}
          onChange={e => setMeta(p => ({ ...p, description: e.target.value }))}
          placeholder="Summarize the content, key topics, and target audience..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border/40 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
          data-testid="textarea-manual-desc"
        />
      </div>
      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
        <div className="text-[11px] text-blue-400">This content will be saved to your library and used for comparison against existing performance data.</div>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2" data-testid="text-manual-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      <Button
        onClick={handleSubmit}
        disabled={!ready || saving}
        className="w-full rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
        data-testid="btn-manual-submit"
      >
        {saving ? "Saving..." : "Save to Library & Compare"}
      </Button>
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
        <button
          onClick={onClear}
          className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
          data-testid="btn-clear-selected"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
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
  const [approach, setApproach] = useState<ContentApproach | null>(null);
  const [slotA, setSlotA] = useState<SlotAState>(EMPTY_SLOT_A);
  const [slotB, setSlotB] = useState<SlotBState>(EMPTY_SLOT_B);
  const [step, setStep] = useState<"intake" | "baseline" | "results">("intake");
  const [newContentResult, setNewContentResult] = useState<PdfResult | null>(null);

  function handleNewContentReady(result: PdfResult, _savedToLibrary: boolean) {
    setNewContentResult(result);
    setSlotB({ ...EMPTY_SLOT_B, result });
    setStep("baseline");
  }

  function handleBaselineSelected(asset: AssetPickerItem) {
    setSlotA({ ...EMPTY_SLOT_A, selectedAsset: asset });
    setStep("results");
  }

  function handleReset() {
    setApproach(null);
    setSlotA(EMPTY_SLOT_A);
    setSlotB(EMPTY_SLOT_B);
    setNewContentResult(null);
    setStep("intake");
  }

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
    return null;
  };

  const bothReady = slotA.selectedAsset && slotB.result;

  return (
    <div className="space-y-4" data-testid="content-comparison-tool">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur p-5"
        data-testid="panel-content-intake"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Content Comparison</h3>
            <p className="text-xs text-muted-foreground">Upload or select content to compare against your library's top performers</p>
          </div>
          {step !== "intake" && (
            <Button onClick={handleReset} variant="outline" size="sm" className="ml-auto rounded-lg text-xs" data-testid="btn-reset-comparison">
              Start Over
            </Button>
          )}
        </div>

        {step === "intake" && (
          <>
            <div className="mb-3">
              <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Content Approach</span>
              <div className="flex flex-col gap-1.5">
                {CONTENT_APPROACHES.map(a => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setApproach(a.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left ${
                        approach === a.value
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-muted/20 border-border/30 text-muted-foreground hover:border-primary/30"
                      }`}
                      data-testid={`radio-approach-${a.value}`}
                    >
                      <div className={`h-3 w-3 rounded-full border-2 flex items-center justify-center ${approach === a.value ? "border-primary" : "border-border/60"}`}>
                        {approach === a.value && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <Icon className="h-3.5 w-3.5" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {approach === "upload" && (
                <motion.div key="upload" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <UploadAndSavePanel onAnalyzed={handleNewContentReady} />
                </motion.div>
              )}
              {approach === "existing" && (
                <motion.div key="existing" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 mb-2">
                      <div className="text-[11px] text-blue-400">Select the content you want to evaluate. You'll then pick a baseline asset to compare it against.</div>
                    </div>
                    <LibraryPickerPanel onSelect={(asset) => {
                      const manualResult: PdfResult = {
                        filename: asset.name || asset.contentId,
                        pageCount: 0,
                        wordCount: 0,
                        text: "",
                        classification: {
                          contentType: asset.type || "Document",
                          stage: asset.stage,
                          product: asset.product || "General",
                          industry: "General",
                          topic: asset.name || asset.contentId,
                          confidence: 1.0,
                        },
                        isFallback: true,
                        benchmarks: [],
                        aggregateBenchmarks: null,
                        analysis: null,
                      };
                      handleNewContentReady(manualResult, false);
                    }} />
                  </div>
                </motion.div>
              )}
              {approach === "manual" && (
                <motion.div key="manual" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <ManualEntryPanel onSubmit={handleNewContentReady} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {step === "baseline" && newContentResult && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-3">
              <CircleCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-emerald-400">Content ready: </span>
                <span className="text-sm">{newContentResult.filename}</span>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <span>{newContentResult.classification.contentType}</span>
                  <span>·</span>
                  <Badge className={`${stageBadgeColors[newContentResult.classification.stage] || "bg-muted"} border text-[9px]`}>
                    {newContentResult.classification.stage}
                  </Badge>
                  {newContentResult.classification.product && (
                    <>
                      <span>·</span>
                      <span>{newContentResult.classification.product}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Select baseline content to compare against</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Choose an existing asset from your library as the performance benchmark.
              </p>
              <AssetSearchPicker onSelect={handleBaselineSelected} />
            </div>
          </motion.div>
        )}

        {step === "results" && slotA.selectedAsset && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Baseline (Content A)</span>
                <SelectedAssetCard asset={slotA.selectedAsset} onClear={() => { setSlotA(EMPTY_SLOT_A); setStep("baseline"); }} />
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">New Content (Content B)</span>
                <div className="rounded-xl bg-muted/10 border border-border/30 p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{newContentResult?.filename}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span>{newContentResult?.classification.contentType}</span>
                    <Badge className={`${stageBadgeColors[newContentResult?.classification.stage || ""] || "bg-muted"} border text-[9px]`}>
                      {newContentResult?.classification.stage}
                    </Badge>
                    {newContentResult?.classification.product && <span>{newContentResult.classification.product}</span>}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {bothReady && getContentAInfo() && (
        <ComparisonResults
          contentA={getContentAInfo()!}
          contentB={slotB.result!}
        />
      )}
    </div>
  );
}

function AssetSearchPicker({ onSelect }: { onSelect: (asset: AssetPickerItem) => void }) {
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
          data-testid="input-baseline-search"
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
                data-testid={`picker-baseline-${asset.id}`}
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
          <p className="text-xs text-muted-foreground">No matching content found</p>
        </div>
      )}
    </div>
  );
}
