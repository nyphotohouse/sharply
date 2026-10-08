# Search System

This document explains how search works in Sharply: routing, URL model, UI surfaces, API shape, DB prerequisites, and the ranking algorithm.

## Surfaces

- `Header` global search: `src/components/layout/header.tsx`
  - Spotlight-style inline search with a floating preview panel.
  - The closed trigger rotates through plain-text example queries, mixing basic searches and high-confidence smart-search phrases, while preserving the existing muted placeholder styling.
  - Empty focus opens recent searches only when history exists.
  - Non-empty input stays visually closed until useful suggestions arrive.
  - After non-empty suggestions have appeared once, the panel stays open until the input is cleared.
  - Plain `Enter` prioritizes arrow-key selection, then smart action, then best-match gear, then `/search?q=...`.
- Header and footer navigation: the standalone **Search** link routes to `/search`; it appears after **News** and before the **Gear** category in the shared navigation definition.
- Command palette: `src/components/search/command-palette.tsx`
  - Opens with ⌘K/Ctrl+K or programmatically via `document.dispatchEvent(new CustomEvent("sharply:open-command-palette"))`.
  - Debounced typeahead (200ms) calling `/api/search/suggest`.
  - Uses the same suggestion contract and Enter priority as the header search.
  - When the query is empty, the input shows the same rotating plain-text example queries used by the closed global search trigger.
  - The inline `GlobalSearchBar` only shows the visual ⌘K/Ctrl+K hint from the `sm` breakpoint upward; mobile keeps the shortcut behavior but hides the hint chip.
  - Built-in cmdk filtering is disabled so server-ranked results always render.
- Search results page: `src/app/[locale]/(pages)/search/page.tsx`
  - Server component; fully driven by `searchParams`.
  - Sort: `relevance` (default), `name`, `newest`.
  - Pagination: `page` (1-based), `pageSize` (internal default 20).
  - Presentation: the existing grid can be switched to the reusable list table. The browser-local choice is shared with browse and does not alter the search URL or request model.
  - Loading: the route reserves at least a viewport of space and uses the saved browser-local view choice to show either grid-card or list-table skeletons, preventing the footer from appearing above the fold while results are loading.

## Routing & URL model

- Route: `/search`
- URL params (extensible):
  - `q`: query text
  - `sort`: `relevance` | `name` | `newest`
  - `page`: number (1-based)
  - Filters (optional): `brand`, `mount`, `gearType`, `priceMin`, `priceMax`, `sensorFormat`

Helper utilities for URLs live in `src/lib/utils/url.ts` (`buildSearchHref`, `mergeSearchParams`).

## API

- Full search (optional for clients): `src/app/api/search/route.ts`
  - GET params: `q`, `sort`, `page`, `pageSize` (+ future filters)
  - Returns: `{ results, total, totalPages, page, pageSize }`
  - Each result also includes display fields for the reusable gear table: all mount names, sensor format, weight, focal length, maximum aperture, prime/zoom state, and `isUnderConstruction`. The construction flag uses the same required-spec rules as gear pages; it renders as a gray badge in cards and an amber pencil-ruler icon beside names in table view. These enrich the existing page result; they do not change filtering or pagination.
- Suggest (used by palette and gear pickers): `src/app/api/search/suggest/route.ts`
  - GET params: `q`, optional `limit` (1–20, default 8), optional `country`, optional `types=gear`, optional `gearType`
  - Returns: `{ suggestions: Suggestion[] }`
  - Default (palette/modal): top 5 gear rows + brand suggestions + optional compare smart-action, then sliced to `limit`
  - Command-palette-only natural-language parsing can also prepend a parsed-search smart action that routes to `/search` with existing URL filters applied. This path is only used for high-confidence patterns and never changes `/search` page typing behavior directly.
  - `types=gear`: gear-only mode for form pickers — no brands or smart-actions; gear SQL limit follows request `limit`
  - `gearType`: optional exact gear-type filter (e.g. `LENS`) applied before ranking
- Gear picker combobox: `src/components/gear/gear-search-combobox.tsx`
  - Uses `/api/search/suggest?types=gear` (not full `/api/search`) so ranking and best-match metadata match the modal path
  - Default `limit` 12; hoists `isBestMatch` rows; scrolls with viewport-aware max height and dialog-safe popover nesting
- `Suggestion` is a discriminated union:
  - `gear`: region-aware item suggestion with `title`, `subtitle`, `canonicalName`, `localizedName`, `matchedName`, `matchSource`, `brandName`, `relevance`, `isBestMatch`
  - `brand`: brand suggestion with `title`, `subtitle`, `brandName`, `relevance`
  - `smart-action`: compare actions with `action: "compare"` and parsed-search actions with `action: "parsed-search"`
  - Compatibility fields `label` and `type` are still emitted for older consumers.

### Developer API

The key-authenticated developer API has separate public endpoints at `/api/v1/search` and `/api/v1/search/suggestions`. Both reuse `searchGear` and `getSuggestions` from the search service, preserving one ranking implementation. The developer suggestion serializer omits website-specific `href` and smart compare-action data; see `docs/developers/api/overview.md` for its public contract.

## Database prerequisites

- PostgreSQL `pg_trgm` extension is required for similarity-based ranking and fast `ILIKE` searches.
- Migration: `drizzle/0006_search_trgm.sql`
  - Creates extension if missing
  - Adds a GIN trigram index on `sharply_gear.search_name`
- `gear.search_name` is denormalized to include canonical names plus any US, EU, JP, or Global aliases. Aliases may contain a different regional brand, while search normalization retains canonical-brand tokens so either name can match.

## Core algorithm

Implemented in `src/server/search/data.ts`, `src/server/search/service.ts`, and `src/server/search/query-normalization.ts`.

### Search flow

When a user types a query, the server-side search pipeline runs in this order:

1. Normalize the raw query.
   - Lowercase and trim it.
   - Build `normalizedQueryNoPunct` by removing spaces, underscores, dots, slashes, and common dash characters.
2. Parse the query into search tokens.
   - Split into parts.
   - Extract strong text tokens, explicit dashed focal-length ranges, significant numeric tokens, explicit single focal-length tokens, aperture tokens, and any allowlisted lens feature acronyms.
   - Canonicalize focal ranges such as `70-200`, `70 – 200`, and `70-200mm` to one range token before applying generic numeric fallback behavior.
   - Decide whether short acronyms such as `pf` or `is` should be treated as active high-signal tokens or ignored as low-information shorthand.
3. Build normalized database-side comparison forms.
   - `searchLower` for case-insensitive matching.
   - `normalizedCol` for punctuation-insensitive matching.
   - `normalizedNoBrand` for brand-agnostic matching.
   - Relaxed normalized forms that tolerate omitted lens glue such as `mm` and `f`.
4. Build the text-match `WHERE` clause.
   - Add OR conditions for strong-token substring matches, normalized contains, brand-agnostic contains, relaxed contains, and conservative trigram similarity.
   - Add boundary-aware acronym matches for active allowlisted lens feature tokens.
5. Apply numeric and acronym gates.
   - If the query has two or more significant numeric tokens, all of them must appear in the item text.
   - If the query has exactly one significant numeric token plus strong text context, that numeric token is required.
   - If the query has active lens feature acronyms, those acronym matches are also required.
   - Low-information acronym-only queries use a narrow boundary-aware acronym match instead of broad substring matching.
6. Build the relevance score.
   - Start with additive base signals: raw contains, normalized contains, brand-agnostic contains, and relaxed contains.
   - Add token-coverage bonuses for strong text, complete focal-length ranges, single focal-length tokens, aperture tokens, and active lens acronyms.
   - Apply the single-focal tie-break so exact `500mm` primes outrank zooms like `200-500mm` only when the query is targeting a true single focal length.
   - Keep trigram similarity as a weaker fallback signal.
7. Fetch and shape results.
   - Full search sorts by relevance or the requested sort key, applies filters, paginates, and optionally counts totals.
   - Suggest search fetches the top gear rows (5 by default, or the request limit in gear-only mode) plus brand suggestions, applies exact-match metadata, and may prepend a smart compare action. Gear-only suggest skips brands and smart-actions.
8. Resolve UI behavior.
   - Best-match gear suggestions can win plain Enter.
   - Otherwise the UI falls back to the explicit `Search for "..."` action and the `/search?q=...` results page.

### Goals

- Tolerant to punctuation/spacing (Z6III vs Z6 III, 70-200 vs 70200)
- Brand should not dominate results
- Avoid over-broad numeric matches (token `70` shouldn’t match everything)
- Use trigram as a ranking signal, not the only gate

### Normalization

- Query normalization: lowercase, trim, remove spaces/underscores/dots/slashes/hyphens → `normalizedQueryNoPunct`.
- Column forms:
  - `searchLower` = `lower(gear.search_name)`
  - `normalizedCol` = `regexp_replace(searchLower, '[[:space:]_.-]+', '', 'g')`
  - Brand-agnostic: `noBrand` = `replace(searchLower, lower(brands.name), '')`
  - `normalizedNoBrand` = `regexp_replace(noBrand, '[[:space:]_.-]+', '', 'g')`

### Tokenization

- Split query on spaces/underscores only (keep hyphens intact): `/[\s_]+/`.
- “Strong tokens” used for substring ILIKE: must contain a letter and be length ≥ 3.
  - Prevents numeric-only tokens (e.g., `70`) from widening results.
- Explicit focal-length ranges are detected before generic numeric fallback:
  - A dashed range such as `24-70`, `70-200mm`, or `70 – 200` becomes one canonical range token.
  - The complete range must appear before `mm` in a candidate name to earn the focal-range relevance bonus.
  - Range endpoints are not reused as standalone focal tokens, so `70-200` is not treated as a single `200mm` query.
- Lens feature acronyms are handled from a fixed allowlist:
  - `pf`, `vr`, `is`, `oss`, `ois`, `vc`, `os`, `stm`, `usm`, `hsm`, `ssm`
- Those acronyms only become high-signal ranking/gating tokens when the query also has lens evidence:
  - at least one significant numeric token, or
  - at least one strong text token
- Low-information acronym-only queries avoid generic substring matching and fall back to boundary-aware token matching so short tokens like `is` do not behave like broad `ILIKE %is%` searches.

### Matching (WHERE clause)

Combined with OR:

- Substring on strong tokens: `gear.search_name ILIKE %token%`
- Boundary-aware acronym matching: `lower(gear.search_name) ~ '(^|[^a-z0-9])token([^a-z0-9]|$)'`
- Normalized contains: `normalizedCol ILIKE %normalizedQueryNoPunct%`
- Brand-agnostic contains: `normalizedNoBrand ILIKE %normalizedQueryNoPunct%`
- Fuzzy (conservative thresholds):
  - `similarity(normalizedNoBrand, normalizedQueryNoPunct) > 0.4`
  - `similarity(gear.search_name, normalizedQueryNoPunct) > 0.5`

### Relevance ranking

Final score is additive, not `GREATEST(...)`, so multiple good signals can beat one broad match.

- Base signals:
  - raw contains on `search_name`
  - normalized contains
  - brand-agnostic contains
  - relaxed normalized contains for omitted `mm` / `f`
- Additive token bonuses:
  - strong token coverage
  - lens feature acronym coverage
  - complete focal-range coverage
  - focal-length token coverage
  - aperture token coverage
- Single-focal tie-break:
  - when the query targets one focal length such as `500mm` or shorthand `500`, exact `500mm` lenses get a boost
  - zoom overmatches such as `200-500mm` receive a penalty for those single-focal queries
  - explicit range queries skip both the single-focal bonus and the zoom-overmatch penalty
- Trigram similarity remains a weaker fallback signal instead of the primary ranking decision.

Sort order remains `DESC(relevance), ASC(name)` for `relevance`; otherwise `ASC(name)` or `DESC(release_date)`.

### Best-match classification

- Best-match is computed server-side for gear suggestions only.
- A gear result is marked `isBestMatch` when either:
  - the normalized query exactly matches one candidate name, or
  - for a multi-token query, one candidate uniquely covers every informative query token
- In either case, no competing gear suggestion can share that same high-confidence match.
- Exact candidates include:
  - canonical gear name
  - region-localized display name
  - regional aliases
  - brand-stripped variants for exact item-name entry (for example `z50ii` matching `Nikon Z50 II`)
  - derived lens shorthand variants for suggestion intent only (for example `500 pf` or `35mm 1.8g`)
- For lens-style token coverage, focal-length tokens ending in `mm` also contribute a bare numeric equivalent so queries like `150-600 contemporary` and `150-600mm contemporary` behave the same in best-match classification.
- Brands never receive implicit direct-open behavior.

### Smart compare parsing

- Suggestion parsing recognizes:
  - `A vs B`
  - `A versus B`
  - `compare A vs B`
- When both sides resolve to strong exact gear matches, the suggest API prepends a `smart-action` row that routes directly to `/compare?...`.
- If either side is ambiguous or weak, no smart action is emitted and the query falls back to normal ranked suggestions.

### Natural-language parsed search

- The global search command palette also recognizes a narrow set of high-confidence patterns and converts them into existing `/search` URL filters:
  - `[brand] lenses`
  - `[mount] mount lenses`
  - `lenses for [camera]`
  - `[brand] cameras`
  - `[mount] mount cameras`
- Parsing is strict:
  - the parser only emits a smart action when the brand or mount resolves uniquely
  - `lenses for [camera]` only succeeds when the camera phrase resolves to one strong camera match through the existing suggestion-ranking pipeline
  - ambiguous inputs fall back to normal suggestions
- Parsed search actions leave `q` blank when the phrase is fully consumed, and only keep leftover text in `q` when some suffix remains unparsed.
- The `/search` page remains a normal URL-driven search surface. It does not run parser logic while typing; it only shows a one-time arrival toast when navigation came from a parsed command-palette action.

### Filters

Optional ANDed filters are layered on top of the text matching WHERE clause. The `/search` results page exposes brand, mount, gear type, price range, sensor format, megapixel range, lens type, and analog camera type.

On mobile, the same filters are available from the Filters bottom drawer; desktop keeps the persistent sidebar.

Camera-only filters are `megapixelsMin`, `megapixelsMax`, `isoMin`, `isoMax`, `hasIbis=true`, and `hasWeatherSealing=true`. ISO bounds describe native ISO coverage: a matching camera has a native minimum at or below `isoMin` and a native maximum at or above `isoMax`. Expanded ISO bounds are catalog-only display fields and are not search filters.

Lens-only filters are `focalIncludes`, `widestFocalMax`, `longestFocalMin`, `fastestApertureMax`, `hasAutofocus=true`, and `hasStabilization=true`. `focalIncludes` matches an interchangeable lens whose focal range contains the requested millimeter value; the advanced bounds match its widest and longest focal lengths. `fastestApertureMax` evaluates the wide-end maximum aperture, so `2.8` means f/2.8 or faster. Macro remains intentionally unfiltered.

Numeric range bounds are non-negative (positive where zero is not meaningful); reversed min/max pairs are normalized by the API. Capability filters only match an explicitly recorded positive value, excluding unknown specifications.

### Numeric tokens

- Explicit dashed focal ranges are parsed first and ranked as complete ranges. This preserves short endpoints such as `24` or `70` without broadening generic numeric matching.
- If a query contains two or more significant numeric tokens (integers with ≥3 digits like `400` or decimals like `4.5`), the search additionally requires that all numeric tokens appear in the item’s `search_name`.
- If a query contains exactly one significant numeric token and at least one alphabetic “strong token” (e.g., `nikon z 400`), the match is gated on that numeric token appearing in the item’s `search_name`. This makes mixed queries surface the expected lenses (e.g., `400mm`) without broadly relaxing other matches.
- Decimal numeric tokens are matched with a digit-sequence regex so `f/1.4`, `F1.4`, and the normalized `search_name` form (`f1 4`) all satisfy the same gate.

## Command palette specifics

- UI primitives: `src/components/ui/command.tsx`
  - `CommandDialog` passes `shouldFilter={false}` to cmdk to prevent client-side filtering from hiding server suggestions.
- Behavior: `src/components/search/command-palette.tsx`
  - Debounced fetch while typing (200ms)
  - On open: focus input and eagerly fetch if current query length ≥ 2.
  - Empty input shows recent searches when available.
  - Non-empty input shows smart action rows, best match rows, fallback search action, then remaining suggestions.

## Interaction model

- Loading indicator:
  - The inline header search shows a persistent spinner inside the input as soon as the user starts typing and keeps it visible through the debounced fetch lifecycle.
- Dropdown/panel behavior:
  - Empty input: show an `Enter` → `Advanced Search` hint at the input’s right edge on desktop only. Pressing Enter closes the palette and opens `/search`, where the full filter controls are available.
  - Non-empty input: the panel waits for useful content before opening.
  - Once useful non-empty content has appeared, the panel remains open until the query is cleared, even if later requests return no direct suggestions.
- Enter behavior:
  - If the user has moved selection with arrow keys, Enter accepts the selected row.
  - Otherwise, smart action wins.
  - Otherwise, a `gear` suggestion with `isBestMatch` wins.
  - Otherwise, Enter navigates to `/search?q=...`.
  - With an empty or whitespace-only query, Enter navigates to `/search`.
- Search actions:
  - The UI no longer renders a standalone submit button.
  - Instead it renders a selectable fallback row: `Search for "..."`.
- Naming:
  - Gear rows prefer the localized display name.
  - If the matched alias differs materially from the localized display name, the alias leads and the viewer-local display name moves to secondary text.
- Debug UI:
  - Relevance remains in the payload for ranking/diagnostics but is not shown in production UI.

## SSR & Suspense

- `src/components/layout/header.tsx` now builds only the locale-scoped header shell on the server so shared ISR routes stay static-safe.
- `src/components/layout/header-client.tsx` derives compact vs expanded route state from `usePathname()`, while query-string callback enrichment stays isolated behind a `Suspense` boundary around `useSearchParams()`.
- Auth/session state, notifications, and final sign-in callback refinement all stay client-side.

## Performance

- GIN trigram index on `search_name` speeds up `ILIKE` and `similarity`.
- Debounce on palette reduces network chatter.
- Minimal fields selected in listing; pagination is fixed page size 20.

## Tuning knobs

Located in `src/server/search/data.ts` and `src/server/search/query-normalization.ts`:

- Token gate: letter presence and `length ≥ 3` for substring ILIKE
- Similarity thresholds: `> 0.4` (brand-agnostic), `> 0.5` (raw column)
- Relevance weights:
  - `2.4` raw contains
  - `1.9` normalized contains
  - `1.2` brand-agnostic contains
  - `0.8` relaxed contains
  - `0.35` strong-token coverage
  - `0.7` acronym coverage
  - `1.0` focal-length coverage
  - `0.65` aperture coverage
  - `1.2` exact single-focal bonus
  - `-0.95` single-focal zoom overmatch penalty
  - `0.35` / `0.2` / `0.12` for the three similarity fallback terms

Guidance:

- To be stricter: raise similarity thresholds, or require at least one “strong token” match before allowing fuzzy hits.
- To be more permissive: lower thresholds, include short tokens, or add more fields into `search_name`.

## Extensibility

- Add facets: update `SearchFilters` and WHERE filter blocks.
- Add entity types to suggest API (e.g., users): union into output.
- Add sort keys: extend `SearchSort` union; provide corresponding `orderBy`.

## Testing

Manual checks (examples):

- Z6iii → includes “Nikon Z6 III” high; may include “Z6” lower; excludes “Z50ii”.
- 70-200 → includes 70–200 variants; excludes 24–70.
- Brand bias → typing brand alone should not flood irrelevant models.
- `Lumix GF9` → surfaces the GX850 record with alias-aware labeling and canonical/local-name context.
- `Canon EOS 1200D` from a US/global session → surfaces the Rebel T5 record with `Canon EOS 1200D` as the title and `Canon EOS Rebel T5` as the subtitle.
- `z50ii vs a6700` → shows a compare smart action and Enter opens the comparison page.
- Header search stays closed on non-empty input until useful content arrives, then stays open until the input is cleared.
- Plain Enter on a strong exact gear match opens the gear page directly; otherwise it opens `/search?q=...`.
