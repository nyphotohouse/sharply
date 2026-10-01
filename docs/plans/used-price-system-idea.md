# Used Price System Idea (Historical)

Status: superseded by the implemented system. This file preserves the
original design context; it is not an implementation checklist. The current
behavior is documented in [`../prices/`](../prices/), summarized in
[`../used-price-system.md`](../used-price-system.md), and recorded in
[`../decisions/2026-10-01-source-independent-used-pricing.md`](../decisions/2026-10-01-source-independent-used-pricing.md).

## Goal

Add a source-independent used-price system alongside the existing
`mpbMaxPriceUsdCents` field so the application can:

- support Kamerastore first, followed by manual observations and future MPB data;
- preserve real source markets without creating rows for every display currency;
- produce an `Estimated used retail price` with low, typical, and high values;
- preserve the history of Sharply's derived estimates;
- keep catalog reads, filtering, and sorting efficient;
- avoid synchronous or aggressive scraping of external sites; and
- expose approved source links to users without duplicating URLs on `gear`.

## Product semantics

The initial estimate represents used dealer retail pricing, not completed-sale value, trade-in value, or peer-to-peer market value. Different valuation types should remain separate if those sources are added later.

The estimate is a range with a representative value:

- `low`: robust lower bound;
- `typical`: median or weighted median used for sorting and compact displays;
- `high`: robust upper bound.

Raw minimum and maximum values should not be used as the public range when enough observations exist because outliers can distort the result.

The first version should use a small, deterministic estimator rather than a general statistical framework:

- use the source-provided range when a source already provides one;
- use the median as `typical` when multiple eligible values exist;
- use a single value for all three fields when only one eligible value exists; and
- exclude clearly unavailable or invalid observations.

No confidence score or advanced outlier model is required initially. Track only the metadata needed to explain the result: `asOf`, freshness/status, source count, observation count, and estimator method version. Condition and availability can remain simple normalized fields until real source data shows that more detailed normalization is necessary.

## Source and market model

Source adapters are configured in code initially:

- `kamerastore` — automated source, first implementation;
- `manual` — editor/admin-entered observation, never automatically fetched;
- `mpb` — future automated source.

The primary identity for a current source record is:

```text
gear item + source + market + price kind
```

Market is the important dimension, not display currency. A market represents a real regional pricing context and may include storefront, tax, shipping, or inventory differences. Currency is a property of the market/source observation.

Examples:

```text
Canon EOS R5 / Kamerastore / US
Canon EOS R5 / Kamerastore / EU
Canon EOS R5 / Manual / US
```

The system should not create records merely because a visitor wants to view a price in CAD, EUR, or GBP. Currency is inferred from the market configuration; display-currency conversion can happen when data is read later.

## Database shape

### `gear_price_mappings`

Stores one approved relationship between a gear item and an external pricing source. The primary identity is:

```text
gear item + source + market + price kind
```

Conceptual fields include:

- `gearId`;
- `sourceKey`;
- `marketKey`;
- `priceKind` such as `used_retail`;
- `externalProductId`;
- `canonicalUrl`;
- optional `fetchUrl` when the fetch endpoint differs from the public page;
- enabled/disabled state;
- `nextFetchAt`, priority, retry count, and last fetch status; and
- the latest fetch timestamp and error summary.

The canonical URL is the single source of truth for the user-facing source link. An active approved mapping can appear in the gear sidebar without adding a separate `linkKamerastore` field to `gear`.

The mapping table should have a unique constraint on `(gearId, sourceKey, marketKey, priceKind)`. Scheduler state belongs here rather than on historical observations.

### `gear_price_observations`

Stores compact observations produced by a successful source fetch or a manual entry. Observations are append-only for auditability, but the first implementation does not need to retain raw source pages or build a source-level history UI.

Conceptual fields include:

- `mappingId`;
- point or range value in native minor units;
- native `currency`;
- simple normalized condition and availability;
- `observedAt` and `fetchedAt`;
- optional evidence URL and note for manual entries; and
- parser/mapping version or a compact fingerprint when useful for deduplicating unchanged results.

Manual observations use mappings with `sourceKey = "manual"` and do not receive an automated fetch schedule.

### `gear_price_estimates`

Stores Sharply's derived estimate history. A row is written when the estimate changes materially or when a periodic historical checkpoint is appropriate.

Conceptual fields include:

- `gearId`;
- `marketKey`;
- `priceKind`;
- low/typical/high estimate values;
- estimate currency or canonical valuation currency;
- `asOf`/calculated timestamp;
- estimation method version;
- compact input snapshot or observation IDs identifying the source values used; and
- source and observation counts.

The newest row is the current estimate. The table provides the historical series shown as estimated used-price history.

Source-level historical charts are not required initially. If they become necessary, observations can later become append-only snapshots without changing the public estimate model.

## Gear read projection

To keep cards, browse pages, filters, and sorting simple, add a system-managed JSONB projection to `gear`, for example:

```json
{
  "US": {
    "low": 110000,
    "typical": 125000,
    "high": 140000,
    "asOf": "2026-09-29T12:00:00.000Z",
    "status": "current",
    "sourceCount": 2,
    "observationCount": 5,
    "methodVersion": 1
  },
  "EU": {
    "low": 105000,
    "typical": 120000,
    "high": 135000,
    "asOf": "2026-09-28T12:00:00.000Z",
    "status": "stale",
    "sourceCount": 1,
    "observationCount": 1,
    "methodVersion": 1
  }
}
```

Values are stored in minor units. Currency is inferred from the market configuration and is not duplicated in the projection. The projection contains the current low/typical/high values plus the small amount of freshness and coverage metadata needed by public readers and administrators. Detailed provenance remains in the pricing tables.

The projection is a read cache, not an authority and not an editable core specification. It is rebuilt or updated after source observations and estimates change.

For SQL sorting/filtering, use the market-specific JSON expression directly first. Add an expression index or a small helper projection only if profiling shows JSON extraction is insufficient. Localized market-specific sorting can remain a service-level concern until it is needed.

## Editor and contributor workflows

### Admin/editor price data modal

Admins and trusted editors manage pricing separately from ordinary core-spec editing. The section should support:

- adding and validating an automated source mapping;
- selecting a market;
- reviewing the canonical URL and external product identity;
- enabling/disabling refresh;
- viewing the latest observation and estimate history;
- adding a manual observation; and
- requesting a refresh or revaluation.

The primary editor surface is a client-facing **Used Prices** modal opened from
the existing staff dock on the public gear detail page. There is no dedicated
per-gear pricing route and no pricing editor added to `/admin/gear`. The
minimal `/admin/prices` page is an overview of mappings and opens the same
modal for a selected gear item.

Manual observation fields include amount or range, currency, market, condition, observed date, optional evidence URL, and note. Manual entries participate in estimate calculation but are not automatic overrides.

### User suggestions

The ordinary public suggestion flow should not directly add scraper mappings or published price values. A future dedicated price-evidence proposal may accept a source, market, amount, observed date, and evidence URL. After review, approval creates or updates a manual observation and recalculates the estimate.

## Refresh and revaluation system

Use the protected `/api/admin/pricing/refresh` Vercel Cron route rather than fetching during a gear-page request. Sharply already uses authenticated Vercel Cron routes with `CRON_SECRET`.

Each run should:

1. select a small bounded batch of due automated mappings;
2. fetch only explicitly mapped source pages;
3. process the batch sequentially or with a deliberately small source-specific concurrency limit;
4. apply source-specific rate limits, backoff, and retry handling;
5. append an observation and update the mapping's latest fetch state;
6. calculate the affected market estimate;
7. append estimate history when the output changes; and
8. update the `gear` JSON projection.

The gear page only reads cached values. A page visit may raise an item's refresh priority, but it must not synchronously fetch an external site.

The first version assumes one scheduled cron owner and a bounded run duration. It does not need per-row leases or `SKIP LOCKED` coordination. Keep each run small enough that the next scheduled run cannot normally overlap, and make unchanged observation writes easy to deduplicate. If multiple workers, manual refreshes, or overlapping invocations are introduced later, add a job-level advisory lock or row leases at that point.

The schedule should be source- and item-aware. Popular or recently mapped items can refresh more frequently; long-tail or out-of-stock items can refresh less frequently. Manual observations have no automated fetch schedule.

Revaluation after a source update happens in the same processing flow. A separate bounded revaluation job can recalculate existing observations when the estimation method or FX rules change, without fetching external pages.

## Fetching safeguards

Each source adapter should be separate from scheduling and parsing. The system should:

- fetch only mapped canonical pages;
- prefer approved APIs, feeds, or structured data when available;
- respect source terms, robots guidance, and rate limits;
- avoid search crawling and anti-bot bypasses;
- use conservative per-source budgets and concurrency limits;
- honor `Retry-After` responses; and
- allow a source to be disabled without affecting the rest of the pricing system.

## Fallback behavior

For a requested market, prefer:

1. current estimate for the exact market;
2. a stale estimate for the exact market;
3. a regional or canonical source-market estimate, converted when useful; or
4. new MSRP, explicitly labeled as a new price.

Cross-market fallback is acceptable for the initial product as long as the origin market is available to the read model and the UI does not label it as an exact local-market estimate. Cross-market fallback should not participate in market-specific filtering or sorting. MSRP should never be silently presented as an estimated used price.

## Public price read model

The current code contains price precedence in several unrelated readers. During migration, centralize the policy in a small pricing service/read model so cards, detail pages, tables, lists, APIs, and metadata receive the same semantics.

Conceptually:

```ts
getGearPriceView({ gearId, marketKey, displayCurrency? })
```

The result should distinguish `usedEstimate` from `newRetailPrice`, identify which one is primary, include freshness/status, and expose any fallback origin. Formatting helpers should remain separate from the selection policy.

The read model is important because the current implementation does not use one consistent price rule: general display prefers MPB, search filters use a different `COALESCE`, browse sorting uses MSRP only, and SEO emits an offer from the MPB field.

## SEO semantics

An estimated used range is not automatically a purchasable offer. Emit an `Offer` only when the structured data represents an actual source listing with a valid amount and source URL. If the visible page shows Sharply's derived estimate, do not represent that estimate as a direct `Offer`; keep the visible label explicit and revisit the most appropriate schema representation when the public UI is implemented.

## Server structure

Keep the pricing domain organized under one server module with source-specific adapters:

```text
src/server/pricing/
  types.ts
  data.ts
  service.ts
  estimator.ts
  projection.ts
  adapters/
    index.ts
    kamerastore.ts
    json-ld.ts
    manual.ts
    mpb.ts
```

Adapters should normalize source responses into the pricing domain. Scheduling, estimation, projection updates, and public read shaping should not be embedded in an individual source adapter.

## Migration boundary

Keep `mpbMaxPriceUsdCents` available for MPB-specific pricing. Migrate price readers, cards, tables, APIs, SEO, popularity, user lists, alternatives, Discord output, and sorting/filtering to the new read model/projection. Add the new nullable schema fields in a backwards-compatible way and update the pricing and gear documentation when implementation begins.

Recommended vertical slice:

1. Add mappings, observations, estimate history, and the JSON projection.
2. Implement Kamerastore plus manual observations for one market and `used_retail`.
3. Add the deterministic estimator and projection rebuild path.
4. Migrate the gear detail page and source-link presentation through the pricing read model.
5. Add the admin mapping/observation workflow and refresh cron.
6. Migrate browse, search, tables, lists, popularity, APIs, and SEO.
7. Backfill and compare values where needed while keeping the MPB field
   available for future partner integration.
