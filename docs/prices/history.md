# Gear price history

Gear pages show a full-width Price History section immediately above Reviews.
The section is hidden when the selected market has fewer than two valid saved
estimates. It follows the existing country preference (US/USD, UK/GBP, EU/EUR),
uses only that market's stored prices, and does not fall back to other markets or
reconvert historical currencies.

## Loading and public read

History is separate from the server-rendered current price. A client intersection
observer starts an SWR request within 400px of the viewport. A bordered skeleton
reserves the chart's height; errors offer Retry. The Recharts bundle loads on the
client. Requests are cached by gear slug and market; period changes are local.

`GET /api/gear/[slug]/price-history?market=US|UK|EU` returns `market`, `currency`,
server `now`, and chronological `points` with `timestamp`, `lowMinor`,
`typicalMinor`, and `highMinor`. Timestamps are estimate `createdAt`, not evidence
`asOf`. Invalid markets return 400; missing or nonpublic gear returns 404.
The database read selects only the timestamp, currency, and low/typical/high
fields. Internal evidence IDs and calculation inputs are neither fetched nor exposed.

## Chart semantics

The estimated price is a smooth line and the faint band is the minimum/maximum
contributing source prices. All three curves use the same bounded horizontal
interpolation, preserving low ≤ estimate ≤ high between snapshots, even when
a zero-width range widens. This source-price spread is not a confidence interval
or a distribution of listings. There is no floating tooltip. Pointer or keyboard
inspection updates the top-left price, date, source range, and percentage to the
selected snapshot. Leaving the graph or moving focus outside it restores the
latest saved price; changing market or period clears inspection. Touch inspection
resets on touch end or cancellation, including repeated touches at the same point.
Pointer inspection is independent of Recharts’ synthetic touch clicks; keyboard
inspection continues through its accessibility support. The date and range stay beneath the price to avoid layout
shifts. Selection snaps to saved chart points, rather than inventing interpolated
prices from the visual curve.

The header uses the existing NumberFlow rolling-digit animation (200ms) with
localized currency formatting and reduced-motion support. The selected price has
an accessible text equivalent without a noisy live announcement on each move.
Axes use UTC dates and localized whole-unit currency formatting. Y-axis labels
sit on the left and are left-aligned with the header price.
The muted header range represents the source spread, which is explained in the
accessible chart description; there is no footer note.

The default period is one calendar year; 30 days and all time are also available.
The percentage compares the displayed typical price with the price effective at the
period boundary, or the first available estimate when history starts later.
Percentages round to one decimal, with increases red and decreases green;
zero is neutral and a zero baseline omits the percentage.

History only adds a row when rounded low/typical/high changes. The chart smoothly interpolates between saved snapshots for presentation only.
It carries the effective estimate into the period boundary and
extends the latest value to server `now`. It never fabricates history before the
first estimate. Periods without changes show a flat line and zero change. Axis
padding uses the visible source extrema, with a minimum of one currency unit or
2% of the latest typical price, and never extends below zero.

Existing estimates remain immutable. No chart request fetches source sites,
recalculates estimates, or writes observations. The current gear projection stays
the fast path for page prices, cards, sorting, and comparisons.
