# Server Folder Structure

This document explains how to organize server-only code under `src/server/**`.

## Layers

- **data/** (lowest level)
  - Purpose: raw DB reads/writes; small, composable functions
  - Characteristics:
    - Uses Drizzle directly (`db`, `schema`)
    - No auth, no request/response shaping, no caching
    - Never imported by client or UI code
  - Example files:
    - `server/gear/data.ts`
    - `server/search/data.ts`
    - `server/admin/gear/data.ts`
    - `server/admin/colorways/data.ts`

- **service/** (domain logic)
  - Purpose: safe, reusable server functions for pages, API routes, and server components
  - Responsibilities:
    - Accept meaningful params (e.g., slugs, filters)
    - Perform auth/role checks where necessary
    - Compose multiple `data/*` calls, validate inputs, and shape return values
    - Centralize rules and orchestration
  - Example files:
    - `server/gear/service.ts`
    - `server/search/service.ts`
    - `server/admin/gear/service.ts`
    - `server/admin/colorways/service.ts`

- **actions/** (Next.js Server Actions)
  - Purpose: client-triggered mutations (CRUD) invoked from Client Components
  - Characteristics:
    - Marked with "use server"
    - Thin wrappers that call service functions
    - May call `revalidatePath`/`revalidateTag`
  - Example files:
    - `server/gear/actions.ts`
    - `server/admin/colorways/actions.ts`

## Guidelines

- Do not import `db` or `schema` from UI or libs. All DB access belongs in `server/**/data.ts`.
- Prefer importing from `service.ts` in server components and API routes.
- Use server actions only for client-side mutations; do not use actions for pure reads.
- Keep small, testable helpers in `data.ts`; keep business logic and auth in `service.ts`.
- Admin-specific logic lives under `server/admin/**` with its own `data.ts` and `service.ts` per feature.

## Flow (Hierarchy)

- data → service → actions
  - Reads: import from `service.ts` in server components or API routes
  - Mutations from client: call `actions.ts` which delegates to `service.ts`
- Auth: enforced in `service.ts` (fetch session with `auth.api.getSession({ headers })` + `requireRole`); actions remain thin wrappers

## Examples

- Gear
  - `server/gear/data.ts`: `getGearIdBySlug`, `fetchGearBySlug`, wishlist/ownership/review writes, stats reads
  - `server/gear/service.ts`: `resolveGearIdOrThrow`, `fetchGearBySlug`, `toggleWishlist`, `toggleOwnership`, `submitReview`, `fetch...Status`
  - `server/gear/actions.ts`: `actionToggleWishlist`, `actionToggleOwnership`, `actionSubmitReview`

- User Lists
  - `server/user-lists/data.ts`: list/list-item/shared-list reads+writes, ordered item queries, shared lookup by `publicId`
  - `server/user-lists/service.ts`: `ensureDefaultSavedItemsList`, auth ownership checks, publish/unpublish orchestration, public list read models
  - `server/user-lists/actions.ts`: thin list CRUD + publish mutations with `revalidatePath`

- Search
  - `server/search/data.ts`: `buildSearchWhereClause`, `buildRelevanceExpr`, `querySearchRows`, `querySearchTotal`, suggestions queries
  - `server/search/service.ts`: `searchGear`, `getSuggestions`

- Admin
  - `server/admin/gear/data.ts`: `performFuzzySearch`
  - `server/admin/gear/service.ts`: `performFuzzySearchAdmin` (auth + role)

- Metrics (global stats)
  - `server/metrics/data.ts`: `getGearCount`, `getContributionCount`, `getPublishedGearCountsByBrand`
  - `server/metrics/service.ts`: `fetchGearCount`, `fetchContributionCount`, `fetchPublishedGearCountsByBrand`

- Developer API
  - `server/developer-api/data.ts`: API-key, rate-bucket, and usage aggregate persistence.
  - `server/developer-api/service.ts`: access checks, key lifecycle, rate limiting, and composition of existing search/gear domain reads.
  - `server/developer-api/actions.ts`: authenticated portal/admin mutations only.
  - `server/developer-api/http.ts`: shared public-route authentication and response handling.
  - `server/developer-api/webhooks/data.ts`: durable webhook event, target, and per-target delivery persistence.
  - `server/developer-api/webhooks/service.ts`: developer-access checks, target lifecycle, signed delivery, retries, and dispatch orchestration.
  - `server/developer-api/webhooks/security.ts`: endpoint validation, pinned public DNS resolution, signing, and encryption of target secrets.
  - Developer route handlers must not call the website’s API routes or access Drizzle directly.

## Import Rules

- UI/Client Components → call Server Actions (for mutations) or import from `server/**/service.ts` (for reads).
- API Routes → import from `server/**/service.ts`.
- Never import from `server/**/data.ts` outside of `server/**` service layers.
