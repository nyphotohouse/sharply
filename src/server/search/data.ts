// In Next.js runtime, enforce server-only import. In scripts (Node), skip.
if (process.env.NEXT_RUNTIME) {
  import("server-only").catch(() => {
    console.warn("[search:data] server-only import failed, skipping.");
  });
}

/**
 * Search Data Layer (server-only)
 *
 * Responsibilities:
 * - Provide pure SQL builders (expressions) and raw DB query functions.
 * - No auth, no caching, no request/response shaping.
 * - Reusable by service.ts (or other server modules) to compose higher-level operations.
 *
 * Structure:
 * - buildSearchWhereClause: builds a strict WHERE clause for free-text queries.
 * - buildRelevanceExpr: ranks results using a weighted GREATEST(...) expression.
 * - querySearchRows / querySearchTotal: run the core search select + count.
 * - queryGearSuggestions / queryBrandSuggestions: lighter-weight suggestion queries.
 */

import { asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { db } from "~/server/db";
import {
  analogCameraSpecs,
  brands,
  cameraSpecs,
  fixedLensSpecs,
  gear,
  gearTags,
  gearMounts,
  lensSpecs,
  mounts,
  sensorFormats,
  tags,
} from "~/server/db/schema";
import type { SearchFilters } from "~/types/search-results";
import { getGearDisplayImageSql } from "~/server/gear/display-image";
import {
  buildUsComparablePriceSql,
  buildUsHasComparablePriceSql,
} from "~/server/pricing/sql";
import {
  buildApertureTokenRegex,
  buildDecimalNumericTokenRegex,
  buildFocalLengthRangeTokenRegex,
  buildFocalLengthTokenRegex,
  buildSingleFocalZoomOvermatchRegex,
  buildWholeWordTokenRegex,
  getSignificantNumericTokens,
  parseSearchQueryTokens,
  SEARCH_RANKING_WEIGHTS,
  shouldGateSingleNumericToken,
} from "./query-normalization";

function buildPublishedGearClause() {
  return eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED);
}

/** Builds the catalog-specification constraints shared by result and count queries. */
export function buildSearchFilterClause(
  filters: SearchFilters,
): SQL | undefined {
  const conditions: SQL[] = [];
  const hasPrice = buildUsHasComparablePriceSql();
  const effectivePriceCents = buildUsComparablePriceSql();

  if (filters.brand)
    conditions.push(sql`${brands.name} ILIKE ${`%${filters.brand}%`}`);
  if (filters.mount) conditions.push(sql`${mounts.id} = ${filters.mount}`);
  if (filters.gearType)
    conditions.push(sql`${gear.gearType} = ${filters.gearType}`);
  if (filters.sensorFormat)
    conditions.push(sql`${sensorFormats.slug} = ${filters.sensorFormat}`);
  if (filters.lensType) {
    const isPrime = filters.lensType === "prime";
    conditions.push(
      sql`(${lensSpecs.isPrime} = ${isPrime} OR ${fixedLensSpecs.isPrime} = ${isPrime})`,
    );
  }
  if (filters.analogCameraType)
    conditions.push(
      sql`${analogCameraSpecs.cameraType} = ${filters.analogCameraType}`,
    );

  const megapixelsMin =
    filters.megapixelsMin == null
      ? undefined
      : Math.max(0, filters.megapixelsMin - 0.9);
  const megapixelsMax =
    filters.megapixelsMax == null ? undefined : filters.megapixelsMax + 0.9;
  if (megapixelsMin !== undefined)
    conditions.push(sql`${cameraSpecs.resolutionMp} >= ${megapixelsMin}`);
  if (megapixelsMax !== undefined)
    conditions.push(sql`${cameraSpecs.resolutionMp} <= ${megapixelsMax}`);
  if (filters.isoMin !== undefined)
    conditions.push(sql`${cameraSpecs.isoMin} <= ${filters.isoMin}`);
  if (filters.isoMax !== undefined)
    conditions.push(sql`${cameraSpecs.isoMax} >= ${filters.isoMax}`);
  if (filters.hasIbis) conditions.push(sql`${cameraSpecs.hasIbis} = true`);
  if (filters.hasWeatherSealing)
    conditions.push(sql`${cameraSpecs.hasWeatherSealing} = true`);

  if (filters.focalIncludes !== undefined) {
    conditions.push(
      sql`${lensSpecs.focalLengthMinMm} <= ${filters.focalIncludes} AND ${lensSpecs.focalLengthMaxMm} >= ${filters.focalIncludes}`,
    );
  }
  if (filters.widestFocalMax !== undefined)
    conditions.push(
      sql`${lensSpecs.focalLengthMinMm} <= ${filters.widestFocalMax}`,
    );
  if (filters.longestFocalMin !== undefined)
    conditions.push(
      sql`${lensSpecs.focalLengthMaxMm} >= ${filters.longestFocalMin}`,
    );
  if (filters.fastestApertureMax !== undefined)
    conditions.push(
      sql`${lensSpecs.maxApertureWide} <= ${filters.fastestApertureMax}`,
    );
  if (filters.hasAutofocus)
    conditions.push(sql`${lensSpecs.hasAutofocus} = true`);
  if (filters.hasStabilization)
    conditions.push(sql`${lensSpecs.hasStabilization} = true`);

  if (filters.priceMin !== undefined) {
    conditions.push(
      sql`(${hasPrice}) AND (${effectivePriceCents} >= ${filters.priceMin * 100})`,
    );
  }
  if (filters.priceMax !== undefined) {
    conditions.push(
      sql`(NOT (${hasPrice}) OR ${effectivePriceCents} <= ${filters.priceMax * 100})`,
    );
  }

  if (filters.tags?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${gearTags}
      INNER JOIN ${tags} ON ${tags.id} = ${gearTags.tagId}
      WHERE ${gearTags.gearId} = ${gear.id}
        AND ${tags.unlisted} = false
        AND ${tags.slug} IN (${sql.join(
          filters.tags.map((slug) => sql`${slug}`),
          sql`, `,
        )})
    )`);
  }

  return conditions.length
    ? sql`(${sql.join(conditions, sql` AND `)})`
    : undefined;
}

function buildNumericTokenMatchClause(searchLower: SQL, token: string): SQL {
  const decimalPattern = buildDecimalNumericTokenRegex(token);
  if (decimalPattern) {
    return sql`${searchLower} ~ ${decimalPattern}`;
  }

  return ilike(gear.searchName, `%${token}%`);
}

function buildRegexMatchClause(searchLower: SQL, pattern: string): SQL {
  return sql`${searchLower} ~ ${pattern}`;
}

function buildScoreTerm(condition: SQL, weight: number): SQL {
  return sql`CASE WHEN ${condition} THEN ${weight}::double precision ELSE 0::double precision END`;
}

/**
 * Build a strict WHERE clause for free-text search.
 * - Normalizes input (case-insensitive, punctuation-insensitive).
 * - Requires multiple strong token matches when present to reduce overmatching.
 * - Combines brand-agnostic and normalized contains with conservative fuzzy thresholds.
 */
export function buildSearchWhereClause(query: string): SQL | undefined {
  const parsedQuery = parseSearchQueryTokens(query);
  const { normalizedQueryNoPunct, parts } = parsedQuery;
  if (parts.length === 0) return undefined;

  const strongParts = parsedQuery.strongTextTokens;

  const searchLower = sql`lower(${gear.searchName})`;
  const normalizedCol = sql`regexp_replace(${searchLower}, '[[:space:]_.\/-]+', '', 'g')`;
  const brandLower = sql`lower(${brands.name})`;
  const noBrand = sql`replace(${searchLower}, ${brandLower}, '')`;
  // For Nikon items, also strip a leading "nikkor" word to avoid penalizing
  // users who search without it (common behavior: they type "nikon z 400 4.5").
  const noBrandWithSynonyms = sql`CASE WHEN ${brandLower} = 'nikon' THEN regexp_replace(${noBrand}, '^\\s*nikkor\\s+', '', 'g') ELSE ${noBrand} END`;
  const normalizedNoBrand = sql`regexp_replace(${noBrandWithSynonyms}, '[[:space:]_.\/-]+', '', 'g')`;

  // Also remove the detected brand (and Nikon's "nikkor") from the QUERY side
  // when matching against brand-stripped columns, so queries that omit
  // product-line terms don't get penalized.
  const queryNormSql = sql`${normalizedQueryNoPunct}`;
  const queryNoBrand = sql`regexp_replace(${queryNormSql}, ${brandLower}, '', 'gi')`;
  const queryNoBrandWithSynonyms = sql`CASE WHEN ${brandLower} = 'nikon' THEN regexp_replace(${queryNoBrand}, 'nikkor', '', 'gi') ELSE ${queryNoBrand} END`;

  // Lens-relaxed normalization: remove domain-specific glue between numbers
  // - "mm" after a digit (e.g., 400mm -> 400)
  // - leading "f" before a digit (e.g., f4.5 -> 4.5)
  const normalizedNoBrandRelaxedStep1 = sql`regexp_replace(${normalizedNoBrand}, '([0-9])mm', '\\1', 'gi')`;
  const normalizedNoBrandRelaxed = sql`regexp_replace(${normalizedNoBrandRelaxedStep1}, 'f([0-9])', '\\1', 'gi')`;
  const normalizedColRelaxedStep1 = sql`regexp_replace(${normalizedCol}, '([0-9])mm', '\\1', 'gi')`;
  const normalizedColRelaxed = sql`regexp_replace(${normalizedColRelaxedStep1}, 'f([0-9])', '\\1', 'gi')`;
  const activeAcronymTokens = parsedQuery.activeLensFeatureAcronymTokens;
  const acronymClauses = activeAcronymTokens.map((token) =>
    buildRegexMatchClause(searchLower, buildWholeWordTokenRegex(token)),
  );
  const acronymAndClause =
    acronymClauses.length > 0
      ? sql`(${sql.join(acronymClauses, sql` AND `)})`
      : null;

  if (parsedQuery.isLowInformationFeatureAcronymQuery) {
    const rawAcronymClauses = parsedQuery.rawLensFeatureAcronymTokens.map(
      (token) =>
        buildRegexMatchClause(searchLower, buildWholeWordTokenRegex(token)),
    );
    if (rawAcronymClauses.length > 0) {
      return sql`(${sql.join(rawAcronymClauses, sql` AND `)})`;
    }
  }

  const conditions: SQL[] = [];
  if (strongParts.length >= 2) {
    const partMatches = strongParts.map(
      (part) =>
        sql`CASE WHEN ${ilike(gear.searchName, `%${part}%`)} THEN 1 ELSE 0 END`,
    );
    const sumMatches = sql`(${sql.join(partMatches, sql` + `)})`;
    conditions.push(sql`${sumMatches} >= 2`);
  } else if (strongParts.length === 1) {
    conditions.push(ilike(gear.searchName, `%${strongParts[0]}%`));
  }

  conditions.push(sql`${normalizedCol} ILIKE ${`%${normalizedQueryNoPunct}%`}`);
  conditions.push(
    sql`${normalizedNoBrand} ILIKE ('%' || ${queryNoBrandWithSynonyms} || '%')`,
  );
  // Relaxed contains to tolerate omitted "mm"/"f" in user queries
  conditions.push(
    sql`${normalizedNoBrandRelaxed} ILIKE ('%' || ${queryNoBrandWithSynonyms} || '%')`,
  );
  conditions.push(
    sql`${normalizedColRelaxed} ILIKE ${`%${normalizedQueryNoPunct}%`}`,
  );
  conditions.push(
    sql`similarity(${normalizedNoBrand}, ${normalizedQueryNoPunct}) > 0.4`,
  );
  conditions.push(
    sql`similarity(${gear.searchName}, ${normalizedQueryNoPunct}) > 0.5`,
  );

  // Numeric token handling
  // - If there are 2+ numeric tokens (e.g., "400 4.5"), require ALL of them
  //   to appear in the normalized search name form (AND). Decimal tokens are
  //   matched as digit sequences so "1.4" still matches the stored "f1 4".
  //   This is appended to the OR set to avoid over-broad fuzzy matches.
  // - If there is exactly 1 significant numeric token (e.g., "400") AND the
  //   query also contains at least one alphabetic "strong" token (e.g., "nikon"),
  //   gate the whole match on that numeric token appearing as well. This helps
  //   queries like "nikon z 400" surface the corresponding 400mm lenses instead
  //   of only camera bodies.
  const numericTokens = getSignificantNumericTokens(query);

  // Make numeric tokens contribute positively to OR conditions as well.
  // This helps lens queries like "50 1.8" where punctuation/letters (e.g., "f/")
  // in names would otherwise break contiguous substring matches.
  if (numericTokens.length >= 2) {
    const andClauses: SQL[] = numericTokens.map((token) =>
      buildNumericTokenMatchClause(searchLower, token),
    );
    const numericAndForOr = sql`(${sql.join(andClauses, sql` AND `)})`;
    conditions.push(numericAndForOr);
  } else if (numericTokens.length === 1) {
    conditions.push(
      buildNumericTokenMatchClause(searchLower, numericTokens[0]!),
    );
  }
  if (acronymAndClause) {
    conditions.push(acronymAndClause);
  }

  const baseOr = sql`(${sql.join(conditions, sql` OR `)})`;
  const singleNumericToken = numericTokens[0];
  const shouldGateSingleNumeric = shouldGateSingleNumericToken({
    numericTokens,
    strongParts,
    normalizedQueryNoPunct,
  });

  if (numericTokens.length >= 2) {
    const andClauses: SQL[] = numericTokens.map((token) =>
      buildNumericTokenMatchClause(searchLower, token),
    );
    const numericAnd = sql`(${sql.join(andClauses, sql` AND `)})`;
    const gated = sql`(${baseOr}) AND (${numericAnd})`;
    return acronymAndClause ? sql`(${gated}) AND (${acronymAndClause})` : gated;
  }

  if (shouldGateSingleNumeric) {
    const singleNumeric = buildNumericTokenMatchClause(
      searchLower,
      singleNumericToken!,
    );
    const gated = sql`(${baseOr}) AND (${singleNumeric})`;
    return acronymAndClause ? sql`(${gated}) AND (${acronymAndClause})` : gated;
  }

  return acronymAndClause ? sql`(${baseOr}) AND (${acronymAndClause})` : baseOr;
}

/**
 * Construct a relevance expression used for ranking (higher is better).
 * Weights prefer exact/normalized contains over fuzzy similarity.
 */
export function buildRelevanceExpr(
  query: string,
  normalizedQueryNoPunct: string,
) {
  const parsedQuery = parseSearchQueryTokens(query);
  const searchLower = sql`lower(${gear.searchName})`;
  const normalizedCol = sql`regexp_replace(${searchLower}, '[[:space:]_.\/-]+', '', 'g')`;
  const brandLower = sql`lower(${brands.name})`;
  const noBrand = sql`replace(${searchLower}, ${brandLower}, '')`;
  const noBrandWithSynonyms = sql`CASE WHEN ${brandLower} = 'nikon' THEN regexp_replace(${noBrand}, '^\\s*nikkor\\s+', '', 'g') ELSE ${noBrand} END`;
  const normalizedNoBrand = sql`regexp_replace(${noBrandWithSynonyms}, '[[:space:]_.\/-]+', '', 'g')`;

  const normalizedNoBrandRelaxedStep1 = sql`regexp_replace(${normalizedNoBrand}, '([0-9])mm', '\\1', 'gi')`;
  const normalizedNoBrandRelaxed = sql`regexp_replace(${normalizedNoBrandRelaxedStep1}, 'f([0-9])', '\\1', 'gi')`;
  const normalizedColRelaxedStep1 = sql`regexp_replace(${normalizedCol}, '([0-9])mm', '\\1', 'gi')`;
  const normalizedColRelaxed = sql`regexp_replace(${normalizedColRelaxedStep1}, 'f([0-9])', '\\1', 'gi')`;

  // Query-side brand and Nikon synonym stripping for ranking, mirroring WHERE
  const queryNormSql = sql`${normalizedQueryNoPunct}`;
  const queryNoBrand = sql`regexp_replace(${queryNormSql}, ${brandLower}, '', 'gi')`;
  const queryNoBrandWithSynonyms = sql`CASE WHEN ${brandLower} = 'nikon' THEN regexp_replace(${queryNoBrand}, 'nikkor', '', 'gi') ELSE ${queryNoBrand} END`;
  const terms: SQL[] = [
    buildScoreTerm(
      sql`${searchLower} ILIKE ${`%${query.toLowerCase().trim()}%`}`,
      SEARCH_RANKING_WEIGHTS.rawContains,
    ),
    buildScoreTerm(
      sql`${normalizedCol} ILIKE ${`%${normalizedQueryNoPunct}%`}`,
      SEARCH_RANKING_WEIGHTS.normalizedContains,
    ),
    buildScoreTerm(
      sql`${normalizedNoBrand} ILIKE ('%' || ${queryNoBrandWithSynonyms} || '%')`,
      SEARCH_RANKING_WEIGHTS.brandAgnosticContains,
    ),
    buildScoreTerm(
      sql`${normalizedNoBrandRelaxed} ILIKE ('%' || ${queryNoBrandWithSynonyms} || '%')`,
      SEARCH_RANKING_WEIGHTS.relaxedContains,
    ),
    buildScoreTerm(
      sql`${normalizedColRelaxed} ILIKE ${`%${normalizedQueryNoPunct}%`}`,
      SEARCH_RANKING_WEIGHTS.relaxedContains,
    ),
    sql`similarity(${normalizedNoBrand}, ${normalizedQueryNoPunct}) * ${SEARCH_RANKING_WEIGHTS.similarityNormalizedNoBrand}`,
    sql`similarity(${normalizedCol}, ${normalizedQueryNoPunct}) * ${SEARCH_RANKING_WEIGHTS.similarityNormalizedCol}`,
    sql`similarity(${gear.searchName}, ${normalizedQueryNoPunct}) * ${SEARCH_RANKING_WEIGHTS.similaritySearchName}`,
  ];

  for (const token of parsedQuery.strongTextTokens) {
    terms.push(
      buildScoreTerm(
        ilike(gear.searchName, `%${token}%`),
        SEARCH_RANKING_WEIGHTS.strongToken,
      ),
    );
  }

  for (const token of parsedQuery.activeLensFeatureAcronymTokens) {
    terms.push(
      buildScoreTerm(
        buildRegexMatchClause(searchLower, buildWholeWordTokenRegex(token)),
        SEARCH_RANKING_WEIGHTS.featureAcronymToken,
      ),
    );
  }

  for (const token of parsedQuery.focalLengthTokens) {
    terms.push(
      buildScoreTerm(
        buildRegexMatchClause(searchLower, buildFocalLengthTokenRegex(token)),
        SEARCH_RANKING_WEIGHTS.focalToken,
      ),
    );
  }

  for (const token of parsedQuery.focalLengthRangeTokens) {
    terms.push(
      buildScoreTerm(
        buildRegexMatchClause(
          searchLower,
          buildFocalLengthRangeTokenRegex(token),
        ),
        SEARCH_RANKING_WEIGHTS.focalToken,
      ),
    );
  }

  for (const token of parsedQuery.apertureTokens) {
    terms.push(
      buildScoreTerm(
        buildRegexMatchClause(searchLower, buildApertureTokenRegex(token)),
        SEARCH_RANKING_WEIGHTS.apertureToken,
      ),
    );
  }

  if (parsedQuery.focalLengthTokens.length === 1) {
    const focalToken = parsedQuery.focalLengthTokens[0]!;
    const exactFocalMatch = buildRegexMatchClause(
      searchLower,
      buildFocalLengthTokenRegex(focalToken),
    );
    const zoomOvermatch = buildRegexMatchClause(
      searchLower,
      buildSingleFocalZoomOvermatchRegex(focalToken),
    );
    terms.push(
      buildScoreTerm(
        sql`(${exactFocalMatch}) AND NOT (${zoomOvermatch})`,
        SEARCH_RANKING_WEIGHTS.primarySingleFocal,
      ),
    );
    terms.push(
      sql`CASE WHEN ${zoomOvermatch} THEN ${-SEARCH_RANKING_WEIGHTS.singleFocalZoomPenalty}::double precision ELSE 0::double precision END`,
    );
  }

  return sql<number>`(${sql.join(terms, sql` + `)})`;
}

/**
 * Execute the core search SELECT using the provided whereClause/orderBy/pagination.
 * Optionally includes a computed relevance column when supplied.
 */
export async function querySearchRows(options: {
  whereClause?: SQL;
  orderBy: any[];
  pageSize: number;
  offset: number;
  relevanceExpr?: any;
  includeMounts?: boolean;
  includeSensorFormats?: boolean;
  includeLensSpecs?: boolean;
  includeAnalogSpecs?: boolean;
}) {
  // Return only core gear fields; callers shouldn't rely on single mount anymore.
  let query = db
    .select({
      id: gear.id,
      name: gear.name,
      slug: gear.slug,
      brandName: brands.name,
      gearType: gear.gearType,
      thumbnailUrl: getGearDisplayImageSql(),
      msrpNowUsdCents: gear.msrpNowUsdCents,
      msrpAtLaunchUsdCents: gear.msrpAtLaunchUsdCents,
      mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
      usedPriceProjection: gear.usedPriceProjection,
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      announcedDate: gear.announcedDate,
      announceDatePrecision: gear.announceDatePrecision,
      ...(options.relevanceExpr && { relevance: options.relevanceExpr }),
    })
    .from(gear)
    .leftJoin(brands, sql`${gear.brandId} = ${brands.id}`);

  if (options.includeMounts) {
    query = query
      .leftJoin(gearMounts, eq(gear.id, gearMounts.gearId))
      .leftJoin(mounts, eq(gearMounts.mountId, mounts.id));
  }
  if (options.includeSensorFormats) {
    query = query
      .leftJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
      .leftJoin(
        sensorFormats,
        eq(cameraSpecs.sensorFormatId, sensorFormats.id),
      );
  }
  if (options.includeLensSpecs) {
    query = query
      .leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId))
      .leftJoin(fixedLensSpecs, eq(gear.id, fixedLensSpecs.gearId));
  }
  if (options.includeAnalogSpecs) {
    query = query.leftJoin(
      analogCameraSpecs,
      eq(gear.id, analogCameraSpecs.gearId),
    );
  }

  const groupByColumns = [
    gear.id,
    gear.name,
    gear.slug,
    brands.name,
    gear.gearType,
    gear.thumbnailUrl,
    gear.topViewUrl,
    gear.msrpNowUsdCents,
    gear.msrpAtLaunchUsdCents,
    gear.mpbMaxPriceUsdCents,
    gear.releaseDate,
    gear.releaseDatePrecision,
    gear.announcedDate,
    gear.announceDatePrecision,
  ];
  if (options.relevanceExpr) {
    groupByColumns.push(options.relevanceExpr);
  }

  return query
    .groupBy(...groupByColumns)
    .where(
      options.whereClause
        ? sql`(${buildPublishedGearClause()}) AND (${options.whereClause})`
        : buildPublishedGearClause(),
    )
    .orderBy(...options.orderBy)
    .limit(options.pageSize)
    .offset(options.offset);
}

/**
 * Execute the COUNT(*) for the current search constraints.
 */
export async function querySearchTotal(
  whereClause?: SQL,
  includeMounts?: boolean,
  includeSensorFormats?: boolean,
  includeLensSpecs?: boolean,
  includeAnalogSpecs?: boolean,
) {
  let query = db
    .select({ count: sql<number>`count(distinct ${gear.id})` })
    .from(gear)
    .leftJoin(brands, sql`${gear.brandId} = ${brands.id}`);

  if (includeMounts) {
    query = query
      .leftJoin(gearMounts, eq(gear.id, gearMounts.gearId))
      .leftJoin(mounts, eq(gearMounts.mountId, mounts.id));
  }
  if (includeSensorFormats) {
    query = query
      .leftJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
      .leftJoin(
        sensorFormats,
        eq(cameraSpecs.sensorFormatId, sensorFormats.id),
      );
  }
  if (includeLensSpecs) {
    query = query
      .leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId))
      .leftJoin(fixedLensSpecs, eq(gear.id, fixedLensSpecs.gearId));
  }
  if (includeAnalogSpecs) {
    query = query.leftJoin(
      analogCameraSpecs,
      eq(gear.id, analogCameraSpecs.gearId),
    );
  }

  const rows = await query.where(
    whereClause
      ? sql`(${buildPublishedGearClause()}) AND (${whereClause})`
      : buildPublishedGearClause(),
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Suggest top gear for a partial query using the given where clause and ranking.
 * Default limit 5 preserves the modal/suggest mix; gear-only pickers pass a higher limit.
 */
export async function queryGearSuggestions(
  whereClause: SQL,
  relevanceExpr: any,
  limit = 5,
) {
  return db
    .select({
      id: gear.id,
      name: gear.name,
      slug: gear.slug,
      brandName: brands.name,
      gearType: gear.gearType,
      relevance: relevanceExpr,
    })
    .from(gear)
    .leftJoin(brands, sql`${gear.brandId} = ${brands.id}`)
    .where(sql`(${buildPublishedGearClause()}) AND (${whereClause})`)
    .orderBy(desc(relevanceExpr), asc(gear.name))
    .limit(limit);
}

/**
 * Suggest brands by similarity to the raw normalized input string.
 */
export async function queryBrandSuggestions(normalizedQuery: string) {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      relevance: sql<number>`similarity(${brands.name}, ${normalizedQuery})`,
    })
    .from(brands)
    .where(ilike(brands.name, `%${normalizedQuery}%`))
    .orderBy(sql`similarity(${brands.name}, ${normalizedQuery}) DESC`)
    .limit(3);
}

export async function queryMountValuesByGearIds(gearIds: string[]) {
  if (gearIds.length === 0) return new Map<string, string[]>();

  const rows = await db
    .select({
      gearId: gearMounts.gearId,
      mountValue: mounts.value,
    })
    .from(gearMounts)
    .innerJoin(mounts, eq(gearMounts.mountId, mounts.id))
    .where(inArray(gearMounts.gearId, gearIds))
    .orderBy(asc(mounts.value));

  const mountsByGearId = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.mountValue) continue;
    mountsByGearId.set(row.gearId, [
      ...(mountsByGearId.get(row.gearId) ?? []),
      row.mountValue,
    ]);
  }

  return mountsByGearId;
}
