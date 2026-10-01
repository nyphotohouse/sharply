# Used Price System

Used-price management is a small editorial data pipeline attached to each gear
item. The public gear read path uses the denormalized `gear.used_price_projection`
JSONB column, while source mappings, observations, and estimate history remain
separate for editorial review and recalculation.

This system replaces the former workflow of manually maintaining one opaque
MPB maximum price on the gear row. The legacy `mpbMaxPriceUsdCents` column is
intentionally retained for compatibility and fallback behavior, but it is not
the authority for new used-price evidence. The transition and its tradeoffs
are recorded in
[`decisions/2026-10-01-source-independent-used-pricing.md`](decisions/2026-10-01-source-independent-used-pricing.md).

Detailed domain guides now live under [`docs/prices/`](./prices/):
[`fetching.md`](./prices/fetching.md) covers collection and scheduled runs,
while [`display.md`](./prices/display.md) covers fallback resolution, public
surfaces, sorting, and the developer API contract. This document remains the
broader architecture reference.

## Data model

- `gear_price_mappings` identifies a gear/source/market pairing. A mapping can
  be `manual`, `mpb`, or `kamerastore`, and can be disabled without deleting its
  history. Removing a mapping with no observations deletes it; mappings with
  history are archived and can be restored.
- `gear_price_observations` stores immutable point or range observations in
  integer minor units. Currency is derived from the mapping market and also
  stored on each observation for historical clarity. Public first-price
  contributions remain valid immediately and set `needs_review` so editors can
  review them later without a second proposal table.
- `gear_price_estimates` stores versioned low/typical/high estimates plus the
  observation IDs used to produce them.
- `gear_price_fetch_runs` stores each scheduled batch execution, including its
  status and aggregate success, no-data, and error counts. The related
  `gear_price_fetch_run_items` table stores one outcome per mapping, including
  the mapping snapshot, inserted observation count, next scheduled time, and
  any error. Items keep enough gear/source context to remain useful if a
  mapping is later deleted.
- `gear.used_price_projection` stores the current per-market result for fast
  public queries. Its values are integer minor units; consumers infer currency
  from the market key. Each entry includes freshness, source count, observation
  count, and estimator version metadata.

The first estimator is deliberately deterministic and uses the five most
recent valid observations, or all available observations when fewer than five
exist. Range observations contribute their bounds to low/high and their
midpoint to typical, while point observations contribute the same value to all
three. The sampled values produce the 25th percentile, median, and 75th
percentile as low, typical, and high. Calculated values are rounded to the
nearest whole unit of the market currency before estimates and projections are
stored; raw observations retain their precise minor-unit values.

Public price consumers use the shared pure resolver in
`src/lib/pricing/display-price.ts`. Its fallback order is an exact-market
current or stale projection, another-market projection when conversion is
available, legacy MPB, current MSRP, launch MSRP, then no price.
`getComparablePrice` uses the projection's typical value for sorting and does
not silently mix currencies; explicit exchange rates are required for a
non-native comparison. Formatting remains in `src/lib/mapping/price-map.ts`.

The developer API exposes the same `estimatedUsedPrice` JSON on full gear and
search responses. The `mpbMaxPriceUsdCents` field remains in those responses
for MPB-specific pricing; see
[`developer-api.md`](./developer-api.md) for the public response contract.

## Editorial workflow

Editors and administrators open **Used Prices** from the existing staff dock on
the gear detail page. The modal renders active automatic mappings as full-width
cards with their latest result, freshness, and source/observation counts. The
same modal provides the manual observation form; manual mappings are kept
hidden from the automatic mapping cards and are reviewed through the recent
observations/Needs Review surfaces on `/admin/prices`. Automatic mappings
expose a refetch control and editable product link; automatic mappings must
retain a product link, while manual mappings may be empty. New mappings use
only the coarse US, UK, and EU market choices. `/admin/prices` includes an
upcoming-fetch queue and a scheduled-run log. Run rows open a detail modal with
aggregate results and per-mapping outcomes; manual refetches remain in the
mapping's own status and are not mixed into the scheduled batch history.

Changing a mapping's source link clears that mapping's existing observations and
resets its fetch state, then rebuilds the gear projection so prices from the old
source link are not attributed to the new one. Saving the same effective link
does not clear history.

Projection rebuilds write all newly calculated estimate rows and the gear JSON
projection in one database transaction. A failed rebuild therefore leaves both
the estimate history and the public read model unchanged.

Manual source refreshes are limited to one request per mapping every six hours
for editors. Administrators can bypass that cooldown. A single daily cron job
refreshes due active mappings in a bounded batch; it does not use per-row locks
or leases because the application owns the scheduler.

Public contributors can seed an item that has no valid active observations from
the gear-page price header. The contribution uses the user's selected market,
creates or reuses the hidden manual mapping, updates the estimate immediately,
and appears with a review warning in `/admin/prices`. Approving only clears the
warning; rejecting marks the observation invalid and rebuilds the projection.

## Server boundaries

Pricing follows the same `data -> service -> actions` structure as the rest of
Sharply:

- `src/server/pricing/data.ts` owns database reads and writes.
- `src/server/pricing/service.ts` owns role checks, validation, cooldowns, and
  orchestration.
- `src/server/pricing/actions.ts` exposes client-triggered mutations.
- `src/server/pricing/adapters/` contains source-specific fetch adapters.

The KameraStore adapter adds market-specific country hints to UK and EU fetch
requests so storefront redirects do not silently switch a GBP or EUR mapping
to the US storefront. The EU mapping remains a generic EUR market; the
Germany hint only pins the site's shared /en-eu/ storefront.

Database schema changes are intentionally backwards-compatible. The existing
`mpbMaxPriceUsdCents` column remains available for MPB-specific pricing and is
read through the shared resolver; callers should not implement their own direct
MPB precedence. The internal Discord price endpoint is a remaining legacy
consumer and currently returns the retained MPB/MSRP fields rather than the
new estimate projection; it is intentionally called out as follow-up work
rather than being represented as fully migrated.
