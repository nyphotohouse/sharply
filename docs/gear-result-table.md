# Gear Result Table

The reusable gear list presentation lives in `src/components/table`. It is used by browse release feeds, browse category/mount results, and search results without changing how any surface fetches or paginates data.

## Public component contract

`GearTable` receives `GearTableRow[]`. Rows are JSON-safe and include identity/display data, all mount names, card-compatible date and price metadata, digital sensor formats, analog capture media, and lens fields. `toGearTableRows` adapts the existing browse or search payloads into this contract.

The shared server helper `src/server/gear/listing-table-service.ts` enriches each existing result page in one batch. Mounts are read from `gear_mounts`; the legacy `gear.mountId` is not used for table display. Price rows include the initial JSON projection and use the shared US/USD comparison helper for in-memory sorting, so sorting does not need a client fetch or a post-load price replacement. The table formats canonical mount values with the shared mount display helper, shows at most three mounts per row, and provides a `[+N]` overflow indicator with the full list in a tooltip.

## Scopes and columns

- Camera and analog-camera-only results: Name, Brand, Mount, Type, Year, Weight, Price. Type shows a digital camera's sensor format or an analog camera's formatted capture medium.
- Lens-only results: Name, Brand, Mount(s), Focal Length, Aperture, Type, Year, Price.
- Mixed result sets: Name, Brand, Mount(s), Type, Year, Price.

The scope is resolved from the currently loaded rows. Unknown values render as an em dash. Dates and prices reuse the gear-card formatting rules.

## Behavior boundaries

TanStack Table performs only in-memory sorting of rows already loaded by the owning browse or search surface. It does not add filtering, pagination, URL parameters, or requests. As the existing surface loads another page, the active client sort is applied to the expanded row set.

The grid/list preference is stored under `sharply:gear-results-view` in localStorage. It defaults to grid during server render and is shared by all result surfaces in a browser.

When list view is active, initial and incremental loading use `GearTableSkeleton` instead of card skeletons. It uses dark, rounded full-width row placeholders with generous vertical spacing rather than simulated cells, so its layout stays stable across table scopes and viewport widths; the rows pulse subtly and use a vertical bottom fade to keep long result loading states visually lightweight. Grid mode uses card skeletons for the same incremental requests, rather than a standalone spinner.

## Adding another surface

1. Make its server payload include the standard table fields with `attachGearListingTableFields`.
2. Convert the loaded items with `toGearTableRows`.
3. Use `useGearResultsView` and `GearViewToggle` beside that surface's existing controls.
4. Render `GearTable` only as an alternative to the existing renderer; keep the fetch, filters, empty states, and pagination owned by the route.
