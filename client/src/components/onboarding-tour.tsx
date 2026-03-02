import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Library, BarChart3, Target, Sparkles, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_SEEN_KEY = "cia_tour_seen";

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  detail: string;
  highlightSelector?: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to CIA",
    description: "Content Intelligence Analyst",
    icon: Sparkles,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    detail: "CIA is your marketing funnel command center. It helps you analyze how your content performs across funnel stages (TOFU, MOFU, BOFU), discover patterns, and plan smarter campaigns — all powered by your own data.",
  },
  {
    title: "Content Library",
    description: "Step 1: Browse your content assets",
    icon: Library,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    detail: "See all your content assets organized by funnel stage — TOFU, MOFU, and BOFU. Search by Content ID, preview asset URLs, and scroll through your entire library to understand what content you have and where it sits in the funnel.",
    highlightSelector: '[data-testid="card-hub-content-library"]',
  },
  {
    title: "Content Performance",
    description: "Step 2: Analyze your data",
    icon: BarChart3,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    detail: "View KPI cards for each funnel stage, a funnel area chart, and top channels and products at a glance. Dive deeper into the Analytics page with filters for stage, content type, channel, product, and industry to find exactly what's working.",
    highlightSelector: '[data-testid="card-hub-content-performance"]',
  },
  {
    title: "Campaign Planner",
    description: "Step 3: Plan with data-backed insights",
    icon: Target,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    detail: "Evaluate how your content will perform by comparing it against similar content in the database — PDF vs PDF, Webinar vs Webinar. Pick a template like Product Launch or Lead Gen, answer a few questions, and get a campaign plan with budget allocation and a readiness score. Export it as a PDF.",
    highlightSelector: '[data-testid="card-hub-campaign-planner"]',
  },
  {
    title: "AI Chat Agents",
    description: "Step 4: Get help on every page",
    icon: MessageCircle,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 ring-amber-500/30",
    detail: "Every page has its own AI assistant built in. The Content Library has a Librarian agent that helps you find specific assets. The Performance and Analytics pages have a CIA agent that answers data questions in real time. The Campaign Planner is itself a full-page AI agent. Just look for the chat panel on each page — no need to switch tools.",
  },
];

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function SpotlightOverlay({ rect }: { rect: HighlightRect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />;
  }

  const pad = 8;
  const r = 16;

  return (
    <div className="fixed inset-0">
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - pad}
              y={rect.top - pad}
              width={rect.width + pad * 2}
              height={rect.height + pad * 2}
              rx={r}
              ry={r}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#spotlight-mask)"
          style={{ backdropFilter: "blur(4px)" }}
        />
      </svg>
      <div
        className="absolute rounded-2xl ring-2 ring-primary/60 pointer-events-none"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 4px hsl(var(--primary) / 0.15), 0 0 30px hsl(var(--primary) / 0.2)",
        }}
      />
    </div>
  );
}

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateHighlight = useCallback((stepIndex: number) => {
    const current = STEPS[stepIndex];
    if (current.highlightSelector) {
      const el = document.querySelector(current.highlightSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setHighlightRect({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
        return;
      }
    }
    setHighlightRect(null);
  }, []);

  useEffect(() => {
    if (visible) {
      updateHighlight(step);
    }
  }, [step, visible, updateHighlight]);

  useEffect(() => {
    if (!visible) return;
    const handleResize = () => updateHighlight(step);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [visible, step, updateHighlight]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(TOUR_SEEN_KEY, "true");
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const modalStyle: React.CSSProperties = {};
  if (highlightRect) {
    const viewportHeight = window.innerHeight;
    const cardBottom = highlightRect.top + highlightRect.height;
    const spaceBelow = viewportHeight - cardBottom;

    if (spaceBelow > 280) {
      modalStyle.position = "absolute";
      modalStyle.top = cardBottom + 20;
      modalStyle.left = "50%";
      modalStyle.transform = "translateX(-50%)";
    } else {
      modalStyle.position = "absolute";
      modalStyle.top = Math.max(20, highlightRect.top - 300);
      modalStyle.left = "50%";
      modalStyle.transform = "translateX(-50%)";
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100]"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
          data-testid="onboarding-overlay"
        >
          <SpotlightOverlay rect={highlightRect} />

          <div
            className={`${highlightRect ? "absolute" : "fixed inset-0 flex items-center justify-center"} px-4`}
            style={highlightRect ? modalStyle : undefined}
            onClick={(e) => {
              if (e.target === e.currentTarget) dismiss();
            }}
          >
            <motion.div
              key={step}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl"
              data-testid={`onboarding-step-${step}`}
            >
              <button
                onClick={dismiss}
                className="absolute right-4 top-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                data-testid="btn-dismiss-tour"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-4 mb-4">
                <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${current.iconBg}`}>
                  <Icon className={`h-6 w-6 ${current.iconColor}`} />
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{current.description}</div>
                  <h2 className="text-lg font-[650] tracking-tight">{current.title}</h2>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {current.detail}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={prev}
                      className="h-8 rounded-lg text-xs"
                      data-testid="btn-tour-prev"
                    >
                      <ArrowLeft className="h-3 w-3 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={next}
                    className="h-8 rounded-lg text-xs bg-primary hover:bg-primary/90"
                    data-testid="btn-tour-next"
                  >
                    {isLast ? "Get Started" : "Next"}
                    {!isLast && <ArrowRight className="h-3 w-3 ml-1" />}
                  </Button>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/40">
                <button
                  onClick={dismiss}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  data-testid="btn-skip-tour"
                >
                  Skip tour
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TourResetButton() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem(TOUR_SEEN_KEY);
        window.location.reload();
      }}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      data-testid="btn-restart-tour"
    >
      <Sparkles className="h-3 w-3" />
      <span>How to use</span>
    </button>
  );
}
