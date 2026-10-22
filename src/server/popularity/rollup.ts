import { sql } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { rollupRuns } from "~/server/db/schema";
import {
  getGearPageTrendingTag,
  queryGearPageTrendingSlugs,
} from "~/server/popularity/data";

type SqlClient = { execute: (q: any) => Promise<any> };
type RevalidateTag = (tag: string, profile: "max") => void;
type RevalidateGearPages = (slugs: Iterable<string>) => void;

/**
 * Slugs that entered or left the gear page trending set during a rollup.
 */
export function getChangedTrendingGearSlugs(
  before: string[],
  after: string[],
): string[] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return Array.from(new Set([...before, ...after]))
    .filter((slug) => beforeSet.has(slug) !== afterSet.has(slug))
    .sort();
}

/**
 * Refresh popularity caches after a rollup.
 *
 * Home, browse and lists read the shared 'trending' tag and refresh every
 * night. Gear pages use per-slug trending tags instead, so only the slugs whose
 * badge changed are refreshed. The per-slug tag also covers pages that show
 * that slug as an alternative.
 */
export async function revalidatePopularityCachesAfterRollup(
  trendingGearSlugs: { before: string[]; after: string[] },
  revalidators?: {
    revalidateTag: RevalidateTag;
    revalidateGearPages: RevalidateGearPages;
  },
): Promise<string[]> {
  const revalidateTag =
    revalidators?.revalidateTag ?? (await import("next/cache")).revalidateTag;
  const revalidateGearPages =
    revalidators?.revalidateGearPages ??
    (await import("~/server/revalidation")).revalidateGearPages;

  revalidateTag("trending", "max");
  console.info("popularity_rollup: revalidated tag", { tag: "trending" });

  const changedSlugs = getChangedTrendingGearSlugs(
    trendingGearSlugs.before,
    trendingGearSlugs.after,
  );
  for (const slug of changedSlugs) {
    revalidateTag(getGearPageTrendingTag(slug), "max");
  }
  if (changedSlugs.length > 0) {
    revalidateGearPages(changedSlugs);
  }
  console.info("popularity_rollup: revalidated trending gear pages", {
    slugs: changedSlugs,
  });
  return changedSlugs;
}

/**
 * Drizzle execute() result normalizer.
 * - postgres-js returns an array of rows
 * - node-postgres returns an object with a rows property
 */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in (result as any)) {
    return ((result as any).rows ?? []) as T[];
  }
  return [] as T[];
}

/**
 * Format a Date (or ISO string) to YYYY-MM-DD in UTC.
 * Used for bucketing events by calendar day in a stable way.
 */
function toUtcDateString(input?: string | Date): string {
  const d =
    input instanceof Date ? input : input ? new Date(input) : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidUtcDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

/**
 * Build per-gear daily counts for a specific UTC date and upsert into app.gear_popularity_daily.
 *
 * What the SQL does:
 * - Groups raw app.popularity_events by (UTC date, gear_id)
 * - Pivots event_type into separate integer columns via SUM(CASE ...)
 * - Upserts on (date, gear_id) so the operation is idempotent
 */
export async function rollupDaily(
  asOfDate: string,
  client: SqlClient = db,
): Promise<number> {
  /**
   * Upsert D-1 (or any given date) daily rows and return number of gear rows touched.
   */
  const res = await client.execute(sql`
    WITH upsert AS (
      INSERT INTO app.gear_popularity_daily (
        date, gear_id, views, wishlist_adds, owner_adds, compare_adds, review_submits, api_fetches, updated_at
      )
      SELECT
        (created_at AT TIME ZONE 'UTC')::date AS date,
        gear_id,
        SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS views,
        SUM(CASE WHEN event_type = 'wishlist_add' THEN 1 ELSE 0 END) AS wishlist_adds,
        SUM(CASE WHEN event_type = 'owner_add' THEN 1 ELSE 0 END) AS owner_adds,
        SUM(CASE WHEN event_type = 'compare_add' THEN 1 ELSE 0 END) AS compare_adds,
        SUM(CASE WHEN event_type = 'review_submit' THEN 1 ELSE 0 END) AS review_submits,
        SUM(CASE WHEN event_type = 'api_fetch' THEN 1 ELSE 0 END) AS api_fetches,
        now()
      FROM app.popularity_events
      WHERE (created_at AT TIME ZONE 'UTC')::date = ${asOfDate}
      GROUP BY 1, 2
      ON CONFLICT (date, gear_id) DO UPDATE SET
        views = EXCLUDED.views,
        wishlist_adds = EXCLUDED.wishlist_adds,
        owner_adds = EXCLUDED.owner_adds,
        compare_adds = EXCLUDED.compare_adds,
        review_submits = EXCLUDED.review_submits,
        api_fetches = EXCLUDED.api_fetches,
        updated_at = now()
      RETURNING 1
    )
    SELECT count(*)::int AS c FROM upsert;
  `);
  const rows = extractRows<{ c?: number }>(res);
  return Number(rows?.[0]?.c ?? 0);
}

/**
 * Compute rolling windows (7d and 30d) ending at asOfDate (inclusive) and upsert into app.gear_popularity_windows.
 *
 * What the SQL does:
 * - Sums the daily table over the given window for each gear
 * - Writes a single row per (gear_id, timeframe) with an as_of_date snapshot
 * - Upserts so snapshots are easy to refresh
 */
export async function rollupWindows(
  asOfDate: string,
  client: SqlClient = db,
): Promise<void> {
  // helper to upsert a window for N days ending at asOfDate (inclusive)
  async function upsertWindow(days: number, timeframe: "7d" | "30d") {
    await client.execute(sql`
      INSERT INTO app.gear_popularity_windows (
        gear_id,
        timeframe,
        as_of_date,
        views_sum,
        wishlist_adds_sum,
        owner_adds_sum,
        compare_adds_sum,
        review_submits_sum,
        api_fetches_sum,
        updated_at
      )
      SELECT
        gear_id,
        ${timeframe}::popularity_timeframe,
        ${asOfDate}::date,
        SUM(views),
        SUM(wishlist_adds),
        SUM(owner_adds),
        SUM(compare_adds),
        SUM(review_submits),
        SUM(api_fetches),
        now()
      FROM app.gear_popularity_daily
      WHERE date BETWEEN (${asOfDate}::date - make_interval(days => ${days - 1})) AND ${asOfDate}::date
      GROUP BY gear_id
      ON CONFLICT (gear_id, timeframe) DO UPDATE SET
        as_of_date = EXCLUDED.as_of_date,
        views_sum = EXCLUDED.views_sum,
        wishlist_adds_sum = EXCLUDED.wishlist_adds_sum,
        owner_adds_sum = EXCLUDED.owner_adds_sum,
        compare_adds_sum = EXCLUDED.compare_adds_sum,
        review_submits_sum = EXCLUDED.review_submits_sum,
        api_fetches_sum = EXCLUDED.api_fetches_sum,
        updated_at = now();
    `);
  }

  await Promise.all([upsertWindow(7, "7d"), upsertWindow(30, "30d")]);
}

/**
 * Recompute monotonic lifetime totals per gear and upsert into app.gear_popularity_lifetime.
 *
 * What the SQL does:
 * - Aggregates all time from the daily table for each metric
 * - Upserts one row per gear
 */
export async function rollupLifetime(client: SqlClient = db): Promise<void> {
  await client.execute(sql`
    INSERT INTO app.gear_popularity_lifetime (
      gear_id,
      views_lifetime,
      wishlist_lifetime_adds,
      owner_lifetime_adds,
      compare_lifetime_adds,
      review_lifetime_submits,
      api_fetch_lifetime,
      updated_at
    )
    SELECT
      gear_id,
      SUM(views) AS views_lifetime,
      SUM(wishlist_adds) AS wishlist_lifetime_adds,
      SUM(owner_adds) AS owner_lifetime_adds,
      SUM(compare_adds) AS compare_lifetime_adds,
      SUM(review_submits) AS review_lifetime_submits,
      SUM(api_fetches) AS api_fetch_lifetime,
      now()
    FROM app.gear_popularity_daily
    GROUP BY gear_id
    ON CONFLICT (gear_id) DO UPDATE SET
      views_lifetime = EXCLUDED.views_lifetime,
      wishlist_lifetime_adds = EXCLUDED.wishlist_lifetime_adds,
      owner_lifetime_adds = EXCLUDED.owner_lifetime_adds,
      compare_lifetime_adds = EXCLUDED.compare_lifetime_adds,
      review_lifetime_submits = EXCLUDED.review_lifetime_submits,
      api_fetch_lifetime = EXCLUDED.api_fetch_lifetime,
      updated_at = now();
  `);
}

/**
 * Purge raw events for a processed UTC date from app.popularity_events.
 *
 * Notes:
 * - Consider keeping a 48h buffer in production to allow late-arriving events
 */
export async function purgeRaw(
  asOfDate: string,
  client: SqlClient = db,
): Promise<void> {
  await client.execute(
    sql`DELETE FROM app.popularity_events WHERE (created_at AT TIME ZONE 'UTC')::date = ${asOfDate}`,
  );
}

/**
 * Orchestrate the daily popularity rollup.
 *
 * Behavior:
 * - Determines D-1 (yesterday UTC) if no date is provided
 * - Runs: daily → windows → lifetime → purge
 * - Returns the processed asOfDate for logging/metrics
 */
export async function runDailyPopularityRollup(
  inputDate?: string,
): Promise<{ asOfDate: string; correctedDate: string }> {
  /**
   * 48-hour robust rollup strategy (UTC):
   *
   * Let base = inputDate (YYYY-MM-DD) or today (UTC) if not provided.
   * D-1 = yesterday from base; D-2 = two days before base.
   *
   * Steps:
   * 1) rollupDaily(D-2)  // correction window captures late arrivals
   * 2) rollupDaily(D-1)  // main daily build for yesterday
   * 3) rollupWindows(D-1) // windows are snapshots as-of D-1
   * 4) rollupLifetime()   // recompute monotonic totals
   * 5) purgeRaw(D-2)      // keep 48h raw buffer; only purge the older day
   */

  // Compute base date in UTC; accept only YYYY-MM-DD, else use today
  const baseDate = isValidUtcDateString(inputDate)
    ? inputDate
    : toUtcDateString();

  // Derive D-1 and D-2 from base
  const base = new Date(`${baseDate}T00:00:00.000Z`);
  const d1 = new Date(base);
  d1.setUTCDate(d1.getUTCDate() - 1);
  const d2 = new Date(base);
  d2.setUTCDate(d2.getUTCDate() - 2);
  const asOfDate = toUtcDateString(d1); // D-1
  const correctedDate = toUtcDateString(d2); // D-2

  console.info("popularity_rollup: start", {
    baseDate,
    asOfDate,
    correctedDate,
  });

  const started = Date.now();
  const dailyCounts = { d2: 0, d1: 0 };
  const durations = {
    d2DailyMs: 0,
    d1DailyMs: 0,
    windowsMs: 0,
    lifetimeMs: 0,
    purgeMs: 0,
    totalMs: 0,
  };
  let eventsD1 = 0;
  let lateArrivals = 0;
  let dailyAgg = {
    items: 0,
    views: 0,
    wishlist_adds: 0,
    owner_adds: 0,
    compare_adds: 0,
    review_submits: 0,
    api_fetches: 0,
  };
  let windowsRows = 0;
  let lifetimeTotalRows = 0;
  let intradayRowsCleared = 0;
  let liveBoostSummary: Array<{
    date: string;
    slug: string;
    name: string;
    liveScore: number;
    views: number;
  }> = [];
  let ok = false;
  let errorMessage: string | null = null;
  // Gear page trending set before the rollup, diffed afterwards so only gear
  // pages whose badge changed are refreshed. Null if the read fails.
  const trendingGearSlugsBefore = await queryGearPageTrendingSlugs().catch(
    (error: unknown) => {
      console.warn("popularity_rollup: failed to read trending gear slugs", {
        error,
      });
      return null;
    },
  );
  try {
    // 1) Correction pass for D-2 (late arrivals)
    const tD2 = Date.now();
    dailyCounts.d2 = await rollupDaily(correctedDate);
    durations.d2DailyMs = Date.now() - tD2;

    // 2) Main pass for D-1
    const tD1 = Date.now();
    dailyCounts.d1 = await rollupDaily(asOfDate);
    durations.d1DailyMs = Date.now() - tD1;

    // 3) Window snapshots as of D-1
    const beforeWindows = Date.now();
    await rollupWindows(asOfDate);
    durations.windowsMs = Date.now() - beforeWindows;

    // 4) Lifetime totals
    const tLife = Date.now();
    await rollupLifetime();
    durations.lifetimeMs = Date.now() - tLife;

    // Live boost summary & cleanup
    type LiveSummaryRow = {
      date?: string;
      slug?: string;
      name?: string;
      live_score?: unknown;
      views?: unknown;
    };
    const liveSummaryRes = await db.execute(sql<LiveSummaryRow>`
      SELECT
        gpi.date,
        g.slug,
        g.name,
        (
          gpi.views * 0.1 +
          gpi.wishlist_adds * 2 +
          gpi.owner_adds * 3 +
          gpi.compare_adds * 1.5 +
          gpi.review_submits * 2.5
        ) AS live_score,
        gpi.views
      FROM app.gear_popularity_intraday gpi
      JOIN app.gear g ON gpi.gear_id = g.id
      WHERE gpi.date < CURRENT_DATE
      ORDER BY live_score DESC
      LIMIT 5;
    `);
    const liveSummaryRows = extractRows<LiveSummaryRow>(liveSummaryRes);
    liveBoostSummary = liveSummaryRows.map((row) => ({
      date: row.date ?? asOfDate,
      slug: row.slug ?? "",
      name: row.name ?? "",
      liveScore: Number(row.live_score ?? 0),
      views: Number(row.views ?? 0),
    }));
    if (liveBoostSummary.length) {
      console.info("popularity_rollup: live boost summary", {
        date: liveBoostSummary[0]?.date,
        top: liveBoostSummary,
      });
    }
    const intradayDelete = await db.execute(sql`
      WITH removed AS (
        DELETE FROM app.gear_popularity_intraday
        WHERE date < CURRENT_DATE
        RETURNING 1
      )
      SELECT count(*)::int AS c FROM removed;
    `);
    intradayRowsCleared = Number(
      extractRows<{ c?: number }>(intradayDelete)[0]?.c ?? 0,
    );
    if (intradayRowsCleared) {
      console.info("popularity_rollup: intraday reset", {
        rows: intradayRowsCleared,
      });
    }

    // Invalidate cached trending endpoints since windows/lifetime changed
    try {
      const trendingGearSlugsAfter = await queryGearPageTrendingSlugs().catch(
        (error: unknown) => {
          console.warn(
            "popularity_rollup: failed to read trending gear slugs",
            {
              error,
            },
          );
          return [];
        },
      );
      await revalidatePopularityCachesAfterRollup({
        // Without a before snapshot, refresh every slug now in the set.
        before: trendingGearSlugsBefore ?? [],
        after: trendingGearSlugsAfter,
      });
    } catch (e) {
      console.warn("popularity_rollup: failed to revalidate tag", { error: e });
    }

    // 5) Purge only D-2 raw; keep D-1 raw for next correction cycle
    const tPurge = Date.now();
    await purgeRaw(correctedDate);
    durations.purgeMs = Date.now() - tPurge;

    // Count late arrivals (events for D-2 that arrived after the previous run)
    const late = await db.execute(sql`
      SELECT count(*)::int AS c
      FROM app.popularity_events
      WHERE (created_at AT TIME ZONE 'UTC')::date = ${correctedDate}
        AND created_at > now() - interval '24 hours';
    `);
    lateArrivals = Number(extractRows<{ c?: number }>(late)[0]?.c ?? 0);

    // Aggregate stats for message
    const ev = await db.execute(sql`
      SELECT count(*)::int AS c
      FROM app.popularity_events
      WHERE (created_at AT TIME ZONE 'UTC')::date = ${asOfDate};
    `);
    eventsD1 = Number(extractRows<{ c?: number }>(ev)[0]?.c ?? 0);

    type DailyAggRow = {
      items?: unknown;
      views?: unknown;
      wishlist_adds?: unknown;
      owner_adds?: unknown;
      compare_adds?: unknown;
      review_submits?: unknown;
      api_fetches?: unknown;
    };

    const agg = await db.execute(sql<DailyAggRow>`
      SELECT
        count(*)::int AS items,
        COALESCE(sum(views), 0)::bigint AS views,
        COALESCE(sum(wishlist_adds), 0)::bigint AS wishlist_adds,
        COALESCE(sum(owner_adds), 0)::bigint AS owner_adds,
        COALESCE(sum(compare_adds), 0)::bigint AS compare_adds,
        COALESCE(sum(review_submits), 0)::bigint AS review_submits,
        COALESCE(sum(api_fetches), 0)::bigint AS api_fetches
      FROM app.gear_popularity_daily
      WHERE date = ${asOfDate};
    `);
    const r = extractRows<DailyAggRow>(agg)[0] ?? ({} as DailyAggRow);
    const num = (v: unknown) => Number(v ?? 0);
    dailyAgg = {
      items: num(r.items),
      views: num(r.views),
      wishlist_adds: num(r.wishlist_adds),
      owner_adds: num(r.owner_adds),
      compare_adds: num(r.compare_adds),
      review_submits: num(r.review_submits),
      api_fetches: num(r.api_fetches),
    };

    const win = await db.execute(sql`
      SELECT count(*)::int AS c
      FROM app.gear_popularity_windows
      WHERE as_of_date = ${asOfDate};
    `);
    windowsRows = Number(extractRows<{ c?: number }>(win)[0]?.c ?? 0);

    const lt = await db.execute(sql`
      SELECT count(*)::int AS c FROM app.gear_popularity_lifetime;
    `);
    lifetimeTotalRows = Number(extractRows<{ c?: number }>(lt)[0]?.c ?? 0);
    ok = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    ok = false;
  } finally {
    const durationMs = Date.now() - started;
    durations.totalMs = durationMs;

    // Persist run history
    try {
      await db.insert(rollupRuns).values({
        asOfDate,
        correctedDate,
        dailyRows: dailyAgg.items,
        lateArrivals,
        windowsRows,
        lifetimeTotalRows,
        durationMs,
        success: ok,
        error: errorMessage,
      });
    } catch (e) {
      console.warn("popularity_rollup: failed to persist run history", {
        error: e,
      });
    }

    const webhook = env.DISCORD_ROLLUP_WEBHOOK_URL;
    if (webhook) {
      // Fire-and-forget webhook; ignore failures
      const statusEmoji = ok ? "✅" : "❌";
      const lines = [
        `**Popularity Rollup** (asOf: ${asOfDate}, corrected: ${correctedDate})`,
        `- **Status**: ${statusEmoji} ${ok ? "Success" : `Failed${errorMessage ? ` - ${errorMessage}` : ""}`}`,
        `- **Raw events (D-1)**: ${eventsD1}`,
        `- **Late arrivals (D-2)**: ${lateArrivals}`,
        `- **Daily rows (D-1)**: ${dailyAgg.items}`,
        `- **Views (D-1)**: ${dailyAgg.views}`,
        `- **Wishlist adds (D-1)**: ${dailyAgg.wishlist_adds}`,
        `- **Owner adds (D-1)**: ${dailyAgg.owner_adds}`,
        `- **Compare adds (D-1)**: ${dailyAgg.compare_adds}`,
        `- **Review submits (D-1)**: ${dailyAgg.review_submits}`,
        `- **Windows rows (D-1)**: ${windowsRows}`,
        `- **Lifetime rows (total)**: ${lifetimeTotalRows}`,
        `- **Intraday rows cleared**: ${intradayRowsCleared}`,
        `\nDurations (ms):\n- D-2 daily: ${durations.d2DailyMs}\n- D-1 daily: ${durations.d1DailyMs}\n- Windows: ${durations.windowsMs}\n- Lifetime: ${durations.lifetimeMs}\n- Purge D-2: ${durations.purgeMs}\n- Total: ${durations.totalMs}`,
      ];
      if (liveBoostSummary.length) {
        const liveLines = liveBoostSummary
          .map(
            (item, idx) =>
              `  ${idx + 1}. ${item.slug} (${item.name}) +${item.liveScore.toFixed(
                1,
              )} live`,
          )
          .join("\n");
        lines.push(`- **Live boost top movers**:\n${liveLines}`);
      }
      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Sharply Rollup Runs",
          content: lines.join("\n"),
        }),
      }).catch(console.error);
    }
  }

  return { asOfDate, correctedDate };
}
