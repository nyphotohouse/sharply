"use client";

import { mergeSearchParams } from "@utils/url";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
import {
  buildBrowseListApiPath,
  normalizeBrowseFilters,
  urlSearchParamsToRecord,
} from "~/lib/browse/query";
import type { RouteScope } from "~/lib/browse/routing";
import { getItemDisplayPrice } from "~/lib/mapping";
import { getPageLoadingState } from "~/lib/pagination";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import { usePriceView } from "~/lib/pricing/use-price-view";
import type { BrowseListPage } from "~/types/browse";

type BrowseResultsGridProps = {
  initialPage: BrowseListPage;
  brandName?: string;
  scope: RouteScope;
  trendingBrandId?: string;
  trendingMountId?: string;
  trendingSlugs?: string[];
  market: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return (await res.json()) as BrowseListPage;
};

const MAX_AUTO_SCROLL_LOADS = 5;
const BROWSE_RESULTS_SKELETON_KEYS = Array.from(
  { length: 12 },
  (_, index) => `browse-results-skeleton-${index + 1}`,
);
const BROWSE_LOADING_SKELETON_KEYS = Array.from(
  { length: 24 },
  (_, index) => `browse-results-loading-${index + 1}`,
);

export function BrowseResultsGrid({
  initialPage,
  brandName,
  scope,
  trendingBrandId,
  trendingMountId,
  trendingSlugs,
  market,
  initialExchangeRates,
}: BrowseResultsGridProps) {
  const { view, setView } = useGearResultsView();
  return (
    <Suspense
      fallback={<BrowseResultsGridFallback scope={scope} view={view} />}
    >
      <BrowseResultsGridContent
        initialPage={initialPage}
        brandName={brandName}
        scope={scope}
        trendingBrandId={trendingBrandId}
        trendingMountId={trendingMountId}
        trendingSlugs={trendingSlugs}
        market={market}
        initialExchangeRates={initialExchangeRates}
        view={view}
        setView={setView}
      />
    </Suspense>
  );
}

function BrowseResultsGridContent({
  initialPage,
  brandName,
  scope,
  trendingBrandId,
  trendingMountId,
  trendingSlugs,
  initialExchangeRates,
  market,
  view,
  setView,
}: BrowseResultsGridProps & ReturnType<typeof useGearResultsView>) {
  const t = useTranslations("browsePage");
  const priceView = usePriceView(market, initialExchangeRates);
  const isMobile = useIsMobile();
  const rawPathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending] = useTransition();
  const [infiniteActive, setInfiniteActive] = useState(false);
  const [autoScrollLoads, setAutoScrollLoads] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const currentPageRef = useRef(1);
  const loadingRef = useRef(false);
  const requestedPageRef = useRef<number | null>(null);
  const autoScrollLoadsRef = useRef(0);
  const [isRequestingMore, setIsRequestingMore] = useState(false);
  const searchParamsString = searchParams.toString();

  const filters = useMemo(
    () => normalizeBrowseFilters(urlSearchParamsToRecord(searchParams), scope),
    [
      scope.brandSlug,
      scope.categorySlug,
      scope.mountShort,
      searchParamsString,
      searchParams,
    ],
  );

  const defaultFilters = useMemo(
    () => normalizeBrowseFilters({}, scope),
    [scope.brandSlug, scope.categorySlug, scope.mountShort],
  );

  const targetPage = filters.page;
  const defaultBrowsePath = useMemo(
    () =>
      buildBrowseListApiPath({
        scope,
        filters: defaultFilters,
      }),
    [defaultFilters, scope],
  );
  const currentBrowsePath = useMemo(
    () =>
      buildBrowseListApiPath({
        scope,
        filters,
      }),
    [filters, scope],
  );
  const shouldUseFallbackData =
    targetPage === initialPage.page && currentBrowsePath === defaultBrowsePath;

  const updatePage = useCallback(
    (nextPage: number) => {
      const query = mergeSearchParams(new URLSearchParams(searchParamsString), {
        page: nextPage > 1 ? nextPage : null,
      });
      const href = query ? `${rawPathname}?${query}` : rawPathname;
      window.history.pushState(null, "", href);
    },
    [rawPathname, searchParamsString],
  );

  const { data, error, size, setSize, isValidating } = useSWRInfinite<
    BrowseListPage,
    Error
  >(
    (pageIndex, previousPageData) => {
      if (previousPageData && !previousPageData.hasMore) return null;
      return buildBrowseListApiPath({
        scope,
        filters: {
          ...filters,
          page: pageIndex + 1,
        },
      });
    },
    fetcher,
    {
      initialSize: targetPage,
      fallbackData: shouldUseFallbackData ? [initialPage] : undefined,
      revalidateFirstPage: true,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  );

  const rawPages = data ?? (shouldUseFallbackData ? [initialPage] : []);
  const pages = rawPages.slice(0, targetPage);
  const items = useMemo(
    () => pages.flatMap((page) => page?.items ?? []),
    [pages],
  );
  const tableRows = useMemo(() => toGearTableRows(items), [items]);
  const trendingSet = useMemo(
    () => new Set(trendingSlugs ?? []),
    [trendingSlugs],
  );
  const lastPage = pages[pages.length - 1];
  const hasMore = lastPage?.hasMore ?? false;
  const { isLoadingInitial, isLoadingMore: isRequestedPageLoading } =
    getPageLoadingState(rawPages, targetPage, isValidating, Boolean(error));
  const isLoadingMore =
    !isLoadingInitial &&
    (isRequestingMore || isPending || isRequestedPageLoading);
  const showEmpty =
    !items.length && !error && !isLoadingInitial && !isLoadingMore;
  const listLoadedPageCount =
    view === "list" ? rawPages.filter(Boolean).length : 0;
  const total =
    pages[0]?.total ?? (shouldUseFallbackData ? initialPage.total : 0);

  useEffect(() => {
    loadingRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    const requestedPage = requestedPageRef.current;
    if (!requestedPage || (!error && !rawPages[requestedPage - 1])) return;

    requestedPageRef.current = null;
    loadingRef.current = false;
    setIsRequestingMore(false);
  }, [error, rawPages]);

  useEffect(() => {
    currentPageRef.current = targetPage;
  }, [targetPage]);

  useEffect(() => {
    if (size !== targetPage) {
      void setSize(targetPage);
    }
  }, [setSize, size, targetPage]);

  useEffect(() => {
    if (targetPage <= 1) {
      setInfiniteActive(false);
      autoScrollLoadsRef.current = 0;
      setAutoScrollLoads(0);
    }
  }, [targetPage]);

  const hasReachedAutoLoadLimit = autoScrollLoads >= MAX_AUTO_SCROLL_LOADS;

  const requestNextPage = useCallback(
    (nextPage: number) => {
      if (!hasMore || loadingRef.current) return false;

      loadingRef.current = true;
      requestedPageRef.current = nextPage;
      setIsRequestingMore(true);
      updatePage(nextPage);
      return true;
    },
    [hasMore, updatePage],
  );

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
          const nextPage = currentPageRef.current + 1;
          if (!requestNextPage(nextPage)) return;

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
    if (!isMobile) {
      setInfiniteActive(true);
      autoScrollLoadsRef.current = 0;
      setAutoScrollLoads(0);
    }
    requestNextPage(targetPage + 1);
  }, [isMobile, requestNextPage, targetPage]);

  const errorText = error ? t("loadError") : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {isLoadingInitial
            ? t("loadingResults")
            : t("showingResults", { count: total })}
        </p>
        <GearViewToggle view={view} onViewChange={setView} />
      </div>

      {errorText ? (
        <div className="text-destructive text-sm">{errorText}</div>
      ) : null}

      {showEmpty ? (
        <div className="text-muted-foreground text-sm">{t("noGearFound")}</div>
      ) : null}

      {view === "list" && isLoadingInitial ? (
        <GearTableSkeleton
          scope={
            scope.categorySlug === "cameras"
              ? "camera"
              : scope.categorySlug === "lenses"
                ? "lens"
                : "mixed"
          }
        />
      ) : view === "list" ? (
        <GearTable rows={tableRows} />
      ) : (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
          {isLoadingInitial
            ? BROWSE_RESULTS_SKELETON_KEYS.map((key) => (
                <GearCardSkeleton key={key} />
              ))
            : null}
          {items.map((g) => (
            <GearCard
              key={g.id}
              href={`/gear/${g.slug}`}
              slug={g.slug}
              name={g.name}
              regionalAliases={g.regionalAliases}
              brandName={g.brandName ?? brandName}
              thumbnailUrl={g.thumbnailUrl ?? undefined}
              gearType={g.gearType ?? undefined}
              isTrending={trendingSet.has(g.slug)}
              trendingQuery={{
                filters: {
                  brandId: trendingBrandId,
                  mountId: trendingMountId,
                },
              }}
              releaseDate={g.releaseDate}
              releaseDatePrecision={g.releaseDatePrecision}
              announcedDate={g.announcedDate}
              announceDatePrecision={g.announceDatePrecision}
              priceText={getItemDisplayPrice(g, {
                style: "short",
                padWholeAmounts: true,
                priceView,
              })}
            />
          ))}
        </div>
      )}

      {isLoadingMore ? (
        view === "list" ? (
          <GearTableSkeleton rows={6} showHeader={false} />
        ) : (
          <div className="relative grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
            <div className="from-background absolute right-0 bottom-0 left-0 z-10 h-full bg-linear-to-t to-transparent" />
            {BROWSE_LOADING_SKELETON_KEYS.map((key) => (
              <GearCardSkeleton key={key} />
            ))}
          </div>
        )
      ) : null}

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

      {!isMobile && infiniteActive ? (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinelRef} className="h-6 w-full" />
        </div>
      ) : null}
    </div>
  );
}

function BrowseResultsGridFallback({
  scope,
  view,
}: Pick<BrowseResultsGridProps, "scope"> & {
  view: ReturnType<typeof useGearResultsView>["view"];
}) {
  const t = useTranslations("browsePage");
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("loadingResults")}</p>
      {view === "list" ? (
        <GearTableSkeleton
          scope={
            scope.categorySlug === "cameras"
              ? "camera"
              : scope.categorySlug === "lenses"
                ? "lens"
                : "mixed"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
          {BROWSE_RESULTS_SKELETON_KEYS.map((key) => (
            <GearCardSkeleton key={key} />
          ))}
        </div>
      )}
    </div>
  );
}
