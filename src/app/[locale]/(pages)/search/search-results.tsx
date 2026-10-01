import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { GearCard, GearCardSkeleton } from "~/components/gear/gear-card";
import { UnderConstructionIndicator } from "~/components/gear/under-construction-indicator";
import {
  GearTable,
  GearTableSkeleton,
  toGearTableRows,
  type GearResultsView,
} from "~/components/table";
import { Empty, EmptyDescription, EmptyTitle } from "~/components/ui/empty";
import { getItemDisplayPrice } from "~/lib/mapping/price-map";
import { useExchangeRates } from "~/lib/pricing/use-exchange-rates";
import { useDisplayPriceMarket } from "~/lib/pricing/use-display-price-market";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import type { SearchResult } from "~/types/search-results";
import { SearchResultsSkeleton } from "./search-results-skeleton";

const LOADING_SKELETON_KEYS = Array.from(
  { length: 24 },
  (_, idx) => `search-loading-${idx}`,
);

type SearchResultsProps = {
  results: SearchResult[];
  isLoading: boolean;
  error: Error | null;
  trendingSlugs?: string[];
  isLoadingMore?: boolean;
  isReachingEnd?: boolean;
  view: GearResultsView;
  market: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
};
export function SearchResults(props: SearchResultsProps) {
  const {
    results,
    isLoading,
    error,
    trendingSlugs = [],
    isLoadingMore = false,
    isReachingEnd = false,
    view,
    market,
    initialExchangeRates,
  } = props;
  const exchangeRates = useExchangeRates(initialExchangeRates);
  const activeMarket = useDisplayPriceMarket(market);
  const construction = useTranslations("underConstructionPage");
  const trendingSet = new Set(trendingSlugs);

  useEffect(() => {
    if (error?.message) {
      toast.error(error.message);
    }
  }, [error]);

  if (isLoading) {
    return <SearchResultsSkeleton view={view} />;
  }

  if (results.length === 0) {
    return (
      <Empty className="h-[calc(100vh-300px)]">
        <EmptyTitle>No gear found</EmptyTitle>
        <EmptyDescription>Try adjusting your filters.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {view === "list" ? (
        <GearTable rows={toGearTableRows(results)} />
      ) : (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((item) => (
            <GearCard
              key={item.id}
              href={`/gear/${item.slug}`}
              slug={item.slug}
              name={item.name}
              regionalAliases={item.regionalAliases}
              brandName={item.brandName}
              thumbnailUrl={item.thumbnailUrl}
              isTrending={trendingSet.has(item.slug)}
              badges={
                item.isUnderConstruction ? (
                  <UnderConstructionIndicator
                    variant="badge"
                    label={construction("statusUnderConstruction")}
                    tooltip={construction("searchIndicatorTooltip")}
                  />
                ) : undefined
              }
              priceText={getItemDisplayPrice(
                {
                  usedPriceProjection: item.usedPriceProjection ?? null,
                  msrpNowUsdCents: item.msrpNowUsdCents ?? null,
                  msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents ?? null,
                  mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents ?? null,
                },
                { style: "short", market: activeMarket, exchangeRates },
              )}
              releaseDate={item.releaseDate ?? null}
              releaseDatePrecision={(item.releaseDatePrecision as any) ?? null}
              announcedDate={item.announcedDate ?? null}
              announceDatePrecision={
                (item.announceDatePrecision as any) ?? null
              }
            />
          ))}
        </div>
      )}
      {isLoadingMore &&
        (view === "list" ? (
          <GearTableSkeleton rows={6} showHeader={false} />
        ) : (
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {LOADING_SKELETON_KEYS.map((key) => (
              <GearCardSkeleton key={key} />
            ))}
          </div>
        ))}
      {isReachingEnd && results.length > 0 && (
        <div className="text-muted-foreground py-24 text-center text-sm">
          You have reached the end.
        </div>
      )}
    </div>
  );
}
