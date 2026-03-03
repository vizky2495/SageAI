import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Bug, Lightbulb, Send, X, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type FeedbackType = "suggestion" | "bug";

export default function FeedbackButton() {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async (data: { type: string; title: string; description: string; page: string | null }) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setTitle("");
        setDescription("");
      }, 1500);
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    submitMutation.mutate({
      type,
      title: title.trim(),
      description: description.trim(),
      page: location,
    });
  }, [type, title, description, location, submitMutation]);

  return (
    <>
      <motion.button
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:brightness-110 transition-all"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        data-testid="btn-floating-feedback"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="h-5 w-5" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageSquarePlus className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-[72px] right-5 z-50 w-80 rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden"
            data-testid="panel-quick-feedback"
          >
            {submitted ? (
              <div className="flex flex-col items-center justify-center p-8 gap-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="h-10 w-10 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center"
                >
                  <Send className="h-4 w-4 text-emerald-400" />
                </motion.div>
                <p className="text-sm font-medium">Thank you!</p>
                <p className="text-xs text-muted-foreground">Your feedback has been submitted.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="p-4 border-b border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Send Feedback</h3>
                    {sessionStorage.getItem("admin_token") && (
                      <button
                        type="button"
                        onClick={() => navigate("/feedback")}
                        className="text-[10px] text-primary hover:underline"
                        data-testid="link-view-all-feedback"
                      >
                        View all
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setType("suggestion")}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                        type === "suggestion"
                          ? "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="btn-quick-type-suggestion"
                    >
                      <Lightbulb className="h-3 w-3" />
                      Suggestion
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("bug")}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                        type === "bug"
                          ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid="btn-quick-type-bug"
                    >
                      <Bug className="h-3 w-3" />
                      Bug
                    </button>
                  </div>
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === "suggestion" ? "Your idea..." : "What happened?"}
                    className="w-full bg-transparent text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none"
                    data-testid="input-quick-title"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe in detail..."
                    rows={3}
                    className="w-full bg-muted/30 rounded-lg p-2.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none resize-none border border-border/30 focus:border-border/60 transition-colors"
                    data-testid="input-quick-description"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!title.trim() || !description.trim() || submitMutation.isPending}
                    className="h-8 rounded-lg text-xs w-full"
                    data-testid="btn-quick-submit"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Submit Feedback
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
