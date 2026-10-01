# Plan: Centralized Used-Price Display and Sorting (Completed)

> Source: docs/plans/used-price-system-idea.md and the pricing fallback
> decisions from the implementation discussion.

> Status: completed. This file preserves the implementation acceptance
> criteria. The live behavior is documented in [`../prices/display.md`](../prices/display.md)
> and [`../used-price-system.md`](../used-price-system.md); unchecked boxes
> below are historical checklist artifacts, not remaining work.

## Goal

Replace the scattered price precedence rules with one shared pricing read
model that can be used by public display surfaces and sorting without changing
the current loading or SSR behavior.

The initial fallback order is:

1. New-system estimate for the requested market, whether current or stale.
2. MPB price.
3. Current MSRP.
4. Launch MSRP.
5. No price.

The selected result must preserve its source, condition, currency, range
shape, and freshness so callers do not mistake a fallback new price for a
used estimate.

## Architectural decisions

- **Pure shared policy**: Price selection is a pure domain helper. It does not
  query the database, fetch sources, format strings, or run in a client-only
  effect.
- **Structured result**: The resolver returns a structured price view rather
  than a formatted string. Formatting remains a separate locale-aware concern.
- **Market context is explicit**: Display resolution receives a market. The
  exact-market projection is preferred. Cross-market conversion is out of
  scope until an exchange-rate and labeling policy exists.
- **Stale estimates are valid**: A stale exact-market estimate remains ahead of
  MPB and MSRP. Its stale status is exposed to the caller.
- **Real ranges only**: range: true returns low/high only when the selected
  source has a real range. Point fallbacks remain point values instead of
  becoming artificial ranges.
- **Display and comparison are separate**: Display resolution and sorting
  resolution share the same fallback policy but have separate contracts.
  Sorting uses the estimate's typical value and never sorts across mixed
  currencies without an explicit comparison market.
- **SSR-first integration**: Public pages and cards receive price data in
  their existing server-loaded read models. No new client fetch or
  client-only price hydration is introduced.
- **Existing-field compatibility**: mpbMaxPriceUsdCents, MSRP fields, and
  existing API fields remain available alongside the new read model.

---

## Phase 1: Build the shared pricing helpers

**User stories**: As a developer, I want one predictable price policy so
every reader can resolve the same price. As a developer, I want the result to
retain enough metadata for correct labels, currencies, ranges, and freshness.

### What to build

Create the shared, pure pricing layer around two related operations:

- display resolution with an options object such as
  getDisplayPrice({ market, range });
- comparison resolution for sorting/filtering, using the same fallback order
  but returning a canonical numeric value plus currency/comparison status.

The display result should distinguish at least:

- new-system used estimate;
- MPB used price;
- current MSRP;
- launch MSRP;
- unavailable.

It should also carry:

- point versus range;
- low, typical, and high values where available;
- currency and market;
- used versus new condition;
- current/stale/fallback status;
- source and asOf metadata when available.

Add fixture-driven tests for:

- current and stale projections;
- missing or unavailable projections;
- each MPB/MSRP fallback;
- range: false and range: true;
- point fallback values without fake ranges;
- each supported market/currency;
- zero, negative, malformed, and missing values;
- stable unavailable behavior.

### Acceptance criteria

- [ ] One pure display resolver owns the documented fallback order.
- [ ] Stale exact-market estimates win over MPB and MSRP.
- [ ] The resolver never silently mixes currencies or invents ranges.
- [ ] Formatting is not part of the selection helper.
- [ ] A separate comparison result uses the estimate's typical value and
      returns null/unknown rather than an unsafe mixed-currency number.
- [ ] Tests cover every fallback branch and the range behavior.

---

## Phase 2: Migrate gear pages and cards

**User stories**: As a visitor, I want gear prices to be consistent everywhere
on the gear page. As a visitor, I want cards to show the same price policy
without client-side loading flashes or hydration changes.

### What to build

Add the new projection to the existing server-side gear read models needed by
the detail page and card/table surfaces. Resolve the price before rendering and
pass the structured result through existing props/view models.

Migrate the visible gear price surfaces, including:

- the gear detail page primary price;
- gear cards and table rows;
- related/alternative gear cards where a price is shown;
- gear-link summaries that currently duplicate MPB precedence.

Keep the existing loading boundaries and SSR/ISR behavior intact:

- no price-only client request;
- no useEffect-driven replacement of the initial value;
- no hydration mismatch from locale or date-dependent formatting;
- existing no-price placeholders remain stable.

Use the structured source and condition metadata to label fallback prices
correctly. A new MSRP must not be presented as an estimated used price.

Review the detail-page metadata/JSON-LD path at the same time. Derived
estimates should not automatically become purchasable Offer values unless
they represent an actual source listing with a valid URL and offer semantics.

### Acceptance criteria

- [ ] Gear pages use the shared resolver for their visible primary price.
- [ ] Gear cards and table rows use the same resolver and fallback order.
- [ ] Initial SSR output contains the resolved price; no client refetch is
      required to display it.
- [ ] Existing loading states, ISR behavior, and hydration remain unchanged.
- [ ] Currency and used/new labels match the selected source.
- [ ] Ranges render only when the selected value is a real range.
- [ ] No-price behavior remains visually consistent.
- [ ] JSON-LD is explicitly aligned with the new price semantics rather than
      accidentally inheriting a display-only estimate.

---

## Phase 3: Centralize sorting and filtering behavior

**User stories**: As a visitor, I want price sorting to be predictable and
consistent. As a developer, I want one comparison policy instead of scattered
COALESCE and fallback expressions.

### What to build

Inventory every price sort/filter path and replace the inconsistent precedence
rules with the shared comparison policy. This includes the client-side gear
table behavior and any server-side browse/search ordering required for
pagination.

Keep the interaction mostly client-focused and ready on initial load:

- include the resolved comparison value in the initial row/read model;
- let existing client sort controls operate without a new request;
- avoid a post-load resort flash;
- preserve current null-last and tie-breaking behavior unless explicitly
  corrected.

For server-paginated paths, use the same explicit comparison market and
fallback policy in the server ordering expression/read model. Do not use a
display-market GBP/EUR value alongside a USD fallback in one numeric sort.
The initial canonical comparison market should be US/USD unless a
market-specific sort is explicitly requested.

Define and test the comparison rules:

- projection typical value is the comparable value for an estimate;
- stale projections remain comparable;
- point MPB/MSRP fallbacks compare normally;
- unknown prices sort last;
- equal prices use a stable secondary key such as gear name and ID;
- mixed currencies are rejected or excluded from numeric comparison rather
  than silently compared.

After migration, remove duplicated price precedence from display and sorting
callers. Keep the existing fields in read models where compatibility, partner
integrations, or editing requires them.

### Acceptance criteria

- [ ] Client-side price sorting uses the shared comparison result.
- [ ] Server-side price ordering, where required, follows the same policy.
- [ ] No remaining price sort path uses an unrelated fallback order.
- [ ] Initial rows contain enough data to sort without a client fetch.
- [ ] Sorting does not introduce loading flashes or hydration changes.
- [ ] Nulls, stale estimates, ranges, currencies, and ties have deterministic
      behavior.
- [ ] Regression tests prove client/server ordering agree for the same fixture
      set.

## Completion boundary

This plan does not remove the MPB/MSRP fields. They remain available for
source-specific integrations, fallback behavior, and editorial workflows
alongside the new read model.
