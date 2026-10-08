/**
 * Single source of truth for the e2e read sweep. Spec files iterate
 * routesForSpec(); tests/unit/route-sweep-parity.test.ts diffs patterns
 * against src/app. New page => add an entry here (or a skip with a reason).
 */
export type Marker =
  | { role: "heading" | "link" | "button"; name: string | RegExp }
  | { text: string | RegExp }
  | { testId: string };

// messages/en.json -> errors.genericTitle; rendered by src/app/[locale]/error.tsx.
// Lives here (not expect-page-renders.ts) so tests/unit/route-sweep-parity.test.ts
// can assert it against en.json without importing @playwright/test.
export const ERROR_BOUNDARY_TEXT = "Something went wrong!";

export type SweepSpec =
  | "core"
  | "static"
  | "community"
  | "tools"
  | "auth-gated"
  | "admin";

export type RouteEntry = {
  /** Concrete path to visit (fixture params filled in), e.g. "/gear/nikon-z6iii" */
  path: string;
  /** Filesystem-derived pattern, e.g. "/gear/[slug]" — parity-guard key */
  pattern: string;
  /** Proof the page rendered its data; resolved in expect-page-renders.ts */
  marker: Marker;
  spec: SweepSpec;
  /** Needs the signed-in storage state (added in the auth task) */
  auth?: boolean;
};

const GEAR = { slug: "nikon-z6iii", name: "Nikon Z6III" } as const;
const NEWS_TITLE = "Sharply E2E seed news post";

export const routeManifest: RouteEntry[] = [
  // --- core ---
  { path: "/", pattern: "/", marker: { role: "heading", name: "Photography gear made simple." }, spec: "core" },
  // GearCard splits brand/model into sibling text nodes ("Nikon" / "Z6III"),
  // so a combined getByText(GEAR.name) never matches a single text node on
  // grid pages; the rendered <Link>'s accessible name concatenates them
  // (plus the thumbnail's alt text) with spaces, so role "link" still finds
  // the seeded gear card by GEAR.name as a substring.
  { path: "/gear", pattern: "/gear", marker: { role: "link", name: GEAR.name }, spec: "core" },
  { path: `/gear/${GEAR.slug}`, pattern: "/gear/[slug]", marker: { role: "heading", name: GEAR.name }, spec: "core" },
  // Browse hub lists gear via the same split-node GearCard grid as /gear — see comment above.
  { path: "/browse", pattern: "/browse/[[...segments]]", marker: { role: "link", name: GEAR.name }, spec: "core" },
  { path: "/search?q=z6", pattern: "/search", marker: { role: "link", name: GEAR.name }, spec: "core" },
  { path: "/brand/nikon", pattern: "/brand/[slug]", marker: { role: "link", name: GEAR.name }, spec: "core" },
  // --- static ---
  { path: "/about", pattern: "/about", marker: { role: "heading", name: "Photography for Everyone" }, spec: "static" },
  { path: "/privacy-policy", pattern: "/privacy-policy", marker: { role: "heading", name: "Privacy Policy" }, spec: "static" },
  { path: "/terms-of-service", pattern: "/terms-of-service", marker: { role: "heading", name: "Terms of Service" }, spec: "static" },
  // /developer and /developer/docs moved to the auth-gated bucket below —
  // now that a signed-in storage state exists, they no longer need to prove
  // the anonymous sign-in redirect.
  { path: "/discord/bingo", pattern: "/discord/bingo", marker: { role: "heading", name: "Photography Lounge Bingo" }, spec: "static" },
  { path: "/discord/bot-commands", pattern: "/discord/bot-commands", marker: { role: "heading", name: "Discord Bot Commands" }, spec: "static" },
  { path: "/auth/signin", pattern: "/auth/signin", marker: { role: "heading", name: "Welcome" }, spec: "static" },
  // Visited with no ?id= — renders the no-edit-id empty-state branch.
  { path: "/edit-success", pattern: "/edit-success", marker: { role: "heading", name: "Submission received" }, spec: "static" },
  { path: "/gear/nikon-z6iii/submitted", pattern: "/gear/[slug]/submitted", marker: { role: "heading", name: "Thanks for your suggestion!" }, spec: "static" },
  { path: "/learn/basics", pattern: "/learn/basics", marker: { role: "heading", name: "The Basics" }, spec: "static" },
  { path: "/invite", pattern: "/invite", marker: { role: "heading", name: "Welcome" }, spec: "static" },
  { path: "/contact", pattern: "/contact", marker: { role: "heading", name: "Let's talk!" }, spec: "static" },
  // --- community (existing seed) ---
  { path: "/news", pattern: "/news", marker: { text: NEWS_TITLE }, spec: "community" },
  { path: "/news/sharply-e2e-seed-news-post", pattern: "/news/[slug]", marker: { role: "heading", name: NEWS_TITLE }, spec: "community" },
  { path: "/lists/trending", pattern: "/lists/trending", marker: { text: GEAR.name }, spec: "community" },
  // Renders its intro copy without curated hall-of-fame seed data (none is seeded).
  { path: "/lists/hall-of-fame", pattern: "/lists/hall-of-fame", marker: { role: "heading", name: "hall of fame" }, spec: "community" },
  // Renders its intro copy without incomplete-gear seed data (none is seeded).
  { path: "/lists/under-construction", pattern: "/lists/under-construction", marker: { role: "heading", name: "Construction List" }, spec: "community" },
  // --- community (e2e fixtures, scripts/e2e/seed-fixtures.ts) ---
  { path: "/tags", pattern: "/tags", marker: { text: "E2E Seed Collection" }, spec: "community" },
  { path: "/tags/e2e-seed-collection", pattern: "/tags/[slug]", marker: { text: GEAR.name }, spec: "community" },
  { path: "/u/sharply-dev", pattern: "/u/[handle]", marker: { text: "Sharply Dev User" }, spec: "community" },
  // Shared-list gear grid uses the same split-node GearCard as /gear — see comment above.
  { path: "/list/e2e-shared-list-e2eseedpub1", pattern: "/list/[shared]", marker: { role: "link", name: GEAR.name }, spec: "community" },
  { path: "/invite/e2e-invite-fixture-0001", pattern: "/invite/[id]", marker: { text: "E2E Invitee" }, spec: "community" },
  // BrandBrowser (_components/BrandBrowser.tsx) is a client component that only
  // renders a chart's title after its brand filter button is clicked;
  // expectPageRenders never clicks, so the initial-render-visible proof that
  // the fixture chart loaded is its brand filter button ("Nikon"), not the
  // chart title text.
  { path: "/recommended-lenses", pattern: "/recommended-lenses", marker: { role: "button", name: "Nikon" }, spec: "community" },
  { path: "/recommended-lenses/nikon/e2e-seed-chart", pattern: "/recommended-lenses/[brand]/[slug]", marker: { role: "heading", name: "E2E Seed Nikon Chart" }, spec: "community" },
  // --- community (Payload fixtures, scripts/e2e/bootstrap-payload.ts) ---
  // The layout's article list (where seed learn pages appear) is collapsed
  // behind an "Open list" toggle since the editorial nav redesign, so the
  // listing asserts its own h1; the seed-data pipeline is still proven by
  // the /learn/[slug] entry below.
  { path: "/learn", pattern: "/learn", marker: { role: "heading", name: "Learn Photography" }, spec: "community" },
  { path: "/learn/sharply-e2e-seed-learn-page", pattern: "/learn/[slug]", marker: { role: "heading", name: "Sharply E2E seed learn page" }, spec: "community" },
  { path: "/reviews", pattern: "/reviews", marker: { text: "Sharply E2E seed review" }, spec: "community" },
  // The detail page's h1 is an i18n template keyed on the *gear* name
  // ("<Gear> Review"), not the review's own title — review.title only
  // renders verbatim in the subtitle <p> beneath it. Deviates from the
  // brief's role:"heading" marker for that reason.
  { path: "/reviews/sharply-e2e-seed-review", pattern: "/reviews/[slug]", marker: { text: "Sharply E2E seed review" }, spec: "community" },
  // --- tools (client-heavy static tools, no fixture data) ---
  // No ?i= pair is supplied, so CompareEmptyState renders — its heading is
  // the genuinely-rendered default state, not a data-backed comparison.
  { path: "/compare", pattern: "/compare", marker: { role: "heading", name: "Nothing to compare yet" }, spec: "tools" },
  { path: "/exif-viewer", pattern: "/exif-viewer", marker: { role: "heading", name: "Shutter Count & EXIF Viewer" }, spec: "tools" },
  { path: "/focal-length-reference", pattern: "/focal-length-reference", marker: { role: "heading", name: "Field of View Reference" }, spec: "tools" },
  { path: "/focal-simulator", pattern: "/focal-simulator", marker: { role: "heading", name: "Focal Length Simulator" }, spec: "tools" },
  // Desktop editor UI has no page h1 (one exists but only renders in the
  // mobile "Desktop Only" branch); "Aspect Ratio" is the first page-specific
  // (non-shared-chrome) heading in the always-rendered desktop controls panel.
  { path: "/instagram-post-builder", pattern: "/instagram-post-builder", marker: { role: "heading", name: "Aspect Ratio" }, spec: "tools" },
  // --- auth-gated (signed in as dev@sharply.local via tests/playwright/auth.setup.ts) ---
  // Redirects to the signed-in user's own profile — the seeded display name
  // ("Sharply Dev User") is the data-driven proof it's the dev fixture's page.
  { path: "/profile", pattern: "/profile", marker: { text: "Sharply Dev User" }, spec: "auth-gated", auth: true },
  { path: "/profile/settings", pattern: "/profile/settings", marker: { role: "heading", name: "Account Settings" }, spec: "auth-gated", auth: true },
  { path: "/profile/settings/add-passkey", pattern: "/profile/settings/add-passkey", marker: { role: "heading", name: "Add a passkey" }, spec: "auth-gated", auth: true },
  { path: `/gear/${GEAR.slug}/edit`, pattern: "/gear/[slug]/edit", marker: { role: "heading", name: "Edit Gear Item" }, spec: "auth-gated", auth: true },
  // The e2e-only developer user is granted access by seed-fixtures.ts so the
  // API key and webhook portal can be covered by browser tests.
  { path: "/developer", pattern: "/developer", marker: { role: "heading", name: "Welcome, Sharply Dev User" }, spec: "auth-gated", auth: true },
  { path: "/developer/docs", pattern: "/developer/docs", marker: { role: "heading", name: "Build with Sharply gear data" }, spec: "auth-gated", auth: true },
  // --- admin (signed in as dev@sharply.local, seeded SUPERADMIN) ---
  // Admin pages are hardcoded English (AGENTS.md) — one exception,
  // /admin/developer-api, pulls its heading from en.json via i18n, but stays
  // deterministic because admin paths are unprefixed and defaultLocale is en
  // (src/i18n/config.ts), so it always resolves to the English string. Every
  // /admin/... page also renders a shared, hidden "Admin Dashboard" <h1> from
  // the layout's header (admin-header.tsx) — never use it as a marker, it
  // can't distinguish one admin page's rendered content from another's.
  // Markers below are each page's own first page-specific heading (or, where
  // a page has none — shadcn CardTitle renders a <div>, not a heading role —
  // its visible text).
  { path: "/admin", pattern: "/admin", marker: { role: "heading", name: "Gear Edit Proposals" }, spec: "admin", auth: true },
  { path: "/admin/analytics", pattern: "/admin/analytics", marker: { role: "heading", name: "Image Requests" }, spec: "admin", auth: true },
  { path: "/admin/approved-creators", pattern: "/admin/approved-creators", marker: { role: "heading", name: "Approved Creators" }, spec: "admin", auth: true },
  // Redirects to /admin/gear — marker matches that page's own heading.
  { path: "/admin/bulk-create", pattern: "/admin/bulk-create", marker: { role: "heading", name: "Bulk Create" }, spec: "admin", auth: true },
  { path: "/admin/developer-api", pattern: "/admin/developer-api", marker: { role: "heading", name: "Developer API access" }, spec: "admin", auth: true },
  { path: "/admin/gear", pattern: "/admin/gear", marker: { role: "heading", name: "Bulk Create" }, spec: "admin", auth: true },
  { path: "/admin/help", pattern: "/admin/help", marker: { role: "heading", name: "Admin Help" }, spec: "admin", auth: true },
  // CardTitle ("Top Contributors") renders a <div>, not a heading role.
  { path: "/admin/leaderboard", pattern: "/admin/leaderboard", marker: { text: "Top Contributors" }, spec: "admin", auth: true },
  { path: "/admin/logs", pattern: "/admin/logs", marker: { role: "heading", name: "Logs" }, spec: "admin", auth: true },
  { path: "/admin/prices", pattern: "/admin/prices", marker: { role: "heading", name: "Pricing" }, spec: "admin", auth: true },
  // No page-specific heading role (CardTitle divs only); the seeded invite
  // fixture ("E2E Invitee", scripts/e2e/seed-fixtures.ts) is the data-driven
  // proof the Invites card's data actually loaded.
  { path: "/admin/private", pattern: "/admin/private", marker: { text: "E2E Invitee" }, spec: "admin", auth: true },
  { path: "/admin/tags", pattern: "/admin/tags", marker: { role: "heading", name: "Tags" }, spec: "admin", auth: true },
  { path: "/admin/tools", pattern: "/admin/tools", marker: { role: "heading", name: "Live Boosts (Today)" }, spec: "admin", auth: true },
  { path: "/admin/recommended-lenses", pattern: "/admin/recommended-lenses", marker: { role: "heading", name: "Recommended Lenses — Admin" }, spec: "admin", auth: true },
  { path: "/admin/recommended-lenses/nikon/e2e-seed-chart", pattern: "/admin/recommended-lenses/[brand]/[slug]", marker: { role: "heading", name: "Edit: nikon/e2e-seed-chart" }, spec: "admin", auth: true },
  { path: "/admin/recommended-lenses/new", pattern: "/admin/recommended-lenses/new", marker: { role: "heading", name: "Create Chart" }, spec: "admin", auth: true },
];

/** pattern -> reason. Every route in src/app either lands in routeManifest
 *  above or gets a skip entry here with a reason — see
 *  tests/unit/route-sweep-parity.test.ts, which fails the build otherwise. */
export const skippedRoutes: Record<string, string> = {
  "/gear/[slug]/[...catchAll]":
    "parallel @edit slot cleanup route; renders null and is exercised through gear edit navigation",
  "/cms/[[...segments]]": "Payload's own admin UI — not ours to sweep",
  "/ui-demo": "dev-only component gallery",
  "/construction-test": "dev-only page",
  "/auth/verify-otp": "renders only mid-auth-flow; redirects covered by routing-auth.spec",
  "/auth/welcome": "renders only mid-auth-flow post-signup",
  // /contribute/random redirects to fetchRandomLowCompletionGearUrl()'s pick —
  // confirmed nondeterministic across repeated signed-in visits (different
  // gear slug almost every time, occasionally /lists/under-construction).
  // The redirect target is itself already covered by the /gear/[slug] sweep;
  // asserting only "some heading rendered" would add coverage of the random
  // selection + redirect plumbing, but at the cost of depending on every
  // low-completion gear page's heading rendering correctly, which is already
  // the /gear/[slug] entry's job. A reasoned skip beats a flaky spec.
  "/contribute/random": "nondeterministic redirect target — landing covered by /gear/[slug] sweep",
};

export function routesForSpec(spec: SweepSpec): RouteEntry[] {
  return routeManifest.filter((route) => route.spec === spec);
}
