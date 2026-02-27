import TopNav from "@/components/top-nav";
import ContentLibrary from "@/components/content-library";
import { motion } from "framer-motion";
import { Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ContentLibraryPage() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <header className="mb-6">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-card shadow-sm">
                <Library className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-[650] tracking-tight" data-testid="text-content-library-title">
                    Content Library
                  </h1>
                  <Badge variant="secondary" className="border bg-card/70 backdrop-blur" data-testid="badge-content-library">
                    Browse
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground" data-testid="text-content-library-subtitle">
                  Browse all content assets by funnel stage. Search by content ID, filter by stage, and preview URLs.
                </p>
              </div>
            </div>
          </header>

          <ContentLibrary />
        </motion.div>
      </div>
    </div>
  );
}
