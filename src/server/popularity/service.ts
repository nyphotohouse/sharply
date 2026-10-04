import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "~/auth";
import { db } from "~/server/db";
import { gear } from "~/server/db/schema";
import { fetchGearAliasesByGearIds } from "~/server/gear/data";
import type {
  TrendingEntry,
  TrendingFiltersInput,
  TrendingPageResult,
} from "~/types/popularity";
import {
  fetchHighTrafficGearSlugsData,
  fetchTopComparePairs as fetchTopComparePairsData,
  getLiveTrendingSnapshot,
  getTrendingData,
  getTrendingTotalCount,
  hasEventForIdentityToday as hasEventForIdentityTodayGeneric,
  hasViewEventForIdentityToday,
  incrementComparePairCountBySlugs,
  insertCompareAddEvent,
  insertViewEvent,
} from "./data";
import { applyLiveBoostToTrending } from "./live";
export { applyLiveBoostToTrending } from "./live";

const DEFAULT_TRENDING_CANDIDATE_POOL = 500;

async function fetchTrendingRanking(params: {
  timeframe: "7d" | "30d";
  filters?: TrendingFiltersInput;
  candidateLimit?: number;
}): Promise<TrendingEntry[]> {
  const timeframe = params.timeframe;
  const filters = params.filters ?? {};
  const targetCount = Math.max(
    1,
    params.candidateLimit ?? DEFAULT_TRENDING_CANDIDATE_POOL,
  );
  let sourceLimit = targetCount;

  while (true) {
    const [baseline, liveSnapshot] = await Promise.all([
      getTrendingData(timeframe, sourceLimit, filters, 0),
      getLiveTrendingSnapshot(sourceLimit, filters, 0),
    ]);
    const ranked = applyLiveBoostToTrending({ baseline, liveSnapshot });
    const baselineExhausted = baseline.length < sourceLimit;
    const liveExhausted = liveSnapshot.items.length < sourceLimit;
    const nextBaselineScore = baselineExhausted
      ? 0
      : (baseline.at(-1)?.score ?? 0);
    const nextLiveScore = liveExhausted
      ? 0
      : (liveSnapshot.items.at(-1)?.liveScore ?? 0);
    const lastRequiredScore = ranked[targetCount - 1]?.score;

    // Any omitted item can score at most the sum of the two source cutoffs.
    // Expand on ties as well so source ordering cannot change the final prefix.
    if (
      (baselineExhausted && liveExhausted) ||
      (lastRequiredScore !== undefined &&
        lastRequiredScore > nextBaselineScore + nextLiveScore)
    ) {
      return ranked;
    }

    sourceLimit *= 2;
  }
}

/**
 * recordGearView(slug, identity)
 *
 * Server-side orchestration for recording a gear view event with dedupe.
 * This function is safe to call from a Server Action. It accepts either
 * a `userId` (for authenticated users) or a `visitorId` (anonymous).
 */
export async function recordGearView(params: {
  slug: string;
  userId?: string | null;
  visitorId?: string | null;
  userAgent?: string | null;
}): Promise<{ success: true; deduped: boolean; skipped?: string }> {
  const ua = params.userAgent || "";
  const BOT_PATTERNS = [
    /Googlebot/i,
    /Bingbot/i,
    /Slurp/i,
    /DuckDuckBot/i,
    /Baiduspider/i,
    /YandexBot/i,
    /Sogou/i,
    /Exabot/i,
    /facebot/i,
    /ia_archiver/i,
    /Discordbot/i,
    /Slackbot/i,
    /Twitterbot/i,
    /bingpreview/i,
    /crawler/i,
    /spider/i,
    /bot/i,
  ];
  if (BOT_PATTERNS.some((re) => re.test(ua))) {
    return { success: true, deduped: false, skipped: "bot" } as const;
  }

  const gearRow = await db
    .select({ id: gear.id })
    .from(gear)
    .where(eq(gear.slug, params.slug))
    .limit(1);
  if (!gearRow.length) {
    return { success: true, deduped: false, skipped: "gear_not_found" };
  }
  const gearId = gearRow[0]!.id;

  // Derive userId from server session if not provided by caller
  let resolvedUserId = params.userId ?? null;
  if (!resolvedUserId) {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      resolvedUserId = session?.user?.id ?? null;
    } catch {}
  }

  const already = await hasViewEventForIdentityToday({
    gearId,
    userId: resolvedUserId,
    visitorId: resolvedUserId ? null : (params.visitorId ?? null),
  });
  if (already) {
    return { success: true, deduped: true } as const;
  }

  await insertViewEvent({
    gearId,
    userId: resolvedUserId,
    visitorId: resolvedUserId ? null : (params.visitorId ?? null),
  });
  return { success: true, deduped: false } as const;
}

/**
 * incrementComparePairCount(slugs)
 *
 * Minimal per-pair counter with atomic upsert. Slugs are sorted in the data layer.
 */
export async function incrementComparePairCount(params: {
  slugs: [string, string];
}): Promise<{ success: boolean; skipped?: string }> {
  return incrementComparePairCountBySlugs({ slugs: params.slugs });
}

export async function fetchTopComparePairs(limit = 20) {
  return fetchTopComparePairsData(limit);
}

export async function fetchLiveBoosts(params?: {
  limit?: number;
  filters?: TrendingFiltersInput;
  offset?: number;
}) {
  const limit = params?.limit ?? 50;
  const filters = params?.filters ?? {};
  const offset = params?.offset ?? 0;
  const snapshot = await getLiveTrendingSnapshot(limit, filters, offset);
  const aliasesById = await fetchGearAliasesByGearIds(
    snapshot.items.map((item) => item.gearId),
  );
  // Only show items with a positive live score
  return snapshot.items
    .filter((i) => (i.liveScore ?? 0) > 0)
    .map((item) => ({
      ...item,
      regionalAliases: aliasesById.get(item.gearId) ?? [],
    }));
}

export async function fetchTrending(params: {
  timeframe?: "7d" | "30d";
  limit?: number;
  offset?: number;
  filters?: TrendingFiltersInput;
}) {
  const timeframe = params.timeframe ?? "30d";
  const limit = params.limit ?? 10;
  const filters = params.filters ?? {};
  const offset = params.offset ?? 0;
  const candidateLimit = Math.max(
    DEFAULT_TRENDING_CANDIDATE_POOL,
    offset + limit,
  );
  const ranked = await fetchTrendingRanking({
    timeframe,
    filters,
    candidateLimit,
  });
  const sliced = ranked.slice(offset, offset + limit);
  const aliasesById = await fetchGearAliasesByGearIds(
    sliced.map((item) => item.gearId),
  );

  return sliced.map((item) => ({
    ...item,
    regionalAliases: aliasesById.get(item.gearId) ?? [],
  }));
}

/**
 * Return only the durable ranking, without the short-lived live boost. Home
 * uses this for its server-rendered baseline before client refreshes begin.
 */
export async function fetchStableTrending(params: {
  timeframe?: "7d" | "30d";
  limit?: number;
  offset?: number;
  filters?: TrendingFiltersInput;
}) {
  const timeframe = params.timeframe ?? "30d";
  const limit = params.limit ?? 10;
  const filters = params.filters ?? {};
  const offset = params.offset ?? 0;
  const items = await getTrendingData(timeframe, limit, filters, offset);
  const aliasesById = await fetchGearAliasesByGearIds(
    items.map((item) => item.gearId),
  );

  return items.map((item) => ({
    ...item,
    regionalAliases: aliasesById.get(item.gearId) ?? [],
  }));
}

type TrendingSlugsParams = {
  timeframe?: "7d" | "30d";
  limit?: number;
  filters?: TrendingFiltersInput;
};

export async function fetchTrendingSlugs(
  params?: TrendingSlugsParams,
): Promise<string[]> {
  const timeframe = params?.timeframe ?? "30d";
  const limit = params?.limit ?? 20;
  const items = await getTrendingData(
    timeframe,
    limit,
    params?.filters ?? {},
    0,
  );
  return items.map((item) => item.slug);
}

export async function fetchHighTrafficGearSlugs(
  limit = 200,
): Promise<string[]> {
  return fetchHighTrafficGearSlugsData(limit);
}

/**
 * Check if a single slug is trending.
 * Uses the cached trending slugs list to avoid redundant fetches.
 * This is useful for showing trending badges on individual gear cards.
 *
 * @param slug - The gear slug to check
 * @param params - Optional parameters for the trending query (timeframe, filters)
 * @returns Promise<boolean> - Whether the slug is in the trending list
 */
export async function isSlugTrending(
  slug: string,
  params?: TrendingSlugsParams,
): Promise<boolean> {
  const trendingSlugs = await fetchTrendingSlugs(params);
  return trendingSlugs.includes(slug);
}

/**
 * Check multiple slugs for trending status.
 * Fetches the trending list once and checks all slugs against it.
 * More efficient than calling isSlugTrending multiple times.
 *
 * @param slugs - Array of gear slugs to check
 * @param params - Optional parameters for the trending query (timeframe, filters)
 * @returns Promise<Set<string>> - Set of slugs that are trending
 */
export async function getTrendingStatusForSlugs(
  slugs: string[],
  params?: TrendingSlugsParams,
): Promise<Set<string>> {
  const trendingSlugs = await fetchTrendingSlugs(params);
  const trendingSet = new Set(trendingSlugs);
  return new Set(slugs.filter((slug) => trendingSet.has(slug)));
}

export async function getLiveTrendingStatusForSlugs(
  slugs: string[],
  params?: TrendingSlugsParams,
): Promise<Set<string>> {
  const limit = params?.limit ?? 20;
  const ranked = await fetchTrendingRanking({
    timeframe: params?.timeframe ?? "30d",
    filters: params?.filters,
    candidateLimit: Math.max(DEFAULT_TRENDING_CANDIDATE_POOL, limit),
  });
  const trendingSet = new Set(ranked.slice(0, limit).map((item) => item.slug));
  return new Set(slugs.filter((slug) => trendingSet.has(slug)));
}

export async function fetchTrendingPage(params: {
  timeframe?: "7d" | "30d";
  page?: number;
  perPage?: number;
  filters?: TrendingFiltersInput;
}): Promise<TrendingPageResult> {
  const timeframe = params.timeframe ?? "30d";
  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(5, params.perPage ?? 10));
  const filters = params.filters ?? {};
  const offset = (page - 1) * perPage;

  const baselineTotal = await getTrendingTotalCount(timeframe, filters);
  const candidateLimit = Math.max(
    DEFAULT_TRENDING_CANDIDATE_POOL,
    baselineTotal + 100,
    offset + perPage,
  );
  const ranked = await fetchTrendingRanking({
    timeframe,
    filters,
    candidateLimit,
  });
  const topScore = ranked[0]?.score ?? 0;
  // Keep the table focused: drop rows that would render as 0 flames.
  const minScoreForOneFlame = topScore > 0 ? topScore / 6 : 0;
  const displayRanked = ranked.filter(
    (item) => item.score >= minScoreForOneFlame,
  );
  const items = displayRanked.slice(offset, offset + perPage);

  return {
    items,
    total: displayRanked.length,
    page,
    perPage,
    timeframe,
    filters,
    topScore,
  };
}

/**
 * recordCompareAdd(slug, identity)
 *
 * Appends a `compare_add` popularity event for this gear if not already
 * recorded for the current identity (user or visitor) today.
 */
export async function recordCompareAdd(params: {
  slug: string;
  userId?: string | null;
  visitorId?: string | null;
}): Promise<{ success: true; deduped: boolean; skipped?: string }> {
  const gearRow = await db
    .select({ id: gear.id })
    .from(gear)
    .where(eq(gear.slug, params.slug))
    .limit(1);
  if (!gearRow.length) {
    return { success: true, deduped: false, skipped: "gear_not_found" };
  }
  const gearId = gearRow[0]!.id;

  // try to get userId from session to assign to the event
  let resolvedUserId = params.userId ?? null;
  if (!resolvedUserId) {
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      resolvedUserId = session?.user?.id ?? null;
    } catch {}
  }

  const already = await hasEventForIdentityTodayGeneric({
    gearId,
    eventType: "compare_add",
    userId: resolvedUserId ?? undefined,
    visitorId: resolvedUserId ? null : (params.visitorId ?? null),
  });
  if (already) return { success: true, deduped: true } as const;

  await insertCompareAddEvent({
    gearId,
    userId: resolvedUserId,
    visitorId: resolvedUserId ? null : (params.visitorId ?? null),
  });
  return { success: true, deduped: false } as const;
}
