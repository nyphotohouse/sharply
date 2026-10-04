# Popularity Tracking System

This document describes the end‑to‑end popularity tracking in Sharply: ingestion, storage, rollups, APIs, caching, UI integrations, and operations.

## Architecture Overview

- **Ingestion (append‑only events)**
  - API routes under `app/api/gear/[slug]/…` record canonical events:
    - `view`, `wishlist_add`, `owner_add`, `compare_add`, `review_submit`, `api_fetch`
  - Enforced with Postgres enum (`popularity_event_type`).
  - Events are never deleted; truth tables (wishlists/ownerships/reviews) remain the authoritative current state.

- **Event quality and dedupe**
  - Views: BotID classification in the gear page server action, then the existing UA denylist, then per‑visitor (cookie `visitorId`, 3‑day TTL) per‑gear per‑UTC‑day dedupe; anonymous allowed.
  - Wishlists/Ownerships: per‑user per‑gear per‑UTC‑day dedupe for the popularity event (truth tables already unique by user+gear).
  - Useful dev logs emitted for blocked reasons.

- **Storage layout (Drizzle schema)**
  - `app.popularity_events`: raw events (short-lived; 48h retention).
  - `app.gear_popularity_intraday`: UTC-day live counters that power the automatic live boost; old UTC-day rows are truncated after each rollup.
  - `app.gear_popularity_daily`: per-gear daily pivoted counts (idempotent upsert).
  - `app.gear_popularity_windows`: rolling snapshots (rows per `7d`/`30d`, `as_of_date` at D‑1).
  - `app.gear_popularity_lifetime`: cumulative monotonic totals by gear.
  - `app.rollup_runs`: persisted rollup run history (timestamps, counts, durations, status, error).
  - `app.compare_pair_counts`: minimal per‑pair counter.
    - Composite primary key: `(gear_a_id, gear_b_id)` with canonical ascending order by id.
    - Denormalized `pair_key` stores the current sorted slugs (`slugA|slugB`) for convenience; updated on increment.
    - Atomic upsert increments `count`.

- **Rollups (UTC, nightly)**
  - Orchestrator: `runDailyPopularityRollup(date?)` in `src/server/popularity/rollup.ts`.
  - Strategy (robust 48h):
    1. Recompute D‑2 daily (late‑arrivals correction)
    2. Recompute D‑1 daily (freshness)
    3. Recompute windows as‑of D‑1
    4. Recompute lifetime totals
    5. Purge only D‑2 raw events
    6. Truncate `gear_popularity_intraday` rows older than the current UTC day and revalidate the stable `trending` baseline.
  - Observability: Discord webhook with counts/durations; `rollup_runs` row persisted per run; Admin page lists recent runs.
  - Scheduling: Vercel Cron → `POST /api/admin/popularity/rollup` (`Authorization: Bearer CRON_SECRET`).

- **Caching & revalidation**
  - Trending API and UI cache ~12h; revalidated proactively after rollup via `revalidateTag('trending')`.
  - Live boost snapshots cache ~2 minutes via `unstable_cache` tagged `trending-live` and expire naturally; the rollup does not invalidate this short-lived cache.
  - Home uses a 15-minute ISR window. Its news and review collections use separate 15-minute Payload cache keys; shared Payload caches used by other routes retain their existing 60-second window.
  - Home server-renders the stable 7-day ranking. After hydration, the visible list refreshes every two minutes from `GET /api/trending/home`; SWR pauses polling while the page is hidden and keeps the last successful list if refresh fails.
  - `GET /api/trending/home` returns only the row fields Home renders (`gearId`, `slug`, `name`, `regionalAliases`, and the flame count). Vercel CDN caches it for 120 seconds and may serve stale data for a further 60 seconds while refreshing. Score and statistics changes therefore update the small live response without changing Home's ISR payload.
  - Gear stats endpoint caches ~1h with tags (`popularity`, `gear-stats:{slug}`).
  - Pair counts are direct reads from `compare_pair_counts` and do not participate in nightly rollups.

## API Surface

- `GET /api/gear/[slug]/stats`
  - Returns: `{ viewsToday, lifetimeViews, views30d, wishlistTotal, ownershipTotal }`.
  - Backed by `gear_popularity_lifetime`, `gear_popularity_windows` with daily fallback, and truth tables.

- `GET /api/popularity/trending`
  - Query params:
    - `timeframe`: `7d` | `30d` (default `30d`)
    - `limit`: number (default 20, max 100)
    - `brandId?`, `mountId?`, `gearType?` (`CAMERA`|`LENS`) filters
  - Returns ordered items with `score` (window score plus any live boost), raw component stats, and optional `liveBoost` metadata.
  - Only rows meeting a minimum weighted score threshold (`score >= 1`) are included (single-view noise and zero-signal rows are excluded).
  - Ordering is deterministic on score + tie-break columns so pagination is stable.
  - Live boosts are automatically applied so gear that surges midday shows up before the nightly rollup.

- `GET /api/trending/status` (internal UI endpoint)
  - Accepts repeated `slug` values plus the badge ranking's `timeframe`, `limit`, and optional filters.
  - Returns only the requested slugs that are present in the current live-boosted ranking.
  - Visible badge checks are batched (maximum 50 slugs per request) and use `Cache-Control: no-store`; the underlying live snapshot still uses its two-minute server cache.
  - Brand and mount filter IDs must be UUIDs. Mount-scoped rankings use `app.gear_mounts`, including gear with any matching canonical mount rather than only a legacy primary mount.

- `GET /api/trending/home`
  - Returns the top 10 live-boosted items from the 7-day ranking using only Home's rendered row fields.
  - Vercel CDN cache: 120 seconds, with 60 seconds of stale-while-revalidate. Home polls every two minutes while visible.

- Ingestion routes (append‑only):
  - `POST /api/gear/[slug]/visit` → records `view` (anonymous allowed; deduped per visitor/day)
  - `POST /api/gear/[slug]/wishlist` → adds/removes truth row; emits `wishlist_add` event (same‑day dedupe)
  - `POST /api/gear/[slug]/ownership` → adds/removes truth row; emits `owner_add` event (same‑day dedupe)
  - Pair counts (minimal): no public API route; compare page uses a server action `actionIncrementComparePairCount` to upsert+increment per pair with a 30‑minute cookie. Composite PK `(gear_a_id, gear_b_id)` ensures stability across slug changes; `pair_key` is refreshed on each increment.

## Example Usage (JavaScript)

Use `NEXT_PUBLIC_BASE_URL` as the absolute base in server contexts.

```ts
const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

// Fetch trending cameras (30d)
const trendingRes = await fetch(
  `${base}/api/popularity/trending?timeframe=30d&gearType=CAMERA&limit=10`,
  { next: { revalidate: 60 * 60 * 12 } },
);
const { items } = await trendingRes.json();

// Fetch gear stats
const statsRes = await fetch(`${base}/api/gear/nikon-z6-iii/stats`, {
  next: { revalidate: 60 * 60 },
});
const stats = await statsRes.json();

// Record a view (anonymous allowed)
await fetch(`${base}/api/gear/nikon-z6-iii/visit`, { method: "POST" });

// Wishlist add/remove (authenticated)
await fetch(`${base}/api/gear/nikon-z6-iii/wishlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "add" }),
});
```

## UI Integrations

- `TrendingList` (unified, server component)
  - File: `src/components/trending-list.tsx`
  - Props: `{ timeframe?, limit?, filters?: { brandId?, mountId?, gearType? }, title?, loading?, rows?, liveRefresh? }`
  - Renders a compact three-flame row. Home sets `liveRefresh` to use a stable server-rendered baseline and two-minute client refresh; other surfaces keep their existing server-rendered live ranking.

- Browse hub trending strip
  - Files: `src/server/gear/browse/service.ts`, `src/app/[locale]/(pages)/browse/_components/all-gear-content.tsx`
  - The 3-card strip on `/browse` and `/browse/[brand]` uses a display-only fallback ladder: scoped `7d` trending, then scoped `30d` trending, then scoped newest gear.
  - Only items sourced from the trending queries render with the trending badge; newest fallback cards are present only to keep the row filled.
  - The strip itself is server-rendered from live-boosted rankings and does not perform the badge-status enhancement request.

- Gear page
  - `GearStatsCard` (server + client)
    - Fetches from `/api/gear/[slug]/stats` (1h cache); optimistic local increments on wishlist/ownership via custom browser events.
    - Displays lifetime views, wishlists, and owners as equal full-width icon-labeled rows with compact totals. Today's and 30-day views remain in the API response for compatibility, but only lifetime views are currently shown in the public sidebar.
  - `GearBadges` (server baseline + visible client enhancement)
    - Badge helpers read the stable rolled-up window ranking, so cached pages immediately server-render deterministic 30d badge state.
    - After hydration, only visible gear badge anchors are batched by ranking scope and checked against the live-boosted ranking. A badge changes only when live status differs; the request does not fetch gear content.

- Admin dashboard
  - `Popularity Rollup Runs`: lists recent runs from `app.rollup_runs`.

## Live Boosting

- Purpose: surface intra-day spikes (e.g., breaking news) without waiting for the nightly rollup.
- Data flow:
  - Every deduped popularity event increments `gear_popularity_intraday` via an atomic upsert alongside `popularity_events`.
  - `getLiveTrendingSnapshot` mirrors the standard score formula over the current UTC-day rows and caches its item list for ~120 seconds (`trending-live` tag).
  - Stable and live rankings are merged before the requested limit is applied. Candidate reads expand until omitted stable and live scores cannot mathematically displace the requested ranked prefix.
  - Service layer automatically adds the live boost to the window score and can emit telemetry/log messages containing the top movers.
- Lifecycle:
  - Rollup removes old intraday rows after finishing window calculations and revalidates `trending`; `trending-live` expires naturally within about two minutes.
  - Admin/Discord notifications summarize the top live movers so operators can confirm the live boost is healthy.
- Dedicated Trending and browse lists read the live-boosted ranking on the server. Home renders the stable 7-day ranking in its ISR output, then refreshes the compact list in the browser every two minutes while visible. General gear badges use the stable baseline in server markup and check live status only after their gear becomes visible.

## Rollup Flow (Detailed)

From the revised plan:

1. Ingest → write user actions to `popularity_events` in real time.
2. Nightly rollup (for “yesterday”):
   - Daily → aggregate `popularity_events` → `gear_popularity_daily` (pivoted counts; upsert).
   - Windows → compute 7d and 30d sums from `gear_popularity_daily` → upsert `gear_popularity_windows` with `as_of_date = D‑1`.
   - Lifetime → recompute `gear_popularity_lifetime` (monotonic adds).
   - Leaderboards → `trending` comes from windows; cached.
3. Purge → delete only `D‑2` from `popularity_events` (keep 48h buffer).

## Important Notes

- Canonical timezone for bucketing is UTC; rollups and dedupe are UTC‑day based.
- Popularity events are append‑only. Truth tables provide current counts; derived tables provide historical and aggregated views.
- Dedupe rules:
  - Views: `actionRecordGearView` checks BotID first and returns `skipped: "botid"` without recording a popularity event when the request is bot-classified. Requests that pass BotID still use per visitor (cookie `visitorId`) per gear per UTC day dedupe, and the UA denylist remains in `recordGearView()` as defense in depth with `skipped: "bot"`.
  - Wishlist/Ownership: popularity event deduped per user per gear per UTC day; truth tables still enforce uniqueness.
- Gear detail pages still render for crawlers and bots. BotID only suppresses the popularity write for this rollout; it does not block page delivery or indexing.
- Caching: trending 12h (`trending` tag) + live boost snapshot 2m (`trending-live` tag) + stats 1h.
- Security: Vercel Cron signed with `CRON_SECRET` using `Authorization: Bearer` header.
- Logging: endpoints and rollup emit concise console logs indicating skipped/blocked reasons (useful in dev).
- Env base URL: use `NEXT_PUBLIC_BASE_URL` (not `NEXT_PUBLIC_SITE_URL`).

## Future / Reach Goals

- Segmented leaderboards UI across brand/mount/type using `TrendingList`.
- Expanded hygiene: IP rate limiting, preview‑bot allowlist.
- Advanced scoring & A/B tests; momentum signals.
- Denormalization for faster filtered queries if profiling shows need.
- Charts and top‑mover analytics in Admin.
- Seed/QA scripts for D‑1/D‑2 events and rollup validation.
- Optional advisory lock or Background Function if rollup duration grows.

---

The system prioritizes correctness (“truth‑first”), idempotent rollups, and cache‑friendly reads. UI integrations consume the stable APIs and refresh automatically when rollups complete.
