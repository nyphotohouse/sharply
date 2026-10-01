import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { db } from "~/server/db";
import {
  brands,
  comparePairCounts,
  gear,
  gearMounts,
  gearPopularityDaily,
  gearPopularityIntraday,
  gearPopularityLifetime,
  gearPopularityWindows,
  ownerships,
  popularityEvents,
  wishlists,
} from "~/server/db/schema";
import type { PopularityEventType } from "~/server/validation/dedupe";
import type {
  LiveTrendingSnapshot,
  TrendingEntry,
  TrendingFiltersInput,
} from "~/types/popularity";
import { getGearDisplayImageSql } from "~/server/gear/display-image";

const MIN_TRENDING_SCORE = 1;

function buildPublishedGearClause() {
  return eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED);
}

function buildGearMountClause(mountId: string) {
  return sql`EXISTS (
    SELECT 1
    FROM ${gearMounts}
    WHERE ${gearMounts.gearId} = ${gear.id}
      AND ${gearMounts.mountId} = ${mountId}
  )`;
}

/**
 * Popularity data access layer (server-only)
 *
 * Purpose:
 * - Provide a single source of truth for popularity reads used by server components
 * - Centralize caching policy (revalidate windows, tag invalidation) with `unstable_cache`
 * - Avoid HTTP round-trips to our own API during SSG/ISR (prevents build-time failures)
 *
 * Design:
 * - Expose small, composable functions that return ready-to-render shapes
 * - Keep queries transparent and documented; prefer straightforward SQL aggregation
 * - Match tag names used by rollup revalidation (e.g., 'trending')
 */

/**
 * getTrendingData(timeframe, limit, filters)
 *
 * Returns top-N trending gear for the given window.
 *
 * Caching:
 * - Cached for 12h via `unstable_cache`
 * - Tagged with 'trending' so a rollup can revalidate proactively
 * - Cache key includes timeframe, limit, and filters to avoid collisions
 *
 * Query notes:
 * - We compute a weighted composite score over window columns
 * - We always select the most recent `as_of_date` for the timeframe
 * - Optional filters apply at the gear row (brand/mount/type)
 */
export async function getTrendingData(
  timeframe: "7d" | "30d",
  limit: number,
  filters: TrendingFiltersInput = {},
  offset = 0,
) {
  // Stable cache key across inputs (kept small and deterministic)
  const key = [
    "pop-trending",
    timeframe,
    String(limit),
    filters.brandId ?? "-",
    filters.mountId ?? "-",
    filters.gearType ?? "-",
    String(offset ?? 0),
  ];

  // Wrap the resolver with unstable_cache to enable ISR-style caching and tag invalidation
  const run = unstable_cache(
    async () => {
      // Composite score: simple, transparent weights; typed numeric expression
      const scoreFormula = sql<number>`(
        ${gearPopularityWindows.viewsSum} * 0.1 +
        ${gearPopularityWindows.wishlistAddsSum} * 2 +
        ${gearPopularityWindows.ownerAddsSum} * 3 +
        ${gearPopularityWindows.compareAddsSum} * 1.5 +
        ${gearPopularityWindows.reviewSubmitsSum} * 2.5
      )`;

      // Base conditions: fixed timeframe and only the most recent snapshot for that timeframe
      const conditions: SQL[] = [
        eq(gearPopularityWindows.timeframe, timeframe),
        buildPublishedGearClause(),
        sql`${gearPopularityWindows.asOfDate} = (
          SELECT MAX(as_of_date)
          FROM app.gear_popularity_windows
          WHERE timeframe = ${timeframe}::popularity_timeframe
        )`,
      ];
      // Optional scoping filters
      if (filters.brandId) conditions.push(eq(gear.brandId, filters.brandId));
      if (filters.mountId)
        conditions.push(buildGearMountClause(filters.mountId));
      if (filters.gearType)
        conditions.push(eq(gear.gearType, filters.gearType));
      conditions.push(sql`${scoreFormula} >= ${MIN_TRENDING_SCORE}`);

      // Read a single row per gear for the latest snapshot; order by score desc; limit N
      const rows = await db
        .select({
          gearId: gearPopularityWindows.gearId,
          score: scoreFormula.as("score"),
          viewsSum: gearPopularityWindows.viewsSum,
          wishlistAddsSum: gearPopularityWindows.wishlistAddsSum,
          ownerAddsSum: gearPopularityWindows.ownerAddsSum,
          compareAddsSum: gearPopularityWindows.compareAddsSum,
          reviewSubmitsSum: gearPopularityWindows.reviewSubmitsSum,
          asOfDate: gearPopularityWindows.asOfDate,
          slug: gear.slug,
          name: gear.name,
          gearType: gear.gearType,
          brandId: gear.brandId,
          brandName: brands.name,
          releaseDate: gear.releaseDate,
          releaseDatePrecision: gear.releaseDatePrecision,
          announcedDate: gear.announcedDate,
          announceDatePrecision: gear.announceDatePrecision,
          msrpNowUsdCents: gear.msrpNowUsdCents,
          msrpAtLaunchUsdCents: gear.msrpAtLaunchUsdCents,
          mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
          usedPriceProjection: gear.usedPriceProjection,
          thumbnailUrl: getGearDisplayImageSql(),
          lifetimeViews: gearPopularityLifetime.viewsLifetime,
        })
        .from(gearPopularityWindows)
        .innerJoin(gear, eq(gearPopularityWindows.gearId, gear.id))
        .innerJoin(brands, eq(gear.brandId, brands.id))
        .leftJoin(
          gearPopularityLifetime,
          eq(gearPopularityLifetime.gearId, gear.id),
        )
        .where(and(...conditions))
        .orderBy(
          desc(scoreFormula),
          desc(gearPopularityWindows.viewsSum),
          gearPopularityWindows.gearId,
        )
        .limit(limit)
        .offset(Math.max(0, offset));

      // Map to a render-ready shape
      const items: TrendingEntry[] = rows.map((r) => ({
        gearId: r.gearId,
        slug: r.slug,
        name: r.name,
        brandName: r.brandName,
        gearType: r.gearType,
        thumbnailUrl: r.thumbnailUrl ?? null,
        releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
        releaseDatePrecision: r.releaseDatePrecision ?? null,
        announcedDate: r.announcedDate ? r.announcedDate.toISOString() : null,
        announceDatePrecision: r.announceDatePrecision ?? null,
        msrpNowUsdCents: r.msrpNowUsdCents,
        msrpAtLaunchUsdCents: r.msrpAtLaunchUsdCents,
        mpbMaxPriceUsdCents: r.mpbMaxPriceUsdCents,
        usedPriceProjection: r.usedPriceProjection,
        lifetimeViews: Number(r.lifetimeViews ?? 0),
        score: Number(r.score),
        stats: {
          views: Number(r.viewsSum),
          wishlistAdds: Number(r.wishlistAddsSum),
          ownerAdds: Number(r.ownerAddsSum),
          compareAdds: Number(r.compareAddsSum),
          reviewSubmits: Number(r.reviewSubmitsSum),
        },
        asOfDate: String(r.asOfDate),
      }));

      return items;
    },
    key,
    { revalidate: 60 * 60 * 12, tags: ["trending"] },
  );

  return run();
}

export async function getLiveTrendingSnapshot(
  limit: number,
  filters: TrendingFiltersInput = {},
  offset = 0,
): Promise<LiveTrendingSnapshot> {
  const currentUtcDate = new Date().toISOString().slice(0, 10);
  const key = [
    "pop-trending-live",
    currentUtcDate,
    String(limit),
    filters.brandId ?? "-",
    filters.mountId ?? "-",
    filters.gearType ?? "-",
    String(offset ?? 0),
  ];

  const run = unstable_cache(
    async () => {
      const scoreFormula = sql<number>`(
        ${gearPopularityIntraday.views} * 0.1 +
        ${gearPopularityIntraday.wishlistAdds} * 2 +
        ${gearPopularityIntraday.ownerAdds} * 3 +
        ${gearPopularityIntraday.compareAdds} * 1.5 +
        ${gearPopularityIntraday.reviewSubmits} * 2.5
      )`;

      const conditions: SQL[] = [
        sql`${gearPopularityIntraday.date} = CURRENT_DATE`,
        buildPublishedGearClause(),
      ];
      if (filters.brandId) conditions.push(eq(gear.brandId, filters.brandId));
      if (filters.mountId)
        conditions.push(buildGearMountClause(filters.mountId));
      if (filters.gearType)
        conditions.push(eq(gear.gearType, filters.gearType));
      conditions.push(sql`${scoreFormula} >= ${MIN_TRENDING_SCORE}`);

      const rows = await db
        .select({
          gearId: gearPopularityIntraday.gearId,
          score: scoreFormula.as("score"),
          views: gearPopularityIntraday.views,
          wishlistAdds: gearPopularityIntraday.wishlistAdds,
          ownerAdds: gearPopularityIntraday.ownerAdds,
          compareAdds: gearPopularityIntraday.compareAdds,
          reviewSubmits: gearPopularityIntraday.reviewSubmits,
          asOfDate: gearPopularityIntraday.date,
          slug: gear.slug,
          name: gear.name,
          gearType: gear.gearType,
          brandName: brands.name,
          releaseDate: gear.releaseDate,
          releaseDatePrecision: gear.releaseDatePrecision,
          announcedDate: gear.announcedDate,
          announceDatePrecision: gear.announceDatePrecision,
          msrpNowUsdCents: gear.msrpNowUsdCents,
          msrpAtLaunchUsdCents: gear.msrpAtLaunchUsdCents,
          mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
          usedPriceProjection: gear.usedPriceProjection,
          thumbnailUrl: getGearDisplayImageSql(),
          lifetimeViews: gearPopularityLifetime.viewsLifetime,
        })
        .from(gearPopularityIntraday)
        .innerJoin(gear, eq(gearPopularityIntraday.gearId, gear.id))
        .innerJoin(brands, eq(gear.brandId, brands.id))
        .leftJoin(
          gearPopularityLifetime,
          eq(gearPopularityLifetime.gearId, gear.id),
        )
        .where(and(...conditions))
        .orderBy(
          desc(scoreFormula),
          desc(gearPopularityIntraday.views),
          gearPopularityIntraday.gearId,
        )
        .limit(limit)
        .offset(Math.max(0, offset));

      const items = rows.map((r) => ({
        gearId: r.gearId,
        slug: r.slug,
        name: r.name,
        brandName: r.brandName,
        gearType: r.gearType,
        thumbnailUrl: r.thumbnailUrl ?? null,
        releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
        releaseDatePrecision: r.releaseDatePrecision ?? null,
        announcedDate: r.announcedDate ? r.announcedDate.toISOString() : null,
        announceDatePrecision: r.announceDatePrecision ?? null,
        msrpNowUsdCents: r.msrpNowUsdCents,
        msrpAtLaunchUsdCents: r.msrpAtLaunchUsdCents,
        mpbMaxPriceUsdCents: r.mpbMaxPriceUsdCents,
        usedPriceProjection: r.usedPriceProjection,
        lifetimeViews: Number(r.lifetimeViews ?? 0),
        stats: {
          views: Number(r.views),
          wishlistAdds: Number(r.wishlistAdds),
          ownerAdds: Number(r.ownerAdds),
          compareAdds: Number(r.compareAdds),
          reviewSubmits: Number(r.reviewSubmits),
        },
        asOfDate: String(r.asOfDate),
        liveScore: Number(r.score),
      }));

      return { items };
    },
    key,
    { revalidate: 60 * 2, tags: ["trending-live"] },
  );

  return run();
}

export async function getTrendingTotalCount(
  timeframe: "7d" | "30d",
  filters: TrendingFiltersInput = {},
) {
  const key = [
    "pop-trending-count",
    timeframe,
    filters.brandId ?? "-",
    filters.mountId ?? "-",
    filters.gearType ?? "-",
  ];

  const run = unstable_cache(
    async () => {
      const conditions: SQL[] = [
        eq(gearPopularityWindows.timeframe, timeframe),
        buildPublishedGearClause(),
        sql`${gearPopularityWindows.asOfDate} = (
          SELECT MAX(as_of_date)
          FROM app.gear_popularity_windows
          WHERE timeframe = ${timeframe}::popularity_timeframe
        )`,
      ];
      const scoreFormula = sql<number>`(
        ${gearPopularityWindows.viewsSum} * 0.1 +
        ${gearPopularityWindows.wishlistAddsSum} * 2 +
        ${gearPopularityWindows.ownerAddsSum} * 3 +
        ${gearPopularityWindows.compareAddsSum} * 1.5 +
        ${gearPopularityWindows.reviewSubmitsSum} * 2.5
      )`;
      if (filters.brandId) conditions.push(eq(gear.brandId, filters.brandId));
      if (filters.mountId)
        conditions.push(buildGearMountClause(filters.mountId));
      if (filters.gearType)
        conditions.push(eq(gear.gearType, filters.gearType));
      conditions.push(sql`${scoreFormula} >= ${MIN_TRENDING_SCORE}`);

      const countRows = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(gearPopularityWindows)
        .innerJoin(gear, eq(gearPopularityWindows.gearId, gear.id))
        .where(and(...conditions));

      return Number(countRows[0]?.count ?? 0);
    },
    key,
    { revalidate: 60 * 60 * 12, tags: ["trending"] },
  );

  return run();
}

/**
 * getGearStats(slug)
 *
 * Returns aggregated stats for a gear slug:
 * - lifetimeViews (from lifetime table)
 * - views30d (from window snapshot; falls back to summing daily if missing)
 * - wishlistTotal and ownershipTotal (from truth tables)
 *
 * Caching:
 * - Cached for 1h via `unstable_cache`
 * - Tagged with 'popularity' and a gear-specific tag for partial invalidation
 *
 * Query notes:
 * - We resolve the gear id by slug to avoid exposing ids at the call site
 * - We read the latest 30d snapshot; if missing (e.g., right after bootstrap), we sum daily rows
 * - Truth counts stay authoritative for current totals
 */
export async function getGearStats(slug: string) {
  const key = ["gear-stats", slug];
  const run = unstable_cache(
    async () => {
      // Resolve gear id from slug (keeps call-sites simple and stable)
      const gearRow = await db
        .select({ id: gear.id })
        .from(gear)
        .where(eq(gear.slug, slug))
        .limit(1);
      if (!gearRow.length) {
        // Keep return type stable; callers can render zeros or hide blocks
        return {
          gearId: "",
          lifetimeViews: 0,
          views30d: 0,
          wishlistTotal: 0,
          ownershipTotal: 0,
        };
      }
      const gearId = gearRow[0]!.id;

      // Lifetime totals: monotonic sums for fast reads
      const lifetimeRow = await db
        .select({ v: gearPopularityLifetime.viewsLifetime })
        .from(gearPopularityLifetime)
        .where(eq(gearPopularityLifetime.gearId, gearId))
        .limit(1);
      const lifetimeViews = Number(lifetimeRow[0]?.v ?? 0);

      // 30d views: prefer the cached window snapshot at the latest as_of_date
      const win30Row = await db
        .select({
          v: gearPopularityWindows.viewsSum,
          d: gearPopularityWindows.asOfDate,
        })
        .from(gearPopularityWindows)
        .where(
          and(
            eq(gearPopularityWindows.gearId, gearId),
            eq(gearPopularityWindows.timeframe, "30d"),
          ),
        )
        .orderBy(desc(gearPopularityWindows.asOfDate))
        .limit(1);
      let views30d = Number(win30Row[0]?.v ?? 0);

      // Fallback: if no window snapshot exists yet, sum from daily (bounded window)
      if (!views30d) {
        const d30Row = await db
          .select({
            v: sql<number>`COALESCE(SUM(${gearPopularityDaily.views}), 0)`,
          })
          .from(gearPopularityDaily)
          .where(
            and(
              eq(gearPopularityDaily.gearId, gearId),
              gte(
                gearPopularityDaily.date,
                sql`CURRENT_DATE - INTERVAL '30 days'`,
              ),
            ),
          );
        views30d = Number(d30Row[0]?.v ?? 0);
      }

      // Truth counts: authoritative for "now"
      const [wlRow, ownRow] = await Promise.all([
        db
          .select({ c: sql<number>`count(*)` })
          .from(wishlists)
          .where(eq(wishlists.gearId, gearId)),
        db
          .select({ c: sql<number>`count(*)` })
          .from(ownerships)
          .where(eq(ownerships.gearId, gearId)),
      ]);

      return {
        gearId,
        lifetimeViews,
        views30d,
        wishlistTotal: Number(wlRow[0]?.c ?? 0),
        ownershipTotal: Number(ownRow[0]?.c ?? 0),
      };
    },
    key,
    { revalidate: 60 * 60, tags: ["popularity", `gear-stats:${slug}`] },
  );

  return run();
}

export async function fetchHighTrafficGearSlugsData(limit: number) {
  const rows = await db
    .select({
      slug: gear.slug,
    })
    .from(gearPopularityLifetime)
    .innerJoin(gear, eq(gearPopularityLifetime.gearId, gear.id))
    .where(
      and(
        gte(gearPopularityLifetime.viewsLifetime, 1),
        buildPublishedGearClause(),
      ),
    )
    .orderBy(
      desc(gearPopularityLifetime.viewsLifetime),
      desc(gear.updatedAt),
      gear.slug,
    )
    .limit(limit);

  return rows.map((row) => row.slug);
}

type GearPopularityIntradayInsert = typeof gearPopularityIntraday.$inferInsert;

const intradayColumnConfig: Record<
  PopularityEventType,
  {
    key: keyof GearPopularityIntradayInsert;
    column:
      | typeof gearPopularityIntraday.views
      | typeof gearPopularityIntraday.wishlistAdds
      | typeof gearPopularityIntraday.ownerAdds
      | typeof gearPopularityIntraday.compareAdds
      | typeof gearPopularityIntraday.reviewSubmits
      | typeof gearPopularityIntraday.apiFetches;
  } | null
> = {
  view: { key: "views", column: gearPopularityIntraday.views },
  wishlist_add: {
    key: "wishlistAdds",
    column: gearPopularityIntraday.wishlistAdds,
  },
  owner_add: { key: "ownerAdds", column: gearPopularityIntraday.ownerAdds },
  compare_add: {
    key: "compareAdds",
    column: gearPopularityIntraday.compareAdds,
  },
  review_submit: {
    key: "reviewSubmits",
    column: gearPopularityIntraday.reviewSubmits,
  },
  api_fetch: {
    key: "apiFetches",
    column: gearPopularityIntraday.apiFetches,
  },
};

export async function incrementGearPopularityIntraday(params: {
  gearId: string;
  eventType: PopularityEventType;
  count?: number;
}) {
  const config = intradayColumnConfig[params.eventType];
  if (!config) return;

  const incrementBy = params.count ?? 1;
  if (incrementBy <= 0) return;

  const todayUtc = new Date().toISOString().slice(0, 10);
  const values: Partial<GearPopularityIntradayInsert> = {
    date: todayUtc,
    gearId: params.gearId,
  };
  (values as Record<string, unknown>)[config.key as string] = incrementBy;

  const setPayload: Partial<GearPopularityIntradayInsert> &
    Record<string, unknown> = {
    updatedAt: new Date(),
  };
  setPayload[config.key as string] = sql`${config.column} + ${incrementBy}`;

  await db
    .insert(gearPopularityIntraday)
    .values(values as GearPopularityIntradayInsert)
    .onConflictDoUpdate({
      target: [gearPopularityIntraday.date, gearPopularityIntraday.gearId],
      set: setPayload,
    });

  console.info("live_popularity_increment", {
    gearId: params.gearId,
    eventType: params.eventType,
    count: incrementBy,
  });
}

/**
 * hasViewEventForIdentityToday
 *
 * Checks if a 'view' event exists for the given gear and identity (user or visitor)
 * within the current UTC calendar day.
 */
export async function hasViewEventForIdentityToday(params: {
  gearId: string;
  userId?: string | null;
  visitorId?: string | null;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const startUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const nextUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );

  // Determine which identity to use for dedupe. If neither is present, we
  // cannot attribute the event to an identity, so we skip dedupe (treat as no existing).
  let identityFilter: SQL | undefined;
  if (params.userId) {
    identityFilter = eq(popularityEvents.userId, params.userId);
  } else if (params.visitorId) {
    identityFilter = eq(popularityEvents.visitorId, params.visitorId);
  } else {
    return false;
  }

  const existing = await db
    .select({ id: popularityEvents.id })
    .from(popularityEvents)
    .where(
      and(
        eq(popularityEvents.gearId, params.gearId),
        eq(popularityEvents.eventType, "view"),
        gte(popularityEvents.createdAt, startUtc),
        lt(popularityEvents.createdAt, nextUtc),
        identityFilter,
      ),
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * insertViewEvent
 *
 * Appends a 'view' popularity event. When a userId is present, visitorId is ignored.
 */
export async function insertViewEvent(params: {
  gearId: string;
  userId?: string | null;
  visitorId?: string | null;
}) {
  await db.insert(popularityEvents).values({
    gearId: params.gearId,
    userId: params.userId ?? null,
    visitorId: params.userId ? null : (params.visitorId ?? null),
    eventType: "view",
  });

  await incrementGearPopularityIntraday({
    gearId: params.gearId,
    eventType: "view",
  });
}

/**
 * hasEventForIdentityToday
 *
 * Generic identity-based dedupe across event types for the current UTC day.
 */
export async function hasEventForIdentityToday(params: {
  gearId: string;
  eventType: PopularityEventType;
  userId?: string | null;
  visitorId?: string | null;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const startUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const nextUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );

  let identityFilter: SQL | undefined;
  if (params.userId) {
    identityFilter = eq(popularityEvents.userId, params.userId);
  } else if (params.visitorId) {
    identityFilter = eq(popularityEvents.visitorId, params.visitorId);
  } else {
    return false;
  }

  const existing = await db
    .select({ id: popularityEvents.id })
    .from(popularityEvents)
    .where(
      and(
        eq(popularityEvents.gearId, params.gearId),
        eq(popularityEvents.eventType, params.eventType),
        gte(popularityEvents.createdAt, startUtc),
        lt(popularityEvents.createdAt, nextUtc),
        identityFilter,
      ),
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * insertCompareAddEvent
 */
export async function insertCompareAddEvent(params: {
  gearId: string;
  userId?: string | null;
  visitorId?: string | null;
}) {
  await db.insert(popularityEvents).values({
    gearId: params.gearId,
    userId: params.userId ?? null,
    visitorId: params.userId ? null : (params.visitorId ?? null),
    eventType: "compare_add",
  });

  await incrementGearPopularityIntraday({
    gearId: params.gearId,
    eventType: "compare_add",
  });
}

/**
 * incrementComparePairCountBySlugs(slugs)
 *
 * Minimal per-pair counter using an atomic upsert. Slugs are sorted to build a stable key.
 */
export async function incrementComparePairCountBySlugs(params: {
  slugs: [string, string];
}): Promise<{ success: boolean; skipped?: string }> {
  const sorted = params.slugs.slice().sort((a, b) => a.localeCompare(b)) as [
    string,
    string,
  ];
  const pairKey = `${sorted[0]}|${sorted[1]}`;

  const rows = await db
    .select({ id: gear.id, slug: gear.slug })
    .from(gear)
    .where(inArray(gear.slug, sorted as string[]));

  if (rows.length !== 2) {
    return { success: false, skipped: "missing_gear" } as const;
  }

  // Canonicalize by IDs to ensure A|B and B|A coalesce regardless of slug order
  const ids = rows.map((r) => r.id).sort((a, b) => a.localeCompare(b)) as [
    string,
    string,
  ];
  const [gearAId, gearBId] = ids;

  await db
    .insert(comparePairCounts)
    .values({ pairKey, gearAId, gearBId, count: 1 })
    .onConflictDoUpdate({
      target: [comparePairCounts.gearAId, comparePairCounts.gearBId],
      set: {
        pairKey, // keep denormalized key fresh even if slugs change
        count: sql`${comparePairCounts.count} + 1`,
        updatedAt: sql`now()`,
      },
    });

  return { success: true } as const;
}

/**
 * fetchTopComparePairs(limit)
 *
 * Returns top-N pairs with joined gear names and slugs.
 */
export async function fetchTopComparePairs(limit = 20) {
  const a = alias(gear, "ga");
  const b = alias(gear, "gb");

  const rows = await db
    .select({
      gearAId: comparePairCounts.gearAId,
      gearBId: comparePairCounts.gearBId,
      count: comparePairCounts.count,
      aName: a.name,
      aSlug: a.slug,
      bName: b.name,
      bSlug: b.slug,
    })
    .from(comparePairCounts)
    .innerJoin(a, eq(comparePairCounts.gearAId, a.id))
    .innerJoin(b, eq(comparePairCounts.gearBId, b.id))
    .orderBy(desc(comparePairCounts.count))
    .limit(limit);

  return rows.map((r) => ({
    gearAId: r.gearAId,
    gearBId: r.gearBId,
    count: Number(r.count),
    a: { name: r.aName, slug: r.aSlug },
    b: { name: r.bName, slug: r.bSlug },
  }));
}
