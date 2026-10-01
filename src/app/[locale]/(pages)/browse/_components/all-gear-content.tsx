import { FlameIcon, TrendingUpIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { JSX } from "react";
import { Suspense } from "react";
import { GearCard, GearCardSkeleton } from "~/components/gear/gear-card";
import { Button } from "~/components/ui/button";
import { orderBrandsWithPriority, splitBrandsWithPriority } from "~/lib/brands";
import { BRANDS } from "~/lib/constants";
import { getItemDisplayPrice } from "~/lib/mapping";
import {
  getPriceMarketForLocale,
  type ExchangeRates,
  type PriceMarket,
} from "~/lib/pricing/display-price";
import { getExchangeRates } from "~/server/pricing/exchange-rates";
import {
  fetchBrandBySlug,
  fetchBrowseTrendingRowItems,
  fetchReleaseFeedPage,
} from "~/server/gear/browse/service";
import { fetchTrendingSlugs } from "~/server/popularity/service";
import { OtherBrandsSelect } from "./other-brands-select";
import { ReleaseFeedGrid } from "./release-feed-grid";

const TRENDING_SKELETON_KEYS = [
  "trending-skeleton-1",
  "trending-skeleton-2",
  "trending-skeleton-3",
] as const;

export default async function AllGearContent({
  brandSlug,
  showBrandPicker = true,
}: {
  brandSlug?: string;
  showBrandPicker?: boolean;
} = {}) {
  const t = await getTranslations("browsePage");
  const locale = await getLocale();
  const market = getPriceMarketForLocale(locale);
  const exchangeRates = await getExchangeRates();
  // return <Loading />;
  const brand = brandSlug ? await fetchBrandBySlug(brandSlug) : null;
  if (brandSlug && !brand) {
    throw new Error(`Brand not found: ${brandSlug}`);
  }
  const brandId = brand?.id;

  const brandOptions = BRANDS.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    sortOrder: b.sort_order ?? null,
  }));
  const featured = orderBrandsWithPriority(brandOptions).slice(0, 3);

  const prioritizedBrands = splitBrandsWithPriority(brandOptions);
  const initialReleasePage = await fetchReleaseFeedPage({
    limit: 12,
    brandSlug,
  });
  const trendingSlugs = await fetchTrendingSlugs({
    timeframe: "30d",
    limit: 20,
    filters: brandId ? { brandId } : undefined,
  });

  return (
    <main className="space-y-8">
      {/* browse hero only on root browse page*/}
      {brandSlug ? null : (
        <section className="max-w-3xl space-y-4">
          <h1 className="text-3xl font-bold sm:text-5xl">
            {t("allGearTitle")}
          </h1>
          <p className="text-muted-foreground">{t("allGearDescription")}</p>
        </section>
      )}
      <section className="relative rounded-2xl">
        <div className="relative grid gap-8 lg:grid-cols-[2fr,1fr]">
          {showBrandPicker ? (
            <div className="">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {featured.map((b) => (
                  <Link
                    key={b.id}
                    href={`/browse/${b.slug}`}
                    className="border-border hover:bg-accent/40 group block rounded-lg border p-4 text-center"
                  >
                    <div className="text-lg font-semibold group-hover:underline">
                      {b.name}
                    </div>
                    <div className="text-muted-foreground mt-1 text-sm">
                      {t("browseBrand", { brand: b.name })}
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                {brandOptions.length ? (
                  <OtherBrandsSelect
                    brands={[
                      ...prioritizedBrands.hoisted,
                      ...prioritizedBrands.remaining,
                    ]}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <span>
              <FlameIcon className="size-5 text-orange-500" />
            </span>
            {t("trendingTitle")}
          </h2>
          <Button
            variant="link"
            asChild
            icon={<TrendingUpIcon className="text-muted-foreground h-3 w-3" />}
            iconPosition="right"
            className="text-muted-foreground pr-1"
          >
            <Link href="/lists/trending">{t("viewTrendingList")}</Link>
          </Button>
        </div>

        <Suspense fallback={<TrendingSkeleton />}>
          <TrendingGrid
            brandId={brandId}
            market={market}
            exchangeRates={exchangeRates}
          />
        </Suspense>
      </section>

      <ReleaseSection
        brandSlug={brandSlug}
        trendingBrandId={brandId}
        initialReleasePage={initialReleasePage}
        trendingSlugs={trendingSlugs}
        latestReleasesLabel={t("latestReleases")}
        market={market}
        exchangeRates={exchangeRates}
      />
    </main>
  );
}

async function TrendingGrid({
  brandId,
  market,
  exchangeRates,
}: {
  brandId?: string;
  market: PriceMarket;
  exchangeRates: ExchangeRates | null;
}) {
  const trendingResult = await fetchBrowseTrendingRowItems({
    brandId,
    limit: 3,
  });

  return (
    <div className="grid w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
      {trendingResult.map((g) => (
        <GearCard
          key={g.slug}
          href={`/gear/${g.slug}`}
          slug={g.slug}
          name={g.name}
          regionalAliases={g.regionalAliases}
          brandName={g.brandName}
          thumbnailUrl={g.thumbnailUrl ?? undefined}
          gearType={g.gearType}
          isTrending={g.isTrending}
          trendingStatusSource="live"
          releaseDate={g.releaseDate}
          releaseDatePrecision={g.releaseDatePrecision}
          announcedDate={g.announcedDate}
          announceDatePrecision={g.announceDatePrecision}
          priceText={getItemDisplayPrice(g, {
            style: "short",
            padWholeAmounts: true,
            market,
            locale:
              market === "US" ? "en-US" : market === "UK" ? "en-GB" : "de-DE",
            exchangeRates,
          })}
        />
      ))}
    </div>
  );
}

async function ReleaseSection({
  brandSlug,
  trendingBrandId,
  initialReleasePage,
  trendingSlugs,
  latestReleasesLabel,
  market,
  exchangeRates,
}: {
  brandSlug?: string;
  trendingBrandId?: string;
  initialReleasePage: Awaited<ReturnType<typeof fetchReleaseFeedPage>>;
  trendingSlugs: string[];
  latestReleasesLabel: string;
  market: PriceMarket;
  exchangeRates: ExchangeRates | null;
}): Promise<JSX.Element> {
  return (
    <section className="space-y-4">
      <ReleaseFeedGrid
        heading={latestReleasesLabel}
        initialPage={initialReleasePage}
        brandSlug={brandSlug}
        trendingBrandId={trendingBrandId}
        trendingSlugs={trendingSlugs}
        market={market}
        initialExchangeRates={exchangeRates}
      />
    </section>
  );
}

function TrendingSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
      {TRENDING_SKELETON_KEYS.map((key) => (
        <GearCardSkeleton key={key} />
      ))}
    </div>
  );
}
