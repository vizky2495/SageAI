import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  SALES_FEEDBACK_TAGS,
  POSITIVE_TAGS,
  NEGATIVE_TAGS,
} from "@shared/schema";
import {
  MessageSquarePlus,
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  ExternalLink,
  CheckCircle2,
  X,
} from "lucide-react";

interface FeedbackEntry {
  id: number;
  contentId: string;
  author: string;
  tags: string[];
  note: string | null;
  salesforceRef: string | null;
  createdAt: string;
}

interface FeedbackStats {
  totalCount: number;
  tagCounts: Record<string, number>;
  sentimentScore: number;
}

function SentimentDot({ score, count }: { score: number; count: number }) {
  if (count === 0) return null;
  const color =
    score > 0.2
      ? "bg-emerald-500"
      : score < -0.2
        ? "bg-red-500"
        : "bg-amber-500";
  const label =
    score > 0.2 ? "Mostly positive" : score < -0.2 ? "Mostly negative" : "Mixed";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="sentiment-indicator">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function TagPill({
  tag,
  count,
}: {
  tag: string;
  count: number;
}) {
  const isPositive = POSITIVE_TAGS.has(tag);
  const isNegative = NEGATIVE_TAGS.has(tag);
  const pillClass = isPositive
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : isNegative
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : "bg-secondary text-foreground/70 border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${pillClass}`}
    >
      {tag}
      <span className="opacity-60">×{count}</span>
    </span>
  );
}

function SelectableTag({
  tag,
  selected,
  onToggle,
}: {
  tag: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const isPositive = POSITIVE_TAGS.has(tag);
  const isNegative = NEGATIVE_TAGS.has(tag);
  const base = selected
    ? isPositive
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30"
      : isNegative
        ? "bg-red-500/20 text-red-300 border-red-500/40 ring-1 ring-red-500/30"
        : "bg-primary/20 text-primary border-primary/40 ring-1 ring-primary/30"
    : "bg-secondary/50 text-foreground/60 border-border hover:bg-secondary hover:text-foreground/80";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-xs transition-all cursor-pointer ${base}`}
      data-testid={`tag-${tag.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {tag}
    </button>
  );
}

function FeedbackForm({
  contentId,
  onSuccess,
  compact = false,
}: {
  contentId: string;
  onSuccess: () => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [salesforceRef, setSalesforceRef] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const getAuthorName = () => {
    if (user) {
      const name = `${user.firstName} ${user.lastName}`.trim() || user.displayName;
      if (name) {
        try { localStorage.setItem("cia-feedback-author", name); } catch {}
        return name;
      }
    }
    try { return localStorage.getItem("cia-feedback-author") || "Unknown"; } catch { return "Unknown"; }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/sales-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          author: getAuthorName(),
          tags: selectedTags,
          note: note.trim() || null,
          salesforceRef: salesforceRef.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      setSelectedTags([]);
      setNote("");
      setSalesforceRef("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
      onSuccess();
    },
  });

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" data-testid="feedback-success">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-sm text-emerald-300 font-medium">Feedback submitted</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 rounded-xl border border-border/60 bg-secondary/20 ${compact ? "p-2.5" : "p-3"}`} data-testid="sales-feedback-form">
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Prospect Reaction
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SALES_FEEDBACK_TAGS.prospect_reaction.map((tag) => (
            <SelectableTag
              key={tag}
              tag={tag}
              selected={selectedTags.includes(tag)}
              onToggle={() => toggleTag(tag)}
            />
          ))}
        </div>
      </div>

      {!compact && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Content Quality
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SALES_FEEDBACK_TAGS.content_quality.map((tag) => (
              <SelectableTag
                key={tag}
                tag={tag}
                selected={selectedTags.includes(tag)}
                onToggle={() => toggleTag(tag)}
              />
            ))}
          </div>
        </div>
      )}

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did the prospect say or how did they react?"
        className={`text-sm resize-none bg-background/50 ${compact ? "min-h-[40px]" : "min-h-[60px]"}`}
        data-testid="input-feedback-note"
      />

      {!compact && (
        <Input
          value={salesforceRef}
          onChange={(e) => setSalesforceRef(e.target.value)}
          placeholder="Opportunity or lead name (optional)"
          className="text-sm bg-background/50"
          data-testid="input-salesforce-ref"
        />
      )}

      <Button
        size="sm"
        onClick={() => submitMutation.mutate()}
        disabled={selectedTags.length === 0 || submitMutation.isPending}
        className="w-full gap-1.5"
        data-testid="button-submit-feedback"
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-3.5 w-3.5" />
            Submit Feedback
          </>
        )}
      </Button>

      {submitMutation.error && (
        <div className="text-xs text-red-400">
          {(submitMutation.error as Error).message}
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FeedbackEntry({ entry }: { entry: FeedbackEntry }) {
  return (
    <div
      className="rounded-lg border border-border/40 bg-secondary/10 p-2.5 space-y-1.5"
      data-testid={`feedback-entry-${entry.id}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/90">
          {entry.author}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatRelativeDate(entry.createdAt)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {entry.tags.map((tag) => {
          const isPos = POSITIVE_TAGS.has(tag);
          const isNeg = NEGATIVE_TAGS.has(tag);
          const cls = isPos
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : isNeg
              ? "bg-red-500/10 text-red-400 border-red-500/20"
              : "bg-secondary text-foreground/70 border-border";
          return (
            <span
              key={tag}
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${cls}`}
            >
              {tag}
            </span>
          );
        })}
      </div>

      {entry.note && (
        <p className="text-xs text-foreground/70 leading-relaxed">{entry.note}</p>
      )}

      {entry.salesforceRef && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          <span>Opp: {entry.salesforceRef}</span>
        </div>
      )}
    </div>
  );
}

export default function SalesFeedbackSection({
  contentId,
}: {
  contentId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: stats } = useQuery<FeedbackStats>({
    queryKey: ["sales-feedback-stats", contentId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/sales-feedback/${encodeURIComponent(contentId)}/stats`
      );
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: entries } = useQuery<FeedbackEntry[]>({
    queryKey: ["sales-feedback", contentId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/sales-feedback/${encodeURIComponent(contentId)}`
      );
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json();
    },
    enabled: expanded,
  });

  const topTags = stats
    ? Object.entries(stats.tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["sales-feedback-stats", contentId],
    });
    queryClient.invalidateQueries({
      queryKey: ["sales-feedback", contentId],
    });
    queryClient.invalidateQueries({
      queryKey: ["sales-feedback-batch-stats"],
    });
    queryClient.invalidateQueries({
      queryKey: ["sales-feedback-recent"],
    });
  };

  return (
    <section data-testid="section-sales-feedback">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full group cursor-pointer"
        data-testid="button-toggle-sales-feedback"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/60">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Sales Feedback
        </div>

        {stats && stats.totalCount > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <Badge
              variant="secondary"
              className="rounded-full text-[11px] px-2 py-0"
            >
              {stats.totalCount}
            </Badge>
            <SentimentDot
              score={stats.sentimentScore}
              count={stats.totalCount}
            />
          </div>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {stats && stats.totalCount > 0 && topTags.length > 0 && (
            <div className="space-y-1.5" data-testid="feedback-aggregate">
              <div className="flex flex-wrap gap-1.5">
                {topTags.map(([tag, count]) => (
                  <TagPill key={tag} tag={tag} count={count} />
                ))}
              </div>
            </div>
          )}

          <FeedbackForm contentId={contentId} onSuccess={invalidate} />

          {entries && entries.length > 0 && (
            <div className="space-y-2" data-testid="feedback-thread">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </div>
              {entries.map((entry) => (
                <FeedbackEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {entries && entries.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No feedback yet — be the first to share.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function QuickFeedbackPopup({
  contentId,
  onClose,
}: {
  contentId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sales-feedback-stats", contentId] });
    queryClient.invalidateQueries({ queryKey: ["sales-feedback-batch-stats"] });
    queryClient.invalidateQueries({ queryKey: ["sales-feedback-recent"] });
    setTimeout(onClose, 2600);
  };

  return (
    <div
      className="absolute z-50 right-0 top-full mt-1 w-[260px] rounded-xl border border-border/80 bg-card shadow-xl backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
      data-testid="quick-feedback-popup"
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-semibold text-foreground/80">Quick Feedback</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 hover:bg-secondary/60 cursor-pointer"
          data-testid="button-close-quick-feedback"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="px-2 pb-2">
        <FeedbackForm contentId={contentId} onSuccess={invalidate} compact />
      </div>
    </div>
  );
}
