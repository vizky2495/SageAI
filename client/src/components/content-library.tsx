import { useState, useRef, useCallback, useEffect, createContext, useContext } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authFetch } from "@/lib/queryClient";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  Search,
  X,
  MessageCircle,
  GitCompare,
  CalendarPlus,
  Sparkles,
  Loader2,
  Send,
  ArrowRight,
  Filter,
  ChevronDown,
  Plus,
  Upload,
  Tag,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import type { AssetAgg } from "@shared/schema";
import ContentPreviewPanel from "@/components/content-preview-panel";

interface StructuredKeywordTags {
  topic_tags: string[];
  audience_tags: string[];
  intent_tags: string[];
  user_added_tags: string[];
}

interface ContentStatusEntry {
  fetchStatus: string;
  sourceUrl: string | null;
  contentSummary: string | null;
  extractedTopics: string[] | null;
  extractedCta: { text: string; type: string; strength: string; location: string } | null;
  keywordTags: StructuredKeywordTags;
  dateStored: string | null;
  dateLastUpdated: string | null;
  uploadedByName: string | null;
}

type ContentStatusMap = Record<string, ContentStatusEntry>;

const ContentStatusContext = createContext<{ statusMap: ContentStatusMap; refreshStatus: () => void }>({
  statusMap: {},
  refreshStatus: () => {},
});

const PAGE_SIZE = 25;

function formatUploadDate(isoDate: string, style: "short" | "long" = "short"): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (style === "short") {
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const stageTones: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  TOFU: { bg: "bg-chart-1/12", text: "text-chart-1", border: "border-chart-1/20", accent: "#00D657" },
  MOFU: { bg: "bg-chart-2/12", text: "text-chart-2", border: "border-chart-2/20", accent: "#67E8F9" },
  BOFU: { bg: "bg-chart-3/12", text: "text-chart-3", border: "border-chart-3/20", accent: "#A78BFA" },
  UNKNOWN: { bg: "bg-chart-4/12", text: "text-chart-4", border: "border-chart-4/20", accent: "#6B7280" },
};

function deriveReadableName(contentId: string, asset: { name?: string | null; campaignName?: string | null; url?: string | null }): { primary: string; showId: boolean } {
  if (asset.name && asset.name !== contentId) return { primary: asset.name, showId: true };
  if (asset.campaignName && asset.campaignName !== contentId) return { primary: asset.campaignName, showId: true };
  const parts = contentId.split("_");
  if (parts.length >= 7) {
    const tail = parts.slice(6).join(" ");
    const readable = tail.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(\d+)/g, " $1 ").replace(/\s+/g, " ").trim();
    if (readable.length > 3) return { primary: readable, showId: true };
  }
  return { primary: contentId, showId: false };
}

interface CompareContextType {
  compareMode: boolean;
  selectedCard: { asset: AssetAgg; stage: string } | null;
  onCompareSelect: (asset: AssetAgg, stage: string) => void;
  cancelCompare: () => void;
}

const CompareContext = createContext<CompareContextType>({
  compareMode: false,
  selectedCard: null,
  onCompareSelect: () => {},
  cancelCompare: () => {},
});

function formatCompact(n: number) {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function truncateUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

function ContentDetailModal({
  asset,
  stage,
  onClose,
}: {
  asset: AssetAgg;
  stage: string;
  onClose: () => void;
}) {
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const tone = stageTones[stage] || stageTones.TOFU;
  const hasUrl = !!asset.url;
  const fullUrl = hasUrl ? (asset.url!.startsWith("http") ? asset.url! : `https://${asset.url}`) : "";
  const proxyUrl = hasUrl ? `/api/proxy?url=${encodeURIComponent(fullUrl)}` : "";

  const detailRows: { label: string; value: string | null | undefined }[] = [
    { label: "Content ID", value: asset.contentId },
    { label: "Stage", value: stage },
    { label: "URL", value: asset.url },
    { label: "Campaign Name", value: asset.campaignName || asset.name },
    { label: "Product Franchise", value: asset.productFranchise },
    { label: "Product Category", value: asset.productCategory },
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

  const metricRows = [
    { label: "Pageviews", value: asset.pageviewsSum },
    { label: "Avg Time (sec)", value: asset.timeAvg },
    { label: "Downloads", value: asset.downloadsSum },
    { label: "Unique Leads", value: asset.uniqueLeads },
    { label: "SQOs", value: asset.sqoCount },
  ].filter((r) => r.value > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="url-preview-overlay"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="url-preview-modal"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <Badge className={`shrink-0 border ${tone.bg} ${tone.text} ${tone.border}`}>{stage}</Badge>
            <div className="truncate text-sm font-semibold">{asset.contentId}</div>
          </div>
          <div className="flex items-center gap-2">
            {hasUrl && (
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-open-new-tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Details</div>
              <div className="space-y-2">
                {detailRows.map((r) => (
                  <div key={r.label} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-[120px] text-muted-foreground">{r.label}</span>
                    <span className="font-medium break-all">
                      {r.label === "URL" && r.value ? (
                        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {r.value}
                        </a>
                      ) : (
                        r.value
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {metricRows.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Metrics</div>
                <div className="grid grid-cols-2 gap-3">
                  {metricRows.map((m) => (
                    <div key={m.label} className="rounded-xl border bg-secondary/50 p-3">
                      <div className="text-xs text-muted-foreground">{m.label}</div>
                      <div className="mt-1 text-lg font-bold">{formatCompact(m.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {hasUrl ? "Page Preview" : "Preview"}
            </div>
            {hasUrl ? (
              iframeError ? (
                <div className="flex h-[400px] items-center justify-center rounded-xl border bg-muted/20 text-center text-sm text-muted-foreground" data-testid="preview-fallback">
                  <div className="flex flex-col items-center gap-3">
                    <Eye className="h-8 w-8 text-muted-foreground/50" />
                    <p>Preview not available for this page.</p>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in new tab
                    </a>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl border bg-muted/20">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading preview…
                      </div>
                    </div>
                  )}
                  <iframe
                    src={proxyUrl}
                    className="h-[400px] w-full rounded-xl border bg-white"
                    title="URL Preview"
                    onError={() => {
                      setIframeError(true);
                      setLoading(false);
                    }}
                    onLoad={() => setLoading(false)}
                    data-testid="iframe-preview"
                  />
                </div>
              )
            ) : (
              <div className="flex h-[400px] items-center justify-center rounded-xl border bg-muted/20 text-center text-sm text-muted-foreground" data-testid="preview-no-url">
                <div className="flex flex-col items-center gap-3">
                  <Eye className="h-8 w-8 text-muted-foreground/50" />
                  <p>No URL available for this content.</p>
                  <p className="text-xs">Upload data with a URL column to enable page previews.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HoverInsightTooltip({
  asset,
  visible,
  onAsk,
  onCompare,
  onPlan,
}: {
  asset: AssetAgg;
  visible: boolean;
  onAsk: () => void;
  onCompare: () => void;
  onPlan: () => void;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [performance, setPerformance] = useState<string>("neutral");
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (visible && !fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      authFetch(`/api/assets/${encodeURIComponent(asset.contentId)}/insight`)
        .then(res => res.json())
        .then(data => {
          setInsight(data.insight || null);
          setPerformance(data.performance || "neutral");
        })
        .catch(() => {
          setInsight("Unable to load insight.");
          setPerformance("neutral");
        })
        .finally(() => setLoading(false));
    }
  }, [visible, asset.contentId]);

  if (!visible) return null;

  const perfColor =
    performance === "green" ? "bg-emerald-500" :
    performance === "red" ? "bg-red-500" :
    performance === "amber" ? "bg-amber-500" :
    "bg-muted-foreground/30";

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-[220px] animate-in fade-in slide-in-from-bottom-2 duration-200"
      data-testid={`tooltip-insight-${asset.contentId.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <div className="rounded-xl border bg-card/95 backdrop-blur-lg shadow-xl p-3 space-y-2">
        <div className={`h-1 w-full rounded-full ${perfColor}`} data-testid="performance-bar" />

        <div className="min-h-[28px] flex items-start gap-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Analyzing...</span>
            </div>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
              <p className="text-xs text-foreground leading-snug" data-testid="text-insight">
                {insight}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
          <button
            className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); onAsk(); }}
            data-testid="button-ask-ai"
          >
            <MessageCircle className="h-3 w-3" />
            Ask
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); onCompare(); }}
            data-testid="button-compare"
          >
            <GitCompare className="h-3 w-3" />
            Compare
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); onPlan(); }}
            data-testid="button-plan"
          >
            <CalendarPlus className="h-3 w-3" />
            Plan
          </button>
        </div>
      </div>
    </div>
  );
}

interface InlineChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
}

function InlineChatBubble({
  asset,
  stage,
  onClose,
  onEscalate,
}: {
  asset: AssetAgg;
  stage: string;
  onClose: () => void;
  onEscalate: (msgs: InlineChatMsg[]) => void;
}) {
  const [msgs, setMsgs] = useState<InlineChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [convId, setConvId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, streamContent]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const assetContext = `Asset: ${asset.contentId}\nStage: ${stage}\nProduct: ${asset.productFranchise || "N/A"}\nChannel: ${asset.utmChannel || "N/A"}\nPageviews: ${asset.pageviewsSum}\nLeads: ${asset.uniqueLeads}\nSQOs: ${asset.sqoCount}\nAvg Time: ${asset.timeAvg}s`;

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: InlineChatMsg = { id: Date.now(), role: "user", content: text };
    setMsgs(p => [...p, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamContent("");

    try {
      let cid = convId;
      if (!cid) {
        const res = await authFetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `About: ${asset.contentId.slice(0, 40)}`, agent: "librarian" }),
        });
        const conv = await res.json();
        cid = conv.id;
        setConvId(conv.id);
      }

      const fullContent = `[Context about this asset]\n${assetContext}\n\n[User question]\n${text}`;
      const res = await authFetch(`/api/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fullContent }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) { full += data.content; setStreamContent(full); }
                if (data.done) {
                  setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: full }]);
                  setStreamContent("");
                }
                if (data.error) {
                  setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: "Sorry, something went wrong." }]);
                  setStreamContent("");
                }
              } catch {}
            }
          }
        }
      }
    } catch {
      setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: "Connection error. Please try again." }]);
      setStreamContent("");
    } finally {
      setStreaming(false);
    }
  }

  const suggestions = ["How is this performing?", "What could improve?", "Compare to similar assets"];

  return (
    <div
      className="mt-2 rounded-xl border border-[#00D657]/20 overflow-hidden"
      style={{ background: "rgba(10, 20, 15, 0.92)", backdropFilter: "blur(24px)", width: 280 }}
      data-testid={`inline-chat-${asset.contentId.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#00D657]/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="h-4 w-4 rounded-full bg-[#00D657] flex items-center justify-center shrink-0">
            <Sparkles className="h-2.5 w-2.5 text-black" />
          </div>
          <span className="text-[10px] text-white/60 truncate">
            {asset.contentId.slice(0, 25)} — {stage}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            data-testid="btn-expand-inline-chat"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            data-testid="btn-close-inline-chat"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin"
        style={{ height: expanded ? 450 : 300 }}
      >
        {msgs.length === 0 && !streamContent && (
          <div className="space-y-1.5 py-2">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left text-[11px] rounded-lg px-2.5 py-1.5 border border-white/5 bg-white/[0.03] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition"
                data-testid={`suggestion-inline-${s.slice(0, 15).replace(/\s+/g, "-").toLowerCase()}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${msg.role === "user" ? "bg-[#004D4D] text-white" : "bg-white/5 text-white/80 border border-white/5"}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {streamContent && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed bg-white/5 text-white/80 border border-white/5">
              {streamContent}
              <span className="inline-block w-1 h-3 bg-[#00D657] opacity-60 animate-pulse ml-0.5 rounded-sm" />
            </div>
          </div>
        )}
        {streaming && !streamContent && (
          <div className="flex justify-start">
            <div className="rounded-xl px-2.5 py-1.5 bg-white/5 border border-white/5 flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="h-1 w-1 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="h-1 w-1 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        {msgs.some(m => m.role === "assistant") && !streaming && (
          <button
            onClick={() => onEscalate(msgs)}
            className="flex items-center gap-1 text-[10px] text-[#00D657] hover:text-[#00C04E] transition-colors mt-1"
            data-testid="btn-escalate-inline"
          >
            <ArrowRight className="h-3 w-3" />
            Continue in full chat →
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-[#00D657]/10">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); send(input); }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Ask about this asset..."
          className="flex-1 bg-transparent border-none outline-none text-[11px] text-white placeholder:text-white/25"
          disabled={streaming}
          data-testid="input-inline-chat"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="h-6 w-6 rounded-full bg-[#00D657] hover:bg-[#00C04E] text-black flex items-center justify-center disabled:opacity-40 transition-colors shrink-0"
          data-testid="btn-send-inline"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ComparisonPanel({
  assetA,
  stageA,
  assetB,
  stageB,
  onClose,
  onDeepDive,
  onPlanWithWinner,
}: {
  assetA: AssetAgg;
  stageA: string;
  assetB: AssetAgg;
  stageB: string;
  onClose: () => void;
  onDeepDive: () => void;
  onPlanWithWinner: () => void;
}) {
  const [verdict, setVerdict] = useState<string | null>(null);
  const [loadingVerdict, setLoadingVerdict] = useState(true);

  useEffect(() => {
    setLoadingVerdict(true);
    authFetch("/api/assets/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetA, assetB }),
    })
      .then(res => res.json())
      .then(data => setVerdict(data.verdict || "Unable to generate verdict."))
      .catch(() => setVerdict("Unable to generate comparison verdict."))
      .finally(() => setLoadingVerdict(false));
  }, [assetA.contentId, assetB.contentId]);

  const convA = assetA.uniqueLeads > 0 ? ((assetA.sqoCount / assetA.uniqueLeads) * 100).toFixed(1) : "0.0";
  const convB = assetB.uniqueLeads > 0 ? ((assetB.sqoCount / assetB.uniqueLeads) * 100).toFixed(1) : "0.0";

  const rows = [
    { label: "Name", a: assetA.name || assetA.contentId, b: assetB.name || assetB.contentId },
    { label: "Stage", a: stageA, b: stageB },
    { label: "Channel", a: assetA.utmChannel || "—", b: assetB.utmChannel || "—" },
    { label: "Views", a: formatCompact(assetA.pageviewsSum), b: formatCompact(assetB.pageviewsSum), numA: assetA.pageviewsSum, numB: assetB.pageviewsSum },
    { label: "Leads", a: formatCompact(assetA.uniqueLeads), b: formatCompact(assetB.uniqueLeads), numA: assetA.uniqueLeads, numB: assetB.uniqueLeads },
    { label: "SQOs", a: formatCompact(assetA.sqoCount), b: formatCompact(assetB.sqoCount), numA: assetA.sqoCount, numB: assetB.sqoCount },
    { label: "Conv%", a: `${convA}%`, b: `${convB}%`, numA: parseFloat(convA), numB: parseFloat(convB) },
    { label: "Avg Time", a: assetA.timeAvg > 0 ? `${Math.round(assetA.timeAvg)}s` : "0s", b: assetB.timeAvg > 0 ? `${Math.round(assetB.timeAvg)}s` : "0s", numA: assetA.timeAvg, numB: assetB.timeAvg },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="comparison-overlay"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card/95 backdrop-blur-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="comparison-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-bold" data-testid="text-comparison-title">Content Comparison</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={onClose}
            data-testid="button-close-comparison"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-xl border overflow-hidden" data-testid="comparison-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">Metric</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-emerald-500 uppercase tracking-wider">Card 1</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-blue-500 uppercase tracking-wider">Card 2</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isNumeric = row.numA !== undefined && row.numB !== undefined;
                const aWins = isNumeric && row.numA! > row.numB!;
                const bWins = isNumeric && row.numB! > row.numA!;
                return (
                  <tr key={row.label} className={i % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                    <td className="px-4 py-2 text-xs font-medium text-muted-foreground">{row.label}</td>
                    <td className={`px-4 py-2 font-medium ${aWins ? "text-emerald-500" : ""}`} data-testid={`compare-a-${row.label.toLowerCase().replace(/[^a-z]/g, "")}`}>
                      {row.a}
                      {aWins && <span className="ml-1 text-[10px]">&#9650;</span>}
                    </td>
                    <td className={`px-4 py-2 font-medium ${bWins ? "text-emerald-500" : ""}`} data-testid={`compare-b-${row.label.toLowerCase().replace(/[^a-z]/g, "")}`}>
                      {row.b}
                      {bWins && <span className="ml-1 text-[10px]">&#9650;</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border bg-emerald-500/5 p-4" data-testid="comparison-verdict">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">AI Verdict</div>
              {loadingVerdict ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Analyzing comparison...</span>
                </div>
              ) : (
                <p className="text-sm leading-relaxed" data-testid="text-verdict">{verdict}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium h-9"
            onClick={onDeepDive}
            data-testid="button-deep-dive-chat"
          >
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
            Deep dive in chat
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
          <Button
            className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium h-9"
            onClick={onPlanWithWinner}
            data-testid="button-plan-with-winner"
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
            Plan with winner
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
          <Button
            variant="outline"
            className="rounded-xl text-xs font-medium h-9"
            onClick={onClose}
            data-testid="button-close-comparison-bottom"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentStatusIndicator({ status, assetId, assetName }: { status: string | undefined; assetId: string; assetName?: string }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { refreshStatus } = useContext(ContentStatusContext);

  const handleFile = useCallback(async (file: File) => {
    setSelectedFile({ name: file.name, size: file.size });
    setUploadError(null);
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await authFetch("/api/content/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, fileBase64: base64, filename: file.name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(data.message || "Upload failed");
      }
      setPopoverOpen(false);
      setSelectedFile(null);
      refreshStatus();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [assetId, refreshStatus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (status === "success") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 cursor-default"
              data-testid="status-dot-success"
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Content uploaded — preview and analysis available
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === "partial") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="h-2 w-2 rounded-full bg-orange-500 shrink-0 cursor-default"
              data-testid="status-dot-partial"
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Content uploaded — analysis pending or incomplete
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className="relative h-2 w-2 rounded-full border border-muted-foreground/40 bg-transparent shrink-0 cursor-pointer group flex items-center justify-center hover:border-muted-foreground/70 transition-colors"
                onClick={(e) => e.stopPropagation()}
                data-testid="status-dot-empty"
              >
                <Plus className="h-1.5 w-1.5 text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors" strokeWidth={3} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Content not uploaded — click to add
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[260px] p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-semibold truncate" data-testid="upload-popover-title">
          {assetName || assetId}
        </div>
        {uploading && selectedFile ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <div className="text-[11px] font-medium truncate max-w-full">{selectedFile.name}</div>
            <div className="text-[10px] text-muted-foreground">{formatFileSize(selectedFile.size)} — Uploading and analyzing...</div>
          </div>
        ) : (
          <div
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors cursor-pointer ${
              dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-muted-foreground/20 hover:border-muted-foreground/40"
            }`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="upload-popover-dropzone"
          >
            <Upload className="h-5 w-5 text-muted-foreground/50" />
            <div className="text-[11px] text-muted-foreground text-center">
              Drag & drop or browse
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              PDF, DOCX, PPTX, images
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
              data-testid="upload-popover-file-input"
            />
          </div>
        )}
        {uploadError && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5">
            <span className="text-[11px] text-red-400 truncate">{uploadError}</span>
            <button
              className="text-[10px] font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
              onClick={(e) => { e.stopPropagation(); setUploadError(null); fileInputRef.current?.click(); }}
              data-testid="button-try-again"
            >
              Try again
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ContentCard({
  asset,
  stage,
  search,
  inlineChatActive,
  onOpenInlineChat,
  onCloseInlineChat,
}: {
  asset: AssetAgg;
  stage: string;
  search?: string;
  inlineChatActive: boolean;
  onOpenInlineChat: (assetId: string) => void;
  onCloseInlineChat: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, navigate] = useLocation();
  const tone = stageTones[stage] || stageTones.TOFU;
  const { compareMode, selectedCard, onCompareSelect } = useContext(CompareContext);
  const { statusMap } = useContext(ContentStatusContext);
  const contentStatus = statusMap[asset.contentId];

  const isSelectedForCompare = selectedCard?.asset.contentId === asset.contentId;

  const { primary: readableName, showId: showIdBelow } = deriveReadableName(asset.contentId, asset);

  const allTags = [
    asset.utmChannel,
    asset.productFranchise,
    asset.productCategory,
    asset.objective,
    asset.utmMedium && `Medium: ${asset.utmMedium}`,
  ].filter(Boolean) as string[];
  const tags = allTags.slice(0, 3);

  const handleCardClick = () => {
    if (compareMode && !isSelectedForCompare) {
      onCompareSelect(asset, stage);
      return;
    }
  };

  const metrics: { label: string; value: string }[] = [];
  if (stage === "TOFU") {
    metrics.push({ label: "Views", value: formatCompact(asset.pageviewsSum) });
    metrics.push({ label: "Avg time", value: asset.timeAvg > 0 ? `${Math.round(asset.timeAvg / 60)}m` : "0m" });
    if (asset.downloadsSum > 0) metrics.push({ label: "Downloads", value: formatCompact(asset.downloadsSum) });
  } else if (stage === "MOFU") {
    metrics.push({ label: "Leads", value: formatCompact(asset.uniqueLeads) });
    metrics.push({ label: "Views", value: formatCompact(asset.pageviewsSum) });
    if (asset.downloadsSum > 0) metrics.push({ label: "Downloads", value: formatCompact(asset.downloadsSum) });
  } else if (stage === "BOFU") {
    metrics.push({ label: "SQOs", value: formatCompact(asset.sqoCount) });
    metrics.push({ label: "Leads", value: formatCompact(asset.uniqueLeads) });
    metrics.push({ label: "Views", value: formatCompact(asset.pageviewsSum) });
  } else {
    metrics.push({ label: "Views", value: formatCompact(asset.pageviewsSum) });
    metrics.push({ label: "Leads", value: formatCompact(asset.uniqueLeads) });
  }

  return (
    <>
      <div
        className="w-[220px] h-[210px] shrink-0 relative flex flex-col"
        style={{ paddingTop: 4, paddingBottom: 4 }}
        onMouseEnter={() => {
          setHovered(true);
          if (!compareMode) {
            hoverTimerRef.current = setTimeout(() => setShowTooltip(true), 1500);
          }
        }}
        onMouseLeave={() => {
          setHovered(false);
          setShowTooltip(false);
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        }}
      >
        {isSelectedForCompare && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-bold text-white shadow-lg" data-testid="badge-card-selected">
            Card 1 selected
          </div>
        )}
        {compareMode && !isSelectedForCompare && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 rounded-full bg-blue-500/80 px-3 py-0.5 text-[10px] font-bold text-white shadow-lg" data-testid="badge-select-card-2">
            Click to compare
          </div>
        )}
        <Card
          className={`flex h-full flex-col overflow-hidden rounded-xl border backdrop-blur ${compareMode && !isSelectedForCompare ? "cursor-pointer" : ""}`}
          style={{
            transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
            transform: hovered ? "translateY(-3px)" : "translateY(0)",
            borderLeft: `3px solid ${tone.accent}`,
            boxShadow: isSelectedForCompare
              ? "0 0 0 2px rgba(16, 185, 129, 0.6), 0 0 20px rgba(16, 185, 129, 0.2)"
              : hovered
              ? "0 8px 20px -5px rgba(0,0,0,0.15), 0 3px 8px -4px rgba(0,0,0,0.1)"
              : "0 1px 3px 0 rgba(0,0,0,0.06)",
            borderColor: isSelectedForCompare
              ? "rgb(16, 185, 129)"
              : hovered ? "hsl(var(--primary) / 0.35)" : undefined,
            borderLeftColor: tone.accent,
            background: hovered ? "hsl(var(--card))" : "hsl(var(--card) / 0.7)",
            animation: isSelectedForCompare ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : undefined,
          }}
          onClick={handleCardClick}
          data-testid={`card-asset-${asset.contentId.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <div className="px-3 pt-2.5 pb-0">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1">
                <button
                  className="block w-full text-left text-[13px] font-semibold leading-tight text-foreground cursor-pointer line-clamp-2"
                  style={{
                    transition: "color 0.15s ease",
                    color: hovered ? "hsl(var(--primary))" : undefined,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                  title={`${asset.contentId} — click to view details${asset.url ? " & preview" : ""}`}
                  onClick={(e) => {
                    if (compareMode) { e.preventDefault(); return; }
                    setShowDetail(true);
                  }}
                  data-testid="card-title"
                >
                  {readableName}
                </button>
                {showIdBelow && (
                  <div
                    className="mt-0.5 truncate text-[10px] text-muted-foreground/60 font-mono"
                    title={asset.contentId}
                    data-testid="card-secondary"
                  >
                    {asset.contentId}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <ContentStatusIndicator status={contentStatus?.fetchStatus} assetId={asset.contentId} assetName={asset.name || asset.contentId} />
                <Badge
                  className={`border text-[9px] px-1.5 py-0 ${tone.bg} ${tone.text} ${tone.border}`}
                  data-testid="card-stage-badge"
                >
                  {stage}
                </Badge>
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="px-3 mt-1 flex flex-wrap gap-0.5 overflow-hidden max-h-[18px]" data-testid="card-tags">
              {tags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="max-w-[90px] truncate rounded px-1 py-0 text-[9px] text-muted-foreground/80 bg-muted/40"
                  title={t}
                >
                  {t}
                </span>
              ))}
              {allTags.length > 3 && (
                <span
                  className="rounded px-1 py-0 text-[9px] text-muted-foreground/60 bg-muted/40"
                  title={allTags.slice(3).join(", ")}
                >
                  +{allTags.length - 3}
                </span>
              )}
            </div>
          )}

          {asset.utmCampaign && (
            <div
              className="px-3 mt-0.5 truncate text-[9px] text-muted-foreground/60"
              title={asset.utmCampaign}
              data-testid="card-campaign"
            >
              Campaign: {asset.utmCampaign}
            </div>
          )}

          <div className="mx-3 my-1.5 h-px bg-border/50" />

          <div className="px-3 pb-2" data-testid="card-metrics">
            <div className={`grid gap-1 text-[11px] ${metrics.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {metrics.map((m) => (
                <div key={m.label} className="text-center">
                  <div className="text-muted-foreground/70 text-[9px] leading-none">{m.label}</div>
                  <div className="font-bold text-[13px] leading-tight">{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {contentStatus && (contentStatus.fetchStatus === "success" || contentStatus.fetchStatus === "partial") && (contentStatus.dateStored || contentStatus.dateLastUpdated) && (
            <div className="px-3 pb-1 text-[10px]" style={{ color: "#888888" }} data-testid="card-upload-date">
              {contentStatus.dateLastUpdated && contentStatus.dateStored && contentStatus.dateLastUpdated !== contentStatus.dateStored
                ? `Updated: ${formatUploadDate(contentStatus.dateLastUpdated)}${contentStatus.uploadedByName ? ` by ${contentStatus.uploadedByName}` : ""}`
                : contentStatus.dateStored
                  ? `Uploaded: ${formatUploadDate(contentStatus.dateStored)}${contentStatus.uploadedByName ? ` by ${contentStatus.uploadedByName}` : ""}`
                  : null}
            </div>
          )}

          {contentStatus && contentStatus.fetchStatus === "success" && contentStatus.contentSummary && (
            <div className="px-3 pb-2 space-y-1" data-testid="card-content-preview">
              <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2" data-testid="card-content-summary">
                {contentStatus.contentSummary}
              </div>
              {contentStatus.keywordTags && (() => {
                const t = contentStatus.keywordTags;
                const allTagsTyped: { tag: string; type: "topic" | "audience" | "intent" | "user" }[] = [
                  ...t.topic_tags.map(tag => ({ tag, type: "topic" as const })),
                  ...t.audience_tags.map(tag => ({ tag, type: "audience" as const })),
                  ...t.intent_tags.map(tag => ({ tag, type: "intent" as const })),
                  ...t.user_added_tags.map(tag => ({ tag, type: "user" as const })),
                ];
                if (allTagsTyped.length === 0) return null;
                const tagStyles = {
                  topic: "bg-[#006362] text-white border-[#006362]/60",
                  audience: "bg-[#00A65C] text-white border-[#00A65C]/60",
                  intent: "bg-transparent text-[#00D657] border-[#00D657]/60",
                  user: "bg-purple-500/15 text-purple-300 border-purple-500/30",
                };
                const tagTypeLabels = { topic: "Topic", audience: "Audience", intent: "Intent", user: "Custom" };
                const searchLower = search?.toLowerCase() || "";
                const matchingTags = searchLower
                  ? allTagsTyped.filter((item) => item.tag.toLowerCase().includes(searchLower))
                  : [];
                const sortedTags = searchLower
                  ? [...allTagsTyped].sort((a, b) => {
                      const aMatch = a.tag.toLowerCase().includes(searchLower) ? -1 : 0;
                      const bMatch = b.tag.toLowerCase().includes(searchLower) ? -1 : 0;
                      return aMatch - bMatch;
                    })
                  : allTagsTyped;
                const visible = sortedTags.slice(0, 4);
                const overflow = allTagsTyped.length - 4;
                return (
                  <div data-testid="card-keyword-tags">
                    {matchingTags.length > 0 && (
                      <div className="text-[8px] text-[#00D657]/80 mb-0.5" data-testid="text-tag-match">
                        Matched: {tagTypeLabels[matchingTags[0].type]} — {matchingTags[0].tag}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-0.5">
                      {visible.map((item, i) => {
                        const isMatch = searchLower && item.tag.toLowerCase().includes(searchLower);
                        return (
                          <Badge
                            key={i}
                            variant="outline"
                            className={`rounded-full text-[7px] px-1 py-0 font-medium border ${tagStyles[item.type]} ${
                              isMatch ? "ring-1 ring-[#00D657] shadow-[0_0_6px_rgba(0,214,87,0.4)]" : ""
                            }`}
                          >
                            {item.tag}
                          </Badge>
                        );
                      })}
                      {overflow > 0 && (
                        <span className="text-[7px] text-muted-foreground self-center">+{overflow}</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </Card>
        <HoverInsightTooltip
          asset={asset}
          visible={showTooltip && !compareMode}
          onAsk={() => {
            setShowTooltip(false);
            onOpenInlineChat(asset.contentId);
          }}
          onCompare={() => {
            setShowTooltip(false);
            onCompareSelect(asset, stage);
          }}
          onPlan={() => {
            setShowTooltip(false);
            navigate("/campaign-planner");
          }}
        />
        {inlineChatActive && (
          <InlineChatBubble
            asset={asset}
            stage={stage}
            onClose={onCloseInlineChat}
            onEscalate={(msgs) => {
              onCloseInlineChat();
              window.dispatchEvent(new CustomEvent("open-full-chat", {
                detail: { asset, stage, messages: msgs },
              }));
            }}
          />
        )}
      </div>

      {showDetail && (
        <ContentPreviewPanel asset={asset} stage={stage} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

interface Filters {
  product: string;
  channel: string;
  campaign: string;
  industry: string;
  contentAvailability: string;
}

function StageCarousel({
  stage,
  search,
  filters,
  tagFilter,
  activeInlineChatId,
  onOpenInlineChat,
  onCloseInlineChat,
}: {
  stage: "TOFU" | "MOFU" | "BOFU" | "UNKNOWN";
  search: string;
  filters: Filters;
  tagFilter?: string[];
  activeInlineChatId: string | null;
  onOpenInlineChat: (assetId: string) => void;
  onCloseInlineChat: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tone = stageTones[stage];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["/api/assets", stage, search, filters, tagFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        stage,
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (search) params.set("search", search);
      if (filters.product) params.set("product", filters.product);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.campaign) params.set("campaign", filters.campaign);
      if (filters.industry) params.set("industry", filters.industry);
      if (filters.contentAvailability) params.set("contentAvailability", filters.contentAvailability);
      if (tagFilter && tagFilter.length > 0) params.set("tagFilter", tagFilter.join(","));
      const res = await authFetch(`/api/assets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json() as Promise<{ data: AssetAgg[]; total: number }>;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.data.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "0px 200px 0px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const scroll = useCallback((dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -300 : 300,
      behavior: "smooth",
    });
  }, []);

  const allCards = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  if (stage === "UNKNOWN" && total === 0 && !isLoading) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={`carousel-${stage.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={`border ${tone.bg} ${tone.text} ${tone.border}`}>
            {stage}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {total} asset{total !== 1 ? "s" : ""}
            <span className="mx-1.5 opacity-40">·</span>
            {stage === "TOFU" ? "Awareness metrics" : stage === "MOFU" ? "Engagement metrics" : stage === "BOFU" ? "Conversion metrics" : "General metrics"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => scroll("left")}
            data-testid={`button-scroll-left-${stage.toLowerCase()}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => scroll("right")}
            data-testid={`button-scroll-right-${stage.toLowerCase()}`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex items-stretch gap-2 overflow-x-auto pt-2 pb-3 scrollbar-thin"
        style={{ scrollSnapType: "x mandatory", maxWidth: "100%" }}
        data-testid={`scroll-lane-${stage.toLowerCase()}`}
      >
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[210px] w-[220px] shrink-0 animate-pulse rounded-xl border bg-muted/30"
              data-testid={`skeleton-${stage.toLowerCase()}-${i}`}
            />
          ))}

        {!isLoading && allCards.length === 0 && (
          <div
            className="flex h-[140px] w-full items-center justify-center text-sm text-muted-foreground"
            data-testid={`empty-${stage.toLowerCase()}`}
          >
            No {stage} content found{search ? ` for "${search}"` : ""}.
          </div>
        )}

        {allCards.map((asset) => (
          <ContentCard
            key={asset.id}
            asset={asset}
            stage={stage}
            search={search}
            inlineChatActive={activeInlineChatId === asset.contentId}
            onOpenInlineChat={onOpenInlineChat}
            onCloseInlineChat={onCloseInlineChat}
          />
        ))}

        {isFetchingNextPage &&
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={`loading-${i}`}
              className="h-[210px] w-[220px] shrink-0 animate-pulse rounded-xl border bg-muted/30"
            />
          ))}

        <div ref={sentinelRef} className="h-1 w-1 shrink-0" />
      </div>
    </div>
  );
}

export default function ContentLibrary() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, navigate] = useLocation();
  const [activeInlineChatId, setActiveInlineChatId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ product: "", channel: "", campaign: "", industry: "", contentAvailability: "" });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagTypeFilter, setTagTypeFilter] = useState<"all" | "topic" | "audience" | "intent">("all");
  const [tagExplorerOpen, setTagExplorerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagShowAll, setTagShowAll] = useState(false);
  const qc = useQueryClient();

  const { data: contentStatusMap } = useQuery<ContentStatusMap>({
    queryKey: ["/api/content/status"],
    queryFn: async () => {
      const res = await authFetch("/api/content/status");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: coverageData } = useQuery<Record<string, { total: number; withContent: number }>>({
    queryKey: ["/api/content/coverage"],
    queryFn: async () => {
      const res = await authFetch("/api/content/coverage");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
  });

  const refreshContentStatus = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/content/status"] });
    qc.invalidateQueries({ queryKey: ["/api/content/coverage"] });
  }, [qc]);

  const contentStatusCtx = {
    statusMap: contentStatusMap || {},
    refreshStatus: refreshContentStatus,
  };

  const { data: filterOptions } = useQuery({
    queryKey: ["/api/assets/filter-options"],
    queryFn: async () => {
      const res = await authFetch("/api/assets/filter-options");
      if (!res.ok) throw new Error("Failed to fetch filter options");
      return res.json() as Promise<{ products: string[]; channels: string[]; campaigns: string[]; industries: string[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tagSummary } = useQuery<{
    topic_tags: Record<string, number>;
    audience_tags: Record<string, number>;
    intent_tags: Record<string, number>;
    user_added_tags: Record<string, number>;
    total_assets_with_tags: number;
    total_assets: number;
  }>({
    queryKey: ["/api/tags/summary"],
    queryFn: async () => {
      const res = await authFetch("/api/tags/summary");
      if (!res.ok) return { topic_tags: {}, audience_tags: {}, intent_tags: {}, user_added_tags: {}, total_assets_with_tags: 0, total_assets: 0 };
      return res.json();
    },
    staleTime: 60_000,
  });

  const activeFilterCount = Object.values(filters).filter(Boolean).length + selectedTags.length;

  const clearFilters = useCallback(() => {
    setFilters({ product: "", channel: "", campaign: "", industry: "", contentAvailability: "" });
    setSelectedTags([]);
    setTagTypeFilter("all");
  }, []);

  const [compareMode, setCompareMode] = useState(false);
  const [selectedCard, setSelectedCard] = useState<{ asset: AssetAgg; stage: string } | null>(null);
  const [comparisonPair, setComparisonPair] = useState<{ a: { asset: AssetAgg; stage: string }; b: { asset: AssetAgg; stage: string } } | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, 300);
  }, []);

  const handleCompareSelect = useCallback((asset: AssetAgg, stage: string) => {
    setActiveInlineChatId(null);
    if (!selectedCard) {
      setSelectedCard({ asset, stage });
      setCompareMode(true);
    } else {
      if (selectedCard.asset.contentId === asset.contentId) return;
      setComparisonPair({
        a: selectedCard,
        b: { asset, stage },
      });
      setCompareMode(false);
      setSelectedCard(null);
    }
  }, [selectedCard]);

  const cancelCompare = useCallback(() => {
    setCompareMode(false);
    setSelectedCard(null);
  }, []);

  const closeComparison = useCallback(() => {
    setComparisonPair(null);
  }, []);

  const compareCtx: CompareContextType = {
    compareMode,
    selectedCard,
    onCompareSelect: handleCompareSelect,
    cancelCompare,
  };

  return (
    <ContentStatusContext.Provider value={contentStatusCtx}>
    <CompareContext.Provider value={compareCtx}>
      <div className="flex min-w-0 flex-col gap-4" data-testid="content-library">
        <Card className="sticky top-14 z-10 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by Content ID…"
                className="h-9 rounded-xl pl-9 pr-9"
                data-testid="input-content-search"
              />
              {search && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                  data-testid="button-clear-content-search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
              size="sm"
              className={`h-9 gap-1.5 rounded-xl text-xs ${activeFilterCount > 0 ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
              onClick={() => setShowFilters((p) => !p)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="ml-0.5 h-4 min-w-4 rounded-full bg-white/20 px-1 text-[10px] text-white" data-testid="badge-active-filters">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
            )}
            {compareMode && (
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <GitCompare className="h-3.5 w-3.5" />
                  <span data-testid="text-compare-mode">Select a second card to compare</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  onClick={cancelCompare}
                  data-testid="button-cancel-compare"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {showFilters && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="filter-panel">
              <Select value={filters.product} onValueChange={(v) => setFilters((f) => ({ ...f, product: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-filter-product">
                  <SelectValue placeholder="Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Products</SelectItem>
                  {filterOptions?.products.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.campaign} onValueChange={(v) => setFilters((f) => ({ ...f, campaign: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-filter-campaign">
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Campaigns</SelectItem>
                  {filterOptions?.campaigns.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.channel} onValueChange={(v) => setFilters((f) => ({ ...f, channel: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-filter-channel">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Channels</SelectItem>
                  {filterOptions?.channels.map((ch) => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.industry} onValueChange={(v) => setFilters((f) => ({ ...f, industry: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-filter-industry">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Industries</SelectItem>
                  {filterOptions?.industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.contentAvailability} onValueChange={(v) => setFilters((f) => ({ ...f, contentAvailability: v === "__all__" ? "" : v }))}>
                <SelectTrigger className="h-9 rounded-xl text-xs" data-testid="select-filter-content">
                  <SelectValue placeholder="Content status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All assets</SelectItem>
                  <SelectItem value="with_content">With content</SelectItem>
                  <SelectItem value="without_content">Without content</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Card>

        {coverageData && (Object.keys(coverageData).length > 0) && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1" data-testid="text-coverage-summary">
            <span className="font-medium text-foreground/70">Content uploaded:</span>
            {(["TOFU", "MOFU", "BOFU"] as const).map((s) => {
              const c = coverageData[s];
              if (!c) return null;
              return (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="font-medium">{s}</span>
                  <span>{c.withContent} of {c.total}</span>
                  {c.total > 0 && (
                    <span className="inline-block h-2 w-14 rounded-full bg-muted overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round((c.withContent / c.total) * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {tagSummary && Object.keys(tagSummary.topic_tags).length + Object.keys(tagSummary.audience_tags).length + Object.keys(tagSummary.intent_tags).length + Object.keys(tagSummary.user_added_tags).length > 0 && (
          <Card className="rounded-2xl border bg-card/80 shadow-sm overflow-hidden" data-testid="tag-filter-bar">
            <button
              onClick={() => { setTagExplorerOpen((v) => !v); setTagSearch(""); setTagShowAll(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors"
              data-testid="button-toggle-tag-explorer"
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Tag Explorer</span>
              <span className="text-[10px] text-muted-foreground">
                {tagSummary.total_assets_with_tags} of {tagSummary.total_assets} assets tagged
              </span>
              {selectedTags.length > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#00D657]/20 text-[#00D657] text-[10px] font-medium">
                  {selectedTags.length} active
                </span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${tagExplorerOpen ? "rotate-180" : ""}`} />
            </button>

            {selectedTags.length > 0 && !tagExplorerOpen && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5" data-testid="tag-active-collapsed">
                {(() => {
                  const tagStyles: Record<string, { bg: string; text: string; border: string }> = {
                    topic: { bg: "bg-[#006362]", text: "text-white", border: "border-[#006362]/60" },
                    audience: { bg: "bg-[#00A65C]", text: "text-white", border: "border-[#00A65C]/60" },
                    intent: { bg: "bg-[#00D657]/20", text: "text-[#00D657]", border: "border-[#00D657]/60" },
                    user: { bg: "bg-purple-500/30", text: "text-purple-300", border: "border-purple-500/30" },
                  };
                  return selectedTags.map((tag) => {
                    const type = tagSummary.topic_tags[tag] ? "topic" : tagSummary.audience_tags[tag] ? "audience" : tagSummary.intent_tags[tag] ? "intent" : "user";
                    const s = tagStyles[type];
                    return (
                      <button
                        key={tag}
                        onClick={(e) => { e.stopPropagation(); setSelectedTags((prev) => prev.filter((t) => t !== tag)); }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${s.bg} ${s.text} ${s.border} ring-1 ring-[#00D657]/40`}
                        data-testid={`button-active-tag-${tag}`}
                      >
                        {tag}
                        <X className="h-2.5 w-2.5 opacity-60" />
                      </button>
                    );
                  });
                })()}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedTags([]); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1.5"
                  data-testid="button-clear-tags"
                >
                  Clear all
                </button>
              </div>
            )}

            {tagExplorerOpen && (
              <div className="px-3 pb-3 space-y-2.5 border-t border-border/20 pt-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={tagSearch}
                      onChange={(e) => { setTagSearch(e.target.value); setTagShowAll(false); }}
                      placeholder="Search tags..."
                      className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border border-border/40 text-xs focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                      data-testid="input-tag-search"
                    />
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap"
                      data-testid="button-clear-tags"
                    >
                      Clear {selectedTags.length} tag{selectedTags.length > 1 ? "s" : ""}
                    </button>
                  )}
                </div>

                <div className="flex gap-1">
                  {(["all", "topic", "audience", "intent"] as const).map((t) => {
                    const count = t === "all"
                      ? Object.keys(tagSummary.topic_tags).length + Object.keys(tagSummary.audience_tags).length + Object.keys(tagSummary.intent_tags).length + Object.keys(tagSummary.user_added_tags).length
                      : t === "topic" ? Object.keys(tagSummary.topic_tags).length
                      : t === "audience" ? Object.keys(tagSummary.audience_tags).length
                      : Object.keys(tagSummary.intent_tags).length;
                    return (
                      <button
                        key={t}
                        onClick={() => { setTagTypeFilter(t); setTagShowAll(false); }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                          tagTypeFilter === t
                            ? "bg-[#00D657] text-black"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                        data-testid={`button-tag-type-${t}`}
                      >
                        {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                        <span className="ml-1 opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedTags.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-medium">Active filters</span>
                    <div className="flex flex-wrap gap-1.5" data-testid="tag-active-expanded">
                      {(() => {
                        const tagStyles: Record<string, { bg: string; text: string; border: string }> = {
                          topic: { bg: "bg-[#006362]", text: "text-white", border: "border-[#006362]/60" },
                          audience: { bg: "bg-[#00A65C]", text: "text-white", border: "border-[#00A65C]/60" },
                          intent: { bg: "bg-[#00D657]/20", text: "text-[#00D657]", border: "border-[#00D657]/60" },
                          user: { bg: "bg-purple-500/30", text: "text-purple-300", border: "border-purple-500/30" },
                        };
                        return selectedTags.map((tag) => {
                          const type = tagSummary.topic_tags[tag] ? "topic" : tagSummary.audience_tags[tag] ? "audience" : tagSummary.intent_tags[tag] ? "intent" : "user";
                          const s = tagStyles[type];
                          return (
                            <button
                              key={tag}
                              onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${s.bg} ${s.text} ${s.border} ring-1 ring-[#00D657]/40`}
                              data-testid={`button-active-tag-${tag}`}
                            >
                              {tag}
                              <X className="h-2.5 w-2.5 opacity-60" />
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto" data-testid="tag-filter-pills">
                  {(() => {
                    const tagStyles: Record<string, { bg: string; activeBg: string; text: string; border: string }> = {
                      topic: { bg: "bg-[#006362]/60", activeBg: "bg-[#006362]", text: "text-white", border: "border-[#006362]/60" },
                      audience: { bg: "bg-[#00A65C]/60", activeBg: "bg-[#00A65C]", text: "text-white", border: "border-[#00A65C]/60" },
                      intent: { bg: "bg-transparent", activeBg: "bg-[#00D657]/20", text: "text-[#00D657]", border: "border-[#00D657]/60" },
                      user: { bg: "bg-purple-500/15", activeBg: "bg-purple-500/30", text: "text-purple-300", border: "border-purple-500/30" },
                    };
                    const entries: { tag: string; count: number; type: "topic" | "audience" | "intent" | "user" }[] = [];
                    if (tagTypeFilter === "all" || tagTypeFilter === "topic") {
                      Object.entries(tagSummary.topic_tags).forEach(([tag, count]) => entries.push({ tag, count, type: "topic" }));
                    }
                    if (tagTypeFilter === "all" || tagTypeFilter === "audience") {
                      Object.entries(tagSummary.audience_tags).forEach(([tag, count]) => entries.push({ tag, count, type: "audience" }));
                    }
                    if (tagTypeFilter === "all" || tagTypeFilter === "intent") {
                      Object.entries(tagSummary.intent_tags).forEach(([tag, count]) => entries.push({ tag, count, type: "intent" }));
                    }
                    if (tagTypeFilter === "all") {
                      Object.entries(tagSummary.user_added_tags).forEach(([tag, count]) => entries.push({ tag, count, type: "user" }));
                    }

                    const searchLower = tagSearch.toLowerCase().trim();
                    const filtered = searchLower
                      ? entries.filter((item) => item.tag.toLowerCase().includes(searchLower))
                      : entries;
                    filtered.sort((a, b) => b.count - a.count);

                    const VISIBLE_LIMIT = 15;
                    const visible = tagShowAll ? filtered : filtered.slice(0, VISIBLE_LIMIT);
                    const hasMore = filtered.length > VISIBLE_LIMIT && !tagShowAll;

                    if (filtered.length === 0) {
                      return (
                        <span className="text-[11px] text-muted-foreground py-2">
                          {searchLower ? `No tags matching "${tagSearch}"` : "No tags in this category"}
                        </span>
                      );
                    }

                    return (
                      <>
                        {visible.map((item) => {
                          const isActive = selectedTags.includes(item.tag);
                          const s = tagStyles[item.type];
                          return (
                            <button
                              key={`${item.type}-${item.tag}`}
                              onClick={() => {
                                setSelectedTags((prev) =>
                                  prev.includes(item.tag)
                                    ? prev.filter((t) => t !== item.tag)
                                    : [...prev, item.tag]
                                );
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                                isActive
                                  ? `${s.activeBg} ${s.text} ${s.border} ring-1 ring-[#00D657]/40`
                                  : `${s.bg} ${s.text} ${s.border} opacity-70 hover:opacity-100`
                              }`}
                              data-testid={`button-tag-${item.type}-${item.tag}`}
                            >
                              {item.tag}
                              <span className="opacity-60">×{item.count}</span>
                            </button>
                          );
                        })}
                        {hasMore && (
                          <button
                            onClick={() => setTagShowAll(true)}
                            className="text-[10px] text-[#00D657] hover:text-[#00C04E] font-medium px-2 py-0.5"
                            data-testid="button-show-more-tags"
                          >
                            +{filtered.length - VISIBLE_LIMIT} more
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </Card>
        )}

        <StageCarousel stage="TOFU" search={debouncedSearch} filters={filters} tagFilter={selectedTags.length > 0 ? selectedTags : undefined} activeInlineChatId={activeInlineChatId} onOpenInlineChat={setActiveInlineChatId} onCloseInlineChat={() => setActiveInlineChatId(null)} />
        <StageCarousel stage="MOFU" search={debouncedSearch} filters={filters} tagFilter={selectedTags.length > 0 ? selectedTags : undefined} activeInlineChatId={activeInlineChatId} onOpenInlineChat={setActiveInlineChatId} onCloseInlineChat={() => setActiveInlineChatId(null)} />
        <StageCarousel stage="BOFU" search={debouncedSearch} filters={filters} tagFilter={selectedTags.length > 0 ? selectedTags : undefined} activeInlineChatId={activeInlineChatId} onOpenInlineChat={setActiveInlineChatId} onCloseInlineChat={() => setActiveInlineChatId(null)} />
        <StageCarousel stage="UNKNOWN" search={debouncedSearch} filters={filters} tagFilter={selectedTags.length > 0 ? selectedTags : undefined} activeInlineChatId={activeInlineChatId} onOpenInlineChat={setActiveInlineChatId} onCloseInlineChat={() => setActiveInlineChatId(null)} />
      </div>

      {comparisonPair && (
        <ComparisonPanel
          assetA={comparisonPair.a.asset}
          stageA={comparisonPair.a.stage}
          assetB={comparisonPair.b.asset}
          stageB={comparisonPair.b.stage}
          onClose={closeComparison}
          onDeepDive={() => {
            closeComparison();
            navigate("/hub");
          }}
          onPlanWithWinner={() => {
            closeComparison();
            navigate("/campaign-planner");
          }}
        />
      )}
    </CompareContext.Provider>
    </ContentStatusContext.Provider>
    
  );
}
