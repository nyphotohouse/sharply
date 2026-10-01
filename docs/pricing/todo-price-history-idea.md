# TODO: Price History

Status: idea / not yet implemented.

## Goal

Add a historical price view to gear pages and the Used Price Management
workflow once enough observations and estimates have accumulated. The view
should explain how the current estimated used price relates to the product's
original and current retail pricing.

## Chart concept

The chart should always start at **MSRP at launch** when that value is
available. It should not begin at the first used-price observation.

The launch MSRP should be rendered as the initial anchor for the timeline,
using the product's launch or release date as the starting date. From there,
the chart can show:

- the launch MSRP baseline;
- current MSRP, when it differs from launch MSRP;
- historical estimated used-price values, preferably as low/typical/high
  ranges;
- individual observations or observation markers on demand;
- stale periods and gaps in the estimate history;
- the current value and its source/freshness status.

If launch MSRP is unavailable, the UI should use an explicit empty or
alternative-baseline state rather than silently inventing a starting value.
The fallback policy for that case should be decided before implementation.

## Data sources

The existing pricing tables already provide the required raw material:

- `gearPriceObservations` contains timestamped point/range observations,
  source mappings, markets, currencies, evidence URLs, and fetch metadata.
- `gearPriceEstimates` contains versioned low/typical/high estimates,
  `asOf`, method version, source count, observation count, and contributing
  observation IDs.
- `gear.msrpAtLaunchUsdCents` provides the launch anchor.
- `gear.msrpNowUsdCents` can provide a current MSRP reference line.

The history should query estimates for the selected gear, market, and price
kind. It should use observations for detail and provenance rather than
recomputing historical estimates in the client.

## Product decisions to preserve

- Show one market at a time: `US`/USD, `UK`/GBP, or `EU`/EUR. Do not silently
  convert values between markets.
- Treat point estimates as points. Only render a band when low and high differ.
- Keep stale estimates visible but clearly marked.
- Keep source and observation details available through hover, a detail row, or
  a secondary view rather than overcrowding the primary chart.
- Use the stored estimate values and method version so a future estimator
  change does not rewrite the meaning of old points.
- Preserve the existing rule that changing a mapping link deletes that
  mapping's observations. If history across source-link replacement is desired,
  archive the old mapping or add source-version records instead of silently
  joining observations from unrelated links.

## Possible UI shape

On the public gear page, a compact chart could sit near the current estimated
used price with:

- a market selector;
- a legend for launch MSRP, current MSRP, and estimated used price;
- a time-range selector only if the history becomes long enough to need one;
- a tooltip showing date, typical/low/high values, freshness, and source count;
- an accessible table or summary below the chart for non-visual access.

In the management modal, the chart could be accompanied by a source-aware
history table showing the observations that contributed to each estimate.

## Implementation path

1. Add a server data/service read that returns ordered estimate history and
   optional observation detail for one gear item and market.
2. Add tests for launch-MSRP anchoring, missing launch MSRP, point/range
   rendering, stale values, market isolation, and source-link changes.
3. Add a public read-only chart using the existing SSR data flow; avoid a
   client-only history fetch for the initial render.
4. Add the management-modal detail view after the public presentation is
   stable.
5. Document the API shape if history is exposed to developer API consumers.

The current projection remains the fast path for present-day display. History
should be an additive read model and must not replace the projection used by
cards, tables, sorting, or the primary gear-page price.
