import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Bug, Lightbulb, Send, ArrowLeft, Clock, CheckCircle2, Circle, Loader2, Filter } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { Feedback } from "@shared/schema";

type FeedbackType = "suggestion" | "bug";
type FilterType = "all" | "suggestion" | "bug";
type FilterStatus = "all" | "open" | "in_progress" | "resolved" | "closed";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: "Open", color: "text-amber-400 bg-amber-500/10 ring-amber-500/30", icon: Circle },
  in_progress: { label: "In Progress", color: "text-sky-400 bg-sky-500/10 ring-sky-500/30", icon: Clock },
  resolved: { label: "Resolved", color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30", icon: CheckCircle2 },
  closed: { label: "Closed", color: "text-muted-foreground bg-muted/50 ring-border/40", icon: CheckCircle2 },
};

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data: items = [], isLoading } = useQuery<Feedback[]>({
    queryKey: ["/api/feedback"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { type: string; title: string; description: string; page: string | null }) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setTitle("");
      setDescription("");
      setShowForm(false);
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    submitMutation.mutate({ type, title: title.trim(), description: description.trim(), page: null });
  }, [type, title, description, submitMutation]);

  const filtered = items.filter((item) => {
    if (filterType !== "all" && item.type !== filterType) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    return true;
  });

  const suggestionCount = items.filter((i) => i.type === "suggestion").length;
  const bugCount = items.filter((i) => i.type === "bug").length;
  const openCount = items.filter((i) => i.status === "open").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" data-testid="link-feedback-home">
            <div className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-[650] tracking-tight">CIA</span>
            </div>
          </Link>
          <h1 className="text-sm font-semibold">Feedback</h1>
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-8 rounded-lg text-xs"
            data-testid="btn-new-feedback"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
            New
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onSubmit={handleSubmit}
              data-testid="form-feedback"
            >
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 mb-6 backdrop-blur">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setType("suggestion")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      type === "suggestion"
                        ? "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    data-testid="btn-type-suggestion"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    Suggestion
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("bug")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      type === "bug"
                        ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    data-testid="btn-type-bug"
                  >
                    <Bug className="h-3.5 w-3.5" />
                    Bug Report
                  </button>
                </div>

                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === "suggestion" ? "What would you like to see?" : "What went wrong?"}
                  className="w-full bg-transparent text-base font-medium placeholder:text-muted-foreground/40 focus:outline-none mb-3"
                  data-testid="input-feedback-title"
                />

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe in detail..."
                  rows={3}
                  className="w-full bg-muted/30 rounded-lg p-3 text-sm placeholder:text-muted-foreground/40 focus:outline-none resize-none border border-border/30 focus:border-border/60 transition-colors"
                  data-testid="input-feedback-description"
                />

                <div className="flex items-center justify-between mt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="btn-cancel-feedback"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!title.trim() || !description.trim() || submitMutation.isPending}
                    className="h-8 rounded-lg text-xs"
                    data-testid="btn-submit-feedback"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Submit
                  </Button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-center" data-testid="stat-total">
            <div className="text-2xl font-bold">{items.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Total</div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-center" data-testid="stat-suggestions">
            <div className="text-2xl font-bold text-violet-400">{suggestionCount}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Suggestions</div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-center" data-testid="stat-bugs">
            <div className="text-2xl font-bold text-rose-400">{bugCount}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Bug Reports</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground/50" />
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 p-0.5">
            {(["all", "suggestion", "bug"] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  filterType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`btn-filter-type-${t}`}
              >
                {t === "all" ? "All Types" : t === "suggestion" ? "Suggestions" : "Bugs"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 p-0.5">
            {(["all", "open", "in_progress", "resolved"] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  filterStatus === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`btn-filter-status-${s}`}
              >
                {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {openCount > 0 && (
            <span className="text-[10px] text-amber-400/70 ml-auto">{openCount} open</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquarePlus className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/60">
              {items.length === 0 ? "No feedback yet. Be the first to share!" : "No items match your filters."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item, i) => {
              const statusMeta = STATUS_META[item.status] || STATUS_META.open;
              const StatusIcon = statusMeta.icon;
              const isBug = item.type === "bug";
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-border/40 bg-card/50 p-4 hover:bg-card/70 transition-colors"
                  data-testid={`feedback-item-${item.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isBug ? "bg-rose-500/10 ring-1 ring-rose-500/20" : "bg-violet-500/10 ring-1 ring-violet-500/20"
                    }`}>
                      {isBug ? (
                        <Bug className="h-3.5 w-3.5 text-rose-400" />
                      ) : (
                        <Lightbulb className="h-3.5 w-3.5 text-violet-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold truncate">{item.title}</h3>
                        <span className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusMeta.color}`}>
                          <StatusIcon className="h-2.5 w-2.5" />
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-muted-foreground/40">
                          {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {item.page && (
                          <span className="text-[10px] text-muted-foreground/40">from {item.page}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
