import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Library, BarChart3, Target, ArrowRight, LogOut, Upload, Clock, ChevronDown, ChevronUp, Sun, Moon, FileText, Zap } from "lucide-react";
import FeedbackButton from "@/components/feedback-button";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/queryClient";

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
    description: "Browse all content assets by funnel stage, search by content ID, upload new assets, and preview URLs.",
    href: "/content-library",
    icon: Library,
    accentHsl: "145 80% 42%",
    iconBg: "bg-emerald-500/10 ring-emerald-500/30",
    iconColor: "text-emerald-400",
    tags: ["TOFU", "MOFU", "BOFU", "Search", "Upload"],
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
    description: "Evaluate your content against top performers. Get a data-backed verdict: deploy, refresh, or replace — with channel and timing recommendations.",
    href: "/campaign-planner",
    icon: Target,
    accentHsl: "270 70% 60%",
    iconBg: "bg-violet-500/10 ring-violet-500/30",
    iconColor: "text-violet-400",
    tags: ["AI Agent", "Compare", "Score", "Trends", "PDF Export"],
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
              ? `0 20px 60px -15px hsl(${card.accentHsl} / 0.25), 0 0 0 1px hsl(${card.accentHsl} / 0.3)`
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
              <div className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-200" style={{ color: hovering ? "hsl(145 100% 42%)" : "hsl(var(--muted-foreground))" }}>
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

interface RecentItem {
  label: string;
  time: string;
  href: string;
  icon: React.ElementType;
  type: "campaign" | "upload" | "performance";
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function RecentActivity() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecent() {
      try {
        const [convRes, libRes] = await Promise.all([
          authFetch("/api/conversations?agent=planner").catch(() => null),
          authFetch("/api/content-library?limit=5").catch(() => null),
        ]);

        const recent: RecentItem[] = [];

        if (convRes?.ok) {
          const convs = await convRes.json();
          for (const c of convs.slice(0, 3)) {
            recent.push({
              label: c.title || "Campaign Plan",
              time: c.createdAt,
              href: "/campaign-planner",
              icon: Target,
              type: "campaign",
            });
          }
        }

        if (libRes?.ok) {
          const assets = await libRes.json();
          const uploaded = assets.filter((a: any) => a.source === "uploaded").slice(0, 2);
          for (const a of uploaded) {
            recent.push({
              label: `Uploaded: ${a.assetName}`,
              time: a.createdAt,
              href: "/content-library",
              icon: Upload,
              type: "upload",
            });
          }
        }

        recent.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setItems(recent.slice(0, 5));
      } catch {}
      setLoading(false);
    }
    fetchRecent();
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="w-full max-w-4xl mt-6"
      data-testid="section-recent-activity"
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <Link key={i} href={item.href}>
            <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/40 backdrop-blur px-4 py-2.5 cursor-pointer hover:bg-card/70 hover:border-primary/20 transition-all group" data-testid={`recent-item-${i}`}>
              <div className="flex items-center gap-3 min-w-0">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-muted-foreground">{formatRelativeTime(item.time)}</span>
                <span className="text-xs text-muted-foreground group-hover:text-[#00D657] transition-colors">Open</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

function GettingStarted() {
  const [open, setOpen] = useState(false);

  const steps = [
    { num: 1, title: "Upload your content or browse the library", desc: "Add new content assets for evaluation or explore your existing library by funnel stage.", icon: Upload },
    { num: 2, title: "Start a campaign plan", desc: "The AI evaluates your content against historical data and current trends to build a complete strategy.", icon: Zap },
    { num: 3, title: "Download your campaign plan PDF", desc: "Get a Sage-branded PDF with channel mix, timeline, KPIs, and actionable next steps.", icon: FileText },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.5 }}
      className="w-full max-w-4xl mt-6"
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        data-testid="btn-getting-started"
      >
        <Zap className="h-3.5 w-3.5" />
        <span>Getting Started</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 sm:grid-cols-3 mt-4">
              {steps.map((step) => (
                <div key={step.num} className="rounded-xl border border-border/40 bg-card/40 backdrop-blur p-4" data-testid={`step-${step.num}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{step.num}</div>
                    <step.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">{step.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggle = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("cia_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("cia_theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    const saved = localStorage.getItem("cia_theme");
    if (saved === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  return (
    <button
      onClick={toggle}
      className="h-8 w-8 rounded-full border border-border/50 bg-card/70 backdrop-blur flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="btn-theme-toggle"
    >
      {isDark ? <Sun className="h-3.5 w-3.5 text-muted-foreground" /> : <Moon className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

export default function HubPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const displayFullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.displayName || "";

  const greeting = user?.firstName
    ? `${getTimeGreeting()}, ${user.firstName}`
    : getTimeGreeting();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <FeedbackButton />

      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <ThemeToggle />
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
        <div className="hub-glow" />
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
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="w-full max-w-4xl mt-5"
      >
        <div
          onClick={() => navigate("/campaign-planner?approach=upload")}
          className="group relative cursor-pointer rounded-2xl border border-primary/20 bg-card/40 backdrop-blur overflow-hidden transition-all hover:border-primary/40 hover:shadow-[0_0_40px_-10px_hsl(145_100%_42%/0.15)]"
          data-testid="banner-upload-evaluate"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center gap-4 px-6 py-4">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30 group-hover:scale-110 transition-transform">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Upload & Evaluate Content</h3>
              <p className="text-xs text-muted-foreground">Drop in a new content asset to compare it against your library and get an instant performance prediction.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[#00D657] group-hover:translate-x-1 transition-all shrink-0" />
          </div>
        </div>
      </motion.div>

      <RecentActivity />
      <GettingStarted />
    </div>
  );
}
