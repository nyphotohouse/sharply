## AI Review Summaries

This document describes the implemented AI review summary system for gear pages. It supersedes the initial plan in `docs/ai-review-summary-plan.md` where relevant and reflects the current production code.

---

### Goals

- Provide a short, natural-language blurb that summarizes user reviews for a gear item (cameras only for phase 1).
- Keep cost low and writes infrequent (cooldown windows).
- Keep configuration centralized with a single surface for prompt/model tweaks.

---

### Overall Structure

- Data layer (`server-only`):
  - `src/server/reviews/summary/data.ts`
    - `countApprovedReviewsForGear(gearId)`
    - `fetchRecentApprovedReviews(gearId, limit)`
    - `getReviewSummaryRow(gearId)`
    - `upsertReviewSummary({ gearId, summaryText })`
    - `isSummaryOlderThanDays(gearId, days)`
    - `backdateSummaryTimestamp(gearId, daysAgo)` (testing aid)

- Service layer (`server-only`):
  - `src/server/reviews/summary/service.ts`
    - `maybeGenerateReviewSummary({ gearId, gearName })`: applies conditions and writes a new summary if needed
    - `fetchReviewSummary(gearId)`: read helper for UI
    - `generateReviewSummaryFromProvidedReviews(...)`: script/testing helper
    - Uses centralized prompt configuration from `prompt-config.ts`

- Prompt configuration (single tuning surface):
  - `src/server/reviews/summary/prompt-config.ts`
    - `SUMMARY_MODEL`, `SUMMARY_TEMPERATURE`, `SUMMARY_SYSTEM_MESSAGE`
    - `buildSummaryPrompt({ gearName, previousSummary, reviews, maxCharsPerReview })`
    - This is the only place you should change model, temperature, instructions, or prompt wording

- OpenAI client:
  - `src/lib/open-ai/open-ai.ts` (reads `OPENAI_API_KEY`)

- Review hooks (trigger generation attempts):
  - `src/server/gear/service.ts → submitReview(...)`
    - After moderation pass + auto-approval, calls `maybeGenerateReviewSummary` in the background.
  - `src/server/gear/service.ts → deleteOwnReview(...)`
    - After owner deletion, calls `maybeGenerateReviewSummary` in the background.
  - `src/server/admin/reviews/service.ts → approveReview(...)`
    - After approval, calls `maybeGenerateReviewSummary` in the background.
  - `src/server/admin/reviews/service.ts → rejectReportedReview(...)`
    - After moderation rejection of a flagged approved review, calls `maybeGenerateReviewSummary` in the background.

- UI integration:
  - Banner (server component): `src/app/[locale]/(pages)/gear/_components/ai-review-banner.tsx`
    - Fetches summary via service and renders immediately on the server
  - Reviews section (client component): `src/app/[locale]/(pages)/gear/_components/gear-reviews.tsx`
    - Accepts `bannerSlot` so the server banner is shown instantly
    - Only the reviews list is fetched on the client (skeletons shown while loading)
  - Page composition: `src/app/[locale]/(pages)/gear/[slug]/page.tsx`
    - Renders `<AiReviewBanner />` and passes it into `<GearReviews bannerSlot={...} />`

---

### Database Schema

- Source file: `src/server/db/schema.ts`
- Table: `app.review_summaries`
  - `gear_id` (PK, FK → `gear.id`)
  - `summary_text` (text)
  - `updated_at` (timestamptz, default now)

Notes

- One row per gear. Regeneration overwrites `summary_text` and updates `updated_at`.
- As with all schema changes, migrations are generated and pushed by the developer workflow—do not apply manual SQL in code.

---

### Generation Rules

- Trigger: on review events that affect approved review corpus (auto-approved submit, admin approve, owner delete, reported-review reject)
- Conditions (in `SUMMARY_CONFIG`):
  - `minReviews`: 10 approved reviews required
  - `sampleSize`: up to 40 most recent approved reviews
  - `maxCharsPerReview`: ~600 chars per review included in the prompt
  - `cooldownDays`: 7 days; if a summary exists and is fresher than this, skip
- Model: `gpt-4.1-mini` (configurable in `prompt-config.ts`)
- Logging: verbose console logs prefixed with `[ai-summary]` and `[ai-summary:data]`

---

### How To Adjust the Prompt (Single Surface)

Edit `src/server/reviews/summary/prompt-config.ts`:

- **Model/temperature**: `SUMMARY_MODEL`, `SUMMARY_TEMPERATURE`
- **System message**: `SUMMARY_SYSTEM_MESSAGE` (camera-focused, neutral editorial tone)
- **Prompt composition**: `buildSummaryPrompt(...)`
  - You can tweak wording, review truncation, and how metadata (recommend/genres) is injected.

No other files should need changes when tuning the prompt.

---

### Testing & Scripts

- Sample data:
  - `src/server/reviews/summary/sample-reviews.json` (10 camera-focused items)

- Script: generate a fake summary by gear slug
  - `scripts/generate-fake-review-summary.ts`
  - Loads `.env` via `dotenv`. For local execution, skip strict Next env validation:

```bash
SKIP_ENV_VALIDATION=1 npm run reviews:generate-fake-summary -- --slug nikon-z6-iii --use-sample
```

- Optional backdate to test cooldown logic:

```bash
SKIP_ENV_VALIDATION=1 npm run reviews:generate-fake-summary -- --slug nikon-z6-iii --use-sample --backdate-days 8
```

Requirements

- `.env` must include `OPENAI_API_KEY` and a valid `DATABASE_URL` (when connecting to a DB).
- The script writes/overwrites the summary row for the targeted gear.

E2E Test Strategy

- Use the script in test setup to seed a summary for a known slug, then assert that the gear page renders the banner SSR without network waterfalls.

---

### UI Behavior

- The AI summary banner is server-rendered and appears immediately.
- The reviews list is fetched client-side; skeletons are shown while loading.
- The "Write a Review" CTA is a single button whose `loading` prop reflects auth state probing; if unauthenticated, clicking redirects to sign-in with a proper `callbackUrl`.

---

### Future Improvements

- Consider a cron-based periodic refresh for highly active gear.
- Incremental updates: incorporate only the newest reviews to evolve the summary.
- Locale-awareness and tone adjustments (e.g., longer/shorter mode toggles in prompt config).
- Add editor tools to review/override AI summaries and capture feedback.
- Guardrails: length checks, profanity filters, or explicit negative-content limits.
- Observability: record generation duration, token counts, and provider response metadata for cost tracking.

---

### Environment & Deployment Notes

- `OPENAI_API_KEY` is optional in all environments, including production. The OpenAI client is initialized in `src/lib/open-ai/open-ai.ts` only when a non-blank key is configured.
- Without a key, automatic generation skips before database or API calls, and the summary read helper returns `null` so banners stay hidden. Existing stored summaries are preserved. The explicit script/testing generation helper reports a missing-key error.
- For scripts outside Next runtime, `server-only` imports are guarded and `.env` is loaded via `dotenv`.
- Follow server layering (`data → service → actions`) per `docs/server-structure.md`. Reads live in services; actions are only for client-triggered mutations (not used here).

---

### Quick Reference

- Prompt surface: `src/server/reviews/summary/prompt-config.ts`
- Generation service: `src/server/reviews/summary/service.ts`
- Data helpers: `src/server/reviews/summary/data.ts`
- Review hooks: `src/server/gear/service.ts`, `src/server/admin/reviews/service.ts`
- UI banner: `src/app/[locale]/(pages)/gear/_components/ai-review-banner.tsx`
- Reviews wrapper: `src/app/[locale]/(pages)/gear/_components/gear-reviews.tsx`
- Seeding script: `scripts/generate-fake-review-summary.ts`
