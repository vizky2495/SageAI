import { Link } from "wouter";
import { motion } from "framer-motion";
import { Library, BarChart3, Target, ArrowRight } from "lucide-react";

const cards = [
  {
    title: "Content Library",
    description: "Browse all content assets by funnel stage, search by content ID, and preview URLs.",
    href: "/content-library",
    icon: Library,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    glow: "group-hover:shadow-emerald-500/20",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    iconColor: "text-emerald-400",
    testId: "card-hub-content-library",
  },
  {
    title: "Content Performance",
    description: "KPI dashboards, funnel analytics, channel & product mix, CTA analysis, and drilldowns.",
    href: "/performance",
    icon: BarChart3,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    glow: "group-hover:shadow-sky-500/20",
    iconBg: "bg-sky-500/10 ring-sky-500/30",
    iconColor: "text-sky-400",
    testId: "card-hub-content-performance",
  },
  {
    title: "Campaign Planner",
    description: "AI-powered campaign strategy builder. Define goals, budget, channels, and get a full plan.",
    href: "/campaign-planner",
    icon: Target,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    glow: "group-hover:shadow-violet-500/20",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    iconColor: "text-violet-400",
    testId: "card-hub-campaign-planner",
  },
];

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function HubPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
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
        className="grid w-full max-w-4xl gap-4 md:grid-cols-3"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.title} variants={cardVariants}>
              <Link href={card.href} data-testid={card.testId}>
                <div className={`group relative flex h-full cursor-pointer flex-col rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-all duration-300 hover:border-border hover:bg-card/80 hover:shadow-xl ${card.glow}`}>
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${card.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                  <div className="relative z-10 flex flex-col gap-4">
                    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${card.iconBg}`}>
                      <Icon className={`h-6 w-6 ${card.iconColor}`} />
                    </div>

                    <div>
                      <h2 className="text-lg font-[650] tracking-tight">{card.title}</h2>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                        {card.description}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition group-hover:text-foreground pt-2">
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
