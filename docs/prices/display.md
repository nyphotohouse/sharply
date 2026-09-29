# Price display

This document describes how Sharply chooses a price for a gear item after the
fetching pipeline has stored its current projection. The shared implementation
is the pure helper in `src/lib/pricing/display-price.ts`.

## One display policy

Callers provide an explicit market and may request a range:

```ts
getDisplayPrice(item, { market: "US", range: true });
```

The resolver returns structured data rather than a formatted string. It keeps
the selected source, condition, currency, freshness, market match, timestamp,
and observation metadata together with the value.

The fallback order is:

1. Exact-market estimated used price, whether `current` or `stale`.
2. MPB used price.
3. Current MSRP.
4. Launch MSRP.
5. Unavailable.

Stale estimates intentionally remain ahead of MPB. A stale result is still an
estimate from the new system and its stale status is available to the caller.

There is no implicit currency conversion. A projection for `US`, `UK`, or `EU`
is used only for that requested market. MSRP and MPB fallbacks are USD
values and are marked as fallbacks; they are not treated as GBP or EUR
comparables.

## Projection shape

The database/read-model field is `usedPriceProjection`. It is a JSON object
keyed by market and contains integer minor units:

```json
{
  "US": {
    "low": 178300,
    "typical": 178300,
    "high": 178300,
    "asOf": "2026-09-29T19:05:00.000Z",
    "status": "current",
    "sourceCount": 1,
    "observationCount": 1,
    "methodVersion": 1
  }
}
```

The market determines the currency: USD for `US`, GBP for `UK`, and EUR for
`EU`. `sourceCount` counts contributing mappings, while `observationCount`
counts valid observations used for the estimate.

`range: true` returns a range only when low and high differ. A point estimate,
including one whose low/typical/high values are equal, remains a point instead
of becoming an artificial `$x–$x` range.

## Formatting and sorting

Selection and formatting remain separate:

- `getDisplayPrice` selects the structured result.
- `formatDisplayPrice` formats the selected value for a locale.
- `getComparablePrice` returns the typical point value and currency status for
  sorting/filtering.

Public cards, gear pages, tables, lists, alternatives, metadata, and search
sorting should use these shared helpers or a server read model that already
uses them. They should not read `mpbMaxPriceUsdCents` directly or implement a
second fallback order.

The public read path is SSR-friendly: projections are loaded with the existing
gear/search data and resolved synchronously. No client-only price fetch or
hydration step is required.

## Developer API

The developer API exposes the same data under the public field
`estimatedUsedPrice` on full gear and search responses. Its market entries use
the projection shape above and retain minor-unit values.

`mpbMaxPriceUsdCents` remains in those responses for MPB-specific integrations.
`estimatedUsedPrice` contains the source-independent estimate, while the MSRP
fields represent new pricing. The lightweight catalog intentionally excludes
prices.

See [`../developer-api.md`](../developer-api.md) for the endpoint contract.

## Compatibility rules

- Keep the existing MPB and MSRP fields available alongside the new system.
- Centralize fallback changes in `display-price.ts` and its tests.
- Keep `usedPriceProjection` as the internal/storage name; use
  `estimatedUsedPrice` at the developer API boundary.
- Preserve the existing server-loaded data flow when adding a new public
  display surface.
