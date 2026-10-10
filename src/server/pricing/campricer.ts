import "server-only";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import type { PriceImportCounts, PriceImportSummary } from "~/server/db/schema";
import {
  completePriceFetchRunData,
  createPriceFetchRunData,
  importCampricerPriceData,
  listGearForPriceImportData,
  listActiveCampricerGearData,
  recordPriceFetchRunItemData,
} from "./data";
import { rebuildGearPriceProjection } from "./projection";

const API_URL = "https://campricer.psavela.com/api/v1/models";
const stateSchema = z.object({
  nextPage: z.number().int().positive(),
  pages: z.number().int().positive(),
  etags: z.record(z.string()),
  nextEligibleAt: z.number().nonnegative(),
});
type SyncState = z.infer<typeof stateSchema>;
const pageSchema = z.object({
  currency: z.literal("EUR"),
  page: z.number().int().positive(),
  pages: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  per_page: z.number().int().min(1).max(1000),
  models: z.array(z.unknown()).max(1000),
});
const modelSchema = z.object({
  sharply_slug: z.string().min(1),
  url: z.string().url(),
  updated_at: z.string().datetime({ offset: true }),
  estimate: z
    .object({
      cents: z.number().int().positive().max(2147483647),
      thin: z.boolean(),
    })
    .nullable(),
});

export function emptyImportCounts(): PriceImportCounts {
  return {
    matched: 0,
    imported: 0,
    unchanged: 0,
    thin: 0,
    unmatched: 0,
    invalid: 0,
    disabled: 0,
  };
}
export function campricerNamespace(
  environment: Record<string, string | undefined> = process.env,
) {
  // Production remains stable across releases; preview branches and local projects are isolated.
  const identity =
    environment.VERCEL_ENV === "production"
      ? "production"
      : `${environment.VERCEL_ENV ?? environment.NODE_ENV ?? "development"}:${environment.VERCEL_GIT_COMMIT_REF ?? "local"}:${environment.NEXT_PUBLIC_BASE_URL ?? "localhost"}`;
  return `pricing:campricer:${encodeURIComponent(identity)}`;
}
export function parseRetryAfter(value: string | null, now: number): number {
  if (!value) return now + 24 * 60 * 60 * 1000;
  const seconds = Number(value);
  const parsed = Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Date.parse(value);
  return Number.isFinite(parsed)
    ? Math.max(now, parsed)
    : now + 24 * 60 * 60 * 1000;
}
function redisFromEnvironment() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token, retry: { retries: 0 } });
}
type Dependencies = {
  redis?: Pick<Redis, "get" | "set" | "eval">;
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Two requests/day, independent of the per-mapping fetch queue. All secrets stay server-side. */
export async function syncCampricerService(deps: Dependencies = {}) {
  const run = await createPriceFetchRunData("campricer");
  const summary: PriceImportSummary = {
    requests: 0,
    cursorBefore: 1,
    cursorAfter: 1,
    nextEligibleAt: null,
    counts: emptyImportCounts(),
    pages: [],
  };
  const gearSlugs = new Set<string>();
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const request = deps.fetch ?? fetch;
  const prefix = campricerNamespace();
  const lockKey = `${prefix}:lock`,
    stateKey = `${prefix}:state`;
  const lockToken = crypto.randomUUID();
  let redis: Dependencies["redis"];
  let locked = false,
    failed = false;
  let error: string | undefined;
  try {
    const apiKey = deps.apiKey ?? process.env.CAMPRICER_API_KEY;
    if (!apiKey) {
      summary.skippedReason = "API key not configured";
    } else {
      redis = deps.redis ?? redisFromEnvironment();
      locked = Boolean(
        await redis.set(lockKey, lockToken, { nx: true, ex: 900 }),
      );
      if (!locked) summary.skippedReason = "Import already running";
      else {
        const parsed = stateSchema.safeParse(await redis.get(stateKey));
        const state: SyncState = parsed.success
          ? parsed.data
          : { nextPage: 1, pages: 1, etags: {}, nextEligibleAt: 0 };
        summary.cursorBefore = summary.cursorAfter = state.nextPage;
        summary.nextEligibleAt = state.nextEligibleAt
          ? new Date(state.nextEligibleAt).toISOString()
          : null;
        if (state.nextEligibleAt > now()) summary.skippedReason = "Not due";
        else
          for (let index = 0; index < 2; index++) {
            // Budget reservation is atomic and survives partial failures and repeated cron calls.
            const budgetKey = `${prefix}:budget:${new Date(now()).toISOString().slice(0, 10)}`;
            const reserved = await redis.eval<[string], number>(
              `
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -1 end
            local used = tonumber(redis.call('GET', KEYS[2]) or '0')
            if used >= 2 then return 0 end
            redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
            return 1`,
              [lockKey, budgetKey],
              [lockToken],
            );
            if (reserved !== 1) {
              summary.skippedReason =
                reserved === 0
                  ? "Daily request budget exhausted"
                  : "Import lease lost";
              break;
            }
            if (index > 0) await sleep(2000);
            summary.requests++;
            const page = state.nextPage,
              started = now();
            const detail: PriceImportSummary["pages"][number] = {
              page,
              httpStatus: null,
              durationMs: 0,
              itemCount: 0,
              counts: emptyImportCounts(),
            };
            summary.pages.push(detail);
            try {
              const url = new URL(API_URL);
              url.search = new URLSearchParams({
                sharply: "1",
                currency: "EUR",
                per_page: "1000",
                page: String(page),
              }).toString();
              const headers: Record<string, string> = {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
                "User-Agent": "Sharply price catalog/1.0",
              };
              if (state.etags[page])
                headers["If-None-Match"] = state.etags[page]!;
              const response = await request(url.toString(), {
                headers,
                signal: AbortSignal.timeout(20000),
                cache: "no-store",
                redirect: "error",
              });
              detail.httpStatus = response.status;
              if (response.status === 429) {
                state.nextEligibleAt = parseRetryAfter(
                  response.headers.get("Retry-After"),
                  now(),
                );
                await redis.set(stateKey, state);
                summary.nextEligibleAt = new Date(
                  state.nextEligibleAt,
                ).toISOString();
                throw new Error("Rate limited");
              }
              // The catalog may have shrunk since the cursor was saved.
              if (response.status === 404 && page > 1) {
                state.nextPage = 1;
                state.pages = 1;
                state.etags = {};
                state.nextEligibleAt = 0;
                await redis.set(stateKey, state);
                summary.cursorAfter = 1;
                summary.nextEligibleAt = null;
                detail.error =
                  "Saved page no longer exists; cursor reset to page 1";
                continue;
              }
              if (response.status !== 304 && !response.ok)
                throw new Error("HTTP failure");
              let etag: string | null = null;
              if (response.status !== 304) {
                const payload = pageSchema.parse(await response.json());
                if (payload.pages < page) {
                  state.nextPage = 1;
                  state.pages = payload.pages;
                  state.etags = {};
                  state.nextEligibleAt = 0;
                  await redis.set(stateKey, state);
                  summary.cursorAfter = 1;
                  summary.nextEligibleAt = null;
                  detail.error = "Catalog shrank; cursor reset to page 1";
                  continue;
                }
                if (payload.page !== page)
                  throw new Error("Invalid pagination");
                state.pages = payload.pages;
                detail.itemCount = payload.models.length;
                const models = payload.models.map((value) =>
                  modelSchema.safeParse(value),
                );
                const gears = await listGearForPriceImportData(
                  models.flatMap((m) =>
                    m.success ? [m.data.sharply_slug] : [],
                  ),
                );
                const bySlug = new Map(gears.map((g) => [g.slug, g]));
                const processModel = async (model: (typeof models)[number]) => {
                  if (
                    !model.success ||
                    (model.success &&
                      new URL(model.data.url).origin !==
                        "https://campricer.psavela.com")
                  ) {
                    detail.counts.invalid++;
                    return;
                  }
                  const m = model.data;
                  const gear = bySlug.get(m.sharply_slug);
                  if (!gear) {
                    detail.counts.unmatched++;
                    return;
                  }
                  const observedAt = new Date(m.updated_at);
                  if (observedAt.getTime() > now()) {
                    detail.counts.invalid++;
                    return;
                  }
                  detail.counts.matched++;
                  const itemStartedAt = new Date(now());
                  const imported = await importCampricerPriceData({
                    gearId: gear.id,
                    slug: gear.slug,
                    url: m.url,
                    amountMinor:
                      m.estimate && !m.estimate.thin ? m.estimate.cents : null,
                    observedAt:
                      m.estimate && !m.estimate.thin ? observedAt : null,
                  });
                  detail.counts[imported.outcome]++;
                  await recordPriceFetchRunItemData({
                    runId: run.id,
                    mappingId: imported.mapping.id,
                    gearId: gear.id,
                    gearName: gear.name,
                    gearSlug: gear.slug,
                    sourceKey: "campricer",
                    marketKey: "EU",
                    status:
                      imported.outcome === "thin" ||
                      imported.outcome === "disabled"
                        ? "NO_DATA"
                        : "SUCCESS",
                    insertedObservationCount:
                      imported.outcome === "imported" ? 1 : 0,
                    startedAt: itemStartedAt,
                    completedAt: new Date(now()),
                  });
                };

                // Local DB work is bounded independently of sequential provider requests.
                for (let offset = 0; offset < models.length; offset += 5) {
                  const results = await Promise.allSettled(
                    models.slice(offset, offset + 5).map(processModel),
                  );
                  if (results.some((result) => result.status === "rejected"))
                    throw new Error("Page processing failed");
                }
                etag = response.headers.get("ETag");
              }
              if (etag) state.etags[page] = etag;
              else if (response.status !== 304) delete state.etags[page];
              const completedCycle = page >= state.pages;
              state.nextPage = completedCycle ? 1 : page + 1;
              if (completedCycle) {
                // Once per UTC day, even when the cycle uses only one request.
                state.nextEligibleAt = Date.parse(
                  `${new Date(now() + 86400000).toISOString().slice(0, 10)}T00:00:00Z`,
                );
                for (const key of Object.keys(state.etags))
                  if (Number(key) > state.pages) delete state.etags[key];
              }
              await redis.set(stateKey, state);
              summary.cursorAfter = state.nextPage;
              summary.nextEligibleAt = state.nextEligibleAt
                ? new Date(state.nextEligibleAt).toISOString()
                : null;
              if (completedCycle) break;
            } catch {
              // Do not persist response bodies or arbitrary error messages: they may contain credentials.
              detail.error =
                detail.httpStatus === 429
                  ? "CamPricer rate limited the import"
                  : "CamPricer page request or processing failed";
              error = detail.error;
              failed = true;
              break;
            } finally {
              detail.durationMs = now() - started;
              for (const key of Object.keys(detail.counts) as Array<
                keyof PriceImportCounts
              >)
                summary.counts[key] += detail.counts[key];
            }
          }
      }
    }
  } catch {
    failed = true;
    error = "CamPricer sync state or processing unavailable";
  } finally {
    // A 304 (or unavailable provider) must not freeze FX conversions and freshness.
    // Failed page processing can also be recovered from observations already stored.
    if (summary.skippedReason !== "Import already running") {
      try {
        const gears = await listActiveCampricerGearData();
        for (let offset = 0; offset < gears.length; offset += 5) {
          const outcomes = await Promise.allSettled(
            gears.slice(offset, offset + 5).map(async (gear) => {
              await rebuildGearPriceProjection(gear.id, {
                preserveExisting: true,
              });
              gearSlugs.add(gear.slug);
            }),
          );
          if (outcomes.some((outcome) => outcome.status === "rejected")) {
            failed = true;
            error ??= "Stored CamPricer price recalculation failed";
          }
        }
      } catch {
        failed = true;
        error ??= "Stored CamPricer price recalculation unavailable";
      }
    }
    if (redis && locked) {
      try {
        await redis.eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
          [lockKey],
          [lockToken],
        );
      } catch {
        failed = true;
        error ??= "CamPricer sync lease release failed";
      }
    }
    await completePriceFetchRunData({
      runId: run.id,
      status: failed
        ? summary.counts.imported
          ? "PARTIAL"
          : "ERROR"
        : "SUCCESS",
      scannedCount: summary.counts.matched,
      successCount: summary.counts.imported + summary.counts.unchanged,
      noDataCount: summary.counts.thin + summary.counts.disabled,
      errorCount: failed ? 1 : 0,
      error,
      summary,
    });
  }
  return {
    ok: !failed,
    runId: run.id,
    summary,
    gearSlugs: Array.from(gearSlugs),
  };
}
