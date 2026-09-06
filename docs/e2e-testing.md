# E2E Testing

The Playwright suite (`tests/playwright/`) runs on every PR via
`.github/workflows/e2e-tests.yml` against a hermetic Postgres service
container — no Neon, no secrets, no Vercel involvement.
Decision record: `docs/decisions/2026-08-31-hermetic-e2e-ci.md`.

## Local setup (one command)

```bash
npm run e2e:setup-local   # disposable Postgres on :5433 + full pipeline
```

The script prints the two commands for a CI-identical run (production
build + `npm run test:e2e`). For the usual dev-server flow,
`npm run test:e2e` alone still works exactly as before.

## Creating a PR (e2e-gated)

```bash
npm run pr:create            # runs the e2e suite, then gh pr create --base development
npm run pr:create -- --fill  # extra args go to gh pr create
```

PR creation is gated on a green suite: if any test fails, `gh pr create`
never runs. The suite uses the managed dev server (`dev:e2e`), so it
needs your dev database up — no `.env` changes are needed, `dev:e2e` sets
`DEV_AUTH=true` itself (see above). CI re-runs the same suite on the PR
either way — this gate just saves the round-trip.

### Pre-push hook (automatic)

A committed `pre-push` hook (`.githooks/pre-push`, wired by the npm
`prepare` script via `git config core.hooksPath .githooks`) enforces the
same gate for people who push first and open PRs in the GitHub UI: the
**first push of a branch** (no open PR yet) runs the e2e suite and
blocks the push if it fails. Pushes to branches with an open PR,
`development`/`main`, tags, and deletions all skip instantly — CI
already covers those. Bypass once with `git push --no-verify`. If `gh`
isn't installed the hook warns and lets the push through rather than
bricking it.

## The CI pipeline

health check → `CREATE EXTENSION pg_trgm` → `drizzle-kit push --force` →
`e2e:bootstrap` (Payload schema push + published news fixture) →
`db:seed` (includes popularity windows) → `next build` → Playwright
(chromium on PRs; full matrix nightly via `PLAYWRIGHT_ALL_PROJECTS=true`).
The committed `src/lib/generated.ts` feeds the seed — do NOT set
`GENERATE_CONSTANTS=true` around this pipeline; the generator would read
the throwaway e2e database and clobber the tracked constants file.

Gotchas encoded in the pipeline — don't reorder it:

- `pg_trgm` must exist before tests or search is silently empty.
- The build must run AFTER seeding: ISR/SSG pages query the DB at build time.
- `PLAYWRIGHT_BASE_URL` must stay unset in CI: setting it disables the
  managed webServer (`config/playwright.config.ts`).
- Some SDK clients are constructed at module scope and throw at import
  without a key (the OpenAI client in `src/lib/open-ai`) — CI carries
  dummy values for these. Locally, `next build` silently reads your
  `.env`, so a missing dummy only ever surfaces in CI.

## Writing specs — isolation rules

- Cross-run state is guaranteed clean (the DB dies with the runner).
- Within a run, one worker executes spec files serially in no guaranteed
  order. Specs may write to the DB, but must never assert global
  aggregates ("exactly 12 gear items") or assume another spec hasn't
  run. Assert on what you created or what the seed deterministically
  contains.
- Intercepted-route modal specs should assert explicit dismissal to the modal's
  canonical owning route. Browser Back specs must establish and assert a known
  predecessor because a fresh Playwright page starts at `about:blank`. Wait for the specific
  auth-dependent control to become visible and enabled instead of using
  `networkidle`: recurring background requests make global network idle an
  unreliable readiness signal in both development and production builds.
- Auth: hit `/api/dev-login` (see `tests/playwright/basic/routing-auth.spec.ts`);
  the dev user self-provisions. The default local flow (`npm run test:e2e`
  against `dev:e2e`) needs nothing in your `.env` — `dev:e2e` sets
  `DEV_AUTH=true` itself, same as CI's `start:e2e`. Only set `DEV_AUTH=true`
  in `.env` yourself if you're running the app via a different server command.
- Mock only the outermost third-party boundary with `page.route`
  (pattern: `tests/playwright/contact.spec.ts`); everything inside the
  app runs for real.

## Page sweep

Alongside the isolation-rule specs above, `tests/playwright/pages/` runs a
reads-only sweep over (almost) every page route. Rationale and alternatives
considered: `docs/decisions/2026-08-31-page-sweep-and-coverage.md`.

- **Manifest.** `tests/playwright/utils/route-manifest.ts` is the single
  source of truth: each `RouteEntry` names a concrete path, its
  filesystem-derived pattern, a render marker, which spec bucket it belongs
  to (`core` / `static` / `community` / `tools` / `auth-gated` / `admin`),
  and whether it needs the signed-in storage state. Spec files
  (`tests/playwright/pages/*.spec.ts`) just iterate `routesForSpec(...)` —
  new coverage is a manifest edit, not a new spec file.
- **Parity guard.** `tests/unit/route-sweep-parity.test.ts` walks `src/app`
  for every `page.tsx`, and fails if a route pattern is neither in the
  manifest nor in `route-manifest.ts`'s `skippedRoutes` map. A failure means:
  add your new route to the manifest, or add it to `skippedRoutes` with a
  reason.
- **Assertion contract** (`tests/playwright/utils/expect-page-renders.ts`):
  for each route, the marker must be visible (primary — proves
  routing -> service -> data ran), no error boundary text may be present
  (a late-streamed error still fails the test even though the response was
  already 200), and the HTTP response must be `.ok()` (secondary — streaming
  SSR sends its 200 before a late error boundary can paint). Browser-side
  requests to any host other than `localhost`/`127.0.0.1` are aborted via
  `page.route`, so the sweep can't flake on an unreachable third party; CI's
  dummy keys mean server-side calls to those same services already run for
  real (against dummy credentials) and can't be intercepted from the page.
- **Fixtures.** `scripts/e2e/seed-fixtures.ts` runs after `db:seed` in the
  e2e pipeline (`npm run e2e:setup-local` and CI both call it via
  `e2e:seed-fixtures`) and seeds the deterministic rows some manifest markers
  depend on (a tag, a shared list, an invite, a recommendation chart) plus
  the dev user. `scripts/e2e/bootstrap-payload.ts` seeds the Payload-owned
  fixtures (a published news post, a learn page, a review). **Manifest
  marker values and fixture values must move together** — renaming a seeded
  title/slug without updating its `RouteEntry` (or vice versa) breaks the
  sweep silently until the spec runs.
- **Auth.** `tests/playwright/auth.setup.ts` is a Playwright `setup` project
  (`config/playwright.config.ts`) that runs once per invocation: it hits
  `/api/dev-login` to mint a session for the single seeded identity
  (`dev@sharply.local`, seeded `SUPERADMIN` by `seed-fixtures.ts`) and
  writes the resulting cookies to a shared storage state file
  (`tests/playwright/utils/auth.ts`'s `STORAGE_STATE_PATH`). Every
  browser project depends on `setup`, and any `RouteEntry` with `auth: true`
  runs against that storage state. There is only one identity — the sweep
  cannot currently assert role-scoped or per-user views. The documented (not
  built) upgrade path is a gated `email` query param on `/api/dev-login` to
  mint additional seeded identities on demand.

## Flakes

CI retries twice and warns (`::warning`) on any test that passed only on
retry. Two flakes in a week ⇒ quarantine it (`test.fixme` + an issue).
A jittery check people override is worse than no check.

## Debugging a red CI run

Download the `playwright-report` artifact from the failed run, then:

```bash
npx playwright show-report path/to/downloaded/playwright-report
```

Traces are retained on first failure — open one with
`npx playwright show-trace <trace.zip>`.

## Known cross-browser debt (phase-2 unskip targets)

The first full-matrix run (2026-08-31) surfaced pre-existing failures in
non-chromium/mobile combos that had never run anywhere. Each is now an
explicit, reasoned skip rather than a red nightly:

- **Pending-navigation specs** (`*-pending-navigation.spec.ts`) run on
  desktop chromium only: they assert a transient loading state whose
  timing races prefetch/soft-navigation on firefox and mobile engines
  (and flaked once even on chromium under the long matrix session — the
  robust fix is delaying prefetch/RSC requests too, not just documents).
- **Desktop-only UI interactions** skip on mobile projects: search
  filter panel (`gear-list-view`), Gear dropdown (`smoke`), decimal
  typing (`number-input`).
- **routing-auth mobile failures — RESOLVED, no skips:** the
  locale-cookie flake was a test-side race, root-caused and fixed: the
  middleware re-sets `NEXT_LOCALE` on every response (`src/proxy.ts`),
  so an in-flight prefetch/RSC response could overwrite the
  test-injected `ja` cookie — the spec now leaves the page
  (`about:blank`) to abort in-flight requests before injecting
  (verified 16/16 across chromium + Mobile Chrome). The Mobile Safari
  auth failure was WebKit dropping Secure session cookies over plain
  http — better-auth infers production under `next start` without an
  explicit base URL, so CI sets `BETTER_AUTH_URL=http://localhost:3000`.

Unskipping these — by fixing specs (pending-nav), writing mobile
variants (UI), or fixing the app (locale) — is part of the agreed
coverage phase 2.

## Nightly matrix

A scheduled run executes the full browser matrix (firefox, mobile
Chrome/Safari) against `development`. Trigger manually:
Actions → E2E tests → Run workflow.

Two schedule facts worth knowing: the cron does not fire until the
workflow file reaches `main` (promotion PR), and a scheduled run always
executes `main`'s copy of the workflow — only the checkout is pinned to
`development`. Pipeline changes on `development` therefore apply to
nightlies only after promotion. Flaky-but-green runs upload the
Playwright report artifact too, so quarantine decisions have evidence.
