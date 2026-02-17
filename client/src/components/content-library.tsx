import { useState, useRef, useCallback, useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  Library,
  Search,
  X,
} from "lucide-react";
import type { AssetAgg } from "@shared/schema";

const PAGE_SIZE = 25;

const stageTones: Record<string, { bg: string; text: string; border: string }> = {
  TOFU: { bg: "bg-chart-1/12", text: "text-chart-1", border: "border-chart-1/20" },
  MOFU: { bg: "bg-chart-2/12", text: "text-chart-2", border: "border-chart-2/20" },
  BOFU: { bg: "bg-chart-3/12", text: "text-chart-3", border: "border-chart-3/20" },
  UNKNOWN: { bg: "bg-chart-4/12", text: "text-chart-4", border: "border-chart-4/20" },
};

function formatCompact(n: number) {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function truncateUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

function UrlPreview({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [iframeError, setIframeError] = useState(false);
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="url-preview-overlay"
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="url-preview-modal"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{fullUrl}</div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border bg-card px-3 py-1.5 text-xs font-medium hover:shadow"
              data-testid="button-open-new-tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Separator className="my-3" />
        {iframeError ? (
          <div className="flex h-[400px] items-center justify-center rounded-xl border bg-muted/30 text-center text-sm text-muted-foreground" data-testid="preview-fallback">
            <div>
              <p>Preview not available due to site restrictions.</p>
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-foreground underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            </div>
          </div>
        ) : (
          <iframe
            src={fullUrl}
            sandbox="allow-scripts allow-same-origin"
            className="h-[400px] w-full rounded-xl border"
            title="URL Preview"
            onError={() => setIframeError(true)}
            onLoad={(e) => {
              try {
                const frame = e.currentTarget;
                if (!frame.contentDocument?.body?.innerHTML) {
                  setIframeError(true);
                }
              } catch {
                setIframeError(true);
              }
            }}
            data-testid="iframe-preview"
          />
        )}
      </div>
    </div>
  );
}

function ContentCard({
  asset,
  stage,
}: {
  asset: AssetAgg;
  stage: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const tone = stageTones[stage] || stageTones.TOFU;

  const secondary =
    asset.name || asset.formName || asset.typecampaignmember || null;

  const tags = [
    asset.typecampaignmember,
    asset.productFranchise,
    asset.utmChannel,
  ].filter(Boolean);

  return (
    <>
      <Card
        className="group flex h-full w-[280px] shrink-0 flex-col rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur transition hover:shadow"
        data-testid={`card-asset-${asset.contentId.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-[650] tracking-tight"
              title={asset.contentId}
              data-testid="card-title"
            >
              {asset.contentId}
            </div>
            {secondary && (
              <div
                className="mt-0.5 truncate text-xs text-muted-foreground"
                title={secondary}
                data-testid="card-secondary"
              >
                {secondary}
              </div>
            )}
          </div>
          <Badge
            className={`shrink-0 border ${tone.bg} ${tone.text} ${tone.border}`}
            data-testid="card-stage-badge"
          >
            {stage}
          </Badge>
        </div>

        {asset.url && (
          <div className="mt-2 flex items-center gap-1.5">
            <div
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
              title={asset.url}
              data-testid="card-url"
            >
              {truncateUrl(asset.url)}
            </div>
            <button
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setPreviewUrl(asset.url)}
              title="Preview URL"
              data-testid="button-preview-url"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" data-testid="card-tags">
            {tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="rounded-lg border bg-card/60 text-[10px]"
              >
                {t}
              </Badge>
            ))}
          </div>
        )}

        <Separator className="my-3" />

        <div className="grid grid-cols-2 gap-2 text-xs" data-testid="card-metrics">
          {stage === "TOFU" && (
            <>
              <div>
                <div className="text-muted-foreground">Pageviews</div>
                <div className="mt-0.5 font-[650]">{formatCompact(asset.pageviewsSum)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg time</div>
                <div className="mt-0.5 font-[650]">
                  {asset.timeAvg > 0 ? `${Math.round(asset.timeAvg / 60)}m` : "0m"}
                </div>
              </div>
              {asset.downloadsSum > 0 && (
                <div>
                  <div className="text-muted-foreground">Downloads</div>
                  <div className="mt-0.5 font-[650]">{formatCompact(asset.downloadsSum)}</div>
                </div>
              )}
            </>
          )}
          {stage === "MOFU" && (
            <>
              <div>
                <div className="text-muted-foreground">Unique leads</div>
                <div className="mt-0.5 font-[650]">
                  {formatCompact(asset.uniqueLeads)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Pageviews</div>
                <div className="mt-0.5 font-[650]">{formatCompact(asset.pageviewsSum)}</div>
              </div>
            </>
          )}
          {stage === "BOFU" && (
            <>
              <div>
                <div className="text-muted-foreground">SQOs</div>
                <div className="mt-0.5 font-[650]">
                  {formatCompact(asset.sqoCount)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Unique leads</div>
                <div className="mt-0.5 font-[650]">
                  {formatCompact(asset.uniqueLeads)}
                </div>
              </div>
              {asset.sqoCount === 0 && (
                <div className="col-span-2 mt-1 rounded bg-chart-4/10 px-2 py-1 text-[10px] text-chart-4">
                  BOFU tag from CONTENT
                </div>
              )}
            </>
          )}
          {stage === "UNKNOWN" && (
            <>
              <div>
                <div className="text-muted-foreground">Pageviews</div>
                <div className="mt-0.5 font-[650]">{formatCompact(asset.pageviewsSum)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Unique leads</div>
                <div className="mt-0.5 font-[650]">
                  {formatCompact(asset.uniqueLeads)}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {previewUrl && (
        <UrlPreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </>
  );
}

function StageCarousel({
  stage,
  search,
}: {
  stage: "TOFU" | "MOFU" | "BOFU" | "UNKNOWN";
  search: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tone = stageTones[stage];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["/api/assets", stage, search],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        stage,
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/assets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json() as Promise<{ data: AssetAgg[]; total: number }>;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.data.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "0px 200px 0px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const scroll = useCallback((dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -300 : 300,
      behavior: "smooth",
    });
  }, []);

  const allCards = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-3" data-testid={`carousel-${stage.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={`border ${tone.bg} ${tone.text} ${tone.border}`}>
            {stage}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {total} content asset{total !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => scroll("left")}
            data-testid={`button-scroll-left-${stage.toLowerCase()}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => scroll("right")}
            data-testid={`button-scroll-right-${stage.toLowerCase()}`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
        style={{ scrollSnapType: "x mandatory" }}
        data-testid={`scroll-lane-${stage.toLowerCase()}`}
      >
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[220px] w-[280px] shrink-0 animate-pulse rounded-2xl border bg-muted/30"
              data-testid={`skeleton-${stage.toLowerCase()}-${i}`}
            />
          ))}

        {!isLoading && allCards.length === 0 && (
          <div
            className="flex h-[140px] w-full items-center justify-center text-sm text-muted-foreground"
            data-testid={`empty-${stage.toLowerCase()}`}
          >
            No {stage} content found{search ? ` for "${search}"` : ""}.
          </div>
        )}

        {allCards.map((asset) => (
          <ContentCard key={asset.id} asset={asset} stage={stage} />
        ))}

        {isFetchingNextPage &&
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={`loading-${i}`}
              className="h-[220px] w-[280px] shrink-0 animate-pulse rounded-2xl border bg-muted/30"
            />
          ))}

        <div ref={sentinelRef} className="h-1 w-1 shrink-0" />
      </div>
    </div>
  );
}

export default function ContentLibrary() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, 300);
  }, []);

  return (
    <div className="flex flex-col gap-4" data-testid="content-library">
      <Card className="sticky top-14 z-10 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card">
            <Library className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium" data-testid="text-library-title">
                Content Library
              </div>
              <Badge variant="secondary" className="rounded-xl border bg-card/60">
                Browse by stage
              </Badge>
            </div>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by Content ID…"
              className="h-9 rounded-xl pl-9 pr-9"
              data-testid="input-content-search"
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                data-testid="button-clear-content-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </Card>

      <StageCarousel stage="TOFU" search={debouncedSearch} />
      <StageCarousel stage="MOFU" search={debouncedSearch} />
      <StageCarousel stage="BOFU" search={debouncedSearch} />
      <StageCarousel stage="UNKNOWN" search={debouncedSearch} />
    </div>
  );
}
