import { useState, useCallback, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Sun, Moon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  testId: string;
};

const nav: NavItem[] = [
  { label: "Performance", href: "/performance", testId: "link-nav-performance" },
  { label: "Analytics", href: "/analytics", testId: "link-nav-analytics" },
  { label: "My Reports", href: "/reports", testId: "link-nav-reports" },
];

function ThemeToggleNav() {
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
    }
  }, []);

  return (
    <button
      onClick={toggle}
      className="h-8 w-8 rounded-full border border-border/50 bg-card/70 backdrop-blur flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="btn-theme-toggle-nav"
    >
      {isDark ? <Sun className="h-3.5 w-3.5 text-muted-foreground" /> : <Moon className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

export default function TopNav() {
  const [location] = useLocation();

  return (
    <div className="sticky top-0 z-20 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" data-testid="link-nav-home">
          <div className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-sm font-[650] tracking-tight">CIA</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1 rounded-2xl border bg-card/60 p-1 shadow-sm overflow-x-auto">
          {nav.map((item) => {
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <motion.span
                  className={`relative block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition cursor-pointer ${
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  data-testid={item.testId}
                >
                  {active && (
                    <motion.span
                      layoutId="navActive"
                      className="absolute inset-0 -z-10 rounded-xl border bg-background"
                      aria-hidden
                    />
                  )}
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </nav>
        <ThemeToggleNav />
        </div>
      </div>
    </div>
  );
}
