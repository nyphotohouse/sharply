# CamPricer integration

CamPricer is a second-party aggregate price provider, automatically connected
through Sharply slugs. MPB and KameraStore remain individually mapped retailer
sources. The integration is implemented in `src/server/pricing/campricer.ts`.

## Collection and connections

The existing daily `/api/admin/pricing/refresh` cron runs the retailer batch and
then the CamPricer bulk import. Retailer requests time out after 20 seconds;
the retailer batch has a 90-second budget, leaving time in the 300-second cron
for CamPricer. Remaining mappings stay due and the run records partial completion. Either batch can fail without preventing the
other from running. CamPricer mappings are excluded from individual fetch
queues and editor refresh controls.

The importer requests `/api/v1/models?sharply=1&currency=EUR&per_page=1000&page=N`.
It makes at most two sequential requests per UTC day, with two seconds between
requests, a 20-second timeout, and no immediate retries. One request currently
covers the linked catalog. Each request reserves budget before contacting the
provider; failed requests count too. Redirects are rejected to avoid forwarding
credentials to another host.

Match `sharply_slug` exactly; unknown slugs never create gear. Matching models
receive internal mappings automatically, including models without reliable
prices. Accept only positive integer estimates with `thin: false`, valid upstream
timestamps, and valid evidence URLs. Evidence URL origins are currently unrestricted
to accommodate provider domain changes. Null/thin estimates add no price;
previous accepted evidence ages normally. Only the point, timestamp and evidence
URL are retained. Repeated mapping/timestamp snapshots are deduplicated.

One EUR mapping represents pooled international evidence. It is not a native EU
market quote. Projection rebuilds convert it locally for US/UK using the shared
exchange-rate service and persist original values, conversion rates and their
date in estimate inputs. Without usable rates, new converted evidence is omitted.
Existing prices survive transient conversion failures during normal imports.

The management modal shows **CamPricer connected**, latest price/check state, and
one disable/enable control. Disabling excludes evidence and prevents new imports
for that gear. Enabling resumes collection and reuses accepted evidence. Import
upserts never reactivate disabled connections. Creating, editing, deleting or
individually fetching these mappings is rejected by services.

## Redis state and recovery

Use the existing Upstash credentials (`UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN`, or legacy `UPSTASH_KV_REST_API_URL` /
`UPSTASH_KV_REST_API_TOKEN`). State is namespaced by environment; preview branches
and local project URLs are isolated from production.

Redis stores the next page, known page count, per-page ETags, next eligible time,
daily budget and a 15-minute execution lease. Budgets expire after two days;
cursor state has no automatic expiry. Budget reservation and lease release use
atomic scripts. ETags/cursors are committed only after processing the whole page.

Unchanged pages return `304`; use their saved page count and move forward. If
a saved page disappears (HTTP 404 beyond page 1, or a response reporting fewer
pages), clear page ETags and restart at page 1 within the same two-request budget. At the
cap, continue tomorrow rather than starving later alphabetic slugs. Wrap to page
1 after the final page and wait until the next UTC day. Numbered pagination is
not a frozen snapshot: catalog additions can shift boundaries; repeated cycles
and database deduplication provide eventual coverage.

After collection, recalculate active CamPricer gear from stored observations,
even on `304`, provider failures, missing credentials or a spent request budget.
This requires no additional CamPricer requests and updates local exchange-rate
conversions and freshness. Disabled sources are excluded. A concurrent import
that already holds the lease is skipped. Identical rounded prices still do not
create history rows.

Stop on `429`, persist `Retry-After` (seconds or HTTP date), and do not retry early.
Other failures leave the current page pending. Redis failure skips this source
and is logged without interrupting retailers. Lost cursor state restarts at page
1. Losing all Redis state also loses the transient request budget; database
observations remain safe to replay. Redis is therefore required for ingestion,
not for displaying prices.

## Observability and storage

No new tables are introduced. Existing `gear_price_fetch_runs` rows distinguish
`MAPPING_REFRESH` from `SOURCE_IMPORT`; source imports identify `campricer` and
store typed JSON summaries: request/page outcomes, durations, cursors, next
eligibility, import/unchanged/thin/invalid/unmatched/disabled counts and errors.
Existing run items record matched gear outcomes. Unknown models and page errors
remain in the summary, rather than fabricated gear rows.

The existing `/admin/prices` scheduled-run log labels imports separately and
shows summary/page details alongside gear results. Missing credentials, lock
contention and budget exhaustion are visible skip reasons. Errors are generic;
provider response bodies, API keys and authorization headers are never logged.

## Configuration and deployment

Set server-only `CAMPRICER_API_KEY`. Missing credentials skip the import. No key
is embedded in the frontend or repository.

The existing schema gains run kind/source/summary fields and estimate input
snapshots. Generate and apply the additive migration through the project's
normal workflow before running this code. Agents do not generate migrations or
push schema. Existing mappings, estimates and displayed projections are retained.
The daily retailer batch idempotently normalizes legacy observation ranges to
midpoint points; this does not alter saved estimates or clear displayed prices.

CamPricer's published API requires naming and linking the provider wherever its
figures are displayed. Public attribution UI is deferred; arrange attribution or
an agreed exception before production activation. Provider documentation:
https://campricer.psavela.com/api.

## Estimate history volume

New evidence does not automatically create an estimate history row. History is
written only when rounded low/typical/high changes from the latest estimate for
that gear, market and price kind (or currency changes). Source input and timestamp
changes still refresh the current projection. Observation history remains intact.
