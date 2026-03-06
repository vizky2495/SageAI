import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authFetch } from "@/lib/queryClient";
import {
  X,
  Download,
  RefreshCw,
  Upload,
  Globe,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BookOpen,
  Tag,
  MessageSquare,
  Layers,
  ExternalLink,
  Sparkles,
  BarChart3,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Bot,
  Clock,
  Eye,
  Users,
  Target,
  Megaphone,
} from "lucide-react";
import type { AssetAgg } from "@shared/schema";

interface ContentData {
  id: string;
  assetId: string;
  contentSummary: string | null;
  extractedTopics: string[] | null;
  extractedCta: { text: string; type: string; strength: string; location: string } | null;
  contentStructure: { wordCount: number; sectionCount: number; pageCount: number; headings: string[] } | null;
  messagingThemes: string[] | null;
  contentFormat: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  originalFilename: string | null;
  fileSizeBytes: number | null;
  fetchStatus: string;
  fetchNotes: string | null;
  dateStored: string | null;
  hasFile: boolean;
}

const stageTones: Record<string, { bg: string; text: string; border: string }> = {
  TOFU: { bg: "bg-chart-1/12", text: "text-chart-1", border: "border-chart-1/20" },
  MOFU: { bg: "bg-chart-2/12", text: "text-chart-2", border: "border-chart-2/20" },
  BOFU: { bg: "bg-chart-3/12", text: "text-chart-3", border: "border-chart-3/20" },
  UNKNOWN: { bg: "bg-chart-4/12", text: "text-chart-4", border: "border-chart-4/20" },
};

function ctaStrengthColor(strength: string) {
  if (strength === "strong") return "text-emerald-400";
  if (strength === "moderate") return "text-amber-400";
  return "text-muted-foreground";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContentPreviewPanel({
  asset,
  stage,
  onClose,
}: {
  asset: AssetAgg;
  stage: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const tone = stageTones[stage] || stageTones.TOFU;
  const [fetchUrl, setFetchUrl] = useState(asset.url || "");
  const [dragOver, setDragOver] = useState(false);

  const { data: content, isLoading } = useQuery<ContentData>({
    queryKey: ["content-detail", asset.contentId],
    queryFn: async () => {
      const res = await authFetch(`/api/content/${encodeURIComponent(asset.contentId)}`);
      if (res.status === 404) return null;
      return res.json();
    },
  });

  const fetchMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await authFetch("/api/content/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.contentId, url }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-detail", asset.contentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ fileBase64, filename }: { fileBase64: string; filename: string }) => {
      const res = await authFetch("/api/content/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.contentId, fileBase64, filename }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-detail", asset.contentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/content/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.contentId }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-detail", asset.contentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
    },
  });

  const handleFileSelect = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ fileBase64: base64, filename: file.name });
    };
    reader.readAsDataURL(file);
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const isProcessing = fetchMutation.isPending || uploadMutation.isPending || refreshMutation.isPending;
  const hasContent = content && content.fetchStatus !== "not_stored";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
      data-testid="content-preview-overlay"
    >
      <div
        className="h-full w-full max-w-[520px] overflow-y-auto border-l bg-card/95 backdrop-blur-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideInRight 0.3s ease-out" }}
        data-testid="content-preview-panel"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/90 backdrop-blur-lg p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge className={`shrink-0 border ${tone.bg} ${tone.text} ${tone.border}`}>{stage}</Badge>
              <span className="truncate text-sm font-semibold">{asset.contentId}</span>
            </div>
            {(asset.campaignName || asset.name) && (
              <div className="mt-1 truncate text-xs text-muted-foreground">{asset.campaignName || asset.name}</div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} data-testid="button-close-preview-panel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {fetchMutation.isPending ? "Fetching & analyzing content..." : uploadMutation.isPending ? "Processing file..." : "Refreshing content..."}
              </span>
            </div>
          ) : hasContent ? (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <StatusIcon status={content.fetchStatus} />
                <span className="capitalize">{content.fetchStatus}</span>
                {content.contentFormat && <span>· {content.contentFormat.toUpperCase()}</span>}
                {content.fileSizeBytes && <span>· {formatBytes(content.fileSizeBytes)}</span>}
                {content.originalFilename && <span className="truncate">· {content.originalFilename}</span>}
              </div>

              {content.fetchNotes && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                  {content.fetchNotes}
                </div>
              )}

              <UploadNewVersion onFileSelect={handleFileSelect} />

              {content.contentSummary && (
                <section>
                  <SectionHeader icon={<BookOpen className="h-3.5 w-3.5" />} label="AI Summary" />
                  <p className="text-sm leading-relaxed text-foreground/90">{content.contentSummary}</p>
                </section>
              )}

              {content.extractedTopics && content.extractedTopics.length > 0 && (
                <section>
                  <SectionHeader icon={<Tag className="h-3.5 w-3.5" />} label="Topics" />
                  <div className="flex flex-wrap gap-1.5">
                    {content.extractedTopics.map((t, i) => (
                      <Badge key={i} variant="secondary" className="rounded-lg text-xs">{t}</Badge>
                    ))}
                  </div>
                </section>
              )}

              {content.extractedCta && (
                <section>
                  <SectionHeader icon={<MessageSquare className="h-3.5 w-3.5" />} label="Call-to-Action" />
                  <div className="rounded-xl border bg-secondary/30 p-3 space-y-1.5">
                    <div className="text-sm font-medium">"{content.extractedCta.text}"</div>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline" className="rounded-lg capitalize">{content.extractedCta.type.replace(/_/g, " ")}</Badge>
                      <span className={`font-medium ${ctaStrengthColor(content.extractedCta.strength)}`}>
                        {content.extractedCta.strength} strength
                      </span>
                      <span className="text-muted-foreground">· {content.extractedCta.location}</span>
                    </div>
                  </div>
                </section>
              )}

              {content.contentStructure && (
                <section>
                  <SectionHeader icon={<Layers className="h-3.5 w-3.5" />} label="Content Structure" />
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox label="Words" value={content.contentStructure.wordCount.toLocaleString()} />
                    <StatBox label="Sections" value={String(content.contentStructure.sectionCount)} />
                    <StatBox label="Pages" value={String(content.contentStructure.pageCount)} />
                  </div>
                  {content.contentStructure.headings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {content.contentStructure.headings.slice(0, 8).map((h, i) => (
                        <div key={i} className="text-xs text-muted-foreground pl-2 border-l-2 border-primary/20">{h}</div>
                      ))}
                      {content.contentStructure.headings.length > 8 && (
                        <div className="text-xs text-muted-foreground pl-2">+{content.contentStructure.headings.length - 8} more</div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {content.messagingThemes && content.messagingThemes.length > 0 && (
                <section>
                  <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />} label="Messaging Themes" />
                  <div className="flex flex-wrap gap-1.5">
                    {content.messagingThemes.map((t, i) => (
                      <Badge key={i} className="rounded-lg bg-primary/10 text-primary border-primary/20 text-xs">{t}</Badge>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              <div className="flex flex-wrap gap-2">
                {content.hasFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => window.open(`/api/content/${encodeURIComponent(asset.contentId)}/download`, "_blank")}
                    data-testid="button-download-original"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download original
                  </Button>
                )}
                {content.sourceUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    data-testid="button-refetch"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                    Re-fetch
                  </Button>
                )}
                {content.sourceUrl && (
                  <a
                    href={content.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 transition-colors"
                    data-testid="link-source-url"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open source
                  </a>
                )}
              </div>
            </>
          ) : (
            <NotStoredView
              asset={asset}
              fetchUrl={fetchUrl}
              setFetchUrl={setFetchUrl}
              onFetch={() => fetchMutation.mutate(fetchUrl)}
              onFileSelect={handleFileSelect}
              fetchPending={fetchMutation.isPending}
              fetchError={fetchMutation.error?.message || null}
              dragOver={dragOver}
              setDragOver={setDragOver}
              handleDrop={handleDrop}
            />
          )}

          {(fetchMutation.error || uploadMutation.error) && !isProcessing && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              {(fetchMutation.error as Error)?.message || (uploadMutation.error as Error)?.message}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === "partial" || status === "gated") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {icon}
      {label}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-secondary/30 p-2.5 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

function UploadNewVersion({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">Upload new version</span>
      </div>
      <label
        className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 px-4 py-3 cursor-pointer hover:border-primary/60 hover:bg-primary/10 transition-colors"
        data-testid="upload-new-version"
      >
        <span className="text-xs text-muted-foreground">Drop file or click to replace current content (PDF, DOCX, PPTX, images)</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />
      </label>
    </div>
  );
}

function EngagementMetrics({ asset }: { asset: AssetAgg }) {
  const metrics = [
    { icon: <Eye className="h-3.5 w-3.5" />, label: "Pageviews", value: asset.pageviewsSum.toLocaleString() },
    { icon: <Users className="h-3.5 w-3.5" />, label: "Leads", value: asset.uniqueLeads.toLocaleString() },
    { icon: <Target className="h-3.5 w-3.5" />, label: "SQOs", value: asset.sqoCount.toLocaleString() },
    { icon: <Download className="h-3.5 w-3.5" />, label: "Downloads", value: asset.downloadsSum.toLocaleString() },
    { icon: <Clock className="h-3.5 w-3.5" />, label: "Avg Time", value: asset.timeAvg > 0 ? `${Math.round(asset.timeAvg)}s` : "—" },
    { icon: <Megaphone className="h-3.5 w-3.5" />, label: "Channel", value: asset.utmChannel || "—" },
  ];

  return (
    <section>
      <SectionHeader icon={<BarChart3 className="h-3.5 w-3.5" />} label="Engagement Metrics" />
      <div className="grid grid-cols-3 gap-2" data-testid="engagement-metrics-grid">
        {metrics.map((m, i) => (
          <div key={i} className="rounded-xl border bg-secondary/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              {m.icon}
              <span className="text-[10px]">{m.label}</span>
            </div>
            <div className="text-sm font-bold">{m.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotStoredView({
  asset,
  fetchUrl,
  setFetchUrl,
  onFetch,
  onFileSelect,
  fetchPending,
  fetchError,
  dragOver,
  setDragOver,
  handleDrop,
}: {
  asset: AssetAgg;
  fetchUrl: string;
  setFetchUrl: (v: string) => void;
  onFetch: () => void;
  onFileSelect: (file: File) => void;
  fetchPending: boolean;
  fetchError: string | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
}) {
  const [showUrlFetch, setShowUrlFetch] = useState(false);

  return (
    <div className="space-y-5" data-testid="not-stored-view">
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="rounded-full bg-emerald-500/10 p-4 mb-3">
          <Upload className="h-8 w-8 text-emerald-500/60" />
        </div>
        <div className="text-sm font-medium">No content uploaded for this asset</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[300px]">
          Upload a file to unlock AI-powered content analysis, topic extraction, and messaging insights
        </div>
      </div>

      <label
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all ${
          dragOver
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
            : "border-muted-foreground/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        data-testid="dropzone-upload"
      >
        <div className="rounded-full bg-muted/30 p-3">
          <Upload className={`h-6 w-6 ${dragOver ? "text-emerald-500" : "text-muted-foreground/50"}`} />
        </div>
        <div className="text-center">
          <div className="text-sm font-medium">Drop file here or click to browse</div>
          <div className="text-xs text-muted-foreground mt-1">PDF, DOCX, PPTX, or images up to 50MB</div>
        </div>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
          }}
        />
      </label>

      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowUrlFetch(!showUrlFetch)}
          data-testid="button-toggle-url-fetch"
        >
          {showUrlFetch ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Globe className="h-3 w-3" />
          Or fetch from URL
        </button>
        {showUrlFetch && (
          <div className="mt-2 flex gap-2">
            <Input
              value={fetchUrl}
              onChange={(e) => setFetchUrl(e.target.value)}
              placeholder="https://..."
              className="text-sm"
              data-testid="input-fetch-url"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={onFetch}
              disabled={!fetchUrl.trim() || fetchPending}
              className="shrink-0 gap-1.5"
              data-testid="button-fetch-content"
            >
              {fetchPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              Fetch
            </Button>
          </div>
        )}
        {fetchError && (
          <div className="mt-2 text-xs text-red-400">{fetchError}</div>
        )}
      </div>

      <Separator />

      <EngagementMetrics asset={asset} />

      <Separator />

      <div className="flex gap-2" data-testid="preview-panel-actions">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" data-testid="button-compare-performance">
          <GitCompare className="h-3.5 w-3.5" />
          Compare (performance only)
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" data-testid="button-ask-ai">
          <Bot className="h-3.5 w-3.5" />
          Ask AI
        </Button>
      </div>
    </div>
  );
}
