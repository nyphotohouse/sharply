# Source-Independent Used Pricing

- **Date:** 2026-10-01
- **Status:** Accepted
- **Related:** `docs/prices/README.md`, `docs/prices/fetching.md`, `docs/prices/display.md`, `docs/used-price-system.md`, `docs/developer-api.md`, `docs/seo.md`

## Context

Sharply originally stored a manually maintained `mpbMaxPriceUsdCents` value on
each gear row. That field was useful as a simple MPB-specific reference, but it
could not describe where or when a value was observed, distinguish markets,
retain history, represent a range, combine multiple sources, or support
scheduled refreshes and review. It also encouraged individual readers to make
their own MPB/MSRP precedence decisions.

The product now needs a used-price model that can grow beyond one manually
entered MPB number while keeping existing catalog data, API consumers, and SEO
behavior safe during the transition.

## Decision

Adopt a source-independent `used_retail` pricing domain with the identity:

```text
gear item + source + market + price kind
```

The implemented system uses:

- `gear_price_mappings` for approved source/market relationships and refresh
  state;
- `gear_price_observations` for immutable point or range values in integer
  minor units, with currency, dates, evidence, and review metadata;
- `gear_price_estimates` for versioned low/typical/high derived values; and
- `gear.used_price_projection` as the denormalized per-market read model.

Manual editor entries, MPB fetches, KameraStore fetches, and public first-price
contributions all enter the same observation and estimation pipeline. Public
first-price contributions are live immediately but marked for editor review.
The first estimator is deterministic, uses the five most recent valid
observations, and keeps the estimator version with the result.

All ordinary display and comparison surfaces use the shared pricing policy:
exact-market current/stale estimate, converted alternate-market estimate when
explicit rates are available, legacy MPB fallback, current MSRP, launch MSRP,
then unavailable. Derived estimates are not represented as purchasable SEO
offers.

Retain `mpbMaxPriceUsdCents`, `msrpNowUsdCents`, `msrpAtLaunchUsdCents`, and
the separate `linkMpb` field as backwards-compatible compatibility surfaces.
The legacy MPB price is not backfilled into observations because its historical
date and provenance cannot be reconstructed reliably. New used-price evidence
must be entered through Used Price Management or a source adapter.

Scheduled refreshes run through the protected daily cron route in bounded
batches. External pages are fetched only for explicit mappings; gear-page
requests do not synchronously fetch sources.

## Alternatives considered

- **Continue maintaining one manual MPB maximum:** rejected because it has no
  provenance, market model, history, review workflow, or path to reliable
  multi-source refreshes.
- **Replace the field with an MPB-only scraper:** rejected because it keeps the
  domain coupled to one source and cannot represent manual evidence or other
  markets cleanly.
- **Create separate price columns for every source and market:** rejected
  because it duplicates schema and fallback logic and makes historical
  observations difficult to model.
- **Make public contributions proposals before they can be displayed:**
  deferred for the first slice. The product uses an immediate value with a
  `needsReview` moderation queue so missing prices become useful without
  adding a second proposal domain.

## Consequences

- Used prices have provenance, market/currency semantics, ranges, estimates,
  history, freshness, and operational visibility.
- Public readers have one fallback and comparison policy instead of scattered
  MPB/MSRP rules.
- The JSON projection keeps common catalog reads fast and avoids pricing-table
  joins on public pages.
- The system is more complex than a single field and requires scheduled-run
  monitoring, source-specific adapters, and estimator versioning.
- The legacy MPB value remains a compatibility fallback and must not be treated
  as a new observation. Existing values therefore do not appear in estimate
  history until new evidence is collected.
- Price-history charts and a migration of the internal Discord price response
  remain additive follow-up work; neither changes the current public display
  authority.
