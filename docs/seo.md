# SEO Conventions

Conceptual guide to how Sharply handles technical SEO. The building blocks
live in `src/lib/seo/` and `src/app/sitemap.ts` / `src/app/robots.ts`.

## Canonicals and hreflang

- `buildLocalizedMetadata(pathname, metadata, locale)` is the single entry
  point for page metadata. Every indexable page calls it from
  `generateMetadata` and passes the current request locale.
- Canonicals are **self-referential per locale** (`/ja/gear/x` canonicalizes
  to itself), with hreflang alternates for all locales and `x-default`
  pointing at the default (`en`, unprefixed) URL. Do not point a canonical
  across locales: a cross-locale canonical instructs search engines to drop
  the translated page from their index, which silently defeats hreflang.
- `og:locale` and the localized `og:url` are derived from the same locale
  argument.
- Pages must not use static `export const metadata` with
  `buildLocalizedMetadata` — module-level metadata cannot know the locale.
  Use `generateMetadata` and read `params.locale`.
- Never pass `alternates.canonical` or a hand-built `openGraph.url` into
  `buildLocalizedMetadata` — overrides win over the locale-aware values and
  reintroduce cross-locale (or env-dependent) canonicals. The pathname
  argument is the single source of truth for both.

## Structured data (JSON-LD)

Builders live in `src/lib/seo/json-ld-helpers.ts`; rendering goes through
`<JsonLd data={...} />` (`src/components/json-ld.tsx`), which wraps arrays
of nodes in a single `@graph` document. URLs and `@id`s always use the
default-locale canonical via `getLocalizedUrl` so entity identity is stable
across locales.

Which page emits what:

- **Locale layout** (every page): `WebSite` (with the `/search?q=` SearchAction)
  and `Organization`. Other nodes may reference these via
  `{"@id": ".../#website"}` / `{"@id": ".../#organization"}`.
- **Gear pages**: `Product` (with `additionalType: ProductModel`) including
  brand, category, key specs as `additionalProperty`, and an `offers` node
  only when the selected legacy value represents an actual MPB or current
  MSRP offer. The visible price uses the shared used-price resolver, but a
  derived current/stale projection is not emitted as a purchasable Offer.
  Google renders Product snippets only when one of
  `offers`/`review`/`aggregateRating` is present; items whose selected price is
  only a derived estimate therefore emit no `Product` node until a suitable
  non-Offer schema representation exists. Plus `BreadcrumbList` on every gear
  page. Rumored and under-construction gear pages emit nothing (they are
  noindexed or thin).
- **Editorial review pages**: `Product` + nested `Review` with
  `positiveNotes`/`negativeNotes` from the review's good/bad points,
  targeting Google's pros-and-cons rich result. No `reviewRating`: the
  editorial 0–3 genre scale does not map honestly onto a star rating.
- **News / Learn pages**: `NewsArticle` / `Article` with Sharply's
  Organization as author and publisher (there is no per-person author field).

Rules of thumb:

- Only mark up what is _visible on the page_ (Google guideline). This is why
  gear pages have no `aggregateRating` — user reviews are thumbs-style and
  no aggregate stat is displayed. If a visible "% recommend" stat ships,
  an `aggregateRating` (`bestRating: 100`) may be added alongside it.
- Never claim `availability` in offers — Sharply is a database, not a shop.
- Validate changes with Google's Rich Results Test and validator.schema.org.

## Sitemap

- `lastModified` comes from real content timestamps only (gear `updatedAt`,
  Payload doc `updatedAt`, tag `updatedAt`). Static routes omit it — a
  sitemap that stamps generation time on every URL trains crawlers to
  ignore the field.
- Redirecting URLs (e.g. `/gear` → `/browse`) must not appear.
- Unlisted tags and unpublished Payload docs are excluded at the query level.

## Robots / AI crawlers

`robots.ts` allows all crawlers (including AI crawlers — deliberate, for
answer-engine citations) and disallows utility/auth/admin and unfinished
routes. If a new route should not be indexed, add it to `disallowedPaths`
there and keep it out of the sitemap.
