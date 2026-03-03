import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Library, BarChart3, Target, Sparkles, MessageCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_SEEN_KEY = "cia_tour_seen";

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  accentColor: string;
  accentGlow: string;
  iconColor: string;
  iconBg: string;
  detail: string;
  highlightSelector?: string;
  miniScene: "welcome" | "library" | "performance" | "planner" | "chat" | "feedback";
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to CIA",
    description: "Content Intelligence Analyst",
    icon: Sparkles,
    accentColor: "from-emerald-500 to-sky-500",
    accentGlow: "shadow-emerald-500/30",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    detail: "CIA is your marketing funnel command center. Analyze how your content performs across TOFU, MOFU, and BOFU stages, discover patterns, and plan smarter campaigns — all powered by your own data.",
    miniScene: "welcome",
  },
  {
    title: "Content Library",
    description: "Step 1: Browse your content assets",
    icon: Library,
    accentColor: "from-emerald-500 to-emerald-300",
    accentGlow: "shadow-emerald-500/30",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    detail: "See all your content organized by funnel stage. Search by Content ID, preview URLs, and scroll through your entire library to understand what you have and where it sits in the funnel.",
    highlightSelector: '[data-testid="card-hub-content-library"]',
    miniScene: "library",
  },
  {
    title: "Content Performance",
    description: "Step 2: Analyze your data",
    icon: BarChart3,
    accentColor: "from-sky-500 to-blue-400",
    accentGlow: "shadow-sky-500/30",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    detail: "KPI cards for each funnel stage, a funnel area chart, top channels and products at a glance. Dive deeper with filters for stage, content type, channel, product, and industry.",
    highlightSelector: '[data-testid="card-hub-content-performance"]',
    miniScene: "performance",
  },
  {
    title: "Campaign Planner",
    description: "Step 3: Plan with data-backed insights",
    icon: Target,
    accentColor: "from-violet-500 to-purple-400",
    accentGlow: "shadow-violet-500/30",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    detail: "Compare your content against similar assets in the database — PDF vs PDF, Webinar vs Webinar. Get a campaign plan with budget allocation, readiness score, and export as PDF.",
    highlightSelector: '[data-testid="card-hub-campaign-planner"]',
    miniScene: "planner",
  },
  {
    title: "AI Chat Agents",
    description: "Step 4: Get help on every page",
    icon: MessageCircle,
    accentColor: "from-amber-500 to-orange-400",
    accentGlow: "shadow-amber-500/30",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10 ring-amber-500/30",
    detail: "Every page has its own AI assistant. The Librarian finds content, the CIA agent answers data questions, and the Campaign Planner is itself a full AI agent. Just look for the chat panel.",
    miniScene: "chat",
  },
  {
    title: "Share Feedback",
    description: "Step 5: Help us improve",
    icon: MessageSquarePlus,
    accentColor: "from-rose-500 to-pink-400",
    accentGlow: "shadow-rose-500/30",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10 ring-rose-500/30",
    detail: "Got an idea or found a bug? Use the feedback button on this hub page to submit suggestions or report issues. Your input helps shape CIA into a better tool.",
    highlightSelector: '[data-testid="btn-floating-feedback"]',
    miniScene: "feedback",
  },
];

function WelcomeScene() {
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-emerald-950/50 via-background to-sky-950/50 border border-border/30">
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        {["TOFU", "MOFU", "BOFU"].map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.15, type: "spring", stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-1.5"
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 2, delay: i * 0.3, ease: "easeInOut" }}
              className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold ${
                i === 0 ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" :
                i === 1 ? "bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30" :
                "bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30"
              }`}
            >
              {label}
            </motion.div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 32 }}
              transition={{ delay: 0.6 + i * 0.15, duration: 0.4 }}
              className={`h-0.5 rounded-full ${
                i === 0 ? "bg-emerald-500/40" : i === 1 ? "bg-sky-500/40" : "bg-violet-500/40"
              }`}
            />
          </motion.div>
        ))}
      </div>
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/40"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            y: [0, -40],
            x: [0, (i % 2 === 0 ? 1 : -1) * 10],
          }}
          transition={{ repeat: Infinity, duration: 2.5, delay: i * 0.4, ease: "easeOut" }}
          style={{ left: `${15 + i * 14}%`, bottom: "20%" }}
        />
      ))}
    </div>
  );
}

function LibraryScene() {
  const items = [
    { label: "PDF", stage: "TOFU", color: "bg-emerald-500/20 text-emerald-400", barWidth: "72%" },
    { label: "Video", stage: "MOFU", color: "bg-sky-500/20 text-sky-400", barWidth: "85%" },
    { label: "Webinar", stage: "BOFU", color: "bg-violet-500/20 text-violet-400", barWidth: "58%" },
    { label: "Blog", stage: "TOFU", color: "bg-emerald-500/20 text-emerald-400", barWidth: "67%" },
  ];
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-emerald-950/40 via-background to-emerald-950/20 border border-border/30 p-3">
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.35, ease: "easeOut" }}
            className="flex items-center gap-2"
          >
            <div className={`h-5 rounded px-1.5 text-[10px] font-semibold flex items-center ${item.color}`}>
              {item.label}
            </div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: item.barWidth }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
              className="h-2 rounded-full bg-muted-foreground/10"
            />
            <span className="text-[9px] font-medium text-muted-foreground/60 ml-auto shrink-0">{item.stage}</span>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ repeat: Infinity, duration: 2, delay: 1 }}
        className="absolute right-3 top-3 h-4 w-16 rounded border border-emerald-500/30 bg-emerald-500/5 flex items-center px-1.5"
      >
        <span className="text-[8px] text-emerald-400/60">Search...</span>
      </motion.div>
    </div>
  );
}

function PerformanceScene() {
  const bars = [65, 82, 45, 90, 55, 72, 38];
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-sky-950/40 via-background to-blue-950/20 border border-border/30 p-3 flex items-end gap-1.5 pb-4">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{ delay: 0.2 + i * 0.08, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex-1 rounded-t bg-gradient-to-t from-sky-500/40 to-sky-400/20 relative"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.08 }}
            className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-sky-400/70"
          >
            {h}
          </motion.div>
        </motion.div>
      ))}
      <motion.div
        className="absolute bottom-1 left-3 right-3 h-px bg-border/40"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ transformOrigin: "left" }}
      />
      <div className="absolute top-2 right-3 flex gap-1">
        {["TOFU", "MOFU", "BOFU"].map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 + i * 0.1, type: "spring" }}
            className={`text-[7px] font-bold px-1 rounded ${
              i === 0 ? "text-emerald-400/70 bg-emerald-500/10" :
              i === 1 ? "text-sky-400/70 bg-sky-500/10" : "text-violet-400/70 bg-violet-500/10"
            }`}
          >
            {s}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PlannerScene() {
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-violet-950/40 via-background to-purple-950/20 border border-border/30 p-3">
      <div className="flex gap-2 h-full">
        <div className="flex-1 flex flex-col gap-1.5">
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-[9px] font-semibold text-violet-400/80"
          >
            Readiness Score
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 150 }}
            className="relative flex items-center justify-center"
          >
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="23" fill="none" stroke="hsl(var(--muted-foreground) / 0.1)" strokeWidth="4" />
              <motion.circle
                cx="28" cy="28" r="23"
                fill="none"
                stroke="url(#score-grad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 23}
                initial={{ strokeDashoffset: 2 * Math.PI * 23 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 23 * (1 - 0.85) }}
                transition={{ delay: 0.7, duration: 1.2, ease: "easeOut" }}
                transform="rotate(-90 28 28)"
              />
              <defs>
                <linearGradient id="score-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(270 80% 65%)" />
                  <stop offset="100%" stopColor="hsl(280 70% 75%)" />
                </linearGradient>
              </defs>
            </svg>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="absolute text-sm font-bold text-violet-300"
            >
              85
            </motion.span>
          </motion.div>
        </div>
        <div className="flex-1 flex flex-col gap-1 justify-center">
          {["Budget", "Channels", "KPIs", "Content"].map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="flex items-center gap-1.5"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1 + i * 0.1, type: "spring" }}
                className="h-2.5 w-2.5 rounded-full bg-violet-500/40 flex items-center justify-center"
              >
                <div className="h-1 w-1 rounded-full bg-violet-400" />
              </motion.div>
              <span className="text-[9px] text-muted-foreground/70">{item}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatScene() {
  const messages = [
    { role: "user" as const, text: "What's the best channel for MOFU?", delay: 0.3 },
    { role: "bot" as const, text: "Based on your data, Email drives 42% of MOFU leads...", delay: 0.8 },
    { role: "user" as const, text: "Show me top PDFs", delay: 1.4 },
  ];
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/30 via-background to-orange-950/20 border border-border/30 p-3 flex flex-col justify-end gap-1.5">
      {messages.map((msg, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: msg.delay, duration: 0.35, ease: "easeOut" }}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div className={`max-w-[80%] rounded-lg px-2 py-1 text-[9px] leading-tight ${
            msg.role === "user"
              ? "bg-amber-500/15 text-amber-300/80 rounded-br-sm"
              : "bg-muted/50 text-muted-foreground/70 rounded-bl-sm"
          }`}>
            {msg.role === "bot" ? (
              <TypewriterText text={msg.text} delay={msg.delay + 0.2} />
            ) : msg.text}
          </div>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ repeat: Infinity, duration: 1.5, delay: 2 }}
        className="flex justify-start"
      >
        <div className="flex gap-0.5 px-2 py-1">
          {[0, 1, 2].map((d) => (
            <motion.div
              key={d}
              className="h-1 w-1 rounded-full bg-amber-400/40"
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function FeedbackScene() {
  const items = [
    { type: "Suggestion", icon: "💡", color: "bg-violet-500/20 text-violet-400 ring-violet-500/30" },
    { type: "Bug Report", icon: "🐛", color: "bg-rose-500/20 text-rose-400 ring-rose-500/30" },
  ];
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-gradient-to-br from-rose-950/30 via-background to-pink-950/20 border border-border/30 p-3 flex flex-col gap-2">
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-[9px] font-semibold text-rose-400/80"
      >
        Send Feedback
      </motion.div>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.type}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.15, duration: 0.3 }}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ${item.color}`}
          >
            <span className="text-xs">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.type}</span>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "70%" }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="h-1.5 rounded-full bg-rose-500/20 mt-auto"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 1, duration: 0.5 }}
          className="h-full rounded-full bg-gradient-to-r from-rose-500/50 to-pink-500/40"
        />
      </motion.div>
    </div>
  );
}

function TypewriterText({ text, delay }: { text: string; delay: number }) {
  const [displayed, setDisplayed] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setDisplayed("");
    const timeout = setTimeout(() => {
      let i = 0;
      intervalRef.current = setInterval(() => {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 18);
    }, delay * 1000);
    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, delay]);
  return <>{displayed}<motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.6 }} className="inline-block w-px h-2 bg-amber-400/60 ml-px align-middle" /></>;
}

const SCENE_MAP: Record<TourStep["miniScene"], React.FC> = {
  welcome: WelcomeScene,
  library: LibraryScene,
  performance: PerformanceScene,
  planner: PlannerScene,
  chat: ChatScene,
  feedback: FeedbackScene,
};

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
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#spotlight-mask)"
          style={{ backdropFilter: "blur(4px)" }}
        />
      </svg>
      <motion.div
        className="absolute rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      >
        <div className="absolute inset-0 rounded-2xl ring-2 ring-primary/60" style={{ boxShadow: "0 0 0 4px hsl(var(--primary) / 0.15), 0 0 40px hsl(var(--primary) / 0.25)" }} />
        <motion.div
          className="absolute inset-0 rounded-2xl ring-1 ring-primary/30"
          animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);

  const updateHighlight = useCallback((stepIndex: number) => {
    const s = STEPS[stepIndex];
    if (s.highlightSelector) {
      const el = document.querySelector(s.highlightSelector);
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

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(TOUR_SEEN_KEY, "true");
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (visible) updateHighlight(step);
  }, [step, visible, updateHighlight]);

  useEffect(() => {
    if (!visible) return;
    const handleResize = () => updateHighlight(step);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [visible, step, updateHighlight]);

  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, next, prev, dismiss]);

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const Scene = SCENE_MAP[current.miniScene];

  const modalStyle: React.CSSProperties = {};
  if (highlightRect) {
    const viewportHeight = window.innerHeight;
    const cardBottom = highlightRect.top + highlightRect.height;
    const spaceBelow = viewportHeight - cardBottom;
    if (spaceBelow > 340) {
      modalStyle.position = "absolute";
      modalStyle.top = cardBottom + 20;
      modalStyle.left = "50%";
      modalStyle.transform = "translateX(-50%)";
    } else {
      modalStyle.position = "absolute";
      modalStyle.top = Math.max(20, highlightRect.top - 380);
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
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          data-testid="onboarding-overlay"
        >
          <SpotlightOverlay rect={highlightRect} />

          <div
            className={`${highlightRect ? "absolute" : "fixed inset-0 flex items-center justify-center"} px-4`}
            style={highlightRect ? modalStyle : undefined}
            onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          >
            <motion.div
              key={step}
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -16 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-md"
              data-testid={`onboarding-step-${step}`}
            >
              <div className={`absolute -inset-px rounded-2xl bg-gradient-to-b ${current.accentColor} opacity-30 blur-[1px]`} />

              <div className="relative rounded-2xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${current.accentColor} opacity-50`} />

                <div className="p-5 pb-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        initial={{ rotate: -90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 12 }}
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${current.iconBg}`}
                      >
                        <Icon className={`h-5 w-5 ${current.iconColor}`} />
                      </motion.div>
                      <div>
                        <motion.div
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest"
                        >
                          {current.description}
                        </motion.div>
                        <motion.h2
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.25 }}
                          className="text-base font-[700] tracking-tight"
                        >
                          {current.title}
                        </motion.h2>
                      </div>
                    </div>
                    <button
                      onClick={dismiss}
                      className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                      data-testid="btn-dismiss-tour"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <motion.div
                    key={`scene-${step}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="mb-4"
                  >
                    <Scene />
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="text-[13px] text-muted-foreground leading-relaxed mb-5"
                  >
                    {current.detail}
                  </motion.p>
                </div>

                <div className="px-5 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {STEPS.map((_, i) => (
                          <motion.button
                            key={i}
                            onClick={() => setStep(i)}
                            className={`rounded-full transition-all duration-300 ${
                              i === step
                                ? "h-2 w-5 bg-primary"
                                : i < step
                                  ? "h-2 w-2 bg-primary/40"
                                  : "h-2 w-2 bg-muted-foreground/20"
                            }`}
                            whileHover={{ scale: 1.3 }}
                            data-testid={`btn-tour-dot-${i}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground/40 ml-1 tabular-nums">
                        {step + 1}/{STEPS.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {step > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={prev}
                          className="h-7 px-2.5 rounded-lg text-[11px]"
                          data-testid="btn-tour-prev"
                        >
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          Back
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={next}
                        className={`h-7 px-3 rounded-lg text-[11px] font-semibold bg-gradient-to-r ${current.accentColor} text-white shadow-lg ${current.accentGlow} hover:brightness-110 transition-all`}
                        data-testid="btn-tour-next"
                      >
                        {isLast ? "Get Started" : "Next"}
                        {!isLast && <ArrowRight className="h-3 w-3 ml-1" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                    <button
                      onClick={dismiss}
                      className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      data-testid="btn-skip-tour"
                    >
                      Skip tour
                    </button>
                    <span className="text-[9px] text-muted-foreground/25">Use arrow keys to navigate</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TourResetButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        localStorage.removeItem(TOUR_SEEN_KEY);
        window.location.reload();
      }}
      className="group relative inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 backdrop-blur-sm hover:border-primary/30 hover:bg-card/60 transition-all duration-300"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="btn-restart-tour"
    >
      <motion.div
        animate={hovered ? { rotate: 180, scale: 1.1 } : { rotate: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary transition-colors" />
      </motion.div>
      <span className="text-xs font-medium text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
        How to use
      </span>
      <motion.div
        className="absolute -inset-px rounded-full bg-gradient-to-r from-primary/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity -z-10"
      />
    </motion.button>
  );
}
