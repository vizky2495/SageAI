import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Library, BarChart3, Target, Upload, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_SEEN_KEY = "cia_tour_seen";

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  detail: string;
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
    title: "Step 1: Upload Your Data",
    description: "Admin Panel",
    icon: Upload,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 ring-amber-500/30",
    detail: "Start by going to the Admin page (via the URL /admin). Upload your CSV or Excel file containing content performance data. The AI will automatically map your columns to the right fields — no manual setup needed.",
  },
  {
    title: "Step 2: Explore Content Library",
    description: "Browse all your content assets",
    icon: Library,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    detail: "Once data is uploaded, head to the Content Library to see all your content assets organized by funnel stage. You can search by Content ID, preview URLs, and scroll through TOFU, MOFU, and BOFU content. An AI librarian is available on this page to help you find specific assets.",
  },
  {
    title: "Step 3: Analyze Performance",
    description: "Dashboards & deep-dive analytics",
    icon: BarChart3,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    detail: "The Content Performance page shows KPI cards for each funnel stage, a funnel area chart, and top channels/products at a glance. For deeper analysis, go to the Analytics page to filter by stage, content type, channel, product, and more. An AI agent on these pages can answer data questions in real time.",
  },
  {
    title: "Step 4: Plan Your Campaign",
    description: "AI-powered content effectiveness assessment",
    icon: Target,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    detail: "The Campaign Planner compares your content against similar assets already in the database — matching by content type (PDF vs PDF, Webinar vs Webinar), funnel stage, industry, and product. Pick a template like Product Launch or Lead Gen, answer a few questions, and get a data-backed campaign plan with budget allocation and a readiness score. You can export it as a PDF.",
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
          data-testid="onboarding-overlay"
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
