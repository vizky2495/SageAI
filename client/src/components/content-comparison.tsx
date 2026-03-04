import { useState, useCallback } from "react";
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

interface SlotState {
  file: File | null;
  result: PdfResult | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_SLOT: SlotState = { file: null, result: null, loading: false, error: null };

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

function AnalysisCard({ analysis, label }: { analysis: Analysis; label: string }) {
  const riskColors: Record<string, string> = {
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    high: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };

  return (
    <div className="space-y-3" data-testid={`analysis-${label.toLowerCase().replace(/\s/g, "-")}`}>
      {analysis.isFallbackAnalysis && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>AI analysis unavailable — showing benchmark-based estimates</span>
        </div>
      )}

      <div className="rounded-xl bg-muted/10 border border-border/30 p-4">
        <div className="flex items-start gap-4">
          <ReadinessRing score={analysis.readinessScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campaign Readiness</span>
            </div>
            <div className="space-y-1.5">
              <BreakdownBar label="Structure" value={analysis.readinessBreakdown.structure} />
              <BreakdownBar label="CTAs" value={analysis.readinessBreakdown.ctas} />
              <BreakdownBar label="Topic" value={analysis.readinessBreakdown.topicDepth} />
              <BreakdownBar label="Format" value={analysis.readinessBreakdown.format} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-muted/10 border border-border/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance Forecast</span>
          <Badge variant="outline" className={`text-[9px] ml-auto ${
            analysis.performanceForecast.confidence === "high" ? "text-emerald-400 border-emerald-500/30" :
            analysis.performanceForecast.confidence === "medium" ? "text-amber-400 border-amber-500/30" :
            "text-muted-foreground"
          }`}>
            {analysis.performanceForecast.confidence} confidence
          </Badge>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums">
            {analysis.performanceForecast.projectedRange[0].toLocaleString()} — {analysis.performanceForecast.projectedRange[1].toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            projected {analysis.performanceForecast.metric}
          </span>
        </div>
      </div>

      {analysis.recommendations.length > 0 && (
        <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/30">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommendations</span>
          </div>
          <div className="divide-y divide-border/20">
            {analysis.recommendations.sort((a, b) => a.priority - b.priority).map((r, i) => (
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

      {analysis.reusability.length > 0 && (
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
                {analysis.reusability.map((r, i) => (
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
        <p className="text-xs font-medium leading-relaxed" data-testid={`text-top-action-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {analysis.topAction}
        </p>
      </div>
    </div>
  );
}

function ClassificationCard({ result, label }: { result: PdfResult; label: string }) {
  const c = result.classification;
  const stageColor = stageBadgeColors[c.stage] || "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex flex-col gap-3" data-testid={`classification-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{result.filename}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px]">{result.pageCount}p</Badge>
          <Badge variant="outline" className="text-[10px]">{result.wordCount.toLocaleString()}w</Badge>
        </div>
      </div>

      {result.isFallback && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>AI classification unavailable — using rule-based fallback</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Content Type</span>
          <span className="text-sm font-semibold" data-testid={`text-type-${label.toLowerCase()}`}>{c.contentType}</span>
        </div>
        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Funnel Stage</span>
          <Badge className={`${stageColor} border text-[10px]`} data-testid={`badge-stage-${label.toLowerCase()}`}>{c.stage}</Badge>
        </div>
        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Product</span>
          <span className="text-xs font-medium" data-testid={`text-product-${label.toLowerCase()}`}>{c.product}</span>
        </div>
        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Industry</span>
          <span className="text-xs font-medium" data-testid={`text-industry-${label.toLowerCase()}`}>{c.industry}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">{c.topic}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {Math.round(c.confidence * 100)}% confidence
        </span>
      </div>
    </div>
  );
}

function StatCell({ label, stats }: { label: string; stats: MetricStats }) {
  return (
    <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</span>
      <div className="grid grid-cols-4 gap-1 text-[10px]">
        <div><span className="text-muted-foreground/60">Min</span><br/><span className="font-semibold tabular-nums">{stats.min.toLocaleString()}</span></div>
        <div><span className="text-muted-foreground/60">Max</span><br/><span className="font-semibold tabular-nums">{stats.max.toLocaleString()}</span></div>
        <div><span className="text-muted-foreground/60">Mean</span><br/><span className="font-semibold tabular-nums">{stats.mean.toLocaleString()}</span></div>
        <div><span className="text-muted-foreground/60">Median</span><br/><span className="font-semibold tabular-nums">{stats.median.toLocaleString()}</span></div>
      </div>
    </div>
  );
}

function AggregateBenchmarkCard({ agg, label }: { agg: AggregateBenchmarks; label: string }) {
  return (
    <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden" data-testid={`aggregate-benchmarks-${label.toLowerCase()}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border/30">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance Benchmarks</span>
        <Badge variant="outline" className="text-[9px] ml-auto">{agg.sampleSize} of {agg.totalPoolSize} assets</Badge>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <StatCell label="Pageviews" stats={agg.pageviews} />
        <StatCell label="Downloads" stats={agg.downloads} />
        <StatCell label="Leads" stats={agg.leads} />
        <StatCell label="SQOs" stats={agg.sqos} />
        <StatCell label="Avg Time on Page" stats={agg.timeOnPage} />
        <div className="rounded-lg bg-muted/20 border border-border/30 p-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Avg CTA Count</span>
          <span className="text-sm font-bold tabular-nums">{agg.avgCtaCount}</span>
        </div>
      </div>
    </div>
  );
}

function BenchmarkTable({ benchmarks, aggregateBenchmarks, label }: { benchmarks: Benchmark[]; aggregateBenchmarks: AggregateBenchmarks | null; label: string }) {
  if (benchmarks.length === 0 && !aggregateBenchmarks) {
    return (
      <div className="rounded-xl bg-muted/10 border border-border/30 p-4 flex items-center gap-2 text-xs text-muted-foreground" data-testid={`benchmarks-empty-${label.toLowerCase().replace(/\s/g, "-")}`}>
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        No matching content found in the library for this classification.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {benchmarks.length > 0 && (
      <div className="rounded-xl bg-muted/10 border border-border/30 overflow-hidden" data-testid={`benchmarks-${label.toLowerCase()}`}>
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border/30">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Matching Content</span>
          <Badge variant="outline" className="text-[9px] ml-auto">{benchmarks.length} matches</Badge>
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
              {benchmarks.map((b, i) => (
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
      </div>
      )}
      {aggregateBenchmarks && (
        <AggregateBenchmarkCard agg={aggregateBenchmarks} label={label} />
      )}
    </div>
  );
}

function UploadSlot({
  label,
  slot,
  onFileSelect,
  onClear,
  accentColor,
}: {
  label: string;
  slot: SlotState;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  accentColor: string;
}) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
      e.target.value = "";
    },
    [onFileSelect]
  );

  if (slot.result) {
    const previewText = slot.result.text.slice(0, 300);
    const hasMore = slot.result.text.length > 300;
    return (
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <button
            onClick={onClear}
            className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors shrink-0"
            data-testid={`btn-clear-${label.toLowerCase().replace(/\s/g, "-")}`}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <ClassificationCard result={slot.result} label={label} />

        {slot.result.analysis && (
          <AnalysisCard analysis={slot.result.analysis} label={label} />
        )}

        <BenchmarkTable benchmarks={slot.result.benchmarks} aggregateBenchmarks={slot.result.aggregateBenchmarks} label={label} />

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline self-start"
          data-testid={`btn-details-${label.toLowerCase().replace(/\s/g, "-")}`}
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
                <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words" data-testid={`text-preview-${label.toLowerCase().replace(/\s/g, "-")}`}>
                  {textExpanded ? slot.result.text : previewText}
                  {!textExpanded && hasMore && "..."}
                </p>
                {hasMore && (
                  <button
                    onClick={() => setTextExpanded(!textExpanded)}
                    className="flex items-center gap-1 mt-2 text-[11px] font-medium text-primary hover:underline"
                    data-testid={`btn-expand-${label.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {textExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {textExpanded ? "Show less" : "Show full text"}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-8 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all ${
          slot.loading ? "pointer-events-none opacity-60" : ""
        }`}
        data-testid={`dropzone-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        {slot.loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Analyzing content...</span>
          </>
        ) : (
          <>
            <Upload className={`h-8 w-8 ${accentColor} opacity-60`} />
            <div className="text-center">
              <span className="text-sm font-medium">{label}</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Drop a PDF or click to browse</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </>
        )}
      </label>
      {slot.error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 mt-2 text-xs text-destructive"
          data-testid={`text-error-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {slot.error}
        </motion.div>
      )}
    </div>
  );
}

function ComparisonSummary({ a, b }: { a: PdfResult; b: PdfResult }) {
  const ca = a.classification;
  const cb = b.classification;
  const sameStage = ca.stage === cb.stage;
  const sameType = ca.contentType.toLowerCase() === cb.contentType.toLowerCase();
  const comparable = sameStage && sameType;

  const wordsAArr = a.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsBArr = b.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsA = new Set(wordsAArr);
  const wordsB = new Set(wordsBArr);
  const shared = Array.from(wordsA).filter(w => wordsB.has(w));
  const overlapPct = wordsA.size > 0 || wordsB.size > 0
    ? ((shared.length * 2) / (wordsA.size + wordsB.size) * 100).toFixed(1)
    : "0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="comparison-summary">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Comparison Results</h3>
          {comparable ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] ml-auto">
              Comparable ({ca.stage} {ca.contentType})
            </Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/25 text-[10px] ml-auto">
              Different {!sameStage ? "stages" : "types"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-[9px] font-semibold uppercase text-muted-foreground pb-1.5">Attribute</th>
                  <th className="text-left text-[9px] font-semibold uppercase text-muted-foreground pb-1.5">Doc A</th>
                  <th className="text-left text-[9px] font-semibold uppercase text-muted-foreground pb-1.5">Doc B</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                <tr>
                  <td className="py-1 text-muted-foreground">Type</td>
                  <td className="py-1 font-medium">{ca.contentType}</td>
                  <td className="py-1 font-medium">{cb.contentType}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Stage</td>
                  <td className="py-1"><Badge className={`${stageBadgeColors[ca.stage] || ""} border text-[9px]`}>{ca.stage}</Badge></td>
                  <td className="py-1"><Badge className={`${stageBadgeColors[cb.stage] || ""} border text-[9px]`}>{cb.stage}</Badge></td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Product</td>
                  <td className="py-1 font-medium">{ca.product}</td>
                  <td className="py-1 font-medium">{cb.product}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Industry</td>
                  <td className="py-1 font-medium">{ca.industry}</td>
                  <td className="py-1 font-medium">{cb.industry}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Pages</td>
                  <td className="py-1 font-medium tabular-nums">{a.pageCount}</td>
                  <td className="py-1 font-medium tabular-nums">{b.pageCount}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Words</td>
                  <td className="py-1 font-medium tabular-nums">{a.wordCount.toLocaleString()}</td>
                  <td className="py-1 font-medium tabular-nums">{b.wordCount.toLocaleString()}</td>
                </tr>
                {a.analysis && b.analysis && (
                <tr>
                  <td className="py-1 text-muted-foreground">Readiness</td>
                  <td className="py-1 font-bold tabular-nums">{a.analysis.readinessScore}</td>
                  <td className="py-1 font-bold tabular-nums">{b.analysis.readinessScore}</td>
                </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl bg-muted/20 border border-border/30 p-3 flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Vocabulary Overlap</span>
                <span className="text-sm font-bold" data-testid="text-overlap-pct">{overlapPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${overlapPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                <span>{wordsA.size.toLocaleString()} in A</span>
                <span>{shared.length.toLocaleString()} shared</span>
                <span>{wordsB.size.toLocaleString()} in B</span>
              </div>
            </div>

            {!comparable && (
              <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                <Layers className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  These documents have different {!sameStage && !sameType ? "stages and content types" : !sameStage ? "funnel stages" : "content types"}.
                  For the most meaningful comparison, upload content with the same stage and type.
                </p>
              </div>
            )}

            {comparable && (
              <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                <Layers className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                  Both are {ca.stage} {ca.contentType}s — a like-for-like comparison. Check benchmarks to see how similar content performs.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function ContentComparison() {
  const [slotA, setSlotA] = useState<SlotState>(EMPTY_SLOT);
  const [slotB, setSlotB] = useState<SlotState>(EMPTY_SLOT);
  const [expanded, setExpanded] = useState(false);

  const MAX_FILE_SIZE_MB = 20;

  const extractPdf = useCallback(async (file: File, setSlot: (s: SlotState) => void) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setSlot({ file, result: null, loading: false, error: "Only PDF files are supported." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setSlot({ file, result: null, loading: false, error: `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.` });
      return;
    }
    setSlot({ file, result: null, loading: true, error: null });
    try {
      const base64 = await fileToBase64(file);
      const res = await authFetch("/api/assets/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlot({ file, result: null, loading: false, error: data.error || "Extraction failed." });
        return;
      }
      setSlot({ file, result: data, loading: false, error: null });
    } catch {
      setSlot({ file, result: null, loading: false, error: "Something went wrong." });
    }
  }, []);

  const bothReady = slotA.result && slotB.result;

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
            <p className="text-[11px] text-muted-foreground">Upload two PDFs to classify, analyze, and benchmark against existing content</p>
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
                <UploadSlot
                  label="Document A"
                  slot={slotA}
                  onFileSelect={(f) => extractPdf(f, setSlotA)}
                  onClear={() => setSlotA(EMPTY_SLOT)}
                  accentColor="text-emerald-400"
                />
                <div className="hidden sm:flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center">
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>
                <UploadSlot
                  label="Document B"
                  slot={slotB}
                  onFileSelect={(f) => extractPdf(f, setSlotB)}
                  onClear={() => setSlotB(EMPTY_SLOT)}
                  accentColor="text-sky-400"
                />
              </div>

              {bothReady && (
                <ComparisonSummary a={slotA.result!} b={slotB.result!} />
              )}

              {(slotA.result || slotB.result) && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSlotA(EMPTY_SLOT); setSlotB(EMPTY_SLOT); }}
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
