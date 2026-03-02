import { Link } from "wouter";
import { motion } from "framer-motion";
import { Library, BarChart3, Target, ArrowRight, Search, MessageCircle } from "lucide-react";
import OnboardingTour, { TourResetButton } from "@/components/onboarding-tour";

function LibraryMiniPreview() {
  const rows = [
    { label: "PDF", stage: "TOFU", color: "bg-emerald-500/25 text-emerald-400", w: "w-[60%]" },
    { label: "Video", stage: "MOFU", color: "bg-sky-500/25 text-sky-400", w: "w-[80%]" },
    { label: "Webinar", stage: "BOFU", color: "bg-violet-500/25 text-violet-400", w: "w-[45%]" },
  ];
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg bg-gradient-to-br from-emerald-950/30 to-background border border-border/20 p-2.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0">
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={false}
            className="flex items-center gap-1.5"
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <div className={`h-4 rounded px-1 text-[8px] font-bold flex items-center ${r.color}`}>{r.label}</div>
            <div className={`h-1.5 rounded-full bg-emerald-500/15 ${r.w} transition-all duration-700`} style={{ transitionDelay: `${200 + i * 80}ms` }} />
            <span className="text-[7px] text-muted-foreground/40 ml-auto">{r.stage}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-1 py-0.5">
        <Search className="h-2 w-2 text-emerald-400/50" />
        <span className="text-[6px] text-emerald-400/40">Search</span>
      </div>
    </div>
  );
}

function PerformanceMiniPreview() {
  const bars = [55, 78, 40, 90, 62, 85, 35];
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg bg-gradient-to-br from-sky-950/30 to-background border border-border/20 p-2.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0">
      <div className="flex items-end gap-1 h-full pb-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-sky-500/30 to-sky-400/10 transition-all duration-700"
            style={{
              height: `${h}%`,
              transitionDelay: `${200 + i * 50}ms`,
            }}
          />
        ))}
      </div>
      <div className="absolute top-1.5 right-2 flex gap-0.5">
        {["T", "M", "B"].map((s, i) => (
          <span key={s} className={`text-[6px] font-bold px-0.5 rounded ${
            i === 0 ? "text-emerald-400/60 bg-emerald-500/10" :
            i === 1 ? "text-sky-400/60 bg-sky-500/10" :
            "text-violet-400/60 bg-violet-500/10"
          }`}>{s}</span>
        ))}
      </div>
      <div className="absolute bottom-1.5 left-2.5 right-2.5 h-px bg-border/30" />
    </div>
  );
}

function PlannerMiniPreview() {
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg bg-gradient-to-br from-violet-950/30 to-background border border-border/20 p-2.5 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-1 group-hover:translate-y-0">
      <div className="flex gap-2 h-full">
        <div className="flex flex-col items-center justify-center flex-shrink-0">
          <svg width="40" height="40" viewBox="0 0 40 40" className="transition-all duration-700 group-hover:rotate-0" style={{ transitionDelay: "300ms" }}>
            <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--muted-foreground) / 0.1)" strokeWidth="3" />
            <circle
              cx="20" cy="20" r="16"
              fill="none"
              stroke="hsl(270 80% 65% / 0.5)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 16}
              strokeDashoffset={2 * Math.PI * 16 * 0.15}
              transform="rotate(-90 20 20)"
            />
          </svg>
          <span className="text-[8px] font-bold text-violet-400/60 mt-0.5">85</span>
        </div>
        <div className="flex flex-col gap-1 justify-center flex-1">
          {["Budget", "Channels", "KPIs"].map((item, i) => (
            <div key={item} className="flex items-center gap-1" style={{ transitionDelay: `${300 + i * 60}ms` }}>
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500/40" />
              <span className="text-[7px] text-muted-foreground/50">{item}</span>
              <div className="flex-1 h-1 rounded-full bg-violet-500/10 ml-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute top-1.5 right-2 flex items-center gap-0.5">
        <MessageCircle className="h-2 w-2 text-violet-400/40" />
        <span className="text-[6px] text-violet-400/40">AI</span>
      </div>
    </div>
  );
}

const MINI_PREVIEWS: Record<string, React.FC> = {
  "Content Library": LibraryMiniPreview,
  "Content Performance": PerformanceMiniPreview,
  "Campaign Planner": PlannerMiniPreview,
};

const cards = [
  {
    title: "Content Library",
    description: "Browse all content assets by funnel stage, search by content ID, and preview URLs.",
    href: "/content-library",
    icon: Library,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    glow: "group-hover:shadow-emerald-500/20",
    borderGlow: "from-emerald-500/40 via-emerald-300/20 to-emerald-500/40",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    iconColor: "text-emerald-400",
    accentDot: "bg-emerald-400",
    stat: "3 Stages",
    statLabel: "TOFU / MOFU / BOFU",
    testId: "card-hub-content-library",
  },
  {
    title: "Content Performance",
    description: "KPI dashboards, funnel analytics, channel & product mix, CTA analysis, and drilldowns.",
    href: "/performance",
    icon: BarChart3,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    glow: "group-hover:shadow-sky-500/20",
    borderGlow: "from-sky-500/40 via-sky-300/20 to-sky-500/40",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    iconColor: "text-sky-400",
    accentDot: "bg-sky-400",
    stat: "Deep Dive",
    statLabel: "Filters & Drilldowns",
    testId: "card-hub-content-performance",
  },
  {
    title: "Campaign Planner",
    description: "AI-powered content effectiveness assessment. Compare your content against database benchmarks.",
    href: "/campaign-planner",
    icon: Target,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    glow: "group-hover:shadow-violet-500/20",
    borderGlow: "from-violet-500/40 via-violet-300/20 to-violet-500/40",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    iconColor: "text-violet-400",
    accentDot: "bg-violet-400",
    stat: "AI Agent",
    statLabel: "Data-Backed Plans",
    testId: "card-hub-campaign-planner",
  },
];

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function HubPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <OnboardingTour />
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
          Content Intelligence
          <br />
          <span className="bg-gradient-to-r from-primary via-emerald-300 to-sky-400 bg-clip-text text-transparent">
            Analyst
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground leading-relaxed" data-testid="text-hub-subtitle">
          Your marketing funnel command center. Analyze content performance, explore your library, or plan your next campaign.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid w-full max-w-4xl gap-5 md:grid-cols-3"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          const Preview = MINI_PREVIEWS[card.title];
          return (
            <motion.div key={card.title} variants={cardVariants}>
              <Link href={card.href} data-testid={card.testId}>
                <div className={`group relative flex h-full cursor-pointer flex-col rounded-2xl border border-border/60 bg-card/60 backdrop-blur transition-all duration-300 hover:border-transparent hover:bg-card/80 hover:shadow-2xl ${card.glow}`}>

                  <div className={`absolute -inset-px rounded-2xl bg-gradient-to-b ${card.borderGlow} opacity-0 transition-opacity duration-500 group-hover:opacity-100 -z-10 blur-[0.5px]`} />

                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${card.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                  <div className="relative z-10 flex flex-col gap-3 p-6 pb-3">
                    <div className="flex items-start justify-between">
                      <motion.div
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${card.iconBg} transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}
                        whileHover={{ rotate: [0, -5, 5, 0] }}
                        transition={{ duration: 0.4 }}
                      >
                        <Icon className={`h-6 w-6 ${card.iconColor} transition-transform duration-300 group-hover:scale-105`} />
                      </motion.div>
                      <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/50 px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                        <div className={`h-1.5 w-1.5 rounded-full ${card.accentDot} animate-pulse`} />
                        <span className="text-[9px] font-semibold text-muted-foreground/70">{card.stat}</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-lg font-[650] tracking-tight transition-colors duration-200">{card.title}</h2>
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  <div className="relative z-10 px-4 pb-2">
                    {Preview && <Preview />}
                  </div>

                  <div className="relative z-10 mt-auto flex items-center justify-between px-6 pb-5 pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                      <span>Explore</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1.5" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors duration-200">{card.statLabel}</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

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
