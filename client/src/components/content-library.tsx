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

function ContentDetailModal({
  asset,
  stage,
  onClose,
}: {
  asset: AssetAgg;
  stage: string;
  onClose: () => void;
}) {
  const [iframeError, setIframeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const tone = stageTones[stage] || stageTones.TOFU;
  const hasUrl = !!asset.url;
  const fullUrl = hasUrl ? (asset.url!.startsWith("http") ? asset.url! : `https://${asset.url}`) : "";
  const proxyUrl = hasUrl ? `/api/proxy?url=${encodeURIComponent(fullUrl)}` : "";

  const detailRows: { label: string; value: string | null | undefined }[] = [
    { label: "Content ID", value: asset.contentId },
    { label: "Stage", value: stage },
    { label: "URL", value: asset.url },
    { label: "Campaign Name", value: asset.campaignName || asset.name },
    { label: "Product Franchise", value: asset.productFranchise },
    { label: "Product Category", value: asset.productCategory },
    { label: "Channel", value: asset.utmChannel },
    { label: "Medium", value: asset.utmMedium },
    { label: "Campaign", value: asset.utmCampaign },
    { label: "Term", value: asset.utmTerm },
    { label: "UTM Content", value: asset.utmContent },
    { label: "CTA", value: asset.cta },
    { label: "Objective", value: asset.objective },
    { label: "Form Name", value: asset.formName },
    { label: "Content Type", value: asset.typecampaignmember },
    { label: "Campaign ID", value: asset.campaignId },
    { label: "Date", value: asset.dateStamp },
  ].filter((r) => r.value);

  const metricRows = [
    { label: "Pageviews", value: asset.pageviewsSum },
    { label: "Avg Time (sec)", value: asset.timeAvg },
    { label: "Downloads", value: asset.downloadsSum },
    { label: "Unique Leads", value: asset.uniqueLeads },
    { label: "SQOs", value: asset.sqoCount },
  ].filter((r) => r.value > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="url-preview-overlay"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="url-preview-modal"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <Badge className={`shrink-0 border ${tone.bg} ${tone.text} ${tone.border}`}>{stage}</Badge>
            <div className="truncate text-sm font-semibold">{asset.contentId}</div>
          </div>
          <div className="flex items-center gap-2">
            {hasUrl && (
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 transition-colors"
                data-testid="button-open-new-tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </a>
            )}
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

        <Separator className="my-4" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Details</div>
              <div className="space-y-2">
                {detailRows.map((r) => (
                  <div key={r.label} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-[120px] text-muted-foreground">{r.label}</span>
                    <span className="font-medium break-all">
                      {r.label === "URL" && r.value ? (
                        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {r.value}
                        </a>
                      ) : (
                        r.value
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {metricRows.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Metrics</div>
                <div className="grid grid-cols-2 gap-3">
                  {metricRows.map((m) => (
                    <div key={m.label} className="rounded-xl border bg-secondary/50 p-3">
                      <div className="text-xs text-muted-foreground">{m.label}</div>
                      <div className="mt-1 text-lg font-bold">{formatCompact(m.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {hasUrl ? "Page Preview" : "Preview"}
            </div>
            {hasUrl ? (
              iframeError ? (
                <div className="flex h-[400px] items-center justify-center rounded-xl border bg-muted/20 text-center text-sm text-muted-foreground" data-testid="preview-fallback">
                  <div className="flex flex-col items-center gap-3">
                    <Eye className="h-8 w-8 text-muted-foreground/50" />
                    <p>Preview not available for this page.</p>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in new tab
                    </a>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl border bg-muted/20">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading preview…
                      </div>
                    </div>
                  )}
                  <iframe
                    src={proxyUrl}
                    className="h-[400px] w-full rounded-xl border bg-white"
                    title="URL Preview"
                    onError={() => {
                      setIframeError(true);
                      setLoading(false);
                    }}
                    onLoad={() => setLoading(false)}
                    data-testid="iframe-preview"
                  />
                </div>
              )
            ) : (
              <div className="flex h-[400px] items-center justify-center rounded-xl border bg-muted/20 text-center text-sm text-muted-foreground" data-testid="preview-no-url">
                <div className="flex flex-col items-center gap-3">
                  <Eye className="h-8 w-8 text-muted-foreground/50" />
                  <p>No URL available for this content.</p>
                  <p className="text-xs">Upload data with a URL column to enable page previews.</p>
                </div>
              </div>
            )}
          </div>
        </div>
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
  const [showDetail, setShowDetail] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tone = stageTones[stage] || stageTones.TOFU;

  const secondary =
    asset.campaignName || asset.name || asset.formName || null;

  const allTags = [
    asset.utmChannel,
    asset.productFranchise,
    asset.productCategory,
    asset.objective,
    asset.cta && `CTA: ${asset.cta}`,
    asset.utmMedium && `Medium: ${asset.utmMedium}`,
    asset.utmCampaign && `Campaign: ${asset.utmCampaign}`,
    asset.utmTerm && `Term: ${asset.utmTerm}`,
    asset.utmContent && `UTM Content: ${asset.utmContent}`,
    asset.formName && `Form: ${asset.formName}`,
  ].filter(Boolean) as string[];
  const tags = allTags.slice(0, 4);

  return (
    <>
      <div
        className="w-[280px] shrink-0"
        style={{ paddingTop: 6, paddingBottom: 6 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Card
          className="flex h-full flex-col rounded-2xl border p-4 backdrop-blur"
          style={{
            transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease",
            transform: hovered ? "translateY(-4px)" : "translateY(0)",
            boxShadow: hovered
              ? "0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 10px -5px rgba(0,0,0,0.1)"
              : "0 1px 3px 0 rgba(0,0,0,0.06)",
            borderColor: hovered ? "hsl(var(--primary) / 0.35)" : undefined,
            background: hovered ? "hsl(var(--card))" : "hsl(var(--card) / 0.7)",
          }}
          data-testid={`card-asset-${asset.contentId.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <button
                className="block w-full truncate text-left text-sm font-[650] tracking-tight text-foreground underline decoration-muted-foreground/30 underline-offset-2 cursor-pointer"
                style={{
                  transition: "color 0.15s ease",
                  color: hovered ? "hsl(var(--primary))" : undefined,
                }}
                title={`${asset.contentId} — click to view details${asset.url ? " & preview" : ""}`}
                onClick={() => setShowDetail(true)}
                data-testid="card-title"
              >
                {asset.contentId}
              </button>
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
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-primary hover:bg-primary/10"
                onClick={() => setShowDetail(true)}
                title="Preview URL"
                data-testid="button-preview-url"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="card-tags">
              {tags.map((t, i) => (
                <Badge
                  key={`${t}-${i}`}
                  variant="secondary"
                  className="rounded-lg border bg-card/60 text-[10px]"
                >
                  {t}
                </Badge>
              ))}
              {allTags.length > 4 && (
                <Badge
                  variant="secondary"
                  className="rounded-lg border bg-card/60 text-[10px] text-muted-foreground"
                  title={allTags.slice(4).join(", ")}
                >
                  +{allTags.length - 4}
                </Badge>
              )}
            </div>
          )}

          <Separator
            className="my-3"
            style={{
              transition: "background-color 0.2s ease",
              backgroundColor: hovered ? "hsl(var(--primary) / 0.2)" : undefined,
            }}
          />

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
      </div>

      {showDetail && (
        <ContentDetailModal asset={asset} stage={stage} onClose={() => setShowDetail(false)} />
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
    <div className="flex min-w-0 flex-col gap-3" data-testid={`carousel-${stage.toLowerCase()}`}>
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
        className="flex gap-3 overflow-x-auto pt-2 pb-3 scrollbar-thin"
        style={{ scrollSnapType: "x mandatory", maxWidth: "100%" }}
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
    <div className="flex min-w-0 flex-col gap-4" data-testid="content-library">
      <Card className="sticky top-14 z-10 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
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
