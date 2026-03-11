import { useState, useCallback, useEffect, useRef } from "react";
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
  Clock,
  Eye,
  Users,
  Target,
  Megaphone,
  Info,
  Plus,
  Pencil,
} from "lucide-react";
import type { AssetAgg } from "@shared/schema";

function ContentFilePreview({ assetId, contentFormat, hasFile }: { assetId: string; contentFormat: string | null; hasFile: boolean }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hasFile) return;
    let cancelled = false;
    const token = localStorage.getItem("cia_token");
    const fmt = (contentFormat || "").toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(fmt);
    const isPdf = fmt === "pdf";

    fetch(`/api/content/${encodeURIComponent(assetId)}/preview-file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.arrayBuffer();
      })
      .then(async (buffer) => {
        if (cancelled) return;
        if (isImage) {
          const blob = new Blob([buffer], { type: `image/${fmt === "svg" ? "svg+xml" : fmt}` });
          setThumbnailUrl(URL.createObjectURL(blob));
          setLoading(false);
        } else if (isPdf) {
          try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "";
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
            const page = await pdf.getPage(1);
            const scale = 400 / page.getViewport({ scale: 1 }).width;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d")!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            setThumbnailUrl(canvas.toDataURL("image/png"));
            setLoading(false);
          } catch {
            if (!cancelled) { setError(true); setLoading(false); }
          }
        } else {
          setError(true);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [hasFile, assetId, contentFormat]);

  useEffect(() => {
    return () => {
      if (thumbnailUrl && thumbnailUrl.startsWith("blob:")) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  if (!hasFile) return null;

  return (
    <section>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        <Eye className="h-3.5 w-3.5" />
        Document Preview
      </div>
      <div
        className="rounded-xl overflow-hidden border border-border/50 bg-white"
        style={{ maxHeight: 300 }}
        data-testid="panel-file-preview"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : error || !thumbnailUrl ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground/50">
            <FileText className="h-5 w-5" />
            <span className="text-xs">Preview unavailable</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt="Document preview"
            className="w-full object-contain object-top"
            style={{ maxHeight: 300 }}
          />
        )}
      </div>
    </section>
  );
}

function normalizeKeywordTags(raw: StructuredKeywordTags | string[] | null | undefined): StructuredKeywordTags {
  if (!raw) return { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
  if (Array.isArray(raw)) return { topic_tags: raw, audience_tags: [], intent_tags: [], user_added_tags: [] };
  return {
    topic_tags: raw.topic_tags || [],
    audience_tags: raw.audience_tags || [],
    intent_tags: raw.intent_tags || [],
    user_added_tags: raw.user_added_tags || [],
  };
}

interface StructuredKeywordTags {
  topic_tags: string[];
  audience_tags: string[];
  intent_tags: string[];
  user_added_tags: string[];
}

interface ContentData {
  id: string;
  assetId: string;
  contentSummary: string | null;
  extractedTopics: string[] | null;
  extractedCta: { text: string; type: string; strength: string; location: string } | null;
  contentStructure: { wordCount: number; sectionCount: number; pageCount: number; headings: string[] } | null;
  messagingThemes: string[] | null;
  keywordTags: StructuredKeywordTags | string[] | null;
  contentFormat: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  originalFilename: string | null;
  fileSizeBytes: number | null;
  fetchStatus: string;
  fetchNotes: string | null;
  dateStored: string | null;
  dateLastUpdated: string | null;
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

function formatUploadDateLong(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

              {(content.dateStored || content.dateLastUpdated) && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2" data-testid="panel-upload-dates">
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {content.dateStored && (
                      <div>
                        <span className="font-medium text-foreground/80">
                          {content.dateLastUpdated && content.dateLastUpdated !== content.dateStored ? "First uploaded:" : "Content uploaded:"}
                        </span>{" "}
                        {formatUploadDateLong(content.dateStored)}
                      </div>
                    )}
                    {content.dateLastUpdated && content.dateStored && content.dateLastUpdated !== content.dateStored && (
                      <div>
                        <span className="font-medium text-foreground/80">Updated:</span>{" "}
                        {formatUploadDateLong(content.dateLastUpdated)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {content.hasFile && (
                <ContentFilePreview
                  assetId={asset.contentId}
                  contentFormat={content.contentFormat}
                  hasFile={content.hasFile}
                />
              )}

              <UploadNewVersion onFileSelect={handleFileSelect} />

              {content.contentSummary && (
                <section>
                  <SectionHeader icon={<BookOpen className="h-3.5 w-3.5" />} label="AI Summary" />
                  {content.contentSummary === "AI analysis unavailable" || content.contentSummary === "No text content available for analysis" ? (
                    <ReanalyzeSection assetId={asset.contentId} queryClient={queryClient} />
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground/90">{content.contentSummary}</p>
                  )}
                </section>
              )}
              {!content.contentSummary && content.contentStructure && content.contentStructure.wordCount > 50 && (
                <section>
                  <SectionHeader icon={<BookOpen className="h-3.5 w-3.5" />} label="AI Summary" />
                  <ReanalyzeSection assetId={asset.contentId} queryClient={queryClient} />
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

              <KeywordTagsSection
                content={content}
                assetId={asset.contentId}
                queryClient={queryClient}
              />

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

              <AssetDetails asset={asset} stage={stage} />

              <EngagementMetrics asset={asset} />

              <Separator />

              <div className="flex flex-wrap gap-2">
                {content.hasFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      try {
                        const res = await authFetch(`/api/content/${encodeURIComponent(asset.contentId)}/download`);
                        if (!res.ok) throw new Error("Download failed");
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        const disposition = res.headers.get("Content-Disposition");
                        const match = disposition?.match(/filename="(.+?)"/);
                        const originalName = match?.[1] || "file";
                        const ext = originalName.includes(".") ? originalName.substring(originalName.lastIndexOf(".")) : ".pdf";
                        const baseName = originalName.includes(".") ? originalName.substring(0, originalName.lastIndexOf(".")) : originalName;
                        a.download = `${asset.contentId}_${baseName}${ext}`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch (err) {
                        console.error("Download error:", err);
                      }
                    }}
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
              stage={stage}
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

function AssetDetails({ asset, stage }: { asset: AssetAgg; stage: string }) {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Content ID", value: asset.contentId },
    { label: "Stage", value: stage },
    { label: "Campaign Name", value: asset.campaignName || asset.name },
    { label: "Product", value: asset.productFranchise },
    { label: "Category", value: asset.productCategory },
    { label: "Channel", value: asset.utmChannel },
    { label: "Medium", value: asset.utmMedium },
    { label: "Campaign", value: asset.utmCampaign },
    { label: "Term", value: asset.utmTerm },
    { label: "UTM Content", value: asset.utmContent },
    { label: "CTA", value: asset.cta },
    { label: "Objective", value: asset.objective },
    { label: "Form Name", value: asset.formName },
    { label: "Content Type", value: asset.typecampaignmember },
    { label: "Campaign ID", value: asset.campaignId },
    { label: "Date", value: asset.dateStamp },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHeader icon={<Info className="h-3.5 w-3.5" />} label="Asset Details" />
      <div className="space-y-1.5" data-testid="asset-details">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-[100px] text-muted-foreground">{r.label}</span>
            <span className="font-medium break-all text-foreground/90">
              {r.label === "Content ID" && asset.url ? (
                <a href={asset.url.startsWith("http") ? asset.url : `https://${asset.url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {r.value}
                </a>
              ) : (
                r.value
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
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

function ReanalyzeSection({ assetId, queryClient }: { assetId: string; queryClient: any }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const handleReanalyze = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const res = await authFetch(`/api/content/${encodeURIComponent(assetId)}/reanalyze`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to re-analyze");
      queryClient.invalidateQueries({ queryKey: [`/api/content/${assetId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/summary"] });
    } catch (err) {
      console.error("Re-analyze failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [assetId, queryClient]);

  return (
    <div className="flex flex-col items-center gap-2 py-3 px-4 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/5" data-testid="reanalyze-section">
      <p className="text-sm text-muted-foreground">AI analysis was not completed for this content.</p>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-xs"
        onClick={handleReanalyze}
        disabled={isAnalyzing}
        data-testid="button-reanalyze"
      >
        {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
      </Button>
    </div>
  );
}

function KeywordTagsSection({
  content,
  assetId,
  queryClient,
}: {
  content: ContentData;
  assetId: string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const tags = normalizeKeywordTags(content.keywordTags);
  const totalTags = tags.topic_tags.length + tags.audience_tags.length + tags.intent_tags.length + tags.user_added_tags.length;
  const [editing, setEditing] = useState(false);
  const [editTags, setEditTags] = useState<StructuredKeywordTags>(tags);
  const [newTag, setNewTag] = useState("");

  const saveMutation = useMutation({
    mutationFn: async (updatedTags: StructuredKeywordTags) => {
      const res = await authFetch(`/api/content/${encodeURIComponent(assetId)}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTags),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-detail", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/summary"] });
      setEditing(false);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/content/${encodeURIComponent(assetId)}/regenerate-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-detail", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/content/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/summary"] });
    },
  });

  const handleStartEdit = () => {
    setEditTags(normalizeKeywordTags(content.keywordTags));
    setNewTag("");
    setEditing(true);
  };

  const handleRemoveTag = (type: keyof StructuredKeywordTags, index: number) => {
    setEditTags(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index),
    }));
  };

  const handleAddUserTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (editTags.user_added_tags.includes(trimmed)) return;
    setEditTags(prev => ({
      ...prev,
      user_added_tags: [...prev.user_added_tags, trimmed],
    }));
    setNewTag("");
  };

  if (totalTags === 0 && !editing) {
    return (
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionHeader icon={<Tag className="h-3.5 w-3.5" />} label="Keyword Tags" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid="button-regenerate-tags"
          >
            {regenerateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Generate tags
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">No keyword tags generated yet</div>
      </section>
    );
  }

  const tagGroups: { key: keyof StructuredKeywordTags; label: string; bgClass: string; textClass: string; borderClass: string }[] = [
    { key: "topic_tags", label: "Topics", bgClass: "bg-[#006362]", textClass: "text-white", borderClass: "" },
    { key: "audience_tags", label: "Audience", bgClass: "bg-[#00A65C]", textClass: "text-white", borderClass: "" },
    { key: "intent_tags", label: "Intent", bgClass: "bg-transparent", textClass: "text-[#00D657]", borderClass: "border border-[#00D657]" },
    { key: "user_added_tags", label: "Custom", bgClass: "bg-primary/15", textClass: "text-primary", borderClass: "border border-primary/30" },
  ];

  if (editing) {
    return (
      <section data-testid="keyword-tags-edit-section">
        <div className="flex items-center justify-between mb-2">
          <SectionHeader icon={<Tag className="h-3.5 w-3.5" />} label="Edit Tags" />
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setEditing(false)}
              data-testid="button-cancel-edit-tags"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => saveMutation.mutate(editTags)}
              disabled={saveMutation.isPending}
              data-testid="button-save-tags"
            >
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {tagGroups.map(({ key, label, bgClass, textClass, borderClass }) => (
            <div key={key}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
              <div className="flex flex-wrap gap-1.5">
                {editTags[key].map((tag, i) => (
                  <Badge
                    key={`${key}-${i}`}
                    className={`rounded-lg text-xs ${bgClass} ${textClass} ${borderClass} pr-1 gap-1`}
                  >
                    {tag}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full hover:bg-white/20 p-0.5"
                      onClick={() => handleRemoveTag(key, i)}
                      data-testid={`button-remove-tag-${key}-${i}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                {editTags[key].length === 0 && (
                  <span className="text-[10px] text-muted-foreground italic">No {label.toLowerCase()} tags</span>
                )}
              </div>
            </div>
          ))}

          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Add custom tag</div>
            <div className="flex gap-1.5">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddUserTag(); } }}
                placeholder="Type a custom tag..."
                className="h-7 text-xs"
                data-testid="input-add-custom-tag"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1 text-xs"
                onClick={handleAddUserTag}
                disabled={!newTag.trim()}
                data-testid="button-add-custom-tag"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="keyword-tags-section">
      <div className="flex items-center justify-between mb-2">
        <SectionHeader icon={<Tag className="h-3.5 w-3.5" />} label="Keyword Tags" />
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleStartEdit}
            data-testid="button-edit-tags"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid="button-regenerate-tags"
          >
            {regenerateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Regenerate
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {tagGroups.map(({ key, label, bgClass, textClass, borderClass }) => {
          if (tags[key].length === 0) return null;
          return (
            <div key={key}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
              <div className="flex flex-wrap gap-1.5">
                {tags[key].map((tag, i) => (
                  <Badge
                    key={`${key}-${i}`}
                    className={`rounded-lg text-xs ${bgClass} ${textClass} ${borderClass}`}
                    data-testid={`tag-${key}-${i}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NotStoredView({
  asset,
  stage,
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
  stage: string;
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

      <AssetDetails asset={asset} stage={stage} />

      <EngagementMetrics asset={asset} />
    </div>
  );
}
