import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
  Zap,
  Search,
  Database,
  Check,
  Library,
  PenLine,
  CircleCheck,
  CheckCircle,
  ExternalLink,
  Rocket,
} from "lucide-react";

interface Classification {
  contentType: string;
  stage: string;
  product: string;
  industry: string;
  topic: string;
  confidence: number;
}

interface ResonanceRating {
  rating: "Strong" | "Moderate" | "Weak";
  explanation: string;
}

interface ContentOverviewItem {
  summary: string;
  covers?: string;
  writtenFor?: string;
  tone?: string;
  language?: string;
  depth?: string;
  structure?: string;
}

interface ResonanceDimensions {
  countryFit: ResonanceRating;
  industryFit: ResonanceRating;
  funnelStageFit: ResonanceRating;
  productFit: ResonanceRating;
}

interface KeyTopicItem {
  topic: string;
  detail: string;
}

interface Suggestion {
  text: string;
  source: string;
}

interface MetricsWithData {
  pageviews: number;
  downloads: number;
  leads: number;
  sqos: number;
  avgTime: number;
  hasData: boolean;
}

interface ComparisonMetadata {
  stageA: string;
  stageB: string;
  productA: string;
  productB: string;
  countryA: string;
  countryB: string;
  industryA: string;
  industryB: string;
  typeA: string;
  typeB: string;
  wordCountA: number | null;
  wordCountB: number | null;
  pageCountA?: number | null;
  pageCountB?: number | null;
  formatA: string;
  formatB: string;
  summaryA: string;
  summaryB: string;
  bothHaveContent: boolean;
  aHasContent?: boolean;
  bHasContent?: boolean;
}

interface WhatMakesItWorkItem {
  point?: string;
  factor?: string;
  explanation?: string;
  source?: string;
}

interface WhatCouldBeImprovedItem {
  point?: string;
  issue?: string;
  detail?: string;
  source?: string;
}

interface PdfResult {
  filename: string;
  pageCount: number;
  wordCount: number;
  text: string;
  classification: Classification;
  isFallback: boolean;
  contentId?: string;
  metrics?: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number };
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
  url: string | null;
  country: string;
  industry: string;
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
  url: string | null;
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
                  url: asset.url || null,
                  pageviews: asset.pageviewsSum || 0,
                  downloads: asset.downloadsSum || 0,
                  leads: asset.uniqueLeads || 0,
                  sqos: asset.sqoCount || 0,
                  avgTime: asset.timeAvg || 0,
                  country: asset.country || "",
                  industry: asset.industry || "",
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

interface ContentInfo {
  fetchStatus: string;
  contentSummary: string | null;
  extractedTopics: string[] | null;
  extractedCta: { text: string; type: string; strength: string } | null;
}

function parseHumanReadableName(contentId: string): string {
  if (!contentId || contentId.length < 5) return contentId;
  const parts = contentId.split("_");
  if (parts.length < 4) return contentId;
  const regionMap: Record<string, string> = { US: "US", UK: "UK", CA: "Canada", CAEN: "English Canada", CAFR: "French Canada", DE: "Germany", FR: "France", AU: "Australia", ZA: "South Africa" };
  const stageMap: Record<string, string> = { TOFU: "TOFU", MOFU: "MOFU", BOFU: "BOFU" };
  let region = "";
  let stage = "";
  let nameChunks: string[] = [];
  for (const p of parts.slice(2)) {
    if (regionMap[p]) { region = regionMap[p]; continue; }
    if (stageMap[p]) { stage = stageMap[p]; continue; }
    if (/^[A-Z]{2,4}$/.test(p) && p.length <= 4) continue;
    if (/^\d{4}/.test(p)) { nameChunks.push(p.replace(/^\d+/, "")); continue; }
    nameChunks.push(p);
  }
  const name = nameChunks
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\|/g, ", ")
    .trim();
  if (!name) return contentId;
  const suffix = [region, stage].filter(Boolean).join(", ");
  return suffix ? `${name} (${suffix})` : name;
}

function ContentStatusPanel({
  assetId,
  contentId,
  url,
  contentInfo,
  onUploadComplete,
}: {
  assetId: string;
  contentId: string;
  url: string | null;
  contentInfo: ContentInfo | null;
  onUploadComplete: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showReplace, setShowReplace] = useState(false);

  const hasContent = contentInfo?.fetchStatus === "success";

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await authFetch("/api/content/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: contentId, fileBase64: base64, filename: file.name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      setShowReplace(false);
      onUploadComplete();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (uploading) {
    return (
      <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-3 flex items-center gap-2" data-testid="content-uploading">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs font-medium">Analyzing content...</span>
      </div>
    );
  }

  if (hasContent && !showReplace) {
    return (
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2.5 space-y-2" data-testid="content-available">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-400">Content uploaded</span>
          <button
            onClick={() => setShowReplace(true)}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-replace-content"
          >
            Replace
          </button>
        </div>
        {contentInfo?.contentSummary && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{contentInfo.contentSummary}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {contentInfo?.extractedTopics?.slice(0, 4).map((t, i) => (
            <span key={i} className="inline-flex items-center rounded-full bg-muted/30 px-2 py-0.5 text-[9px] text-muted-foreground">{t}</span>
          ))}
          {contentInfo?.extractedCta && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] ${
              contentInfo.extractedCta.strength === "strong" ? "bg-emerald-500/10 text-emerald-400" :
              contentInfo.extractedCta.strength === "moderate" ? "bg-amber-500/10 text-amber-400" :
              "bg-muted/30 text-muted-foreground"
            }`}>
              CTA: {contentInfo.extractedCta.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted/5 border border-border/30 px-3 py-2.5 space-y-2" data-testid="content-not-available">
      <div className="flex items-center gap-1.5">
        <Upload className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-[11px] font-medium">
          {showReplace ? "Upload new version" : "Content not uploaded. Upload here for full quality comparison."}
        </span>
        {showReplace && (
          <button onClick={() => setShowReplace(false)} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
        )}
      </div>
      {url && !showReplace && (
        <a
          href={url.startsWith("http") ? url : `https://${url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate"
          data-testid="link-asset-url"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{url}</span>
        </a>
      )}
      <label
        className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 cursor-pointer transition-all ${
          dragOver ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40 hover:bg-primary/5"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        data-testid="comparison-dropzone"
      >
        <Upload className={`h-4 w-4 shrink-0 ${dragOver ? "text-primary" : "text-muted-foreground/40"}`} />
        <div className="text-[10px]">
          <span className="font-medium">Drop file here</span>
          <span className="text-muted-foreground"> or </span>
          <span className="text-primary font-medium">browse files</span>
          <div className="text-muted-foreground/60 mt-0.5">PDF, DOCX, PPTX, PNG, JPG</div>
        </div>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </label>
      {uploadError && (
        <div className="text-[10px] text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {uploadError}
        </div>
      )}
      {!showReplace && (
        <p className="text-[10px] text-muted-foreground/60">Performance comparison runs with engagement data. Upload to also compare content quality, topics, CTA, and messaging.</p>
      )}
    </div>
  );
}

function SelectedAssetCard({
  asset,
  onClear,
  contentInfo,
  onUploadComplete,
}: {
  asset: AssetPickerItem;
  onClear: () => void;
  contentInfo: ContentInfo | null;
  onUploadComplete: () => void;
}) {
  return (
    <div className="rounded-xl bg-muted/10 border border-border/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/30 shrink-0">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" data-testid="text-selected-asset-name">
            {parseHumanReadableName(asset.name || asset.contentId)}
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

      <ContentStatusPanel
        assetId={asset.id}
        contentId={asset.contentId}
        url={asset.url}
        contentInfo={contentInfo}
        onUploadComplete={onUploadComplete}
      />
    </div>
  );
}

function SourceTag({ type }: { type: "internal" | "content" | "recommendation" }) {
  const config = {
    internal: { label: "Source: Internal Data", color: "text-emerald-400" },
    content: { label: "Source: Content Analysis", color: "text-teal-400" },
    recommendation: { label: "Source: AI Recommendation", color: "text-amber-400" },
  };
  const c = config[type];
  return <span className={`text-[9px] ${c.color} opacity-70`}>[{c.label}]</span>;
}

function ResonanceBadge({ rating }: { rating: string }) {
  const color = rating === "Strong" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : rating === "Moderate" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30";
  return <Badge className={`${color} border text-[10px] font-semibold`}>{rating}</Badge>;
}

function KeywordTagPills({ tags, type }: { tags: string[]; type: "a" | "b" | "shared" }) {
  if (!tags || tags.length === 0) return null;
  const colorMap = { a: "bg-teal-500/20 text-teal-300 border-teal-500/30", b: "bg-emerald-600/20 text-emerald-300 border-emerald-600/30", shared: "bg-[#00D657]/20 text-[#00D657] border-[#00D657]/40" };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${colorMap[type]}`}>
          {tag}{type === "shared" && <span className="ml-1 text-[8px] opacity-70">shared</span>}
        </span>
      ))}
    </div>
  );
}

function ComparisonResults({
  comparisonData,
  isLoadingVerdict,
  onDownloadPdf,
  onPlanCampaign,
}: {
  comparisonData: FullComparisonResult;
  isLoadingVerdict?: boolean;
  onDownloadPdf: () => void;
  onPlanCampaign: () => void;
}) {
  const mA = comparisonData.metricsA;
  const mB = comparisonData.metricsB;
  const meta = comparisonData.metadata;
  const nameA = comparisonData.nameA;
  const nameB = comparisonData.nameB;
  const overview = comparisonData.contentOverview;
  const resonance = comparisonData.resonanceAssessment;
  const shared = comparisonData.sharedAndDifferent;
  const keyTopics = comparisonData.keyTopics;
  const whatWorks = comparisonData.whatMakesItWork;
  const whatImprove = comparisonData.whatCouldBeImproved;
  const perfDisplay = comparisonData.performanceDisplay || ((mA?.hasData && mB?.hasData) ? "table" : (mA?.hasData || mB?.hasData) ? "inline" : "none");
  const primaryMetric = meta.stageB === "BOFU" ? "sqos" : meta.stageB === "MOFU" ? "leads" : "pageviews";
  const hasAnalysis = overview || resonance || shared || keyTopics;
  const tagsA = comparisonData.uniqueTagsA || [];
  const tagsB = comparisonData.uniqueTagsB || [];
  const sharedTagsList = comparisonData.sharedTags || [];

  const displayVal = (v: string | undefined | null) => v || "Not specified";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">

      {overview && (overview.a || overview.b) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="content-overview">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Content Overview</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[{ label: nameA, data: overview.a, color: "emerald", tags: tagsA, tagType: "a" as const, hasContent: meta.aHasContent, metaItems: [
              { k: "Stage", v: meta.stageA }, { k: "Product", v: meta.productA }, { k: "Country", v: displayVal(meta.countryA) },
              { k: "Industry", v: displayVal(meta.industryA) }, { k: "Format", v: displayVal(meta.formatA) },
              { k: "Words", v: meta.wordCountA ? `${meta.wordCountA.toLocaleString()}` : "Not specified" },
            ]}, { label: nameB, data: overview.b, color: "sky", tags: tagsB, tagType: "b" as const, hasContent: meta.bHasContent, metaItems: [
              { k: "Stage", v: meta.stageB }, { k: "Product", v: meta.productB }, { k: "Country", v: displayVal(meta.countryB) },
              { k: "Industry", v: displayVal(meta.industryB) }, { k: "Format", v: displayVal(meta.formatB) },
              { k: "Words", v: meta.wordCountB ? `${meta.wordCountB.toLocaleString()}` : "Not specified" },
            ]}].map(({ label, data, color, tags, tagType, hasContent, metaItems }) => (
              <div key={label} className={`rounded-xl border border-${color}-500/20 bg-${color}-500/5 p-4 space-y-2.5`}>
                <h4 className={`text-xs font-semibold text-${color}-400 uppercase tracking-wider`}>{label}</h4>
                {data?.summary ? (
                  <p className="text-xs text-foreground/85 leading-relaxed">{data.summary}</p>
                ) : !hasContent ? (
                  <p className="text-xs text-amber-400/80 italic">Content not readable — text could not be extracted. Re-upload as text-based PDF or DOCX.</p>
                ) : null}
                {tags.length > 0 && (
                  <div>
                    <KeywordTagPills tags={tags} type={tagType} />
                    {sharedTagsList.length > 0 && <div className="mt-1.5"><KeywordTagPills tags={sharedTagsList} type="shared" /></div>}
                  </div>
                )}
                {!hasContent && tags.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">Tags: Not available — content not readable</p>
                )}
                <div className="pt-2 border-t border-border/20">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {metaItems.map(({ k, v }) => (
                      <div key={k} className="text-[10px]">
                        <span className="text-muted-foreground">{k}: </span>
                        <span className="text-foreground/80 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {keyTopics && (keyTopics.a?.length || keyTopics.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="key-topics">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Key Topics</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[{ label: nameA, items: keyTopics.a, color: "emerald" }, { label: nameB, items: keyTopics.b, color: "sky" }].map(({ label, items, color }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className={`text-xs font-semibold text-${color}-400 uppercase tracking-wider mb-2`}>{label}</h4>
                <div className="space-y-1">
                  {items.slice(0, 5).map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-primary mt-0.5 shrink-0">-</span>
                      <span><strong className="text-foreground/90">{t.topic}:</strong> <span className="text-foreground/70">{t.detail}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {keyTopics.comparisonInsight && (
            <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 mt-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-primary uppercase">Insight</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground/85">{keyTopics.comparisonInsight}</p>
            </div>
          )}
        </Card>
      ) : null}

      {resonance && (resonance.a || resonance.b) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="resonance-assessment">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Audience Resonance</h3>
            <SourceTag type="content" />
          </div>
          <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 bg-muted/20">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Dimension</th>
                  {resonance.a && <th className="text-left px-3 py-2 text-[10px] font-semibold text-emerald-400 uppercase">{nameA}</th>}
                  {resonance.b && <th className="text-left px-3 py-2 text-[10px] font-semibold text-sky-400 uppercase">{nameB}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {(["countryFit", "industryFit", "funnelStageFit", "productFit"] as const).map((dimKey) => {
                  const labels: Record<string, string> = { countryFit: "Country/Region", industryFit: "Industry", funnelStageFit: "Funnel Stage", productFit: "Product" };
                  return (
                    <tr key={dimKey}>
                      <td className="px-3 py-2 font-medium text-muted-foreground">{labels[dimKey]}</td>
                      {resonance.a && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <ResonanceBadge rating={resonance.a[dimKey].rating} />
                            <span className="text-foreground/70 text-[10px]">{resonance.a[dimKey].explanation}</span>
                          </div>
                        </td>
                      )}
                      {resonance.b && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <ResonanceBadge rating={resonance.b[dimKey].rating} />
                            <span className="text-foreground/70 text-[10px]">{resonance.b[dimKey].explanation}</span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {shared && (shared.overlap?.length || shared.divergence?.length || sharedTagsList.length > 0 || tagsA.length > 0 || tagsB.length > 0) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="shared-different">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Shared vs Different</h3>
            <SourceTag type="content" />
          </div>
          {(sharedTagsList.length > 0 || tagsA.length > 0 || tagsB.length > 0) && (
            <div className="mb-3 rounded-lg bg-muted/10 border border-border/30 p-3">
              {sharedTagsList.length > 0 && <div className="mb-1.5"><span className="text-[10px] text-muted-foreground mr-2">Shared:</span><KeywordTagPills tags={sharedTagsList} type="shared" /></div>}
              {tagsA.length > 0 && <div className="mb-1"><span className="text-[10px] text-muted-foreground mr-2">Only {nameA}:</span><KeywordTagPills tags={tagsA} type="a" /></div>}
              {tagsB.length > 0 && <div><span className="text-[10px] text-muted-foreground mr-2">Only {nameB}:</span><KeywordTagPills tags={tagsB} type="b" /></div>}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {shared.overlap && shared.overlap.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 block mb-1.5">Overlap</span>
                {shared.overlap.map((item, i) => (
                  <p key={i} className="text-xs text-foreground/80 leading-relaxed mb-1">- {item}</p>
                ))}
              </div>
            )}
            {shared.divergence && shared.divergence.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 block mb-1.5">Differences</span>
                {shared.divergence.map((item, i) => (
                  <p key={i} className="text-xs text-foreground/80 leading-relaxed mb-1">- {item}</p>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {whatWorks && (whatWorks.a?.length || whatWorks.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="what-makes-it-work">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">What Works</h3>
            <SourceTag type="internal" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[{ label: nameA, items: whatWorks.a, color: "emerald" }, { label: nameB, items: whatWorks.b, color: "sky" }].map(({ label, items, color }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className={`text-xs font-semibold text-${color}-400 uppercase tracking-wider mb-1.5`}>{label}</h4>
                {items.slice(0, 3).map((item, i) => {
                  const text = item.point || (item.factor && item.explanation ? `${item.factor}: ${item.explanation}` : item.factor || item.explanation || "");
                  return text ? <p key={i} className="text-xs text-foreground/80 leading-relaxed mb-1">- {text}</p> : null;
                })}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {whatImprove && (whatImprove.a?.length || whatImprove.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="what-could-be-improved">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Could Be Improved</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[{ label: nameA, items: whatImprove.a, color: "emerald" }, { label: nameB, items: whatImprove.b, color: "sky" }].map(({ label, items, color }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className={`text-xs font-semibold text-${color}-400 uppercase tracking-wider mb-1.5`}>{label}</h4>
                {items.slice(0, 3).map((item, i) => {
                  const text = item.point || (item.issue && item.detail ? `${item.issue}: ${item.detail}` : item.issue || item.detail || "");
                  return text ? <p key={i} className="text-xs text-foreground/75 leading-relaxed mb-1">- {text}</p> : null;
                })}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="rounded-2xl border border-primary/30 bg-card/80 p-5 backdrop-blur" data-testid="verdict-suggestions">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Verdict</h3>
        </div>
        {comparisonData.verdict ? (
          <p className="text-sm leading-relaxed text-foreground/90 mb-4" data-testid="text-verdict">{comparisonData.verdict}</p>
        ) : isLoadingVerdict ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing content...
          </div>
        ) : null}

        {comparisonData.suggestions && comparisonData.suggestions.length > 0 && (
          <div className="space-y-1.5 mt-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Suggestions</span>
            {comparisonData.suggestions.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                <p className="text-foreground/80 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {perfDisplay === "table" && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="performance-comparison">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Performance</h3>
            <SourceTag type="internal" />
          </div>
          <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 bg-muted/20">
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Metric</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-emerald-400 uppercase">{nameA}</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-sky-400 uppercase">{nameB}</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {([
                  { key: "pageviews" as const, label: "Pageviews" },
                  { key: "downloads" as const, label: "Downloads" },
                  { key: "leads" as const, label: "Leads" },
                  { key: "sqos" as const, label: "SQOs" },
                  { key: "avgTime" as const, label: "Avg Time (s)" },
                ]).map(({ key, label }) => {
                  const aVal = mA?.[key] ?? 0;
                  const bVal = mB?.[key] ?? 0;
                  const delta = aVal > 0 ? Math.round(((bVal - aVal) / aVal) * 100) : null;
                  const deltaColor = delta !== null ? (delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground") : "text-muted-foreground/50";
                  return (
                    <tr key={key} className={key === primaryMetric ? "bg-primary/5" : ""}>
                      <td className="px-4 py-2 font-medium">
                        {label}
                        {key === primaryMetric && <Badge variant="outline" className="text-[8px] ml-1.5 text-primary border-primary/30">primary</Badge>}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-semibold">{formatNum(aVal)}</td>
                      <td className="text-right px-3 py-2 tabular-nums font-semibold">{formatNum(bVal)}</td>
                      <td className={`text-right px-3 py-2 tabular-nums font-semibold ${deltaColor}`}>
                        {delta !== null ? `${delta > 0 ? "+" : ""}${delta}%` : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {perfDisplay === "inline" && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="performance-inline">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Performance</h3>
            <SourceTag type="internal" />
          </div>
          <p className="text-xs text-foreground/85 leading-relaxed">
            {comparisonData.performanceInlineSummary || `Performance data available for ${mA?.hasData ? nameA : nameB} only.`}
          </p>
        </Card>
      )}

      {!hasAnalysis && !isLoadingVerdict && (
        <Card className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur" data-testid="no-content-analysis">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-300">Content Analysis Unavailable</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {meta.bothHaveContent
              ? "The AI analysis could not be generated. This may be a temporary issue — try running the comparison again."
              : meta.aHasContent || meta.bHasContent
              ? `Content text is only available for ${meta.aHasContent ? nameA : nameB}. Upload content for the other asset to enable full resonance analysis.`
              : "No content text is available for either asset. Upload content files to enable AI-powered resonance analysis, keyword tags, and topic breakdowns."}
          </p>
        </Card>
      )}

      <div className="flex gap-3 pt-2" data-testid="comparison-actions">
        <Button onClick={onDownloadPdf} className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-semibold" data-testid="btn-download-comparison-pdf">
          <FileText className="h-4 w-4 mr-2" />
          Download Comparison Report (PDF)
        </Button>
        <Button onClick={onPlanCampaign} variant="outline" className="flex-1 rounded-xl border-[#00D657]/50 text-[#00D657] hover:bg-[#00D657]/10 font-semibold" data-testid="btn-plan-campaign">
          <TrendingUp className="h-4 w-4 mr-2" />
          Plan Campaign With This Content &rarr;
        </Button>
      </div>
    </motion.div>
  );
}

interface FullComparisonResult {
  nameA: string;
  nameB: string;
  contentOverview: { a: ContentOverviewItem | null; b: ContentOverviewItem | null } | null;
  resonanceAssessment: { a: ResonanceDimensions | null; b: ResonanceDimensions | null; suggestedStageA?: string | null; suggestedStageB?: string | null } | null;
  sharedAndDifferent: { overlap: string[]; divergence: string[] } | null;
  keyTopics: { a: KeyTopicItem[] | null; b: KeyTopicItem[] | null; comparisonInsight: string } | null;
  whatMakesItWork: { a: WhatMakesItWorkItem[] | null; b: WhatMakesItWorkItem[] | null } | null;
  whatCouldBeImproved: { a: WhatCouldBeImprovedItem[] | null; b: WhatCouldBeImprovedItem[] | null } | null;
  keywordTagsA: string[];
  keywordTagsB: string[];
  sharedTags: string[];
  uniqueTagsA: string[];
  uniqueTagsB: string[];
  verdict: string;
  suggestions: Suggestion[];
  metricsA: MetricsWithData;
  metricsB: MetricsWithData;
  performanceDisplay: "table" | "inline" | "none";
  performanceInlineSummary: string | null;
  metadata: ComparisonMetadata;
}

export default function ContentComparison() {
  const [approach, setApproach] = useState<ContentApproach | null>(null);
  const [slotA, setSlotA] = useState<SlotAState>(EMPTY_SLOT_A);
  const [slotB, setSlotB] = useState<SlotBState>(EMPTY_SLOT_B);
  const [step, setStep] = useState<"intake" | "baseline" | "results">("intake");
  const [newContentResult, setNewContentResult] = useState<PdfResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<FullComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [contentStatusMap, setContentStatusMap] = useState<Record<string, ContentInfo>>({});
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  function refreshContentStatus() {
    authFetch("/api/content/status")
      .then(r => r.json())
      .then((map: Record<string, ContentInfo>) => setContentStatusMap(map))
      .catch(() => {});
  }

  function handleNewContentReady(result: PdfResult, _savedToLibrary: boolean) {
    setNewContentResult(result);
    setSlotB({ ...EMPTY_SLOT_B, result });
    setStep("baseline");
  }

  async function handleBaselineSelected(asset: AssetPickerItem) {
    setSlotA({ ...EMPTY_SLOT_A, selectedAsset: asset });
    setStep("results");
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonResult(null);
    refreshContentStatus();

    const contentBResult = newContentResult;
    if (!contentBResult) {
      setComparisonLoading(false);
      setComparisonError("No content selected for comparison.");
      return;
    }

    try {
      const res = await authFetch("/api/assets/full-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentA: {
            contentId: asset.contentId,
            name: asset.name || asset.contentId,
            stage: asset.stage,
            product: asset.product,
            type: asset.type,
            country: asset.country,
            industry: asset.industry,
            metrics: { pageviews: asset.pageviews, downloads: asset.downloads, leads: asset.leads, sqos: asset.sqos, avgTime: asset.avgTime },
          },
          contentB: {
            name: contentBResult.filename,
            contentId: contentBResult.contentId || contentBResult.filename,
            stage: contentBResult.classification.stage,
            product: contentBResult.classification.product,
            contentType: contentBResult.classification.contentType,
            industry: contentBResult.classification.industry,
            country: (contentBResult as any).country || "",
            topic: contentBResult.classification.topic,
            text: contentBResult.text?.slice(0, 6000),
            metrics: contentBResult.metrics,
          },
        }),
      });
      if (!res.ok) throw new Error("Comparison analysis failed");
      const data = await res.json();
      setComparisonResult(data);
    } catch (err: any) {
      setComparisonError(err.message || "Failed to run comparison analysis.");
    }
    setComparisonLoading(false);
  }

  function handleReset() {
    setApproach(null);
    setSlotA(EMPTY_SLOT_A);
    setSlotB(EMPTY_SLOT_B);
    setNewContentResult(null);
    setComparisonResult(null);
    setComparisonLoading(false);
    setComparisonError(null);
    setStep("intake");
  }

  const bothReady = slotA.selectedAsset && (comparisonResult || comparisonLoading);

  async function handleDownloadPdf(data: FullComparisonResult) {
    const { generateComparisonPdf } = await import("@/lib/comparison-pdf");
    generateComparisonPdf(data);
  }

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
                        contentId: asset.contentId,
                        metrics: { pageviews: asset.pageviews, downloads: asset.downloads, leads: asset.leads, sqos: asset.sqos, avgTime: asset.avgTime },
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
              <BaselineAssetBrowser onSelect={handleBaselineSelected} />
            </div>
          </motion.div>
        )}

        {step === "results" && slotA.selectedAsset && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Baseline (Content A)</span>
                <SelectedAssetCard
                  asset={slotA.selectedAsset}
                  onClear={() => { setSlotA(EMPTY_SLOT_A); setStep("baseline"); }}
                  contentInfo={contentStatusMap[slotA.selectedAsset.contentId] || null}
                  onUploadComplete={() => { refreshContentStatus(); if (slotA.selectedAsset) handleBaselineSelected(slotA.selectedAsset); }}
                />
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">New Content (Content B)</span>
                {newContentResult?.isFallback && newContentResult?.classification ? (
                  <SelectedAssetCard
                    asset={{
                      id: "",
                      contentId: newContentResult.filename,
                      name: newContentResult.filename,
                      stage: newContentResult.classification.stage,
                      product: newContentResult.classification.product || null,
                      channel: null,
                      cta: null,
                      type: newContentResult.classification.contentType || null,
                      url: null,
                      pageviews: 0,
                      downloads: 0,
                      leads: 0,
                      sqos: 0,
                      avgTime: 0,
                      country: "",
                      industry: "",
                    }}
                    onClear={() => { setStep("intake"); handleReset(); }}
                    contentInfo={contentStatusMap[newContentResult.filename] || null}
                    onUploadComplete={() => { refreshContentStatus(); if (slotA.selectedAsset) handleBaselineSelected(slotA.selectedAsset); }}
                  />
                ) : (
                  <div className="rounded-xl bg-muted/10 border border-border/30 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{newContentResult?.filename}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{newContentResult?.classification.contentType}</span>
                      <Badge className={`${stageBadgeColors[newContentResult?.classification.stage || ""] || "bg-muted"} border text-[9px]`}>
                        {newContentResult?.classification.stage}
                      </Badge>
                      {newContentResult?.classification.product && <span>{newContentResult.classification.product}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-[11px] font-medium text-emerald-400">Content analyzed</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {step === "results" && comparisonLoading && !comparisonResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border bg-card/80 p-8 backdrop-blur text-center" data-testid="comparison-loading">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold">Running AI-Powered Comparison</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzing content, finding benchmarks, and generating insights...</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {step === "results" && comparisonError && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border border-destructive/30 bg-card/80 p-5 backdrop-blur" data-testid="comparison-error">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">Comparison Analysis Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{comparisonError}</p>
                <Button onClick={() => { if (slotA.selectedAsset) handleBaselineSelected(slotA.selectedAsset); }} variant="outline" size="sm" className="mt-3 rounded-lg text-xs" data-testid="btn-retry-comparison">
                  Retry Analysis
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {bothReady && comparisonResult && (
        <ComparisonResults
          comparisonData={comparisonResult}
          isLoadingVerdict={comparisonLoading}
          onDownloadPdf={() => handleDownloadPdf(comparisonResult)}
          onPlanCampaign={() => setShowCampaignModal(true)}
        />
      )}

      {showCampaignModal && comparisonResult && (
        <CampaignContextModal
          data={comparisonResult}
          onClose={() => setShowCampaignModal(false)}
        />
      )}
    </div>
  );
}

function CampaignContextModal({ data, onClose }: { data: FullComparisonResult; onClose: () => void }) {
  const [, navigate] = useLocation();
  const meta = data.metadata;
  const stageToObjective: Record<string, string> = { TOFU: "Brand Awareness", MOFU: "Lead Generation", BOFU: "Conversion" };
  const [includeA, setIncludeA] = useState(true);
  const [includeB, setIncludeB] = useState(true);
  const [objective, setObjective] = useState(stageToObjective[meta.stageB] || stageToObjective[meta.stageA] || "Brand Awareness");
  const [product, setProduct] = useState(meta.productA || meta.productB || "");
  const [country, setCountry] = useState(meta.countryA || meta.countryB || "");
  const [industry, setIndustry] = useState(meta.industryA || meta.industryB || "");
  const [funnelStage, setFunnelStage] = useState(meta.stageA || "TOFU");
  const [contentType, setContentType] = useState(meta.typeA || meta.typeB || "");
  const [timeline, setTimeline] = useState("");
  const [budget, setBudget] = useState("");
  const [contextNotes, setContextNotes] = useState(() => {
    const parts: string[] = [];
    if (data.verdict) parts.push(`Comparison verdict: ${data.verdict}`);
    if (data.suggestions?.length) parts.push(`Key suggestions:\n${data.suggestions.map((s, i) => `${i + 1}. ${s.text}`).join("\n")}`);
    if (data.metricsA.hasData) parts.push(`${data.nameA} engagement: ${data.metricsA.pageviews} pageviews, ${data.metricsA.leads} leads, ${data.metricsA.sqos} SQOs`);
    if (data.metricsB.hasData) parts.push(`${data.nameB} engagement: ${data.metricsB.pageviews} pageviews, ${data.metricsB.leads} leads, ${data.metricsB.sqos} SQOs`);
    return parts.join("\n\n");
  });
  const [showFullContext, setShowFullContext] = useState(false);

  const suggestedStageA = data.resonanceAssessment?.suggestedStageA;
  const suggestedStageB = data.resonanceAssessment?.suggestedStageB;
  const hasStageSuggestion = (suggestedStageA && suggestedStageA !== meta.stageA) || (suggestedStageB && suggestedStageB !== meta.stageB);

  function handleBuild() {
    const selectedAssets: any[] = [];
    if (includeA) selectedAssets.push({ name: data.nameA, stage: meta.stageA, product: meta.productA, format: meta.formatA, summary: meta.summaryA });
    if (includeB) selectedAssets.push({ name: data.nameB, stage: meta.stageB, product: meta.productB, format: meta.formatB, summary: meta.summaryB });

    const context = {
      fromComparison: true,
      nameA: data.nameA,
      nameB: data.nameB,
      selectedAssets,
      objective,
      product,
      country,
      industry,
      funnelStage,
      contentType,
      timeline,
      budget,
      contextNotes,
      resonanceAssessment: data.resonanceAssessment,
      contentOverview: data.contentOverview,
      verdict: data.verdict,
      suggestions: data.suggestions,
      metricsA: data.metricsA,
      metricsB: data.metricsB,
    };
    sessionStorage.setItem("cia-campaign-context", JSON.stringify(context));
    navigate("/campaign-planner");
  }

  const selectClass = "w-full h-9 rounded-lg bg-muted/20 border border-border/40 text-xs px-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20";
  const labelClass = "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="campaign-context-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Review Campaign Context</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg" data-testid="btn-close-campaign-modal"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">This information will be pre-loaded into the Campaign Planner. Edit anything before proceeding.</p>

        <div className="space-y-5">
          <div>
            <span className={labelClass}>Recommended Content</span>
            <div className="space-y-2">
              {[{ name: data.nameA, stage: meta.stageA, product: meta.productA, format: meta.formatA, checked: includeA, onChange: setIncludeA },
                { name: data.nameB, stage: meta.stageB, product: meta.productB, format: meta.formatB, checked: includeB, onChange: setIncludeB }].map((item) => (
                <label key={item.name} className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/10 p-3 cursor-pointer hover:border-primary/30 transition-colors" data-testid={`check-include-${item.name}`}>
                  <input type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)} className="accent-[#00D657] h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold block truncate">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground">{item.format} | {item.stage} | {item.product}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className={labelClass}>Campaign Parameters</span>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Campaign Objective</label>
                <select value={objective} onChange={e => setObjective(e.target.value)} className={selectClass} data-testid="select-campaign-objective">
                  <option value="Brand Awareness">Brand Awareness</option>
                  <option value="Lead Generation">Lead Generation</option>
                  <option value="Conversion">Conversion</option>
                  <option value="Retention">Retention</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Product</label>
                <input type="text" value={product} onChange={e => setProduct(e.target.value)} className={selectClass} data-testid="input-campaign-product" />
              </div>
              <div>
                <label className={labelClass}>Target Country/Region</label>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)} className={selectClass} data-testid="input-campaign-country" />
              </div>
              <div>
                <label className={labelClass}>Target Industry</label>
                <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} className={selectClass} data-testid="input-campaign-industry" />
              </div>
              <div>
                <label className={labelClass}>Funnel Stage</label>
                <div className="flex gap-1">
                  {["TOFU", "MOFU", "BOFU"].map(s => (
                    <button key={s} onClick={() => setFunnelStage(s)} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${funnelStage === s ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted/30 border border-border/30"}`} data-testid={`btn-campaign-stage-${s.toLowerCase()}`}>{s}</button>
                  ))}
                </div>
                {hasStageSuggestion && (
                  <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Based on content analysis, this may perform better as {suggestedStageA || suggestedStageB}.
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Content Type</label>
                <input type="text" value={contentType} onChange={e => setContentType(e.target.value)} className={selectClass} data-testid="input-campaign-content-type" />
              </div>
              <div>
                <label className={labelClass}>Timeline (optional)</label>
                <select value={timeline} onChange={e => setTimeline(e.target.value)} className={selectClass} data-testid="select-campaign-timeline">
                  <option value="">Not specified</option>
                  <option value="4 weeks">4 weeks</option>
                  <option value="8 weeks">8 weeks</option>
                  <option value="12 weeks">12 weeks</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Budget (optional)</label>
                <input type="text" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. $10,000" className={selectClass} data-testid="input-campaign-budget" />
              </div>
            </div>
          </div>

          <div>
            <span className={labelClass}>Comparison Insights</span>
            <textarea value={contextNotes} onChange={e => setContextNotes(e.target.value)} rows={5} className="w-full rounded-lg bg-muted/20 border border-border/40 text-xs p-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y" data-testid="textarea-campaign-insights" />
          </div>

          <div>
            <button onClick={() => setShowFullContext(!showFullContext)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="btn-toggle-full-context">
              {showFullContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Full Context Preview
            </button>
            {showFullContext && (
              <div className="mt-2 rounded-xl border border-border/30 bg-muted/10 p-3 max-h-48 overflow-y-auto text-[10px] text-muted-foreground font-mono whitespace-pre-wrap" data-testid="full-context-preview">
                {JSON.stringify({
                  selectedAssets: [includeA && data.nameA, includeB && data.nameB].filter(Boolean),
                  objective, product, country, industry, funnelStage, contentType, timeline, budget,
                  contextNotes: contextNotes.slice(0, 200) + "...",
                  hasResonanceAssessment: !!data.resonanceAssessment,
                  hasSuggestions: data.suggestions?.length || 0,
                }, null, 2)}
                <p className="mt-2 text-muted-foreground/60">This context helps the AI create a more accurate campaign plan.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-border/20">
          <Button onClick={handleBuild} disabled={!includeA && !includeB} className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed" data-testid="btn-build-campaign">
            <Rocket className="h-4 w-4 mr-2" />
            {!includeA && !includeB ? "Select at least one asset" : "Build Campaign Plan \u2192"}
          </Button>
          <Button onClick={onClose} variant="outline" className="rounded-xl" data-testid="btn-cancel-campaign">
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function BaselineAssetBrowser({ onSelect }: { onSelect: (asset: AssetPickerItem) => void }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("TOFU");
  const [assets, setAssets] = useState<AssetPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ stage: stageFilter, limit: "50", offset: "0" });
    if (search.trim().length >= 2) params.set("search", search.trim());
    authFetch(`/api/assets?${params}`)
      .then(r => r.json())
      .then((data: { data: any[]; total: number }) => {
        setAssets(data.data.map((a: any) => ({
          id: String(a.id),
          contentId: a.contentId,
          name: a.name || a.contentId,
          stage: a.stage,
          product: a.productFranchise || null,
          channel: a.utmChannel || null,
          cta: a.typecampaignmember || null,
          type: a.typecampaignmember || null,
          url: a.url || null,
          country: a.country || "",
          industry: a.industry || "",
          pageviews: a.pageviewsSum || 0,
          downloads: a.downloadsSum || 0,
          leads: a.uniqueLeads || 0,
          sqos: a.sqoCount || 0,
          avgTime: a.timeAvg || 0,
        })));
        setTotal(data.total);
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [stageFilter, search]);

  const stages = ["TOFU", "MOFU", "BOFU", "UNKNOWN"];

  return (
    <div className="space-y-3" data-testid="baseline-asset-browser">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by content ID..."
            className="w-full h-9 pl-8 pr-3 rounded-lg bg-muted/20 border border-border/40 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            data-testid="input-baseline-search"
          />
        </div>
      </div>

      <div className="flex gap-1">
        {stages.map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              stageFilter === s
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-muted/30 border border-transparent"
            }`}
            data-testid={`btn-baseline-stage-${s.toLowerCase()}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border/30 divide-y divide-border/10">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading assets...
          </div>
        ) : assets.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No {stageFilter} content found{search ? ` matching "${search}"` : ""}.
          </div>
        ) : (
          assets.map(asset => (
            <button
              key={asset.id}
              onClick={() => onSelect(asset)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors flex items-center gap-3"
              data-testid={`picker-baseline-${asset.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{asset.name || asset.contentId}</span>
                  <Badge className={`${stageBadgeColors[asset.stage] || "bg-muted"} border text-[9px] shrink-0`}>
                    {asset.stage}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  {asset.type && <span className="text-foreground/70 font-medium">{asset.type}</span>}
                  {asset.product && <span className="truncate">{asset.product}</span>}
                </div>
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground shrink-0">
                <span>{formatNum(asset.pageviews)} views</span>
                <span>{formatNum(asset.leads)} leads</span>
                <span>{formatNum(asset.sqos)} SQOs</span>
              </div>
            </button>
          ))
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        Showing {assets.length} of {total} {stageFilter} assets
      </div>
    </div>
  );
}
