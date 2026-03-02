import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  label: string;
  href: string;
  testId: string;
};

const nav: NavItem[] = [
  { label: "Dashboard", href: "/", testId: "link-nav-dashboard" },
  { label: "Analytics", href: "/analytics", testId: "link-nav-analytics" },
  { label: "Content Library", href: "/content-library", testId: "link-nav-content-library" },
];

export default function TopNav() {
  const [location] = useLocation();

  return (
    <div className="sticky top-0 z-20 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-[650] tracking-tight" data-testid="text-nav-brand">
            CIA
          </div>
          <Badge
            variant="secondary"
            className="hidden rounded-xl border bg-card/60 text-xs md:inline-flex"
            data-testid="badge-nav-env"
          >
            Prototype
          </Badge>
        </div>

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
