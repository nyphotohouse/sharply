# Price fetching

This document describes how Sharply collects used-price observations and turns
them into estimates. The implementation lives under `src/server/pricing/` and
follows the project-wide `data -> service -> actions` boundary.

## Supported mappings

A `gear_price_mappings` row represents one source/market pairing for one gear
item. The identity is:

```text
gear item + source + market + price kind
```

The current supported values are:

| Concern    | Values                             |
| ---------- | ---------------------------------- |
| Source     | `manual`, `mpb`, `kamerastore`, `campricer`     |
| Market     | `US` → USD, `UK` → GBP, `EU` → EUR |
| Price kind | `used_retail`                      |

Retailer mappings require a product link. CamPricer mappings are connected automatically by slug and use a pooled EUR source; see [campricer.md](./campricer.md). Manual mappings have no link and are
created internally the first time an editor submits an observation for a gear
item and market. Editors do not create or manage manual mappings directly in
the UI; the mapping is reused for later observations. Manual mappings are also
omitted from the visible mapping lists, admin mapping overview, upcoming queue,
and scheduled fetch selection.

Mappings retain source metadata and fetch state, including the canonical link,
fetch link, active/disabled status, retry count, last fetch result, error, and
next scheduled fetch time.

## Source adapters

Adapters are selected by `sourceKey` in
`src/server/pricing/adapters/index.ts`:

- `manual` does not fetch. Editors add point observations through the
  separate manual-observation modal.
- `mpb` and `kamerastore` use the shared JSON-LD adapter. It follows the
  mapping link, extracts a matching offer from `application/ld+json`, accepts a
  point price or collapses aggregate low/high bounds to their midpoint, and records the source page as evidence.

KameraStore requests add a market-specific country hint for `UK` (`GB`) and
`EU` (`DE`). The EU market is still one generic EUR market; the country hint
only helps keep the storefront response in the expected region. Source links
may use the site's `/en-us/`, `/en-gb/`, or `/en-eu/` storefront paths.

Adapters return one of three outcomes:

- `SUCCESS` with one or more observations;
- `NO_DATA` when the page is reachable but no compatible price is available;
- `ERROR` when the request or parsing fails.

Currency is inferred from the market and the persisted observation also stores
that currency for historical clarity. Automatic observations use the fetch
time and source URL as their evidence metadata.

## Observation and estimate lifecycle

1. An editor creates an automatic mapping from the Used Price Management modal.
   Automatic mappings are fetched immediately after creation, while the newly
   created card shows its loading state.
2. An editor submits a point observation from the separate manual
   observation modal. The service creates or reactivates the matching manual
   mapping as part of that mutation, then stores the observation. Automatic
   mappings receive observations from their adapter.
3. The observation is stored in integer minor units. Legacy observation ranges are normalized to midpoint points; deprecated bound columns remain for compatibility.
4. The gear projection is rebuilt after a successful observation change. Valid
   observations are grouped by market and price kind.
5. Select the latest valid point per active source, using observed time, created
   time and ID to resolve ties. Stale evidence remains eligible. CamPricer pooled
   EUR evidence also participates in US/UK after local currency conversion.
6. Calculate a weighted average: CamPricer weight 3; MPB, KameraStore and manual
   weight 1 each. Normalize across sources that have evidence. Low/high are the
   minimum/maximum contributing points, not listing percentiles. Round all three
   results to the nearest whole currency unit. One source produces equal bounds.
7. Save estimates and input snapshots (source/observation IDs, points, weights,
   original currencies, rates/date and pooled provenance). Append history only when the rounded low, typical or high price changes
   from the latest saved estimate (or the currency changes). Input IDs, timestamps,
   rates and source counts alone do not create rows. Current projection metadata
   still updates on every successful recalculation. History is ordered by calculation creation time, because
   `asOf` uses the oldest contributing observation. The method version remains 1
   during development. Public reads still use the denormalized projection.

Projection entries become `stale` when the oldest contributor is over 30 days old. Stale estimates remain valid
for display and are intentionally preferred over MPB pricing; see
[`display.md`](./display.md).

## Public first-price contributions

When an item has no valid active price observations, an authenticated public
contributor can use the gear-page **Price missing, click to add** action. The
form uses the user's currently selected market and currency; contributors do
not choose a different market in that flow. Point values, optional
evidence, and an optional note are stored using the same manual mapping and
observation model as editorial entries.

These observations are deliberately auto-accepted into the live estimate so a
newly contributed item is useful immediately. The observation remains
`status = VALID` with `needsReview = true`, which makes it visible in the
**Needs Review** table on `/admin/prices`. Editors can approve it by clearing
the flag or reject it by marking it invalid and rebuilding the item's
projection. A valid observation already present at submission time prevents a
second public seed contribution.

## Manual and scheduled refreshes

The daily cron is configured in `vercel.json`:

```text
0 3 * * *  /api/admin/pricing/refresh
```

The route requires `CRON_SECRET`, processes up to 20 due active retailer mappings, and
records a `gear_price_fetch_runs` row plus one
`gear_price_fetch_run_items` row per mapping. Each run captures aggregate
success, no-data, and error counts. Run items retain gear/source context even
if the mapping is later removed.

Retailer requests have a 20-second timeout and share a 90-second batch deadline.
If the deadline is reached, the run reports partial completion and unprocessed
mappings remain due; checked counts include only attempted mappings. Exchange-rate
requests time out after 10 seconds. This leaves execution time for the separate
CamPricer import and local recalculation described in [campricer.md](./campricer.md).

Automatic refreshes schedule the next attempt seven days after a successful or
no-data result, or one hour after an error. Manual refetches use the same
mapping state and are limited to one request per mapping every six hours for
editors. Administrators can bypass that cooldown. The scheduler is owned by
the application, so this flow does not add per-row locks or leases.

CamPricer runs as a separate bulk batch in the same cron, with its own Redis request budget and cursor. It reuses the run tables; see [campricer.md](./campricer.md).

The `/admin/prices` page provides:

- an upcoming-fetch queue limited to mappings due now or within the next 24
  hours;
- a clickable scheduled-run log with aggregate and per-mapping details;
- a dedicated **Needs Review** table for public first-price contributions,
  with approve/reject controls;
- a paginated recent-observations table for the broader observation history.

Per-gear pricing management is available from the **Used Pricing** column in
the admin gear table. Each row shows the current US price when available and
whether the item has an active automatic fetch mapping or manual pricing. The
pricing page remains focused on fetch operations, runs, and observation review.

Manual refetches are shown on the mapping itself and are not mixed into the
scheduled batch history.

## Mapping changes and history

- Removing a mapping with zero observations permanently deletes it.
- Removing a mapping with history archives it by disabling it. Archived
  mappings are hidden from the main list and can be restored.
- Changing a mapping link deletes the mapping's old observations, resets its
  fetch state, and rebuilds the gear projection. Saving the same effective link
  preserves history.
- Restoring an archived mapping rebuilds its gear projection.

## Legacy MPB migration boundary

The old `gear.mpb_max_price_usd_cents` value is not a source observation. It
has no reliable observed date, market-specific provenance, or evidence URL, so
the application does not backfill it into `gear_price_observations`. It remains
available as a compatibility fallback after all usable projections and before
MSRP values. Editors should use Used Price Management for new evidence, even
when the evidence came from MPB.

The separate `gear.link_mpb` field is also retained for the affiliate/source
link flow. A link stored there does not create a pricing mapping, observation,
or estimate. A pricing mapping must be added explicitly with its market and
source URL.

These rules prevent observations from one product page being attributed to a
different page while preserving useful history when an editor intentionally
archives a populated mapping.

## Server boundaries

- `src/server/pricing/data.ts` owns raw reads and writes.
- `src/server/pricing/service.ts` owns roles, validation, cooldowns, and
  orchestration.
- `src/server/pricing/actions.ts` exposes client-triggered mutations.
- `src/server/pricing/adapters/` contains source-specific fetch behavior.
- `src/server/pricing/estimator.ts` calculates estimates.
- `src/server/pricing/projection.ts` rebuilds the denormalized gear JSON.

UI components must use the service/actions boundary rather than importing the
pricing data layer or implementing fetch/estimate rules themselves.
