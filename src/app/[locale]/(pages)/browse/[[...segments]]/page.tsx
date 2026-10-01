import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { JSX } from "react";
import { Suspense } from "react";
import { GearCardSkeleton } from "~/components/gear/gear-card";
import type { Locale } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import { BRANDS, MOUNTS } from "~/lib/constants";
import { getMountDisplayName } from "~/lib/mapping/mounts-map";
import { getPriceMarketForLocale } from "~/lib/pricing/display-price";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import {
  buildBrowseStaticParams,
  shouldPrebuildHeavyRouteLocale,
} from "~/lib/static-generation";
import {
  buildSeo,
  fetchBrandBrowseCategoryCounts,
  fetchBrowseListPage,
  getBrowseCategoryAvailability,
  getSingleCategoryBrandBrowseRedirectPath,
  resolveScopeOrThrow,
} from "~/server/gear/browse/service";
import { fetchTrendingSlugs } from "~/server/popularity/service";
import { getExchangeRates } from "~/server/pricing/exchange-rates";
import AllGearContent from "../_components/all-gear-content";
import BrandContent from "../_components/brand-content";
import Breadcrumbs from "../_components/breadcrumbs";
import { BrowseQueryControls } from "../_components/browse-query-controls";
import { BrowseResultsGrid } from "../_components/browse-results-grid";
import MountButtons from "../_components/mount-buttons";

export const dynamicParams = true;

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  if (!shouldPrebuildHeavyRouteLocale(params.locale)) {
    return [];
  }

  return buildBrowseStaticParams({
    brands: BRANDS,
    mounts: MOUNTS,
    includeMountRoutes: false,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; segments?: string[] }>;
}): Promise<Metadata> {
  const { locale, segments = [] } = await params;
  const meta = await buildSeo({ segments });
  const pathname =
    segments.length > 0 ? `/browse/${segments.join("/")}` : "/browse";
  return buildLocalizedMetadata(
    pathname,
    {
      title: meta.title,
      description: meta.description,
      openGraph: { title: meta.title, description: meta.description },
    },
    locale,
  );
}

export const revalidate = 86400;
const BROWSE_PAGE_SKELETON_KEYS = Array.from(
  { length: 12 },
  (_, index) => `browse-page-skeleton-${index + 1}`,
);

export default async function BrowseCatchAll({
  params,
}: {
  params: Promise<{ locale: string; segments?: string[] }>;
}) {
  const { locale, segments = [] } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("browsePage");
  const { depth, scope, brand, mount } = await resolveScopeOrThrow(segments);

  if (depth === 0) {
    return (
      <main className="space-y-6 pb-24">
        <AllGearContent />
      </main>
    );
  }

  if (depth === 1) {
    const categoryCounts = await fetchBrandBrowseCategoryCounts(brand!.id);
    const redirectPath = getSingleCategoryBrandBrowseRedirectPath({
      brandSlug: brand!.slug,
      counts: categoryCounts,
    });

    if (redirectPath) {
      redirect(localizePathname(redirectPath, locale as Locale));
    }

    return (
      <main className="space-y-6 pb-24">
        <Breadcrumbs brand={{ name: brand!.name, slug: brand!.slug }} />
        <h1 className="text-3xl font-semibold">{brand!.name}</h1>
        <BrandContent
          brandSlug={brand!.slug}
          categoryAvailability={getBrowseCategoryAvailability(categoryCounts)}
        />
      </main>
    );
  }

  const [initialPage, exchangeRates] = await Promise.all([
    fetchBrowseListPage({
      segments,
      searchParams: {},
    }),
    getExchangeRates(),
  ]);
  const market = getPriceMarketForLocale(locale);

  if (depth === 2) {
    const trendingSlugs = await fetchTrendingSlugs({
      timeframe: "30d",
      limit: 20,
      filters: { brandId: brand!.id },
    });
    return (
      <main className="space-y-6 pb-24">
        <Breadcrumbs
          brand={{ name: brand!.name, slug: brand!.slug }}
          category={scope.categorySlug}
        />
        <h1 className="text-3xl font-semibold">
          {brand!.name}{" "}
          {scope.categorySlug === "cameras" ? t("cameras") : t("lenses")}
        </h1>
        <MountButtons
          brandId={brand!.id}
          brandSlug={brand!.slug}
          category={scope.categorySlug!}
        />
        <Suspense fallback={<SortSelectFallback label={t("sortBy")} />}>
          <BrowseQueryControls category={scope.categorySlug} hasMount={false} />
        </Suspense>
        <Suspense
          fallback={<BrowseResultsLoading label={t("loadingResults")} />}
        >
          <BrowseResultsGrid
            initialPage={initialPage}
            brandName={brand!.name}
            scope={scope}
            trendingBrandId={brand!.id}
            trendingSlugs={trendingSlugs}
            market={market}
            initialExchangeRates={exchangeRates}
          />
        </Suspense>
      </main>
    );
  }

  const trendingSlugs = await fetchTrendingSlugs({
    timeframe: "30d",
    limit: 20,
    filters: { brandId: brand!.id, mountId: mount!.id },
  });

  return (
    <main className="space-y-6 pb-24">
      <Breadcrumbs
        brand={{ name: brand!.name, slug: brand!.slug }}
        category={scope.categorySlug}
        mountValue={mount?.value ?? null}
      />
      <h1 className="text-3xl font-semibold">
        {brand!.name}{" "}
        {t("mountLabel", { mount: getMountDisplayName(mount?.value) })}{" "}
        {scope.categorySlug === "cameras" ? t("cameras") : t("lenses")}
      </h1>
      <Suspense fallback={<SortSelectFallback label={t("sortBy")} />}>
        <BrowseQueryControls category={scope.categorySlug} hasMount={!!mount} />
      </Suspense>
      <Suspense fallback={<BrowseResultsLoading label={t("loadingResults")} />}>
        <BrowseResultsGrid
          initialPage={initialPage}
          brandName={brand!.name}
          scope={scope}
          trendingBrandId={brand!.id}
          trendingMountId={mount!.id}
          trendingSlugs={trendingSlugs}
          market={market}
          initialExchangeRates={exchangeRates}
        />
      </Suspense>
    </main>
  );
}

function SortSelectFallback({ label }: { label: string }): JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-end gap-2">
      <div className="border-input text-muted-foreground inline-flex h-10 w-[200px] items-center rounded-md border px-3 text-sm">
        {label}
      </div>
    </div>
  );
}

function BrowseResultsLoading({ label }: { label: string }): JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
        {BROWSE_PAGE_SKELETON_KEYS.map((key) => (
          <GearCardSkeleton key={key} />
        ))}
      </div>
    </div>
  );
}
