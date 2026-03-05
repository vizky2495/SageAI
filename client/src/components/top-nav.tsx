import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

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
      </div>
    </div>
  );
}
