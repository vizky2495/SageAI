import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AiInsightsBarProps {
  page: "content-library" | "performance" | "analytics";
  onInsightClick?: (insight: string) => void;
}

export default function AiInsightsBar({ page, onInsightClick }: AiInsightsBarProps) {
  const { data, isLoading } = useQuery<{ insights: string[] }>({
    queryKey: ["/api/ai-insights", page],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ai-insights?page=${page}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const insights = data?.insights ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const goNext = useCallback(() => {
    if (insights.length === 0) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % insights.length);
  }, [insights.length]);

  const goPrev = useCallback(() => {
    if (insights.length === 0) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);
  }, [insights.length]);

  useEffect(() => {
    if (insights.length <= 1) return;
    const interval = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % insights.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [insights.length]);

  if (isLoading || insights.length === 0) return null;

  return (
    <div
      className="relative flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-card/60 px-4 shadow-sm backdrop-blur-xl"
      style={{ height: 48 }}
      data-testid="ai-insights-bar"
    >
      <div
        className="flex h-6 shrink-0 items-center rounded-md bg-[#00D657] px-2 text-[11px] font-bold text-black"
        data-testid="badge-ai-insights"
      >
        AI
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden" style={{ height: 24 }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.button
            key={currentIndex}
            custom={direction}
            initial={{ opacity: 0, y: direction * 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction * -14 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center truncate text-left text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={() => onInsightClick?.(insights[currentIndex])}
            data-testid={`insight-text-${currentIndex}`}
          >
            {insights[currentIndex]}
          </motion.button>
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={goPrev}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          data-testid="btn-insight-prev"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={goNext}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          data-testid="btn-insight-next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onInsightClick?.("Show me all insights")}
          className="ml-1 text-xs text-muted-foreground transition hover:text-foreground whitespace-nowrap"
          data-testid="btn-see-all-insights"
        >
          See all →
        </button>
      </div>
    </div>
  );
}
