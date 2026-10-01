import type { Metadata } from "next";
import { Suspense } from "react";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import { hasActiveSearchState } from "~/lib/search/has-active-search-state";
import { getPriceMarketForLocale } from "~/lib/pricing/display-price";
import { searchGear } from "~/server/search/service";
import { getExchangeRates } from "~/server/pricing/exchange-rates";
import { fetchPublicTagOptions } from "~/server/tags/service";
import { NaturalLanguageSearchToast } from "./natural-language-search-toast";
import { SearchClient } from "./search-client";
import { SearchPageSkeleton } from "./search-page-skeleton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedMetadata(
    "/search",
    {
      title: "Search",
      openGraph: {
        title: "Search",
      },
    },
    locale,
  );
}

type SearchPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SearchPage({
  params: routeParams,
  searchParams,
}: SearchPageProps) {
  const { locale } = await routeParams;
  const params = await searchParams;
  const hasSearchState = hasActiveSearchState(params);

  // SSR first page (newest) when no query is present
  const initialPagePromise = hasSearchState
    ? Promise.resolve(null)
    : searchGear({
        query: undefined,
        sort: "newest",
        page: 1,
        pageSize: 24,
        includeTotal: true,
        includeConstructionState: true,
        filters: undefined,
      });
  const [initialPage, tagOptions, exchangeRates] = await Promise.all([
    initialPagePromise,
    fetchPublicTagOptions(),
    getExchangeRates(),
  ]);

  return (
    <main className="min-h-screen space-y-10 pt-24">
      <NaturalLanguageSearchToast />
      <Suspense fallback={<SearchPageSkeleton />}>
        <SearchClient
          initialPage={initialPage}
          tagOptions={tagOptions}
          market={getPriceMarketForLocale(locale)}
          initialExchangeRates={exchangeRates}
        />
      </Suspense>
    </main>
  );
}
