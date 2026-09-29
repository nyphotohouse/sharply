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
