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
| Source     | `manual`, `mpb`, `kamerastore`     |
| Market     | `US` → USD, `UK` → GBP, `EU` → EUR |
| Price kind | `used_retail`                      |

Automatic mappings require a product link. Manual mappings have no link and are
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

- `manual` does not fetch. Editors add point or range observations through the
  separate manual-observation modal.
- `mpb` and `kamerastore` use the shared JSON-LD adapter. It follows the
  mapping link, extracts a matching offer from `application/ld+json`, accepts a
  point price or a low/high range, and records the source page as evidence.

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
2. An editor submits a point or range observation from the separate manual
   observation modal. The service creates or reactivates the matching manual
   mapping as part of that mutation, then stores the observation. Automatic
   mappings receive observations from their adapter.
3. The observation is stored in integer minor units. Raw observations retain
   their exact values; a range is represented by `lowMinor` and `highMinor`.
4. The gear projection is rebuilt after a successful observation change. Valid
   observations are grouped by market and price kind.
5. The current estimate uses the five most recent valid observations, or all
   available observations when fewer than five exist. Range observations
   contribute their low and high bounds to the projected low and high values,
   and their midpoint to typical. The sampled values use the 25th percentile,
   median, and 75th percentile for low, typical, and high. Older observations
   remain stored for future history views but no longer hold back the current
   estimate indefinitely.
6. Calculated values are rounded to the nearest whole unit of the market
   currency before the estimate and denormalized projection are stored. The
   estimator method version remains `1` during development.
7. A versioned `gear_price_estimates` row records the calculation inputs,
   source count, observation count, currency, timestamp, and method version.
   The current per-market result is written to `gear.used_price_projection`.

Projection entries become `stale` after 30 days. Stale estimates remain valid
for display and are intentionally preferred over MPB pricing; see
[`display.md`](./display.md).

## Public first-price contributions

When an item has no valid active price observations, an authenticated public
contributor can use the gear-page **Price missing, click to add** action. The
form uses the user's currently selected market and currency; contributors do
not choose a different market in that flow. Point and range values, optional
evidence, and an optional note are stored using the same manual mapping and
observation model as editorial entries.

These observations are deliberately auto-accepted into the live estimate so a
newly contributed item is useful immediately. The observation remains
`status = VALID` with `needsReview = true`, which makes it visible in the
recent-observations section of `/admin/prices`. Editors can approve it by
clearing the flag or reject it by marking it invalid and rebuilding the item's
projection. A valid observation already present at submission time prevents a
second public seed contribution.

## Manual and scheduled refreshes

The daily cron is configured in `vercel.json`:

```text
0 3 * * *  /api/admin/pricing/refresh
```

The route requires `CRON_SECRET`, processes up to 20 due active mappings, and
records a `gear_price_fetch_runs` row plus one
`gear_price_fetch_run_items` row per mapping. Each run captures aggregate
success, no-data, and error counts. Run items retain gear/source context even
if the mapping is later removed.

Automatic refreshes schedule the next attempt seven days after a successful or
no-data result, or one hour after an error. Manual refetches use the same
mapping state and are limited to one request per mapping every six hours for
editors. Administrators can bypass that cooldown. The scheduler is owned by
the application, so this flow does not add per-row locks or leases.

The `/admin/prices` page provides:

- an overview of active mappings and their fetch state;
- an upcoming-fetch queue;
- a clickable scheduled-run log with aggregate and per-mapping details;
- a recent-observations queue with review warnings and approve/reject controls
  for public first-price contributions.

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
