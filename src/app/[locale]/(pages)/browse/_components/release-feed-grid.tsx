"use client";

import { ClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { GearCard, GearCardSkeleton } from "~/components/gear/gear-card";
import {
  GearTable,
  GearTableSkeleton,
  GearViewToggle,
  toGearTableRows,
  useGearResultsView,
} from "~/components/table";
import { Button } from "~/components/ui/button";
import { useIsMobile } from "~/hooks/use-mobile";
import { getItemDisplayPrice } from "~/lib/mapping";
import { getPageLoadingState } from "~/lib/pagination";
import { useExchangeRates } from "~/lib/pricing/use-exchange-rates";
import { useDisplayPriceMarket } from "~/lib/pricing/use-display-price-market";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import type { BrowseFeedPage } from "~/types/browse";

type ReleaseFeedGridProps = {
  heading: string;
  initialPage: BrowseFeedPage;
  brandSlug?: string;
  trendingBrandId?: string;
  trendingSlugs?: string[];
  market: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
};

const PAGE_SIZE = 12;
const MAX_AUTO_SCROLL_LOADS = 5;
const APPENDED_CARD_SKELETON_KEYS = Array.from(
  { length: 24 },
  (_, index) => `release-feed-more-skeleton-${index + 1}`,
);

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return (await res.json()) as BrowseFeedPage;
};

export function ReleaseFeedGrid({
  heading,
  initialPage,
  brandSlug,
  trendingBrandId,
  trendingSlugs,
  market,
  initialExchangeRates,
}: ReleaseFeedGridProps) {
  const t = useTranslations("browsePage");
  const isMobile = useIsMobile();
  const [infiniteActive, setInfiniteActive] = useState(false);
  const { view, setView } = useGearResultsView();
  const [autoScrollLoads, setAutoScrollLoads] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const requestedPageRef = useRef<number | null>(null);
  const autoScrollLoadsRef = useRef(0);
  const [isRequestingMore, setIsRequestingMore] = useState(false);
  const exchangeRates = useExchangeRates(initialExchangeRates);
  const activeMarket = useDisplayPriceMarket(market);

  const buildKey = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (brandSlug) params.set("brandSlug", brandSlug);
      return `/api/gear/browse?${params.toString()}`;
    },
    [brandSlug],
  );

  const { data, error, size, setSize, isValidating } = useSWRInfinite<
    BrowseFeedPage,
    Error
  >(
    (pageIndex) => {
      const offset = pageIndex * PAGE_SIZE;
      return buildKey(offset);
    },
    fetcher,
    {
      fallbackData: [initialPage],
      revalidateFirstPage: false,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  );

  const pages = data ?? [initialPage];
  const items = useMemo(
    () => pages.flatMap((page) => page?.items ?? []),
    [pages],
  );
  const tableRows = useMemo(() => toGearTableRows(items), [items]);
  const trendingSet = useMemo(
    () => new Set(trendingSlugs ?? []),
    [trendingSlugs],
  );
  const lastPage = pages[pages.length - 1] ?? initialPage;
  const hasMore = lastPage?.hasMore ?? false;
  const { isLoadingMore: isRequestedPageLoading } = getPageLoadingState(
    pages,
    size,
    isValidating,
    Boolean(error),
  );
  const isLoadingMore = isRequestingMore || isRequestedPageLoading;
  const showEmpty = !items.length && !error && !isValidating;
  const listLoadedPageCount =
    view === "list" ? pages.filter(Boolean).length : 0;

  useEffect(() => {
    loadingRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    const requestedPage = requestedPageRef.current;
    if (!requestedPage || (!error && !pages[requestedPage - 1])) return;

    requestedPageRef.current = null;
    loadingRef.current = false;
    setIsRequestingMore(false);
  }, [error, pages]);

  // Disable infinite scroll on mobile
  const hasReachedAutoLoadLimit = autoScrollLoads >= MAX_AUTO_SCROLL_LOADS;

  const requestNextPage = useCallback(() => {
    if (!hasMore || loadingRef.current) return false;

    const nextPage = size + 1;
    loadingRef.current = true;
    requestedPageRef.current = nextPage;
    setIsRequestingMore(true);
    void setSize(nextPage);
    return true;
  }, [hasMore, setSize, size]);

  useEffect(() => {
    if (isMobile || !infiniteActive || !hasMore || hasReachedAutoLoadLimit)
      return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          if (!requestNextPage()) return;

          const nextAutoLoadCount = autoScrollLoadsRef.current + 1;
          autoScrollLoadsRef.current = nextAutoLoadCount;
          setAutoScrollLoads(nextAutoLoadCount);
          if (nextAutoLoadCount >= MAX_AUTO_SCROLL_LOADS) {
            setInfiniteActive(false);
          }
        }
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMore,
    infiniteActive,
    isMobile,
    hasReachedAutoLoadLimit,
    listLoadedPageCount,
    requestNextPage,
    view,
  ]);

  const handleLoadMore = useCallback(() => {
    if (loadingRef.current) return;
    // On desktop, enable infinite scroll after first manual load
    if (!isMobile) {
      setInfiniteActive(true);
      autoScrollLoadsRef.current = 0;
      setAutoScrollLoads(0);
    }
    requestNextPage();
  }, [isMobile, requestNextPage]);

  const errorText = error ? t("loadError") : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <ClockIcon className="text-muted-foreground size-5" />
          {heading}
        </h2>
        <GearViewToggle view={view} onViewChange={setView} />
      </div>
      {errorText ? (
        <div className="text-destructive text-sm">{errorText}</div>
      ) : null}

      {showEmpty ? (
        <div className="text-muted-foreground text-sm">{t("noGearFound")}</div>
      ) : null}

      {view === "list" ? (
        <GearTable rows={tableRows} />
      ) : (
        <div className="grid w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <GearCard
              key={g.id}
              href={`/gear/${g.slug}`}
              slug={g.slug}
              name={g.name}
              regionalAliases={g.regionalAliases}
              brandName={g.brandName ?? undefined}
              thumbnailUrl={g.thumbnailUrl ?? undefined}
              gearType={g.gearType}
              isTrending={trendingSet.has(g.slug)}
              trendingQuery={
                trendingBrandId
                  ? { filters: { brandId: trendingBrandId } }
                  : undefined
              }
              releaseDate={g.releaseDate}
              releaseDatePrecision={g.releaseDatePrecision}
              announcedDate={g.announcedDate}
              announceDatePrecision={g.announceDatePrecision}
              priceText={getItemDisplayPrice(g, {
                style: "short",
                padWholeAmounts: true,
                market: activeMarket,
                locale:
                  activeMarket === "US"
                    ? "en-US"
                    : activeMarket === "UK"
                      ? "en-GB"
                      : "de-DE",
                exchangeRates,
              })}
            />
          ))}
        </div>
      )}

      {isLoadingMore ? (
        view === "list" ? (
          <GearTableSkeleton rows={6} showHeader={false} />
        ) : (
          <div className="relative grid w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
            <div className="from-background absolute right-0 bottom-0 left-0 z-10 h-full bg-linear-to-t to-transparent" />
            {APPENDED_CARD_SKELETON_KEYS.map((key) => (
              <GearCardSkeleton key={key} />
            ))}
          </div>
        )
      ) : null}

      {/* Always show button when more items available, or when infinite scroll is not active on desktop */}
      {hasMore && (isMobile || !infiniteActive) ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? t("loading") : t("loadMore")}
          </Button>
        </div>
      ) : null}

      {/* Only show infinite scroll sentinel on desktop when active */}
      {!isMobile && infiniteActive ? (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinelRef} className="h-6 w-full" />
        </div>
      ) : null}
    </div>
  );
}
