# Price history extensions

The public gear-page history chart is implemented. Its current behavior is the
source of truth in [../prices/history.md](../prices/history.md): lazy client fetch,
full-width placement above Reviews, stored market estimates, a smooth line, and a
source-price spread band. It begins at the first saved estimate, without an MSRP
anchor or conversion of old points.

Potential future extensions remain separate from the shipped chart:

- Optional launch/current MSRP reference lines with explicit dates and currencies.
- Observation and source provenance details in the management workflow.
- Explicit freshness overlays using evidence dates, without changing calculation
  timestamps on the history timeline.
- An accessible detailed history table and developer API history access.

Keep saved estimates immutable and preserve the projection as the fast path for
current price display. Later weighting or exchange-rate changes must not rewrite
past snapshots. Flat chart periods do not imply source collection stopped.
