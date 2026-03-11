import { useState, useCallback, useEffect, useRef } from "react";
import { type StructuredKeywordTags, normalizeKeywordTags, flattenKeywordTags } from "@shared/schema";
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
  ShieldAlert,
  Plus,
  Trophy,
  Crown,
  Medal,
} from "lucide-react";

export interface ComparisonContextContent {
  name: string;
  contentId: string;
  contentText: string;
  contentSummary: string;
  keywordTags: string[];
  metadata: {
    product: string;
    country: string;
    industry: string;
    funnelStage: string;
    channel: string;
    contentType: string;
    format: string;
    wordCount: number | null;
  };
  engagement: {
    pageviews: number;
    downloads: number;
    leads: number;
    sqos: number;
    avgTime: number;
    hasData: boolean;
  };
}

export interface ComparisonContextResults {
  contentOverviewA: string | null;
  contentOverviewB: string | null;
  resonanceAssessment: any | null;
  topicRelevance: any | null;
  sharedAndDifferent: { overlap: string[]; divergence: string[] } | null;
  whatWorks: any | null;
  couldBeImproved: any | null;
  verdict: string;
  suggestions: { text: string; source: string }[];
  tagsShared: string[];
  isDuplicate: boolean;
}

export interface ComparisonContext {
  type: "two-way" | "multi";
  contentA?: ComparisonContextContent;
  contentB?: ComparisonContextContent;
  comparisonResults?: ComparisonContextResults;
  multiContents?: ComparisonContextContent[];
  multiResults?: {
    crossAnalysis: { sharedThemes: string[]; differentiators: string[]; contentGaps: string[] };
    rankings: { overall: { name: string; score: number; reason: string }[] };
    verdict: string;
    suggestions: { text: string; source: string }[];
  };
}

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

interface AnalysisBenchmark {
  contentId: string;
  name?: string;
  stage: string;
  type?: string;
  product?: string;
  pageviews: number;
  downloads: number;
  leads: number;
  sqos: number;
  avgTime: number;
  relevanceScore: number;
}

interface ReadinessBreakdown {
  structure: number;
  ctas: number;
  topicDepth: number;
  format: number;
}

interface PerformanceForecast {
  metric: string;
  projectedRange: [number, number];
  confidence: string;
}

interface AnalysisRecommendation {
  priority: number;
  text: string;
  contentId?: string;
}

interface ReusabilityItem {
  contentId: string;
  overlap: number;
  cannibalizationRisk: string;
  repurposingOpportunity: string;
}

interface PdfAnalysis {
  readinessScore: number;
  readinessBreakdown: ReadinessBreakdown;
  performanceForecast: PerformanceForecast;
  recommendations: AnalysisRecommendation[];
  reusability: ReusabilityItem[];
  topAction: string;
  isFallbackAnalysis?: boolean;
}

interface AggregateBenchmarks {
  sampleSize: number;
  totalPoolSize: number;
  pageviews: { min: number; max: number; mean: number; median: number };
  downloads: { min: number; max: number; mean: number; median: number };
  leads: { min: number; max: number; mean: number; median: number };
  sqos: { min: number; max: number; mean: number; median: number };
  timeOnPage: { min: number; max: number; mean: number; median: number };
  avgCtaCount: number;
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
  analysis?: PdfAnalysis;
  benchmarks?: AnalysisBenchmark[];
  aggregateBenchmarks?: AggregateBenchmarks;
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

type SlotSource = "upload" | "library" | "manual";

interface ContentSlot {
  id: number;
  source: SlotSource | null;
  pdfResult: PdfResult | null;
  libraryAsset: AssetPickerItem | null;
  label: string;
  filled: boolean;
  expanded: boolean;
}

const EMPTY_CONTENT_SLOT = (id: number): ContentSlot => ({
  id,
  source: null,
  pdfResult: null,
  libraryAsset: null,
  label: `Content ${id}`,
  filled: false,
  expanded: false,
});

interface MultiContentItem {
  name: string;
  summary: string;
  resonance: ResonanceDimensions | null;
  keyTopics: KeyTopicItem[] | null;
  whatWorks: WhatMakesItWorkItem[] | null;
  improvements: WhatCouldBeImprovedItem[] | null;
  keywordTags: string[];
  detectedMetadata?: { country?: string; product?: string; industry?: string } | null;
}

interface MultiRanking {
  name: string;
  score: number;
  reason: string;
}

interface MultiComparisonResult {
  contents: MultiContentItem[];
  crossAnalysis: {
    sharedThemes: string[];
    differentiators: string[];
    contentGaps: string[];
  };
  rankings: {
    overall: MultiRanking[];
    bestForLeads?: string;
    bestForEngagement?: string;
    bestForConversion?: string;
  };
  verdict: string;
  suggestions: Suggestion[];
  contentNames: string[];
  contentMetrics: { name: string; metrics: MetricsWithData }[];
  contentMetadata: { name: string; stage: string; product: string; type: string; country: string; industry: string }[];
}

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
  onViewAnalysis,
}: {
  onAnalyzed: (result: PdfResult, savedToLibrary: boolean) => void;
  onViewAnalysis?: (result: PdfResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const savingRef = useRef(false);
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
      const fullResult: PdfResult = {
        ...data,
        analysis: data.analysis || undefined,
        benchmarks: data.benchmarks || undefined,
        aggregateBenchmarks: data.aggregateBenchmarks || undefined,
      };
      setPdfResult(fullResult);

      if (meta.contentType === "" && data.classification?.contentType) {
        setMeta(prev => ({ ...prev, contentType: prev.contentType || data.classification.contentType }));
      }
      if (meta.funnelStage === "" && data.classification?.stage) {
        setMeta(prev => ({ ...prev, funnelStage: prev.funnelStage || data.classification.stage }));
      }
      if (meta.product === "" && data.classification?.product) {
        setMeta(prev => ({ ...prev, product: prev.product || data.classification.product }));
      }

      if (!onViewAnalysis) {
        onAnalyzed(fullResult, false);
      }

      if (!savedToLibrary && !savingRef.current) {
        savingRef.current = true;
        const autoName = meta.assetName.trim() || data.filename?.replace(/\.pdf$/i, "") || file.name.replace(/\.pdf$/i, "");
        if (autoName) {
          setMeta(prev => ({ ...prev, assetName: prev.assetName || autoName }));
          authFetch("/api/content-library/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetName: autoName,
              contentType: meta.contentType || data.classification?.contentType || "Document",
              product: meta.product || data.classification?.product || "General",
              funnelStage: meta.funnelStage || data.classification?.stage || "UNKNOWN",
              country: meta.country || "",
              industry: meta.industry || data.classification?.industry || "",
              dateCreated: new Date().toISOString().split("T")[0],
              description: meta.description || "",
              contentText: data.text?.slice(0, 50000),
              classification: data.classification,
              pageCount: data.pageCount,
              wordCount: data.wordCount,
              filename: data.filename || file.name,
            }),
          }).then(r => { if (r.ok) setSavedToLibrary(true); savingRef.current = false; }).catch(() => { savingRef.current = false; });
        } else {
          savingRef.current = false;
        }
      }
    } catch {
      setError("Something went wrong during analysis.");
    }
    setLoading(false);
  }

  async function saveToLibrary() {
    if (savingRef.current || savedToLibrary) return;
    savingRef.current = true;
    const assetName = meta.assetName.trim() || pdfResult?.filename?.replace(/\.pdf$/i, "") || "Uploaded Content";
    setSaving(true);
    try {
      const res = await authFetch("/api/content-library/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetName,
          contentType: meta.contentType || pdfResult?.classification?.contentType || "Document",
          product: meta.product || pdfResult?.classification?.product || "General",
          funnelStage: meta.funnelStage || pdfResult?.classification?.stage || "UNKNOWN",
          country: meta.country,
          industry: meta.industry || pdfResult?.classification?.industry || "",
          dateCreated: new Date().toISOString().split("T")[0],
          description: meta.description,
          contentText: pdfResult?.text?.slice(0, 50000),
          classification: pdfResult?.classification,
          pageCount: pdfResult?.pageCount,
          wordCount: pdfResult?.wordCount,
          filename: pdfResult?.filename,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Save failed");
      }
      setSavedToLibrary(true);
    } catch (err: any) {
      setError(err.message || "Failed to save to library.");
    }
    setSaving(false);
    savingRef.current = false;
  }

  async function handleAnalyzeAndSave() {
    if (!pdfResult) {
      await analyzeAndSave();
    }
  }

  async function handleUseForComparison() {
    if (!pdfResult) return;
    if (!savedToLibrary) {
      saveToLibrary().catch(() => {});
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

          {onViewAnalysis && pdfResult?.analysis && (
            <Button
              onClick={() => onViewAnalysis(pdfResult!)}
              className="w-full rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
              data-testid="btn-view-standalone-analysis"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              View Full Analysis
            </Button>
          )}

          <Button
            onClick={handleUseForComparison}
            variant={onViewAnalysis && pdfResult?.analysis ? "outline" : "default"}
            className={`w-full rounded-xl font-medium ${!onViewAnalysis || !pdfResult?.analysis ? "bg-[#00D657] hover:bg-[#00C04E] text-black" : ""}`}
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

const BASELINE_COLOR = "#006362";
const CHALLENGER_COLOR = "#00A65C";

function generateShortName(raw: string): string {
  if (!raw || raw.length < 3) return raw;
  let s = raw;
  s = s.replace(/^CL_[A-Z0-9]+_[A-Z]{2,4}_[A-Z]{2,4}_[A-Z]+_[A-Z]+_/i, "");
  s = s.replace(/\s*\([^)]*\)\s*$/g, "");
  s = s.replace(/\s*[,|]\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\b/gi, "");
  s = s.replace(/\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\s*[,|]/gi, "");
  s = s.replace(/\s*[,|]\s*(English\s+)?(Canada|Australia|US|UK|France|Germany|Spain|Ireland|South Africa)\s*/gi, "");
  s = s.replace(/\s*(TOFU|MOFU|BOFU)\s*/gi, "");
  s = s.replace(/\b(PDF|DOCX|PPTX|DOC)\b/gi, "");
  s = s.replace(/\bWhitepaper[-\s]*/gi, "");
  s = s.replace(/\bBrochure[-\s]*/gi, (m) => "Brochure ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  s = s.replace(/_/g, " ");
  s = s.replace(/\s*[-|,]\s*$/, "");
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return raw.length > 25 ? raw.slice(0, 25) + "…" : raw;
  const words = s.split(" ").filter(Boolean);
  if (words.length > 4) {
    return words.slice(0, 4).join(" ");
  }
  return words.join(" ");
}

function generateShortNamePair(rawA: string, rawB: string, stageA?: string, stageB?: string): [string, string] {
  let a = generateShortName(rawA);
  let b = generateShortName(rawB);
  if (a === b && stageA && stageB && stageA !== stageB) {
    a = `${a} (${stageA})`;
    b = `${b} (${stageB})`;
  } else if (a === b) {
    a = `${a} (1)`;
    b = `${b} (2)`;
  }
  return [a, b];
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
        {contentInfo?.contentSummary && contentInfo.contentSummary !== "AI analysis unavailable" && (
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

const TAG_TYPE_STYLES = {
  topic: "bg-[#006362] text-white border-[#006362]/60",
  audience: "bg-[#00A65C] text-white border-[#00A65C]/60",
  intent: "bg-transparent text-[#00D657] border-[#00D657]",
  user: "bg-gray-600/30 text-gray-300 border-gray-500/40",
  shared: "bg-[#00D657]/20 text-[#00D657] border-[#00D657]/40",
};

const TAG_TYPE_LABELS: Record<string, string> = {
  topic: "Topic",
  audience: "Audience",
  intent: "Intent",
  user: "Custom",
};

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

function StructuredTagPills({ structuredTags, label }: { structuredTags: StructuredKeywordTags; label?: string }) {
  const allEmpty = structuredTags.topic_tags.length === 0 && structuredTags.audience_tags.length === 0 && structuredTags.intent_tags.length === 0 && structuredTags.user_added_tags.length === 0;
  if (allEmpty) return null;

  const groups: { key: string; tags: string[]; style: string; typeLabel: string }[] = [
    { key: "topic", tags: structuredTags.topic_tags, style: TAG_TYPE_STYLES.topic, typeLabel: TAG_TYPE_LABELS.topic },
    { key: "audience", tags: structuredTags.audience_tags, style: TAG_TYPE_STYLES.audience, typeLabel: TAG_TYPE_LABELS.audience },
    { key: "intent", tags: structuredTags.intent_tags, style: TAG_TYPE_STYLES.intent, typeLabel: TAG_TYPE_LABELS.intent },
    { key: "user", tags: structuredTags.user_added_tags, style: TAG_TYPE_STYLES.user, typeLabel: TAG_TYPE_LABELS.user },
  ].filter(g => g.tags.length > 0);

  return (
    <div className="space-y-1.5" data-testid="structured-tag-pills">
      {label && <span className="text-[10px] text-muted-foreground font-medium">{label}</span>}
      {groups.map(({ key, tags, style, typeLabel }) => (
        <div key={key} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider min-w-[52px]">{typeLabel}:</span>
          {tags.map((tag, i) => (
            <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${style}`} data-testid={`tag-${key}-${i}`}>
              {tag}
            </span>
          ))}
        </div>
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
  const [shortA, shortB] = generateShortNamePair(nameA, nameB, meta.stageA, meta.stageB);
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
  const structuredTagsA = normalizeKeywordTags(comparisonData.structuredUniqueTagsA || (Array.isArray(comparisonData.keywordTagsA) ? comparisonData.keywordTagsA : comparisonData.keywordTagsA));
  const structuredTagsB = normalizeKeywordTags(comparisonData.structuredUniqueTagsB || (Array.isArray(comparisonData.keywordTagsB) ? comparisonData.keywordTagsB : comparisonData.keywordTagsB));
  const structuredShared = normalizeKeywordTags(comparisonData.structuredSharedTags);
  const hasStructuredTags = flattenKeywordTags(structuredTagsA).length > 0 || flattenKeywordTags(structuredTagsB).length > 0 || flattenKeywordTags(structuredShared).length > 0;

  const displayVal = (v: string | undefined | null) => v || "Not specified";
  const isDup = comparisonData.isDuplicate;
  const metaIssues = comparisonData.metadataIssues || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">

      {isDup && comparisonData.duplicateMessage && (
        <Card className="rounded-2xl border-l-4 border-l-amber-500 border border-amber-500/30 bg-amber-500/10 p-5 backdrop-blur" data-testid="duplicate-alert">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-400 mb-1">Duplicate Content Detected</h3>
              <p className="text-xs text-foreground/85 leading-relaxed">{comparisonData.duplicateMessage}</p>
            </div>
          </div>
        </Card>
      )}

      {overview && (overview.a || overview.b) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="content-overview">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Content Overview</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[{ label: shortA, role: "Baseline", fullName: nameA, data: overview.a, accent: BASELINE_COLOR, structTags: structuredTagsA, flatTags: tagsA, tagType: "a" as const, hasContent: meta.aHasContent, metaItems: [
              { k: "Stage", v: meta.stageA }, { k: "Product", v: meta.productA }, { k: "Country", v: displayVal(meta.countryA) },
              { k: "Industry", v: displayVal(meta.industryA) }, { k: "Format", v: displayVal(meta.formatA) },
              { k: "Words", v: meta.wordCountA ? `${meta.wordCountA.toLocaleString()}` : "Not specified" },
            ]}, { label: shortB, role: "Challenger", fullName: nameB, data: overview.b, accent: CHALLENGER_COLOR, structTags: structuredTagsB, flatTags: tagsB, tagType: "b" as const, hasContent: meta.bHasContent, metaItems: [
              { k: "Stage", v: meta.stageB }, { k: "Product", v: meta.productB }, { k: "Country", v: displayVal(meta.countryB) },
              { k: "Industry", v: displayVal(meta.industryB) }, { k: "Format", v: displayVal(meta.formatB) },
              { k: "Words", v: meta.wordCountB ? `${meta.wordCountB.toLocaleString()}` : "Not specified" },
            ]}].map(({ label, role, fullName, data, accent, structTags, flatTags, tagType, hasContent, metaItems }) => (
              <div key={label} className="rounded-xl p-4 space-y-2.5" style={{ border: `1px solid ${accent}33`, background: `${accent}0D` }}>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>{label}</h4>
                  <span className="text-[9px] text-muted-foreground/60">{role}</span>
                </div>
                {data?.summary ? (
                  <p className="text-xs text-foreground/85 leading-relaxed">{data.summary}</p>
                ) : !hasContent ? (
                  <p className="text-xs text-amber-400/80 italic">Content not readable — text could not be extracted. Re-upload as text-based PDF or DOCX.</p>
                ) : null}
                {hasStructuredTags ? (
                  <div>
                    <StructuredTagPills structuredTags={structTags} />
                    {flattenKeywordTags(structuredShared).length > 0 && <div className="mt-1.5"><StructuredTagPills structuredTags={structuredShared} label="Shared" /></div>}
                  </div>
                ) : flatTags.length > 0 ? (
                  <div>
                    <KeywordTagPills tags={flatTags} type={tagType} />
                    {sharedTagsList.length > 0 && <div className="mt-1.5"><KeywordTagPills tags={sharedTagsList} type="shared" /></div>}
                  </div>
                ) : null}
                {!hasContent && flatTags.length === 0 && !hasStructuredTags && (
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

          {metaIssues.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3" data-testid="metadata-health">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-400 uppercase">Metadata issues detected: {metaIssues.length} field{metaIssues.length !== 1 ? "s" : ""} may be incorrect</span>
              </div>
              <div className="space-y-1">
                {metaIssues.map((mi, idx) => (
                  <p key={idx} className="text-[10px] text-foreground/75 leading-relaxed pl-5">
                    <span className="font-medium text-foreground/85">{mi.asset}</span> — {mi.field} tag says "{mi.tagged}" but {mi.issue.toLowerCase().startsWith("tagged") ? mi.issue.slice(mi.issue.indexOf(" ") + 1) : mi.issue.toLowerCase()}
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {!isDup && keyTopics && (keyTopics.a?.length || keyTopics.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="key-topics">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Key Topics</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[{ label: shortA, items: keyTopics.a, accent: BASELINE_COLOR }, { label: shortB, items: keyTopics.b, accent: CHALLENGER_COLOR }].map(({ label, items, accent }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: accent }}>{label}</h4>
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

      {!isDup && resonance && (resonance.a || resonance.b) && (
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
                  {resonance.a && <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: BASELINE_COLOR }}>{shortA}</th>}
                  {resonance.b && <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: CHALLENGER_COLOR }}>{shortB}</th>}
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

      {!isDup && shared && (shared.overlap?.length || shared.divergence?.length || sharedTagsList.length > 0 || tagsA.length > 0 || tagsB.length > 0) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="shared-different">
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Shared vs Different</h3>
            <SourceTag type="content" />
          </div>
          {(sharedTagsList.length > 0 || tagsA.length > 0 || tagsB.length > 0 || hasStructuredTags) && (
            <div className="mb-3 rounded-lg bg-muted/10 border border-border/30 p-3">
              {hasStructuredTags ? (
                <div className="space-y-2">
                  {flattenKeywordTags(structuredShared).length > 0 && <div><span className="text-[10px] text-muted-foreground font-medium block mb-1">Shared tags:</span><StructuredTagPills structuredTags={structuredShared} /></div>}
                  {flattenKeywordTags(structuredTagsA).length > 0 && <div><span className="text-[10px] text-muted-foreground font-medium block mb-1">Only <span style={{ color: BASELINE_COLOR }}>{shortA}</span>:</span><StructuredTagPills structuredTags={structuredTagsA} /></div>}
                  {flattenKeywordTags(structuredTagsB).length > 0 && <div><span className="text-[10px] text-muted-foreground font-medium block mb-1">Only <span style={{ color: CHALLENGER_COLOR }}>{shortB}</span>:</span><StructuredTagPills structuredTags={structuredTagsB} /></div>}
                </div>
              ) : (
                <>
                  {sharedTagsList.length > 0 && <div className="mb-1.5"><span className="text-[10px] text-muted-foreground mr-2">Shared:</span><KeywordTagPills tags={sharedTagsList} type="shared" /></div>}
                  {tagsA.length > 0 && <div className="mb-1"><span className="text-[10px] text-muted-foreground mr-2">Only <span style={{ color: BASELINE_COLOR }}>{shortA}</span>:</span><KeywordTagPills tags={tagsA} type="a" /></div>}
                  {tagsB.length > 0 && <div><span className="text-[10px] text-muted-foreground mr-2">Only <span style={{ color: CHALLENGER_COLOR }}>{shortB}</span>:</span><KeywordTagPills tags={tagsB} type="b" /></div>}
                </>
              )}
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

      {!isDup && whatWorks && (whatWorks.a?.length || whatWorks.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="what-makes-it-work">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">What Works</h3>
            <SourceTag type="internal" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[{ label: shortA, items: whatWorks.a, accent: BASELINE_COLOR }, { label: shortB, items: whatWorks.b, accent: CHALLENGER_COLOR }].map(({ label, items, accent }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: accent }}>{label}</h4>
                {items.slice(0, 3).map((item, i) => {
                  const text = item.point || (item.factor && item.explanation ? `${item.factor}: ${item.explanation}` : item.factor || item.explanation || "");
                  return text ? <p key={i} className="text-xs text-foreground/80 leading-relaxed mb-1">- {text}</p> : null;
                })}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {!isDup && whatImprove && (whatImprove.a?.length || whatImprove.b?.length) ? (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="what-could-be-improved">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Could Be Improved</h3>
            <SourceTag type="content" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[{ label: shortA, items: whatImprove.a, accent: BASELINE_COLOR }, { label: shortB, items: whatImprove.b, accent: CHALLENGER_COLOR }].map(({ label, items, accent }) => items && items.length > 0 && (
              <div key={label}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: accent }}>{label}</h4>
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
          {comparisonData.lowEngagement ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-400">Minimal Engagement Data</p>
                  <p className="text-xs text-foreground/75 leading-relaxed">
                    Both assets have minimal engagement (fewer than 10 total interactions each). Sample sizes are too small for meaningful percentage comparisons.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 pt-1">
                    <div className="rounded-lg bg-muted/10 border border-border/20 p-2.5">
                      <span className="text-[10px] font-semibold uppercase block mb-1" style={{ color: BASELINE_COLOR }}>{shortA}</span>
                      <span className="text-[10px] text-foreground/70">{formatNum(mA?.pageviews ?? 0)} views, {formatNum(mA?.downloads ?? 0)} downloads, {formatNum(mA?.leads ?? 0)} leads, {formatNum(mA?.sqos ?? 0)} SQOs{(mA?.avgTime ?? 0) > 0 ? `, ${formatNum(mA?.avgTime ?? 0)}s avg time` : ""}</span>
                    </div>
                    <div className="rounded-lg bg-muted/10 border border-border/20 p-2.5">
                      <span className="text-[10px] font-semibold uppercase block mb-1" style={{ color: CHALLENGER_COLOR }}>{shortB}</span>
                      <span className="text-[10px] text-foreground/70">{formatNum(mB?.pageviews ?? 0)} views, {formatNum(mB?.downloads ?? 0)} downloads, {formatNum(mB?.leads ?? 0)} leads, {formatNum(mB?.sqos ?? 0)} SQOs{(mB?.avgTime ?? 0) > 0 ? `, ${formatNum(mB?.avgTime ?? 0)}s avg time` : ""}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 bg-muted/20">
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Metric</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: BASELINE_COLOR }}>{shortA}</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase" style={{ color: CHALLENGER_COLOR }}>{shortB}</th>
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
          )}
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
            {comparisonData.performanceInlineSummary || `Performance data available for ${mA?.hasData ? shortA : shortB} only.`}
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
              ? `Content text is only available for ${meta.aHasContent ? shortA : shortB}. Upload content for the other asset to enable full resonance analysis.`
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
  keywordTagsA: StructuredKeywordTags | string[];
  keywordTagsB: StructuredKeywordTags | string[];
  sharedTags: string[];
  uniqueTagsA: string[];
  uniqueTagsB: string[];
  structuredSharedTags?: StructuredKeywordTags;
  structuredUniqueTagsA?: StructuredKeywordTags;
  structuredUniqueTagsB?: StructuredKeywordTags;
  verdict: string;
  suggestions: Suggestion[];
  metricsA: MetricsWithData;
  metricsB: MetricsWithData;
  performanceDisplay: "table" | "inline" | "none";
  performanceInlineSummary: string | null;
  lowEngagement?: boolean;
  isDuplicate?: boolean;
  duplicateMessage?: string;
  metadataIssues?: { asset: string; field: string; tagged: string; issue: string }[];
  metadata: ComparisonMetadata;
}

function ReadinessGauge({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const color = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const bgColor = score >= 75 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  const label = score >= 75 ? "High" : score >= 50 ? "Moderate" : "Low";
  const dim = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  const textSize = size === "lg" ? "text-2xl" : "text-lg";
  const labelSize = size === "lg" ? "text-[10px]" : "text-[8px]";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${dim} rounded-full border-4 ${bgColor}/30 flex items-center justify-center relative`}>
        <span className={`${textSize} font-bold ${color}`}>{score}</span>
      </div>
      <span className={`${labelSize} font-semibold uppercase tracking-wider ${color}`}>{label} Readiness</span>
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-emerald-400" : value >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function StandaloneAnalysisView({
  result,
  onCompare,
  onAskChat,
}: {
  result: PdfResult;
  onCompare: () => void;
  onAskChat?: (prompt: string) => void;
}) {
  const analysis = result.analysis;
  const benchmarks = result.benchmarks || [];
  const aggBench = result.aggregateBenchmarks;
  const cls = result.classification;

  if (!analysis) return null;

  const forecast = analysis.performanceForecast;
  const recs = [...(analysis.recommendations || [])].sort((a, b) => a.priority - b.priority);
  const reuse = analysis.reusability || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      data-testid="standalone-analysis-view"
    >
      <div className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Content Analysis</h3>
            <p className="text-xs text-muted-foreground truncate">{result.filename}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4 mb-4">
          <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">Type</span>
            <span className="text-sm font-medium">{cls.contentType}</span>
          </div>
          <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">Stage</span>
            <Badge className={`${stageBadgeColors[cls.stage] || "bg-muted"} border text-[10px]`}>{cls.stage}</Badge>
          </div>
          <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">Product</span>
            <span className="text-sm font-medium">{cls.product}</span>
          </div>
          <div className="rounded-lg bg-muted/20 border border-border/30 px-3 py-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">Pages / Words</span>
            <span className="text-sm font-medium">{result.pageCount}p · {formatNum(result.wordCount)}w</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] mb-5">
          <div className="flex justify-center sm:justify-start">
            <ReadinessGauge score={analysis.readinessScore} />
          </div>
          <div className="space-y-2">
            <BreakdownBar label="Structure" value={analysis.readinessBreakdown.structure} />
            <BreakdownBar label="CTAs" value={analysis.readinessBreakdown.ctas} />
            <BreakdownBar label="Topic Depth" value={analysis.readinessBreakdown.topicDepth} />
            <BreakdownBar label="Format" value={analysis.readinessBreakdown.format} />
          </div>
        </div>

        {forecast && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-sky-400" />
              <span className="text-sm font-semibold text-sky-400">Performance Forecast</span>
            </div>
            <div className="text-xs text-muted-foreground mb-1">
              Primary metric: <span className="font-medium text-foreground">{forecast.metric}</span> · Confidence: <span className="font-medium text-foreground">{forecast.confidence}</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-center flex-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">Low Estimate</span>
                <span className="text-lg font-bold text-sky-400 tabular-nums">{formatNum(forecast.projectedRange[0])}</span>
              </div>
              <span className="text-muted-foreground text-xs">to</span>
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-center flex-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block">High Estimate</span>
                <span className="text-lg font-bold text-sky-400 tabular-nums">{formatNum(forecast.projectedRange[1])}</span>
              </div>
            </div>
            {aggBench && (
              <div className="text-[10px] text-muted-foreground mt-2">
                Stage benchmark ({forecast.metric}): median {formatNum(aggBench[forecast.metric as keyof AggregateBenchmarks] ? (aggBench[forecast.metric as keyof AggregateBenchmarks] as any)?.median || 0 : 0)} across {aggBench.sampleSize} assets
              </div>
            )}
          </div>
        )}

        {analysis.topAction && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-4 flex items-start gap-2">
            <Rocket className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">{analysis.topAction}</p>
          </div>
        )}

        {recs.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold">Recommendations</span>
            </div>
            <div className="space-y-2">
              {recs.map((r, i) => (
                <div key={i} className="rounded-lg bg-muted/10 border border-border/20 p-3 flex items-start gap-2">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    r.priority <= 2 ? "bg-red-500/15 text-red-400" : r.priority <= 3 ? "bg-amber-500/15 text-amber-400" : "bg-muted/40 text-muted-foreground"
                  }`}>
                    {r.priority}
                  </div>
                  <p className="text-xs leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {benchmarks.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Similar Content in Your Library</span>
            </div>
            <div className="rounded-lg border border-border/20 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/15 border-b border-border/20">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Asset</th>
                    <th className="text-center px-2 py-2 text-muted-foreground font-medium">Match</th>
                    <th className="text-right px-2 py-2 text-muted-foreground font-medium">Views</th>
                    <th className="text-right px-2 py-2 text-muted-foreground font-medium">Leads</th>
                    <th className="text-right px-2 py-2 text-muted-foreground font-medium">SQOs</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.slice(0, 5).map((b, i) => (
                    <tr key={i} className="border-b border-border/10 last:border-0">
                      <td className="px-3 py-2 max-w-[200px] truncate font-medium">{b.name || b.contentId}</td>
                      <td className="text-center px-2 py-2">
                        <span className={`font-semibold ${b.relevanceScore >= 70 ? "text-emerald-400" : b.relevanceScore >= 40 ? "text-amber-400" : "text-muted-foreground"}`}>{b.relevanceScore}%</span>
                      </td>
                      <td className="text-right px-2 py-2 tabular-nums">{formatNum(b.pageviews)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{formatNum(b.leads)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{formatNum(b.sqos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reuse.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold">Overlap & Cannibalization Risk</span>
            </div>
            <div className="space-y-1.5">
              {reuse.map((r, i) => (
                <div key={i} className="rounded-lg bg-muted/10 border border-border/20 p-2.5 flex items-center gap-3 text-xs">
                  <span className="font-medium truncate flex-1 max-w-[180px]">{r.contentId}</span>
                  <span className="text-muted-foreground">Overlap: <span className="font-semibold text-foreground">{r.overlap}%</span></span>
                  <Badge className={`text-[9px] ${r.cannibalizationRisk === "high" ? "bg-red-500/15 text-red-400" : r.cannibalizationRisk === "medium" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                    {r.cannibalizationRisk} risk
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-border/20">
          <Button
            onClick={onCompare}
            className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
            data-testid="btn-compare-from-analysis"
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Use for Comparison
          </Button>
          {onAskChat && (
            <Button
              onClick={() => onAskChat(`I just analyzed "${result.filename}" — a ${cls.contentType} about ${cls.topic} for ${cls.product} (${cls.stage}). Readiness score: ${analysis.readinessScore}/100. ${analysis.topAction || ""} What suggestions do you have to improve this content?`)}
              variant="outline"
              className="flex-1 rounded-xl"
              data-testid="btn-ask-chat-about-analysis"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Ask Librarian About This
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FilledSlotCard({
  slot,
  index,
  totalSlots,
  onClear,
}: {
  slot: ContentSlot;
  index: number;
  totalSlots: number;
  onClear: () => void;
}) {
  const rawName = slot.pdfResult?.filename || slot.libraryAsset?.name || slot.label;
  const shortName = generateShortName(rawName);
  const stage = slot.pdfResult?.classification?.stage || slot.libraryAsset?.stage || "";
  const type = slot.pdfResult?.classification?.contentType || slot.libraryAsset?.type || "";
  const product = slot.pdfResult?.classification?.product || slot.libraryAsset?.product || "";
  const hasAnalysis = slot.source === "upload" && slot.pdfResult && !slot.pdfResult.isFallback;
  const accent = totalSlots === 2 ? (index === 0 ? BASELINE_COLOR : CHALLENGER_COLOR) : BASELINE_COLOR;
  const roleLabel = totalSlots === 2 ? (index === 0 ? "Baseline" : "Challenger") : undefined;

  return (
    <div className="rounded-xl bg-muted/10 p-3 flex items-center gap-3" style={{ border: `1px solid ${accent}33` }} data-testid={`filled-slot-${index}`}>
      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}1A` }}>
        {slot.source === "upload" ? <FileText className="h-4 w-4" style={{ color: accent }} /> :
         slot.source === "library" ? <Database className="h-4 w-4" style={{ color: accent }} /> :
         <PenLine className="h-4 w-4" style={{ color: accent }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold truncate" style={{ color: accent }}>{shortName}</p>
          {roleLabel && <span className="text-[9px] text-muted-foreground/60 shrink-0">{roleLabel}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          {stage && <Badge className={`${stageBadgeColors[stage] || "bg-muted"} border text-[9px]`}>{stage}</Badge>}
          {product && (
            <>
              <span>·</span>
              <span className="truncate">{product}</span>
            </>
          )}
          {type && (
            <>
              <span>·</span>
              <span>{type}</span>
            </>
          )}
          {hasAnalysis && (
            <>
              <span>·</span>
              <span style={{ color: accent }}>Analyzed</span>
            </>
          )}
        </div>
      </div>
      <button onClick={onClear} className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors shrink-0" data-testid={`btn-clear-slot-${index}`}>
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function SlotSourcePicker({
  slotIndex,
  onSelectSource,
}: {
  slotIndex: number;
  onSelectSource: (source: SlotSource) => void;
}) {
  return (
    <div className="flex gap-2" data-testid={`slot-source-picker-${slotIndex}`}>
      <button
        onClick={() => onSelectSource("upload")}
        className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border border-border/30 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary transition-all"
        data-testid={`btn-slot-upload-${slotIndex}`}
      >
        <Upload className="h-3.5 w-3.5" />
        Upload PDF
      </button>
      <button
        onClick={() => onSelectSource("library")}
        className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border border-border/30 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary transition-all"
        data-testid={`btn-slot-library-${slotIndex}`}
      >
        <Library className="h-3.5 w-3.5" />
        From Library
      </button>
      <button
        onClick={() => onSelectSource("manual")}
        className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border border-border/30 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:text-primary transition-all"
        data-testid={`btn-slot-manual-${slotIndex}`}
      >
        <PenLine className="h-3.5 w-3.5" />
        Manual
      </button>
    </div>
  );
}

function MultiComparisonResults({
  data,
  onPlanCampaign,
  onDownloadPdf,
}: {
  data: MultiComparisonResult;
  onPlanCampaign: () => void;
  onDownloadPdf: () => void;
}) {
  const contentCount = data.contents.length;
  const rankColors = ["text-amber-400", "text-gray-300", "text-amber-600", "text-muted-foreground", "text-muted-foreground"];
  const rankIcons = [Crown, Medal, Medal, null, null];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      data-testid="multi-comparison-results"
    >
      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Overall Rankings</h3>
          <span className="text-xs text-muted-foreground ml-auto">{contentCount} pieces compared</span>
        </div>

        <div className="space-y-2">
          {data.rankings.overall.map((r, i) => {
            const RankIcon = rankIcons[i];
            return (
              <div key={i} className={`rounded-xl border ${i === 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/20 bg-muted/10"} p-3 flex items-center gap-3`} data-testid={`ranking-${i}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-amber-500/15" : "bg-muted/30"} ${rankColors[i]}`}>
                  {RankIcon ? <RankIcon className="h-4 w-4" /> : `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{r.name}</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{r.reason}</p>
                </div>
                <div className="shrink-0">
                  <span className={`text-lg font-bold tabular-nums ${i === 0 ? "text-amber-400" : "text-foreground/70"}`}>{r.score}</span>
                  <span className="text-[10px] text-muted-foreground">/100</span>
                </div>
              </div>
            );
          })}
        </div>

        {(data.rankings.bestForLeads || data.rankings.bestForEngagement || data.rankings.bestForConversion) && (
          <div className="flex flex-wrap gap-2">
            {data.rankings.bestForLeads && (
              <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30 border text-[10px]">
                Best for Leads: {data.rankings.bestForLeads}
              </Badge>
            )}
            {data.rankings.bestForEngagement && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border text-[10px]">
                Best for Engagement: {data.rankings.bestForEngagement}
              </Badge>
            )}
            {data.rankings.bestForConversion && (
              <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 border text-[10px]">
                Best for Conversion: {data.rankings.bestForConversion}
              </Badge>
            )}
          </div>
        )}
      </Card>

      <div className={`grid gap-3 ${contentCount === 2 ? "sm:grid-cols-2" : contentCount === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {data.contents.map((item, i) => (
          <Card key={i} className="rounded-2xl border bg-card/80 p-4 backdrop-blur space-y-3" data-testid={`content-card-${i}`}>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{i + 1}</div>
              <h4 className="text-sm font-semibold truncate flex-1">{item.name}</h4>
              {data.contentMetadata[i] && (
                <Badge className={`${stageBadgeColors[data.contentMetadata[i].stage] || "bg-muted"} border text-[9px] shrink-0`}>
                  {data.contentMetadata[i].stage}
                </Badge>
              )}
            </div>

            {item.summary && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{item.summary}</p>
            )}

            {item.resonance && (
              <div className="space-y-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Resonance</span>
                <div className="grid grid-cols-2 gap-1">
                  {(["countryFit", "industryFit", "funnelStageFit", "productFit"] as const).map(dim => {
                    const r = item.resonance?.[dim];
                    if (!r) return null;
                    const dimLabel = dim.replace("Fit", "").replace("funnelStage", "Stage");
                    return (
                      <div key={dim} className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground capitalize">{dimLabel}:</span>
                        <ResonanceBadge rating={r.rating} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {item.keyTopics && item.keyTopics.length > 0 && (
              <div>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Key Topics</span>
                <div className="space-y-1">
                  {item.keyTopics.slice(0, 3).map((t: any, j: number) => (
                    <div key={j} className="text-[10px] text-muted-foreground">
                      {typeof t === "string" ? (
                        <span className="font-medium text-foreground/80">{t}</span>
                      ) : (
                        <><span className="font-medium text-foreground/80">{t.topic}</span>{t.detail ? ` — ${t.detail}` : ""}</>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {item.keywordTags && item.keywordTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.keywordTags.slice(0, 6).map((tag, j) => (
                  <span key={j} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border bg-teal-500/15 text-teal-300 border-teal-500/25">{tag}</span>
                ))}
                {item.keywordTags.length > 6 && <span className="text-[9px] text-muted-foreground">+{item.keywordTags.length - 6}</span>}
              </div>
            )}

            {data.contentMetrics[i]?.metrics.hasData && (
              <div className="grid grid-cols-3 gap-1">
                <MetricPill label="Views" value={data.contentMetrics[i].metrics.pageviews} />
                <MetricPill label="Leads" value={data.contentMetrics[i].metrics.leads} />
                <MetricPill label="SQOs" value={data.contentMetrics[i].metrics.sqos} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Cross-Content Analysis</h3>
        </div>

        {data.crossAnalysis.sharedThemes.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 block mb-1.5">Shared Themes</span>
            <ul className="space-y-1">
              {data.crossAnalysis.sharedThemes.map((t, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.crossAnalysis.differentiators.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 block mb-1.5">Key Differentiators</span>
            <ul className="space-y-1">
              {data.crossAnalysis.differentiators.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <Target className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.crossAnalysis.contentGaps.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 block mb-1.5">Content Gaps</span>
            <ul className="space-y-1">
              {data.crossAnalysis.contentGaps.map((g, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Verdict & Recommendations</h3>
        </div>
        <p className="text-xs text-foreground/85 leading-relaxed">{data.verdict}</p>
        {data.suggestions.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/20">
            {data.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="text-foreground/80">{s.text}</span>
                  <span className="text-[9px] text-muted-foreground/60 ml-2">[{s.source}]</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.contentMetrics.some(cm => cm.metrics.hasData) && (
        <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Performance Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="multi-perf-table">
              <thead>
                <tr className="border-b border-border/20">
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Content</th>
                  <th className="text-right px-2 py-2 text-muted-foreground font-medium">Views</th>
                  <th className="text-right px-2 py-2 text-muted-foreground font-medium">Downloads</th>
                  <th className="text-right px-2 py-2 text-muted-foreground font-medium">Leads</th>
                  <th className="text-right px-2 py-2 text-muted-foreground font-medium">SQOs</th>
                  <th className="text-right px-2 py-2 text-muted-foreground font-medium">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {data.contentMetrics.map((cm, i) => (
                  <tr key={i} className="border-b border-border/10 last:border-0">
                    <td className="px-3 py-2 font-medium max-w-[180px] truncate">{cm.name}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cm.metrics.hasData ? formatNum(cm.metrics.pageviews) : "—"}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cm.metrics.hasData ? formatNum(cm.metrics.downloads) : "—"}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cm.metrics.hasData ? formatNum(cm.metrics.leads) : "—"}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cm.metrics.hasData ? formatNum(cm.metrics.sqos) : "—"}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{cm.metrics.hasData ? `${cm.metrics.avgTime}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex gap-3" data-testid="multi-comparison-actions">
        <Button onClick={onDownloadPdf} className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-semibold" data-testid="btn-download-multi-pdf">
          <FileText className="h-4 w-4 mr-2" />
          Download Comparison Report (PDF)
        </Button>
        <Button onClick={onPlanCampaign} variant="outline" className="flex-1 rounded-xl border-[#00D657]/50 text-[#00D657] hover:bg-[#00D657]/10 font-semibold" data-testid="btn-plan-campaign-multi">
          <TrendingUp className="h-4 w-4 mr-2" />
          Plan Campaign With Top Content &rarr;
        </Button>
      </div>
    </motion.div>
  );
}

export default function ContentComparison() {
  const [slots, setSlots] = useState<ContentSlot[]>([EMPTY_CONTENT_SLOT(1), EMPTY_CONTENT_SLOT(2)]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<SlotSource | null>(null);
  const [step, setStep] = useState<"intake" | "standalone" | "results">("intake");
  const [standaloneResult, setStandaloneResult] = useState<PdfResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<FullComparisonResult | null>(null);
  const [multiResult, setMultiResult] = useState<MultiComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const filledSlots = slots.filter(s => s.filled);
  const canCompare = filledSlots.length >= 2;
  const canAddSlot = slots.length < 5;

  function updateSlot(index: number, update: Partial<ContentSlot>) {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  }

  function clearSlot(index: number) {
    setSlots(prev => prev.map((s, i) => i === index ? EMPTY_CONTENT_SLOT(s.id) : s));
    if (activeSlotIndex === index) {
      setActiveSlotIndex(null);
      setActiveSource(null);
    }
  }

  function addSlot() {
    if (slots.length >= 5) return;
    const newId = Math.max(...slots.map(s => s.id)) + 1;
    setSlots(prev => [...prev, EMPTY_CONTENT_SLOT(newId)]);
  }

  function removeSlot(index: number) {
    if (slots.length <= 2) return;
    setSlots(prev => prev.filter((_, i) => i !== index));
    if (activeSlotIndex === index) {
      setActiveSlotIndex(null);
      setActiveSource(null);
    } else if (activeSlotIndex !== null && activeSlotIndex > index) {
      setActiveSlotIndex(prev => prev !== null ? prev - 1 : null);
    }
  }

  function handleSlotFilled(index: number, result: PdfResult | null, asset: AssetPickerItem | null, source: SlotSource) {
    updateSlot(index, {
      source,
      pdfResult: result,
      libraryAsset: asset,
      label: result?.filename || asset?.name || `Content ${slots[index].id}`,
      filled: true,
      expanded: false,
    });
    setActiveSlotIndex(null);
    setActiveSource(null);
    setCollapsed(false);
  }

  function handleViewStandaloneAnalysis(result: PdfResult) {
    setStandaloneResult(result);
    setStep("standalone");
  }

  function handleMoveToComparison() {
    setStep("intake");
  }

  function buildContentCtx(slot: ContentSlot, piece: any): ComparisonContextContent {
    const a = slot.libraryAsset;
    const r = slot.pdfResult;
    const fullText = r?.text || "";
    return {
      name: piece.name,
      contentId: piece.contentId,
      contentText: fullText,
      contentSummary: "",
      keywordTags: [],
      metadata: {
        product: piece.product || "",
        country: piece.country || "",
        industry: piece.industry || "",
        funnelStage: piece.stage || "",
        channel: a?.channel || "",
        contentType: piece.type || "",
        format: r ? "PDF" : "Library Asset",
        wordCount: r?.wordCount || null,
      },
      engagement: {
        pageviews: piece.metrics?.pageviews || 0,
        downloads: piece.metrics?.downloads || 0,
        leads: piece.metrics?.leads || 0,
        sqos: piece.metrics?.sqos || 0,
        avgTime: piece.metrics?.avgTime || 0,
        hasData: !!(piece.metrics && (piece.metrics.pageviews > 0 || piece.metrics.leads > 0 || piece.metrics.sqos > 0)),
      },
    };
  }

  function dispatchComparisonContext(ctx: ComparisonContext | null) {
    window.dispatchEvent(new CustomEvent("comparison-context-update", { detail: ctx }));
  }

  async function handleRunComparison() {
    if (!canCompare) return;
    setStep("results");
    setComparisonLoading(true);
    setComparisonError(null);
    setComparisonResult(null);
    setMultiResult(null);

    const pieces = filledSlots.map(slot => {
      if (slot.libraryAsset) {
        const a = slot.libraryAsset;
        return {
          name: a.name || a.contentId,
          contentId: a.contentId,
          stage: a.stage,
          product: a.product || "General",
          type: a.type || "Document",
          country: a.country || "",
          industry: a.industry || "",
          metrics: { pageviews: a.pageviews, downloads: a.downloads, leads: a.leads, sqos: a.sqos, avgTime: a.avgTime },
        };
      }
      const r = slot.pdfResult!;
      return {
        name: r.filename,
        contentId: r.contentId || r.filename,
        stage: r.classification.stage,
        product: r.classification.product || "General",
        type: r.classification.contentType || "Document",
        country: (r as any).country || "",
        industry: r.classification.industry || "",
        text: r.text?.slice(0, 8000),
        metrics: r.metrics || { pageviews: 0, downloads: 0, leads: 0, sqos: 0, avgTime: 0 },
      };
    });

    if (pieces.length === 2) {
      try {
        const res = await authFetch("/api/assets/full-comparison", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentA: { ...pieces[0], contentType: pieces[0].type },
            contentB: { ...pieces[1], contentType: pieces[1].type, topic: pieces[1].name },
          }),
        });
        if (!res.ok) throw new Error("Comparison analysis failed");
        const data = await res.json();
        setComparisonResult(data);

        const ctxA = buildContentCtx(filledSlots[0], pieces[0]);
        const ctxB = buildContentCtx(filledSlots[1], pieces[1]);
        ctxA.contentSummary = data.metadata?.summaryA || data.contentOverview?.a?.summary || "";
        ctxB.contentSummary = data.metadata?.summaryB || data.contentOverview?.b?.summary || "";
        ctxA.keywordTags = flattenKeywordTags(data.keywordTagsA);
        ctxB.keywordTags = flattenKeywordTags(data.keywordTagsB);
        dispatchComparisonContext({
          type: "two-way",
          contentA: ctxA,
          contentB: ctxB,
          comparisonResults: {
            contentOverviewA: data.contentOverview?.a?.summary || null,
            contentOverviewB: data.contentOverview?.b?.summary || null,
            resonanceAssessment: data.resonanceAssessment,
            topicRelevance: data.keyTopics,
            sharedAndDifferent: data.sharedAndDifferent,
            whatWorks: data.whatMakesItWork,
            couldBeImproved: data.whatCouldBeImproved,
            verdict: data.verdict,
            suggestions: data.suggestions,
            tagsShared: data.sharedTags || [],
            isDuplicate: !!data.isDuplicate,
          },
        });
      } catch (err: any) {
        setComparisonError(err.message || "Failed to run comparison analysis.");
      }
    } else {
      try {
        const res = await authFetch("/api/assets/multi-comparison", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: pieces }),
        });
        if (!res.ok) throw new Error("Multi-content comparison failed");
        const raw = await res.json();
        const details = raw.contentDetails || [];
        const mapped: MultiComparisonResult = {
          contents: raw.contents || [],
          crossAnalysis: raw.crossAnalysis || { sharedThemes: [], differentiators: [], contentGaps: [] },
          rankings: {
            overall: raw.rankings?.overall || [],
            bestForLeads: raw.rankings?.byMetric?.bestForLeads || raw.rankings?.bestForLeads,
            bestForEngagement: raw.rankings?.byMetric?.bestForEngagement || raw.rankings?.bestForEngagement,
            bestForConversion: raw.rankings?.byMetric?.bestForConversion || raw.rankings?.bestForConversion,
          },
          verdict: raw.verdict || "",
          suggestions: raw.suggestions || [],
          contentNames: details.map((d: any) => d.name),
          contentMetrics: details.map((d: any) => ({
            name: d.name,
            metrics: {
              pageviews: d.metrics?.pageviews || 0,
              downloads: d.metrics?.downloads || 0,
              leads: d.metrics?.leads || 0,
              sqos: d.metrics?.sqos || 0,
              avgTime: d.metrics?.avgTime || 0,
              hasData: d.hasMetrics || false,
            },
          })),
          contentMetadata: details.map((d: any) => ({
            name: d.name,
            stage: d.stage || "",
            product: d.product || "",
            type: d.contentType || "",
            country: d.country || "",
            industry: d.industry || "",
          })),
        };
        setMultiResult(mapped);

        const multiCtxContents = filledSlots.map((slot, i) => {
          const ctx = buildContentCtx(slot, pieces[i]);
          const content = mapped.contents?.[i];
          if (content) {
            ctx.contentSummary = content.summary || "";
            ctx.keywordTags = content.keywordTags || [];
          }
          return ctx;
        });
        dispatchComparisonContext({
          type: "multi",
          multiContents: multiCtxContents,
          multiResults: {
            crossAnalysis: mapped.crossAnalysis,
            rankings: { overall: mapped.rankings.overall },
            verdict: mapped.verdict,
            suggestions: mapped.suggestions,
          },
        });
      } catch (err: any) {
        setComparisonError(err.message || "Failed to run multi-content comparison.");
      }
    }
    setComparisonLoading(false);
  }

  function handleReset() {
    setSlots([EMPTY_CONTENT_SLOT(1), EMPTY_CONTENT_SLOT(2)]);
    setActiveSlotIndex(null);
    setActiveSource(null);
    setStandaloneResult(null);
    setComparisonResult(null);
    setMultiResult(null);
    setComparisonLoading(false);
    setComparisonError(null);
    setStep("intake");
    dispatchComparisonContext(null);
  }

  async function handleDownloadPdf(data: FullComparisonResult) {
    const { generateComparisonPdf } = await import("@/lib/comparison-pdf");
    generateComparisonPdf(data);
  }

  async function handleDownloadMultiPdf(data: MultiComparisonResult) {
    const { generateMultiComparisonPdf } = await import("@/lib/comparison-pdf");
    generateMultiComparisonPdf(data);
  }

  return (
    <div className="space-y-4" data-testid="content-comparison-tool">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur p-5"
        data-testid="panel-content-intake"
      >
        <div
          className={`flex items-center gap-2 w-full ${collapsed ? "" : step === "standalone" ? "mb-0" : "mb-4"}`}
        >
          <div
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed(c => !c); } }}
            data-testid="btn-toggle-comparison-panel"
          >
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30 shrink-0">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold">{step === "standalone" ? "Content Analysis" : "Content Comparison"}</h3>
              {!collapsed && step !== "standalone" && (
                <p className="text-xs text-muted-foreground">Add 2–5 content pieces to compare — upload, pick from library, or enter manually</p>
              )}
              {collapsed && (
                <p className="text-xs text-muted-foreground">Click to expand — upload, pick from library, or enter manually</p>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </div>
          {!collapsed && step !== "intake" && (
            <Button onClick={handleReset} variant="outline" size="sm" className="rounded-lg text-xs shrink-0" data-testid="btn-reset-comparison">
              Start Over
            </Button>
          )}
        </div>

        {!collapsed && step === "intake" && (
          <div className="space-y-3">
            {slots.map((slot, index) => (
              <div key={slot.id} className="space-y-2" data-testid={`slot-container-${index}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {slots.length === 2 ? (index === 0 ? "Baseline" : "Challenger") : `Content ${index + 1}`}
                  </span>
                  {slots.length > 2 && !slot.filled && (
                    <button
                      onClick={() => removeSlot(index)}
                      className="text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors ml-auto"
                      data-testid={`btn-remove-slot-${index}`}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {slot.filled ? (
                  <FilledSlotCard slot={slot} index={index} totalSlots={slots.length} onClear={() => clearSlot(index)} />
                ) : activeSlotIndex === index ? (
                  <div className="rounded-xl border border-primary/20 bg-muted/5 p-3 space-y-3">
                    {!activeSource && <SlotSourcePicker slotIndex={index} onSelectSource={(src) => setActiveSource(src)} />}

                    <AnimatePresence mode="wait">
                      {activeSource === "upload" && (
                        <motion.div key="upload" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}>
                          <UploadAndSavePanel
                            onAnalyzed={(result) => handleSlotFilled(index, result, null, "upload")}
                            onViewAnalysis={filledSlots.length === 0 ? handleViewStandaloneAnalysis : undefined}
                          />
                        </motion.div>
                      )}
                      {activeSource === "library" && (
                        <motion.div key="library" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}>
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
                            handleSlotFilled(index, manualResult, asset, "library");
                          }} />
                        </motion.div>
                      )}
                      {activeSource === "manual" && (
                        <motion.div key="manual" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}>
                          <ManualEntryPanel onSubmit={(result) => handleSlotFilled(index, result, null, "manual")} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {activeSource && (
                      <button
                        onClick={() => setActiveSource(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`btn-back-source-${index}`}
                      >
                        ← Change approach
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { setActiveSlotIndex(index); setActiveSource(null); }}
                    className="w-full rounded-xl border-2 border-dashed border-border/30 bg-muted/5 p-4 text-center hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer"
                    data-testid={`btn-expand-slot-${index}`}
                  >
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      <span>Add content — Upload PDF, select from library, or enter manually</span>
                    </div>
                  </button>
                )}
              </div>
            ))}

            {canAddSlot && (
              <button
                onClick={addSlot}
                className="w-full rounded-lg border border-dashed border-border/30 bg-transparent py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                data-testid="btn-add-content-slot"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Content ({slots.length}/5)
              </button>
            )}

            <Button
              onClick={handleRunComparison}
              disabled={!canCompare || comparisonLoading}
              className={`w-full rounded-xl font-semibold transition-colors ${canCompare ? "bg-[#00D657] hover:bg-[#00C04E] text-black" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
              data-testid="btn-run-comparison"
            >
              {comparisonLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Compare {filledSlots.length > 0 ? `${filledSlots.length} Content Pieces` : "Selected Content"}
                </>
              )}
            </Button>
          </div>
        )}

        {!collapsed && step === "results" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={`grid gap-2 ${filledSlots.length === 2 ? "sm:grid-cols-2" : filledSlots.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {filledSlots.map((slot, i) => (
                <div key={slot.id} className="rounded-xl bg-muted/10 border border-border/30 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{i + 1}</div>
                    <span className="text-xs font-medium truncate">{slot.pdfResult?.filename || slot.libraryAsset?.name || slot.label}</span>
                    {(slot.pdfResult?.classification?.stage || slot.libraryAsset?.stage) && (
                      <Badge className={`${stageBadgeColors[slot.pdfResult?.classification?.stage || slot.libraryAsset?.stage || ""] || "bg-muted"} border text-[9px] shrink-0 ml-auto`}>
                        {slot.pdfResult?.classification?.stage || slot.libraryAsset?.stage}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {step === "standalone" && standaloneResult && (
        <StandaloneAnalysisView
          result={standaloneResult}
          onCompare={handleMoveToComparison}
          onAskChat={(prompt) => {
            window.dispatchEvent(new CustomEvent("open-full-chat", { detail: { prompt } }));
          }}
        />
      )}

      {step === "results" && comparisonLoading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border bg-card/80 p-8 backdrop-blur text-center" data-testid="comparison-loading">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold">Running AI-Powered Comparison</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzing {filledSlots.length} content pieces, finding benchmarks, and generating insights...</p>
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
                <Button onClick={handleRunComparison} variant="outline" size="sm" className="mt-3 rounded-lg text-xs" data-testid="btn-retry-comparison">
                  Retry Analysis
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {step === "results" && comparisonResult && (
        <ComparisonResults
          comparisonData={comparisonResult}
          isLoadingVerdict={comparisonLoading}
          onDownloadPdf={() => handleDownloadPdf(comparisonResult)}
          onPlanCampaign={() => setShowCampaignModal(true)}
        />
      )}

      {step === "results" && multiResult && (
        <MultiComparisonResults
          data={multiResult}
          onPlanCampaign={() => setShowCampaignModal(true)}
          onDownloadPdf={() => handleDownloadMultiPdf(multiResult)}
        />
      )}

      {showCampaignModal && comparisonResult && (
        <CampaignContextModal
          data={comparisonResult}
          onClose={() => setShowCampaignModal(false)}
        />
      )}

      {showCampaignModal && multiResult && !comparisonResult && (
        <MultiCampaignContextModal
          data={multiResult}
          onClose={() => setShowCampaignModal(false)}
        />
      )}
    </div>
  );
}

function CampaignContextModal({ data, onClose }: { data: FullComparisonResult; onClose: () => void }) {
  const [, navigate] = useLocation();
  const meta = data.metadata;
  const [campShortA, campShortB] = generateShortNamePair(data.nameA, data.nameB, meta.stageA, meta.stageB);
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
              {[{ shortName: campShortA, fullName: data.nameA, stage: meta.stageA, product: meta.productA, format: meta.formatA, checked: includeA, onChange: setIncludeA, accent: BASELINE_COLOR, role: "Baseline" },
                { shortName: campShortB, fullName: data.nameB, stage: meta.stageB, product: meta.productB, format: meta.formatB, checked: includeB, onChange: setIncludeB, accent: CHALLENGER_COLOR, role: "Challenger" }].map((item) => (
                <label key={item.fullName} className="flex items-center gap-3 rounded-xl bg-muted/10 p-3 cursor-pointer transition-colors" style={{ border: `1px solid ${item.accent}33` }} data-testid={`check-include-${item.fullName}`}>
                  <input type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)} className="accent-[#00D657] h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold truncate" style={{ color: item.accent }}>{item.shortName}</span>
                      <span className="text-[9px] text-muted-foreground/60">{item.role}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{item.stage} · {item.product} · {item.format}</span>
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

function MultiCampaignContextModal({ data, onClose }: { data: MultiComparisonResult; onClose: () => void }) {
  const [, navigate] = useLocation();
  const [objective, setObjective] = useState("Lead Generation");
  const [product, setProduct] = useState(data.contentMetadata[0]?.product || "");
  const [country, setCountry] = useState(data.contentMetadata[0]?.country || "");
  const [industry, setIndustry] = useState(data.contentMetadata[0]?.industry || "");
  const [funnelStage, setFunnelStage] = useState(data.contentMetadata[0]?.stage || "TOFU");
  const [contentType, setContentType] = useState(data.contentMetadata[0]?.type || "");
  const [timeline, setTimeline] = useState("");
  const [budget, setBudget] = useState("");
  const [selectedContents, setSelectedContents] = useState<boolean[]>(data.contentNames.map(() => true));
  const [contextNotes, setContextNotes] = useState(() => {
    const parts: string[] = [];
    if (data.verdict) parts.push(`Multi-content comparison verdict: ${data.verdict}`);
    if (data.rankings.overall.length > 0) parts.push(`Top ranked: ${data.rankings.overall[0].name} (score: ${data.rankings.overall[0].score}/100)`);
    if (data.suggestions.length) parts.push(`Key suggestions:\n${data.suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s.text}`).join("\n")}`);
    return parts.join("\n\n");
  });

  function handleBuild() {
    const selectedAssets = data.contentNames
      .filter((_, i) => selectedContents[i])
      .map((name, i) => {
        const meta = data.contentMetadata.find(m => m.name === name);
        return { name, stage: meta?.stage || "", product: meta?.product || "", format: meta?.type || "", summary: "" };
      });

    const context = {
      fromComparison: true,
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
      verdict: data.verdict,
      suggestions: data.suggestions,
    };
    sessionStorage.setItem("cia-campaign-context", JSON.stringify(context));
    navigate("/campaign-planner");
  }

  const selectClass = "w-full h-9 rounded-lg bg-muted/20 border border-border/40 text-xs px-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20";
  const labelClass = "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="multi-campaign-context-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Review Campaign Context</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg" data-testid="btn-close-multi-campaign-modal"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Based on your multi-content comparison. Select which content to include and review before building the campaign plan.</p>

        <div className="space-y-5">
          <div>
            <span className={labelClass}>Content Pieces</span>
            <div className="space-y-2">
              {data.contentNames.map((name, i) => {
                const meta = data.contentMetadata[i];
                const rank = data.rankings.overall.find(r => r.name === name);
                return (
                  <label key={i} className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/10 p-3 cursor-pointer hover:border-primary/30 transition-colors" data-testid={`check-include-multi-${i}`}>
                    <input type="checkbox" checked={selectedContents[i]} onChange={e => setSelectedContents(prev => prev.map((v, j) => j === i ? e.target.checked : v))} className="accent-[#00D657] h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold block truncate">{name}</span>
                      <span className="text-[10px] text-muted-foreground">{meta?.type} | {meta?.stage} | {meta?.product}</span>
                    </div>
                    {rank && <span className="text-[10px] text-muted-foreground shrink-0">Score: {rank.score}/100</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className={labelClass}>Campaign Parameters</span>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Objective</label>
                <select value={objective} onChange={e => setObjective(e.target.value)} className={selectClass} data-testid="select-multi-campaign-objective">
                  <option value="Brand Awareness">Brand Awareness</option>
                  <option value="Lead Generation">Lead Generation</option>
                  <option value="Conversion">Conversion</option>
                  <option value="Retention">Retention</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Product</label>
                <input type="text" value={product} onChange={e => setProduct(e.target.value)} className={selectClass} data-testid="input-multi-campaign-product" />
              </div>
              <div>
                <label className={labelClass}>Country/Region</label>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)} className={selectClass} data-testid="input-multi-campaign-country" />
              </div>
              <div>
                <label className={labelClass}>Industry</label>
                <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} className={selectClass} data-testid="input-multi-campaign-industry" />
              </div>
              <div>
                <label className={labelClass}>Funnel Stage</label>
                <div className="flex gap-1">
                  {["TOFU", "MOFU", "BOFU"].map(s => (
                    <button key={s} onClick={() => setFunnelStage(s)} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${funnelStage === s ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted/30 border border-border/30"}`} data-testid={`btn-multi-campaign-stage-${s.toLowerCase()}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Timeline</label>
                <select value={timeline} onChange={e => setTimeline(e.target.value)} className={selectClass} data-testid="select-multi-campaign-timeline">
                  <option value="">Not specified</option>
                  <option value="4 weeks">4 weeks</option>
                  <option value="8 weeks">8 weeks</option>
                  <option value="12 weeks">12 weeks</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <span className={labelClass}>Comparison Insights</span>
            <textarea value={contextNotes} onChange={e => setContextNotes(e.target.value)} rows={4} className="w-full rounded-lg bg-muted/20 border border-border/40 text-xs p-3 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-y" data-testid="textarea-multi-campaign-insights" />
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-border/20">
          <Button onClick={handleBuild} disabled={selectedContents.every(v => !v)} className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-semibold disabled:opacity-40" data-testid="btn-build-multi-campaign">
            <Rocket className="h-4 w-4 mr-2" />
            Build Campaign Plan →
          </Button>
          <Button onClick={onClose} variant="outline" className="rounded-xl" data-testid="btn-cancel-multi-campaign">
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
