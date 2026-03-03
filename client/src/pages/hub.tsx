import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Library, BarChart3, Target, ArrowRight, LogOut } from "lucide-react";
import OnboardingTour, { TourResetButton } from "@/components/onboarding-tour";
import FeedbackButton from "@/components/feedback-button";
import { useAuth } from "@/lib/auth";

interface CardDef {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  accentHsl: string;
  iconBg: string;
  iconColor: string;
  tags: string[];
  testId: string;
}

const cards: CardDef[] = [
  {
    title: "Content Library",
    description: "Browse all content assets by funnel stage, search by content ID, and preview URLs.",
    href: "/content-library",
    icon: Library,
    accentHsl: "145 80% 42%",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    iconColor: "text-emerald-400",
    tags: ["TOFU", "MOFU", "BOFU", "Search", "Preview"],
    testId: "card-hub-content-library",
  },
  {
    title: "Content Performance",
    description: "KPI dashboards, funnel analytics, channel & product mix, CTA analysis, and drilldowns.",
    href: "/performance",
    icon: BarChart3,
    accentHsl: "200 80% 55%",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    iconColor: "text-sky-400",
    tags: ["KPIs", "Funnel", "Channels", "Analytics", "Filters"],
    testId: "card-hub-content-performance",
  },
  {
    title: "Campaign Planner",
    description: "AI-powered content effectiveness assessment. Compare your content against database benchmarks.",
    href: "/campaign-planner",
    icon: Target,
    accentHsl: "270 70% 60%",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    iconColor: "text-violet-400",
    tags: ["AI Agent", "Budget", "Score", "Templates", "PDF"],
    testId: "card-hub-campaign-planner",
  },
];

function HubCard({ card, index }: { card: CardDef; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [hovering, setHovering] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMouse({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  const rotateX = hovering ? (mouse.y - 0.5) * -8 : 0;
  const rotateY = hovering ? (mouse.x - 0.5) * 8 : 0;

  const Icon = card.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 800 }}
    >
      <Link href={card.href} data-testid={card.testId}>
        <div
          ref={ref}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => { setHovering(false); setMouse({ x: 0.5, y: 0.5 }); }}
          className="relative h-full cursor-pointer rounded-2xl transition-shadow duration-500"
          style={{
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transition: hovering ? "transform 0.1s ease-out" : "transform 0.5s ease-out",
            boxShadow: hovering
              ? `0 20px 60px -15px hsl(${card.accentHsl} / 0.2), 0 0 0 1px hsl(${card.accentHsl} / 0.15)`
              : "0 0 0 1px hsl(var(--border) / 0.6)",
          }}
        >
          <div
            className="absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 pointer-events-none"
            style={{
              opacity: hovering ? 1 : 0,
              background: `linear-gradient(135deg, hsl(${card.accentHsl} / 0.25) 0%, transparent 50%, hsl(${card.accentHsl} / 0.15) 100%)`,
            }}
          />

          <div
            className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 pointer-events-none"
            style={{
              opacity: hovering ? 0.7 : 0,
              background: `radial-gradient(600px circle at ${mouse.x * 100}% ${mouse.y * 100}%, hsl(${card.accentHsl} / 0.12), transparent 40%)`,
            }}
          />

          <div className="relative z-10 flex h-full flex-col rounded-2xl bg-card/70 backdrop-blur-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${card.iconBg} transition-all duration-300`}
                style={{
                  transform: hovering ? "scale(1.1)" : "scale(1)",
                  boxShadow: hovering ? `0 8px 24px hsl(${card.accentHsl} / 0.2)` : "none",
                }}
              >
                <Icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>

              <div
                className="h-8 w-8 rounded-full transition-all duration-500 pointer-events-none"
                style={{
                  opacity: hovering ? 0.6 : 0,
                  background: `radial-gradient(circle, hsl(${card.accentHsl} / 0.3), transparent 70%)`,
                  transform: hovering ? "scale(1)" : "scale(0.5)",
                }}
              />
            </div>

            <h2 className="text-lg font-[650] tracking-tight mb-1.5">{card.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {card.description}
            </p>

            <div className="flex flex-wrap gap-1.5 mb-5">
              {card.tags.map((tag, i) => (
                <span
                  key={tag}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all duration-500"
                  style={{
                    opacity: hovering ? 1 : 0.4,
                    transform: hovering ? "translateY(0) scale(1)" : "translateY(4px) scale(0.95)",
                    transitionDelay: hovering ? `${i * 40}ms` : "0ms",
                    borderColor: hovering ? `hsl(${card.accentHsl} / 0.3)` : "hsl(var(--border) / 0.4)",
                    backgroundColor: hovering ? `hsl(${card.accentHsl} / 0.08)` : "transparent",
                    color: hovering ? `hsl(${card.accentHsl})` : "hsl(var(--muted-foreground))",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between pt-3 border-t transition-colors duration-300" style={{ borderColor: hovering ? `hsl(${card.accentHsl} / 0.15)` : "hsl(var(--border) / 0.3)" }}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200" style={{ color: hovering ? "hsl(var(--foreground))" : undefined }}>
                <span>Explore</span>
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform duration-300"
                  style={{ transform: hovering ? "translateX(4px)" : "translateX(0)" }}
                />
              </div>

              <div className="flex items-center gap-1">
                {[0, 1, 2].map((d) => (
                  <div
                    key={d}
                    className="h-1 w-1 rounded-full transition-all duration-500"
                    style={{
                      backgroundColor: hovering ? `hsl(${card.accentHsl} / ${0.7 - d * 0.15})` : `hsl(var(--muted-foreground) / 0.2)`,
                      transform: hovering ? `scale(${1.2 - d * 0.1})` : "scale(1)",
                      transitionDelay: `${d * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HubPage() {
  const { user, logout } = useAuth();

  const displayFullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.displayName || "";

  const greeting = user?.firstName
    ? `${getTimeGreeting()}, ${user.firstName}`
    : getTimeGreeting();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <OnboardingTour />
      <FeedbackButton />

      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/70 backdrop-blur px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground" data-testid="text-user-name">
            {displayFullName}
          </span>
          {user?.isAdmin && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30" data-testid="badge-admin">
              Admin
            </span>
          )}
        </div>
        <button
          onClick={logout}
          className="h-8 w-8 rounded-full border border-border/50 bg-card/70 backdrop-blur flex items-center justify-center hover:bg-destructive/20 hover:border-destructive/40 transition-colors"
          title="Sign out"
          data-testid="btn-logout"
        >
          <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_20%,hsl(145_100%_42%/0.08),transparent_60%),radial-gradient(800px_circle_at_20%_80%,hsl(200_80%_50%/0.06),transparent_55%),radial-gradient(800px_circle_at_80%_70%,hsl(270_60%_50%/0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
        <div className="absolute inset-0 grain" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mb-12 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-1.5 backdrop-blur mb-6" data-testid="badge-hub-brand">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">CIA Platform</span>
        </div>
        <h1 className="text-4xl font-[700] tracking-tight md:text-5xl" data-testid="text-hub-title">
          {greeting}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground leading-relaxed" data-testid="text-hub-subtitle">
          Your marketing funnel command center. Analyze content performance, explore your library, or plan your next campaign.
        </p>
      </motion.div>

      <div className="grid w-full max-w-4xl gap-5 md:grid-cols-3">
        {cards.map((card, i) => (
          <HubCard key={card.title} card={card} index={i} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-8"
      >
        <TourResetButton />
      </motion.div>
    </div>
  );
}
