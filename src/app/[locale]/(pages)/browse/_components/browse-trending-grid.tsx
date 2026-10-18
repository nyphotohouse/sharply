"use client";

import useSWR from "swr";
import { GearCard } from "~/components/gear/gear-card";
import { getItemDisplayPrice } from "~/lib/mapping";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import { usePriceView } from "~/lib/pricing/use-price-view";
import type { BrowseTrendingRowItem } from "~/server/gear/browse/service";

type BrowseTrendingResponse = { items: BrowseTrendingRowItem[] };

async function fetchBrowseTrending(
  url: string,
): Promise<BrowseTrendingResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Browse trending request failed: ${response.status}`);
  }
  return response.json() as Promise<BrowseTrendingResponse>;
}

function getBrowseTrendingUrl(brandId?: string): string {
  const search = new URLSearchParams();
  if (brandId) search.set("brandId", brandId);
  const query = search.toString();
  return query ? `/api/trending/browse?${query}` : "/api/trending/browse";
}

/**
 * Trending row for browse index and brand pages.
 *
 * The server renders the stable 24h ranking so the page keeps its 24h ISR
 * window; after hydration we fetch the live-boosted row once and swap it in.
 * If that request fails, the server-rendered row stays visible.
 */
export function BrowseTrendingGrid({
  initialItems,
  brandId,
  market,
  initialExchangeRates,
}: {
  initialItems: BrowseTrendingRowItem[];
  brandId?: string;
  market: PriceMarket;
  initialExchangeRates: ExchangeRates | null;
}) {
  const priceView = usePriceView(market, initialExchangeRates);
  const { data } = useSWR<BrowseTrendingResponse>(
    getBrowseTrendingUrl(brandId),
    fetchBrowseTrending,
    {
      fallbackData: { items: initialItems },
      keepPreviousData: true,
      // fallbackData would otherwise suppress the mount request that applies
      // the live boost.
      revalidateOnMount: true,
      revalidateOnFocus: false,
    },
  );
  const items = data?.items.length ? data.items : initialItems;

  return (
    <div className="grid w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <GearCard
          key={item.slug}
          href={`/gear/${item.slug}`}
          slug={item.slug}
          name={item.name}
          regionalAliases={item.regionalAliases}
          brandName={item.brandName}
          thumbnailUrl={item.thumbnailUrl ?? undefined}
          gearType={item.gearType}
          isTrending={item.isTrending}
          trendingStatusSource="live"
          releaseDate={item.releaseDate}
          releaseDatePrecision={item.releaseDatePrecision}
          announcedDate={item.announcedDate}
          announceDatePrecision={item.announceDatePrecision}
          priceText={getItemDisplayPrice(item, {
            style: "short",
            padWholeAmounts: true,
            priceView,
          })}
        />
      ))}
    </div>
  );
}
