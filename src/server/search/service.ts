// In Next.js runtime, enforce server-only import. In scripts (Node), skip.
if (process.env.NEXT_RUNTIME) {
  import("server-only").catch(() => {
    console.warn("[search:service] server-only import failed, skipping.");
  });
}

import { asc, desc, sql, type SQL } from "drizzle-orm";
import { getConstructionState } from "~/lib/utils";
import { buildCompareHref, buildSearchHref } from "~/lib/utils/url";
import { gear } from "~/server/db/schema";
import { buildUsComparablePriceSql } from "~/server/pricing/sql";
import { toConstructionGearItem } from "~/server/gear/construction-service";
import {
  fetchGearAliasesByGearIds,
  fetchGearConstructionDataByIds,
} from "~/server/gear/data";
import { attachGearListingTableFields } from "~/server/gear/listing-table-service";
import type { GearAlias, GearRegion } from "~/types/gear";
import type {
  BrandSuggestion,
  CompareSmartActionSuggestion,
  GearSuggestion,
  ParsedSearchIntentKind,
  ParsedSearchSmartActionSuggestion,
  Suggestion,
} from "~/types/search";
import {
  buildRelevanceExpr,
  buildSearchFilterClause,
  buildSearchWhereClause,
  queryBrandSuggestions,
  queryGearSuggestions,
  queryMountValuesByGearIds,
  querySearchRows,
  querySearchTotal,
} from "./data";
import { parseNaturalLanguageSearchIntent } from "./natural-language-intent";
import {
  normalizeSearchQuery,
  normalizeSearchQueryNoPunct,
} from "./query-normalization";
import {
  applyExactMatchMetadata,
  buildGearSuggestion,
  parseCompareIntent,
} from "./suggestion-intent";
import type {
  SearchFilters,
  SearchParams,
  SearchResponse,
  SearchResult,
} from "~/types/search-results";
export type {
  SearchFilters,
  SearchParams,
  SearchResponse,
  SearchResult,
  SearchSort,
} from "~/types/search-results";

/**
 * Search Service Layer
 *
 * Responsibilities:
 * - Orchestrates inputs (query, filters, pagination) and composes data-layer functions.
 * - Shapes return types for API/server components.
 * - Leaves low-level SQL/DB details to data.ts.
 */
// use buildSearchWhereClause directly from data.ts

export async function searchGear(
  params: SearchParams,
): Promise<SearchResponse> {
  const {
    query,
    sort,
    page,
    pageSize,
    filters,
    includeTotal,
    includeConstructionState = false,
  } = params;
  const offset = (page - 1) * pageSize;

  let whereClause: SQL | undefined = undefined;
  let normalizedQueryNoPunct: string | null = null;
  if (query && query.trim().length > 0) {
    whereClause = buildSearchWhereClause(query);
    normalizedQueryNoPunct = normalizeSearchQueryNoPunct(query);
  }

  if (filters) {
    const filterClause = buildSearchFilterClause(filters);
    if (filterClause) {
      whereClause = whereClause
        ? sql`(${whereClause}) AND (${filterClause})`
        : filterClause;
    }
  }

  const relevanceExpr = query
    ? buildRelevanceExpr(query, normalizedQueryNoPunct!)
    : sql<number>`0`;

  let orderBy: any[];
  if (query && sort === "relevance") {
    orderBy = [desc(relevanceExpr), asc(gear.name)];
  } else if (sort === "newest") {
    orderBy = [sql`${gear.releaseDate} DESC NULLS LAST`, asc(gear.name)];
  } else if (sort === "price_asc") {
    const comparablePrice = buildUsComparablePriceSql();
    orderBy = [
      sql`${comparablePrice} ASC NULLS LAST`,
      asc(gear.name),
      asc(gear.id),
    ];
  } else if (sort === "price_desc") {
    const comparablePrice = buildUsComparablePriceSql();
    orderBy = [
      sql`${comparablePrice} DESC NULLS LAST`,
      asc(gear.name),
      asc(gear.id),
    ];
  } else {
    orderBy = [asc(gear.name)];
  }

  const rows = (await querySearchRows({
    whereClause,
    orderBy,
    pageSize,
    offset,
    relevanceExpr: query && sort === "relevance" ? relevanceExpr : undefined,
    includeMounts: Boolean(filters?.mount),
    includeSensorFormats: needsCameraSpecs(filters),
    includeLensSpecs: needsLensSpecs(filters),
    includeAnalogSpecs: Boolean(filters?.analogCameraType),
  })) as unknown as Array<{ id: string }>;

  const resultIds = rows.map((row) => row.id);
  const [tableRows, aliasesById, constructionRows] = await Promise.all([
    attachGearListingTableFields(rows),
    fetchGearAliasesByGearIds(resultIds),
    includeConstructionState
      ? fetchGearConstructionDataByIds(resultIds)
      : Promise.resolve([]),
  ]);
  const constructionById = new Map(
    constructionRows.map((row) => [
      row.id,
      getConstructionState(toConstructionGearItem(row)).underConstruction,
    ]),
  );

  const results = tableRows.map((row) => ({
    ...row,
    regionalAliases: aliasesById.get(row.id) ?? [],
    isUnderConstruction: constructionById.get(row.id) ?? false,
  }));

  const total =
    includeTotal === false
      ? undefined
      : await querySearchTotal(
          whereClause,
          Boolean(filters?.mount),
          needsCameraSpecs(filters),
          needsLensSpecs(filters),
          Boolean(filters?.analogCameraType),
        );
  const totalPages =
    total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;

  return {
    results: results as unknown as SearchResult[],
    total,
    totalPages,
    page,
    pageSize,
  };
}

function needsCameraSpecs(filters?: SearchFilters) {
  return (
    Boolean(filters?.sensorFormat) ||
    filters?.megapixelsMin !== undefined ||
    filters?.megapixelsMax !== undefined ||
    filters?.isoMin !== undefined ||
    filters?.isoMax !== undefined ||
    Boolean(filters?.hasIbis) ||
    Boolean(filters?.hasWeatherSealing)
  );
}

function needsLensSpecs(filters?: SearchFilters) {
  return (
    Boolean(filters?.lensType) ||
    filters?.focalIncludes !== undefined ||
    filters?.widestFocalMax !== undefined ||
    filters?.longestFocalMin !== undefined ||
    filters?.fastestApertureMax !== undefined ||
    Boolean(filters?.hasAutofocus) ||
    Boolean(filters?.hasStabilization)
  );
}

export type GetSuggestionsOptions = {
  /** When `["gear"]`, return only gear suggestions (no brands / smart actions). */
  types?: Array<"gear">;
  filters?: {
    gearType?: string;
  };
};

export async function getSuggestions(
  query: string,
  limit = 8,
  region?: GearRegion | null,
  options?: GetSuggestionsOptions,
): Promise<Suggestion[]> {
  if (!query || query.length < 2) return [];

  const gearOnly = options?.types?.length === 1 && options.types[0] === "gear";
  const gearTypeFilter = options?.filters?.gearType;

  if (gearOnly) {
    const gearLimit = Math.max(1, Math.min(20, limit));
    return buildRankedSuggestions(query, region, {
      gearOnly: true,
      gearLimit,
      gearType: gearTypeFilter,
    });
  }

  const compareIntent = parseCompareIntent(query);
  const compareSmartAction = compareIntent
    ? await buildCompareSmartAction(
        compareIntent.left,
        compareIntent.right,
        region,
      )
    : null;
  const parsedSearchIntent = compareSmartAction
    ? null
    : await parseNaturalLanguageSearchIntent(query, async (cameraQuery) =>
        resolveStrongGearMatch(cameraQuery, region, { gearType: "CAMERA" }),
      );
  const parsedSearchSmartAction = parsedSearchIntent
    ? buildParsedSearchSmartAction(parsedSearchIntent)
    : null;

  const rankedSuggestions = await buildRankedSuggestions(query, region, {
    gearType: gearTypeFilter,
  });

  return (
    compareSmartAction
      ? [compareSmartAction, ...rankedSuggestions]
      : parsedSearchSmartAction
        ? [parsedSearchSmartAction, ...rankedSuggestions]
        : rankedSuggestions
  ).slice(0, limit);
}

type SuggestGearRow = {
  id: string;
  name: string;
  slug: string;
  brandName: string | null;
  gearType: string;
  relevance?: number;
};

type BuildRankedSuggestionsOptions = {
  gearOnly?: boolean;
  gearLimit?: number;
  gearType?: string;
};

async function buildRankedSuggestions(
  query: string,
  region?: GearRegion | null,
  options?: BuildRankedSuggestionsOptions,
): Promise<Suggestion[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedQueryNoPunct = normalizeSearchQueryNoPunct(query);
  let whereClause = buildSearchWhereClause(query)!;
  if (options?.gearType) {
    whereClause = sql`(${whereClause}) AND (${gear.gearType} = ${options.gearType})`;
  }
  const relevanceExpr = buildRelevanceExpr(query, normalizedQueryNoPunct);

  const gearLimit = options?.gearOnly
    ? Math.max(1, Math.min(20, options.gearLimit ?? 8))
    : 5;
  const gearResults = await queryGearSuggestions(
    whereClause,
    relevanceExpr,
    gearLimit,
  );
  const gearSuggestions = await buildGearSuggestions(
    gearResults,
    query,
    region,
  );

  if (options?.gearOnly) {
    return gearSuggestions;
  }

  const brandResults = await queryBrandSuggestions(normalizedQuery);
  const brandSuggestions: BrandSuggestion[] = brandResults.map((item) => ({
    id: `brand:${item.id}`,
    kind: "brand",
    type: "brand",
    brandId: item.id,
    brandName: item.name,
    title: item.name,
    label: item.name,
    subtitle: "Brand",
    href: `/brand/${item.slug}`,
    relevance: item.relevance,
  }));

  return [...gearSuggestions, ...brandSuggestions].sort(
    (a, b) => (b.relevance ?? 0) - (a.relevance ?? 0),
  );
}

async function buildGearSuggestions(
  gearResults: SuggestGearRow[],
  query: string,
  region?: GearRegion | null,
): Promise<GearSuggestion[]> {
  const aliasesById = await fetchGearAliasesByGearIds(
    gearResults.map((item) => item.id),
  );

  const suggestionInputs = new Map<
    string,
    SuggestGearRow & { regionalAliases: GearAlias[] }
  >();

  const baseSuggestions = gearResults.map((item) => {
    const regionalAliases = aliasesById.get(item.id) ?? [];
    suggestionInputs.set(item.id, { ...item, regionalAliases });
    return buildGearSuggestion({ ...item, regionalAliases }, region);
  });

  return applyExactMatchMetadata(
    query,
    baseSuggestions,
    suggestionInputs,
    region,
  );
}

async function buildCompareSmartAction(
  leftQuery: string,
  rightQuery: string,
  region?: GearRegion | null,
): Promise<CompareSmartActionSuggestion | null> {
  const [left, right] = await Promise.all([
    resolveStrongGearMatch(leftQuery, region),
    resolveStrongGearMatch(rightQuery, region),
  ]);

  if (!left || !right) return null;
  if (left.gearId === right.gearId) return null;

  return {
    id: `smart-action:compare:${left.gearId}:${right.gearId}`,
    kind: "smart-action",
    type: "smart-action",
    action: "compare",
    title: `Compare ${left.title} and ${right.title}`,
    label: `Compare ${left.title} and ${right.title}`,
    subtitle: `${left.canonicalName} vs ${right.canonicalName}`,
    href: buildCompareHref(
      [left.href.replace("/gear/", ""), right.href.replace("/gear/", "")],
      {
        preserveOrder: true,
      },
    ),
    compareSlugs: [
      left.href.replace("/gear/", ""),
      right.href.replace("/gear/", ""),
    ],
    compareTitles: [left.title, right.title],
    relevance: Math.max(left.relevance ?? 0, right.relevance ?? 0),
  };
}

function buildParsedSearchSmartAction(intent: {
  kind: ParsedSearchIntentKind;
  subject: string;
  filters: {
    q?: string;
    gearType: "LENS" | "CAMERA";
    brand?: string;
    mount?: string;
  };
}): ParsedSearchSmartActionSuggestion {
  return {
    id: `smart-action:parsed-search:${intent.kind}:${intent.subject.toLowerCase()}`,
    kind: "smart-action",
    type: "smart-action",
    action: "parsed-search",
    title: intent.subject,
    label: intent.subject,
    subtitle: null,
    href: buildSearchHref("/search", {
      page: 1,
      gearType: intent.filters.gearType,
      brand: intent.filters.brand,
      mount: intent.filters.mount,
      q: intent.filters.q,
      nl: 1,
      nlIntent: intent.kind,
      nlSubject: intent.subject,
    }),
    relevance: 1_000,
    parsedSearchKind: intent.kind,
    parsedSearchSubject: intent.subject,
    parsedSearchQueryRemainder: intent.filters.q,
    parsedSearchFilters: intent.filters,
  };
}

async function resolveStrongGearMatch(
  query: string,
  region?: GearRegion | null,
  options?: {
    gearType?: string;
  },
): Promise<(GearSuggestion & { mountValue?: string | null }) | null> {
  const ranked = await buildRankedSuggestions(query, region, options);
  const exactGearMatches = ranked.filter(
    (suggestion): suggestion is GearSuggestion =>
      (suggestion.kind === "camera" || suggestion.kind === "lens") &&
      suggestion.isBestMatch,
  );

  if (exactGearMatches.length !== 1) return null;

  const exactMatch = exactGearMatches[0] ?? null;
  if (!exactMatch) return null;

  const mountsByGearId = await queryMountValuesByGearIds([exactMatch.gearId]);
  return {
    ...exactMatch,
    mountValue: mountsByGearId.get(exactMatch.gearId)?.[0] ?? null,
  };
}
