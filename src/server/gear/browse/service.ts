import { notFound } from "next/navigation";
import "server-only";
export {
  getBrowseCategoryAvailability,
  getSingleCategoryBrandBrowseRedirectPath,
} from "~/lib/browse/category-availability";
import type { BrowseFilters } from "~/lib/browse/filters";
import {
  normalizeBrowseFilters,
  type BrowseSearchParamsRecord,
} from "~/lib/browse/query";
import {
  formatScopeTitle,
  getDepth,
  parseSegments,
  type RouteScope,
} from "~/lib/browse/routing";
import { fetchGearAliasesByGearIds } from "~/server/gear/data";
import { attachGearListingTableFields } from "~/server/gear/listing-table-service";
import type {
  BrowseFeedPage,
  BrowseListItem,
  BrowseListPage,
} from "~/types/browse";
import type { BrowseGearRow, SearchGearResult } from "./data";
import {
  getBrandBySlug,
  getMountByShortName,
  getMountsForBrand,
  getPublishedGearCategoryCountsForBrand,
  getReleaseOrderedGearPage,
  searchGear,
} from "./data";
import { fetchTrending } from "~/server/popularity/service";
type LoadHubDataResult = {
  depth: 0 | 1 | 2 | 3;
  scope: RouteScope;
  brand?: { id: string; name: string; slug: string } | null;
  mount?: { id: string; shortName: string | null; value: string } | null;
  lists: SearchGearResult;
  filters: BrowseFilters;
};

export async function fetchBrandBySlug(slug: string) {
  return getBrandBySlug(slug);
}

export type BrowseTrendingCardFields = {
  slug: string;
  name: string;
  regionalAliases?: BrowseFeedPage["items"][number]["regionalAliases"];
  brandName: string | null;
  thumbnailUrl: string | null;
  gearType: string | null;
  releaseDate: string | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  announcedDate: string | null;
  announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents?: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection?: BrowseGearRow["usedPriceProjection"];
};

export type BrowseTrendingRowItem = BrowseTrendingCardFields & {
  isTrending: boolean;
  source: "7d" | "30d" | "newest";
};

export function selectBrowseTrendingRowItems(params: {
  trending7d: BrowseTrendingCardFields[];
  trending30d: BrowseTrendingCardFields[];
  newest: BrowseTrendingCardFields[];
  limit?: number;
}): BrowseTrendingRowItem[] {
  const limit = Math.max(1, Math.floor(params.limit ?? 3));
  const selected: BrowseTrendingRowItem[] = [];
  const seen = new Set<string>();

  const appendItems = (
    items: BrowseTrendingCardFields[],
    source: BrowseTrendingRowItem["source"],
  ) => {
    for (const item of items) {
      if (selected.length >= limit) break;
      if (seen.has(item.slug)) continue;

      selected.push({
        ...item,
        isTrending: source !== "newest",
        source,
      });
      seen.add(item.slug);
    }
  };

  appendItems(params.trending7d, "7d");
  appendItems(params.trending30d, "30d");
  appendItems(params.newest, "newest");

  return selected;
}

export async function fetchMountsForBrand(brandId: string) {
  return getMountsForBrand(brandId);
}

export async function fetchBrandBrowseCategoryCounts(brandId: string) {
  return getPublishedGearCategoryCountsForBrand(brandId);
}

export async function fetchBrowseTrendingRowItems(params: {
  brandId?: string;
  limit?: number;
}): Promise<BrowseTrendingRowItem[]> {
  const limit = Math.max(1, Math.floor(params.limit ?? 3));
  const candidateLimit = Math.max(limit * 4, 12);
  const filters = params.brandId ? { brandId: params.brandId } : undefined;

  const [trending7d, trending30d, newestPage] = await Promise.all([
    fetchTrending({
      timeframe: "7d",
      limit: candidateLimit,
      filters,
    }),
    fetchTrending({
      timeframe: "30d",
      limit: candidateLimit,
      filters,
    }),
    fetchReleaseFeedPage({
      limit: candidateLimit,
      brandId: params.brandId,
    }),
  ]);

  return selectBrowseTrendingRowItems({
    trending7d,
    trending30d,
    newest: newestPage.items,
    limit,
  });
}

export async function resolveScopeOrThrow(segments: string[]): Promise<{
  depth: 0 | 1 | 2 | 3;
  scope: RouteScope;
  brand?: { id: string; name: string; slug: string } | null;
  mount?: { id: string; shortName: string | null; value: string } | null;
}> {
  const scope = parseSegments(segments);
  const depth = getDepth(scope);
  let brand: { id: string; name: string; slug: string } | null = null;
  let mount: { id: string; shortName: string | null; value: string } | null =
    null;

  if (scope.brandSlug) {
    brand = await getBrandBySlug(scope.brandSlug);
    if (!brand) notFound();
  }
  if (scope.mountShort) {
    if (!brand) notFound();
    const m = await getMountByShortName(scope.mountShort, brand.id);
    if (!m) notFound();
    mount = { id: m.id, shortName: m.shortName, value: m.value };
  }
  return { depth, scope, brand, mount };
}

export async function loadHubData(params: {
  segments: string[];
  searchParams: BrowseSearchParamsRecord;
}): Promise<LoadHubDataResult> {
  const { depth, scope, brand, mount } = await resolveScopeOrThrow(
    params.segments,
  );
  const filters = normalizeBrowseFilters(params.searchParams, scope);

  const effectiveBrandSlug =
    scope.brandSlug ?? filters.brandOverride ?? undefined;
  const effectiveBrand = scope.brandSlug
    ? brand
    : effectiveBrandSlug
      ? await getBrandBySlug(effectiveBrandSlug)
      : null;

  if (depth === 0) {
    const lists = effectiveBrand
      ? await searchGear({ brandId: effectiveBrand.id, filters })
      : await searchGear({ filters });
    const listsWithAliases = await attachAliasesToLists(lists);
    return {
      depth,
      scope,
      brand: effectiveBrand,
      lists: listsWithAliases,
      filters,
    };
  }

  if (depth === 1) {
    const lists = await searchGear({ brandId: brand!.id, filters });
    const listsWithAliases = await attachAliasesToLists(lists);
    return { depth, scope, brand, lists: listsWithAliases, filters };
  }

  if (depth === 2) {
    const lists = await searchGear({
      brandId: brand!.id,
      category: scope.categorySlug!,
      filters,
    });
    const listsWithAliases = await attachAliasesToLists(lists);
    return { depth, scope, brand, lists: listsWithAliases, filters };
  }

  const mountInfo = mount!;
  const lists = await searchGear({
    brandId: brand!.id,
    category: scope.categorySlug!,
    mountId: mountInfo.id,
    filters,
  });
  const listsWithAliases = await attachAliasesToLists(lists);
  return {
    depth,
    scope,
    brand,
    mount: mountInfo,
    lists: listsWithAliases,
    filters,
  };
}

export async function buildSeo(params: { segments: string[] }) {
  // Load data once to obtain scope + total for descriptive metadata
  const { scope, brand, mount, lists } = await loadHubData({
    segments: params.segments,
    searchParams: {},
  });

  // Special-case the browse index for clearer SEO
  if (!scope.brandSlug && !scope.categorySlug && !scope.mountShort) {
    const base = process.env.NEXT_PUBLIC_BASE_URL!;
    const title = "All Gear";
    const description =
      "Explore the latest and trending cameras and lenses from Canon, Nikon, Sony, and more, as well as curated lists of gear.";
    const canonical = `${base}/browse`;
    const openGraph = { title, description, url: canonical };
    return { title, description, canonical, openGraph };
  }

  const plainTitle = formatScopeTitle({
    brandName: brand?.name ?? null,
    category: scope.categorySlug ?? null,
    mountValue: mount?.value ?? null,
  });
  const title = `${plainTitle}`;
  const description = `Explore all ${lists.total} ${plainTitle}`;
  const canonical = buildCanonical(scope);
  const openGraph = { title, description, url: canonical };
  return { title, description, canonical, openGraph };
}

function buildCanonical(scope: RouteScope) {
  const base = process.env.NEXT_PUBLIC_BASE_URL!;
  const segs: string[] = ["browse"];
  if (scope.brandSlug) segs.push(scope.brandSlug);
  if (scope.categorySlug) segs.push(scope.categorySlug);
  if (scope.mountShort) segs.push(scope.mountShort);
  return `${base}/${segs.join("/")}`;
}

// Deprecated: static params are generated directly in the page route

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 60;

export async function fetchReleaseFeedPage(params: {
  limit?: number;
  brandId?: string;
  brandSlug?: string;
  offset?: number;
}): Promise<BrowseFeedPage> {
  const limit = Math.max(
    1,
    Math.min(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
  );
  const offset = Math.max(0, Math.floor(params.offset ?? 0));

  const page = await getReleaseOrderedGearPage({
    limit,
    brandId: params.brandId,
    brandSlug: params.brandSlug,
    offset,
  });

  const [aliasesById, tableItems] = await Promise.all([
    fetchGearAliasesByGearIds(page.items.map((item) => item.id)),
    attachGearListingTableFields(page.items),
  ]);
  const items = tableItems.map((item) => ({
    ...item,
    regionalAliases: aliasesById.get(item.id) ?? [],
    releaseDate: item.releaseDate ? item.releaseDate.toISOString() : null,
    releaseDatePrecision: item.releaseDatePrecision ?? null,
    announcedDate: item.announcedDate ? item.announcedDate.toISOString() : null,
    announceDatePrecision: item.announceDatePrecision ?? null,
    brandName: item.brandName ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    gearType: item.gearType ?? null,
    msrpNowUsdCents:
      typeof item.msrpNowUsdCents === "number" ? item.msrpNowUsdCents : null,
    mpbMaxPriceUsdCents:
      typeof item.mpbMaxPriceUsdCents === "number"
        ? item.mpbMaxPriceUsdCents
        : null,
    mountNames: item.mountNames,
    sensorFormatName: item.sensorFormatName,
    analogCaptureMedium: item.analogCaptureMedium,
    weightGrams: item.weightGrams,
    focalLengthMinMm: item.focalLengthMinMm,
    focalLengthMaxMm: item.focalLengthMaxMm,
    isPrime: item.isPrime,
    maxApertureWide: item.maxApertureWide,
    maxApertureTele: item.maxApertureTele,
  }));

  const nextCursor = page.hasMore
    ? {
        offset: offset + limit,
      }
    : null;

  return {
    items,
    nextCursor,
    hasMore: page.hasMore,
  };
}

export async function fetchBrowseListPage(params: {
  segments: string[];
  searchParams: BrowseSearchParamsRecord;
}): Promise<BrowseListPage> {
  const { lists, filters } = await loadHubData(params);
  return serializeBrowseListPage(lists, filters);
}

export function serializeBrowseListPage(
  lists: SearchGearResult,
  filters: BrowseFilters,
): BrowseListPage {
  return {
    items: lists.items.map(serializeBrowseListItem),
    total: lists.total,
    page: filters.page,
    perPage: filters.perPage,
    hasMore: filters.page * filters.perPage < lists.total,
  };
}

function serializeBrowseListItem(
  item: SearchGearResult["items"][number],
): BrowseListItem {
  return {
    ...item,
    releaseDate: item.releaseDate ? item.releaseDate.toISOString() : null,
    releaseDatePrecision: item.releaseDatePrecision ?? null,
    announcedDate: item.announcedDate ? item.announcedDate.toISOString() : null,
    announceDatePrecision: item.announceDatePrecision ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    brandName: item.brandName ?? null,
    gearType: item.gearType ?? null,
    msrpNowUsdCents:
      typeof item.msrpNowUsdCents === "number" ? item.msrpNowUsdCents : null,
    mpbMaxPriceUsdCents:
      typeof item.mpbMaxPriceUsdCents === "number"
        ? item.mpbMaxPriceUsdCents
        : null,
    mountNames: item.mountNames ?? [],
    sensorFormatName: item.sensorFormatName ?? null,
    analogCaptureMedium: item.analogCaptureMedium ?? null,
    weightGrams: item.weightGrams ?? null,
    focalLengthMinMm: item.focalLengthMinMm ?? null,
    focalLengthMaxMm: item.focalLengthMaxMm ?? null,
    isPrime: item.isPrime ?? null,
    maxApertureWide: item.maxApertureWide ?? null,
    maxApertureTele: item.maxApertureTele ?? null,
  };
}

async function attachAliasesToLists(lists: SearchGearResult) {
  const [tableItems, aliasesById] = await Promise.all([
    attachGearListingTableFields(lists.items),
    fetchGearAliasesByGearIds(lists.items.map((item) => item.id)),
  ]);
  return {
    ...lists,
    items: tableItems.map((item) => ({
      ...item,
      regionalAliases: aliasesById.get(item.id) ?? [],
    })),
  };
}
