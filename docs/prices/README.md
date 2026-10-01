# Pricing

Sharply pricing is split into two domains:

- [`fetching.md`](./fetching.md) — source mappings, adapters, observations,
  scheduled refreshes, estimation, and operational/admin behavior.
- [`display.md`](./display.md) — the shared fallback resolver, formatting,
  sorting/comparison, public surfaces, and API output.

The boundary is intentional: fetching owns how source data becomes a stored
estimate, while display owns how an item chooses and presents a price. Public
readers should consume the display helpers and the denormalized projection;
they should not recreate source precedence or query pricing tables directly.

The existing [`../used-price-system.md`](../used-price-system.md) document
remains the broader architecture reference and compatibility entry point.

Future feature ideas are tracked separately in
[`../pricing/todo-price-history-idea.md`](../pricing/todo-price-history-idea.md).

## Current status

The source-independent used-price system is implemented for the first
`used_retail` slice. It supports manual observations, MPB and KameraStore
source mappings, US/UK/EU markets, point or range observations, deterministic
low/typical/high estimates, a denormalized gear projection, scheduled refresh
runs, public first-price contributions, and editor review of those
contributions.

The former `gear.mpbMaxPriceUsdCents` field is retained as a compatibility
field. It is still available to MPB-specific integrations, the legacy MPB
source-link card, existing editorial records, the developer API, and the
display fallback when no projection is available. It is not the primary way to
enter new used-price evidence. New used-price data belongs in Used Price
Management so that it has a market, source, observation date, provenance, and
estimate history. Existing legacy MPB values are not silently converted into
observations because doing so would invent observation dates and provenance.
The core gear editor may still expose the legacy field while the compatibility
buffer remains in place, but new entries should use the Used Price Management
observation form.

The live integration boundary is:

| Surface                                            | Pricing behavior                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Gear pages, cards, lists, alternatives, and tables | Shared display resolver and projection; no direct fallback order in UI callers                                               |
| Browse/search price sorting and filtering          | Canonical US/USD comparison expression, with projection typical value first                                                  |
| Developer API                                      | `estimatedUsedPrice` projection plus retained MPB/MSRP compatibility fields                                                  |
| SEO                                                | Derived estimates are never emitted as purchasable `Offer` values; only legacy MPB/current MSRP offer semantics are eligible |
| Editorial management                               | Used Prices modal plus `/admin/prices` refresh, run, and observation-review surfaces                                         |
| Internal Discord price endpoint                    | Legacy MPB/MSRP fields remain the compatibility contract until that consumer is migrated                                     |

The two documents under `docs/plans/` are historical design and migration
context, not the current implementation checklist. The current behavior is
defined by the guides in this directory and the decision record
[`../decisions/2026-10-01-source-independent-used-pricing.md`](../decisions/2026-10-01-source-independent-used-pricing.md).
