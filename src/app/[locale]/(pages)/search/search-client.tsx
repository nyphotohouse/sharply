"use client";

import { RefreshCcwDot, SearchIcon } from "lucide-react";
import { parseAsNativeArrayOf, parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef } from "react";
import useSwr from "swr";
import useSWRInfinite from "swr/infinite";
import type { TagSelectOption } from "~/components/custom-inputs/tag-select";
import { SortSelect } from "~/components/search/sort-select";
import { GearViewToggle, useGearResultsView } from "~/components/table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { useDebounce } from "~/lib/hooks/useDebounce";
import { normalizeTagSlugs } from "~/lib/tags/normalize-tag-slugs";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import {
  normalizeSearchGearTypeForApi,
  normalizeSearchGearTypeForUi,
} from "~/lib/search/gear-type-param";
import type { SearchResponse } from "~/types/search-results";
import { buildSearchHref } from "~/lib/utils/url";
import { FiltersSidebar } from "./filters-sidebar";
import { MobileFiltersDrawer } from "./mobile-filters-drawer";
import { SearchResults } from "./search-results";

const fetcher = <T,>(url: string): Promise<T> =>
  fetch(url).then((res) => res.json() as Promise<T>);
const fetcherJson = <T,>(url: string): Promise<T> =>
  fetch(url).then((res) => res.json() as Promise<T>);
const PAGE_SIZE = 24;

type SearchClientProps = {
  tagOptions: readonly TagSelectOption[];
  initialPage?: {
    results: any[];
    total?: number;
    totalPages?: number;
    page: number;
    pageSize: number;
  } | null;
  market: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
};

export function SearchClient({
  initialPage,
  tagOptions,
  market,
  initialExchangeRates,
}: SearchClientProps) {
  const { view, setView } = useGearResultsView();
  const [q, setQ] = useQueryState("q");
  const [sort] = useQueryState("sort");
  const [brand, setBrand] = useQueryState("brand");
  const [mount, setMount] = useQueryState("mount");
  const [gearType, setGearType] = useQueryState("gearType");
  const [sensorFormat, setSensorFormat] = useQueryState("sensorFormat");
  const [lensType, setLensType] = useQueryState("lensType");
  const [analogCameraType, setAnalogCameraType] =
    useQueryState("analogCameraType");
  const [priceMin, setPriceMin] = useQueryState("priceMin");
  const [priceMax, setPriceMax] = useQueryState("priceMax");
  const [megapixelsMin, setMegapixelsMin] = useQueryState("megapixelsMin");
  const [megapixelsMax, setMegapixelsMax] = useQueryState("megapixelsMax");
  const [focalIncludes, setFocalIncludes] = useQueryState("focalIncludes");
  const [widestFocalMax, setWidestFocalMax] = useQueryState("widestFocalMax");
  const [longestFocalMin, setLongestFocalMin] =
    useQueryState("longestFocalMin");
  const [fastestApertureMax, setFastestApertureMax] =
    useQueryState("fastestApertureMax");
  const [isoMin, setIsoMin] = useQueryState("isoMin");
  const [isoMax, setIsoMax] = useQueryState("isoMax");
  const [hasAutofocus, setHasAutofocus] = useQueryState("hasAutofocus");
  const [hasStabilization, setHasStabilization] =
    useQueryState("hasStabilization");
  const [hasIbis, setHasIbis] = useQueryState("hasIbis");
  const [hasWeatherSealing, setHasWeatherSealing] =
    useQueryState("hasWeatherSealing");
  const [tags, setTags] = useQueryState(
    "tag",
    parseAsNativeArrayOf(parseAsString).withDefault([]),
  );
  const normalizedTags = useMemo(
    () => normalizeTagSlugs(tags, tagOptions),
    [tagOptions, tags],
  );
  useEffect(() => {
    const tagsChanged =
      normalizedTags.length !== tags.length ||
      normalizedTags.some((tag, index) => tag !== tags[index]);
    if (tagsChanged) void setTags(normalizedTags);
  }, [normalizedTags, setTags, tags]);
  const debouncedQ = useDebounce(q, 400);

  const normalizedGearType = useMemo(
    () => normalizeSearchGearTypeForUi(gearType),
    [gearType],
  );
  const mappedGearType = useMemo(
    () => normalizeSearchGearTypeForApi(gearType),
    [gearType],
  );

  // Default sort: newest when no query; relevance when query present
  const effectiveSort = useMemo(() => {
    const hasQuery = (q ?? "").trim().length > 0;
    if (!hasQuery) {
      if (!sort || sort === "relevance") return "newest";
      return sort;
    }
    return sort || "relevance";
  }, [q, sort]);

  const getKey = useMemo(() => {
    return (pageIndex: number) => {
      const base = "/api/search";

      return buildSearchHref(base, {
        q: debouncedQ,
        sort: effectiveSort,
        page: pageIndex + 1,
        pageSize: PAGE_SIZE,
        includeTotal: pageIndex === 0 ? undefined : "false",
        brand,
        mount,
        gearType: mappedGearType,
        sensorFormat,
        lensType,
        analogCameraType,
        megapixelsMin,
        megapixelsMax,
        focalIncludes,
        widestFocalMax,
        longestFocalMin,
        fastestApertureMax,
        isoMin,
        isoMax,
        hasAutofocus,
        hasStabilization,
        hasIbis,
        hasWeatherSealing,
        priceMin,
        priceMax,
        tag: normalizedTags,
      });
    };
  }, [
    debouncedQ,
    effectiveSort,
    brand,
    mount,
    mappedGearType,
    sensorFormat,
    lensType,
    analogCameraType,
    megapixelsMin,
    megapixelsMax,
    focalIncludes,
    widestFocalMax,
    longestFocalMin,
    fastestApertureMax,
    isoMin,
    isoMax,
    hasAutofocus,
    hasStabilization,
    hasIbis,
    hasWeatherSealing,
    priceMin,
    priceMax,
    normalizedTags,
  ]);

  const noFiltersActive = useMemo(() => {
    return (
      !brand &&
      !mount &&
      !normalizedGearType &&
      !sensorFormat &&
      !lensType &&
      !analogCameraType &&
      !megapixelsMin &&
      !megapixelsMax &&
      !focalIncludes &&
      !widestFocalMax &&
      !longestFocalMin &&
      !fastestApertureMax &&
      !isoMin &&
      !isoMax &&
      !hasAutofocus &&
      !hasStabilization &&
      !hasIbis &&
      !hasWeatherSealing &&
      !priceMin &&
      !priceMax &&
      normalizedTags.length === 0
    );
  }, [
    brand,
    mount,
    normalizedGearType,
    sensorFormat,
    lensType,
    analogCameraType,
    megapixelsMin,
    megapixelsMax,
    focalIncludes,
    widestFocalMax,
    longestFocalMin,
    fastestApertureMax,
    isoMin,
    isoMax,
    hasAutofocus,
    hasStabilization,
    hasIbis,
    hasWeatherSealing,
    priceMin,
    priceMax,
    normalizedTags,
  ]);

  const { data, error, size, setSize } = useSWRInfinite<SearchResponse>(
    getKey,
    fetcher,
    {
      initialSize: 1,
      revalidateFirstPage: true,
      fallbackData:
        !debouncedQ && noFiltersActive && initialPage
          ? [initialPage]
          : undefined,
    },
  );

  const flattenedResults = data?.flatMap((page) => page?.results ?? []) ?? [];
  const latestPage = data?.at?.(-1) ?? data?.[data.length - 1];
  const firstPage = data?.[0];
  // const totalPages = firstPage?.totalPages ?? latestPage?.totalPages ?? 0;
  // const currentPage = latestPage?.page ?? 1;
  const totalCount = firstPage?.total ?? flattenedResults.length;
  const isLoadingInitial = !data && !error;
  const isLoadingMore =
    isLoadingInitial || (size > 0 && typeof data?.[size - 1] === "undefined");
  const isReachingEnd = data?.length
    ? (latestPage?.results?.length ?? 0) < PAGE_SIZE ||
      (totalCount ? flattenedResults.length >= totalCount : false)
    : false;

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    if (isReachingEnd || isLoadingMore) return;

    const observer = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first?.isIntersecting) {
        void setSize((prev) => prev + 1);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isReachingEnd, isLoadingMore, setSize]);

  type TrendingResponse = { items?: { slug: string }[] };

  const { data: trendingData } = useSwr<TrendingResponse>(
    "/api/trending?timeframe=30d&perPage=20",
    fetcherJson,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-5xl space-y-4 px-4 text-center sm:px-8">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
          {isLoadingInitial && (
            <div className="absolute top-0 right-6 bottom-0 z-20 flex items-center justify-center">
              <Spinner className="size-6" />
            </div>
          )}
          <Input
            value={q ?? ""}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a camera, lens, or other gear"
            className="h-16 rounded-2xl px-12"
          />
        </div>
      </section>

      <section className="px-4 sm:px-8">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              Showing {flattenedResults.length}
              {totalCount ? ` of ${totalCount}` : ""} results
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCcwDot className="size-4" />}
              onClick={() => {
                void setGearType(null);
                void setMount(null);
                void setSensorFormat(null);
                void setBrand(null);
                void setLensType(null);
                void setAnalogCameraType(null);
                void setPriceMin(null);
                void setPriceMax(null);
                void setMegapixelsMin(null);
                void setMegapixelsMax(null);
                void setFocalIncludes(null);
                void setWidestFocalMax(null);
                void setLongestFocalMin(null);
                void setFastestApertureMax(null);
                void setIsoMin(null);
                void setIsoMax(null);
                void setHasAutofocus(null);
                void setHasStabilization(null);
                void setHasIbis(null);
                void setHasWeatherSealing(null);
                void setTags([]);
              }}
            >
              Reset filters
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="sm:hidden">
              <MobileFiltersDrawer tagOptions={tagOptions} />
            </div>
            <GearViewToggle view={view} onViewChange={setView} />
            <SortSelect />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 border-t px-4 sm:grid-cols-3 sm:px-8 lg:grid-cols-5">
        <div className="col-span-1 hidden h-full sm:block">
          <FiltersSidebar tagOptions={tagOptions} />
        </div>
        <div className="col-span-1 h-full min-h-screen pl-4 sm:col-span-2 lg:col-span-4">
          <SearchResults
            results={flattenedResults}
            isLoading={isLoadingInitial}
            error={error}
            trendingSlugs={trendingData?.items?.map((item) => item.slug) ?? []}
            isLoadingMore={isLoadingMore}
            isReachingEnd={isReachingEnd}
            view={view}
            market={market}
            initialExchangeRates={initialExchangeRates}
          />
          <div ref={loadMoreRef} className="h-12 w-full" aria-hidden />
        </div>
      </section>
    </div>
  );
}
