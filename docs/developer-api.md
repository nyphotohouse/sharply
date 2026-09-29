# Developer API

Sharply’s developer API is a gated beta for published photography gear data. It is free during the beta and currently exposes read-only endpoints under `/api/v1`.

## Access and keys

- An administrator enables developer access for a user from `/admin/developer-api`.
- Approved users manage up to three active keys at `/developer`.
- Approved users can review the in-product endpoint guide at `/developer/docs`.
- Keys use the `sharply_live_` prefix and are displayed only when created. The database stores a SHA-256 hash, not the secret.
- Removing developer access immediately revokes all of the user’s keys.
- Send keys with `Authorization: Bearer sharply_live_...`. Use the API from your server or another trusted backend. Browser calls are not supported because the API does not send CORS headers; never place a key in browser code or a public client bundle.

## Rate limit and usage

Each key is limited to 60 total requests per fixed UTC minute. Successful and application-level failed requests made by an authenticated, non-rate-limited key count toward the daily usage totals shown in the portal. Invalid-key and rate-limited requests do not count.

Responses include `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Rate-limit errors return `429` with the standard error response.

## Endpoints

### `GET /api/v1/search`

Required query parameter: `q` (2–200 characters). Optional `page` defaults to 1 and `limit` defaults to 20 (maximum 25).

Returns a ranked page of published results:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
  "meta": { "requestId": "..." }
}
```

Search results include the same price fields as the full gear response. Prefer
`estimatedUsedPrice` and `mpbMaxPriceUsdCents` are both available; the latter
contains the MPB-specific USD price.

### `GET /api/v1/search/suggestions`

Required query parameter: `q` (2–200 characters). Optional `limit` defaults to 8 (maximum 10). Optional `region` defaults to `GLOBAL` and accepts `GLOBAL`, `US`, `EU`, or `JP`. A regional alias is returned when the requested region has one; otherwise the canonical name is used.

### `GET /api/v1/catalog`

Downloads one shared, lightweight snapshot of every published gear record. It is
slug-sorted and contains only `name`, `slug`, `brandName`, `gearType`,
`thumbnailUrl`, `releaseDate`, `releaseDatePrecision`, `announcedDate`,
`announceDatePrecision`, `discontinuedDate`, and `discontinuedDatePrecision`
for each item. It deliberately excludes specifications,
aliases, samples, colourways, prices, IDs, and audit metadata.

```json
{
  "version": "sha256-...",
  "generatedAt": "2026-07-15T15:00:00.000Z",
  "itemCount": 123,
  "data": []
}
```

`version` is a SHA-256 hash of the deterministic `data` array. The endpoint
returns the same value as a quoted `ETag`; `generatedAt` is fixed for the cached
snapshot and does not affect the version. Send a standard `If-None-Match` header
to revalidate a locally stored snapshot. Matching strong or weak tags,
comma-separated tags, and `*` receive `304 Not Modified` with `ETag`, request,
rate-limit, and cache headers. A `200` response also includes the normal
`meta.requestId`.

```sh
curl -i -H "Authorization: Bearer sharply_live_..." \
  -H 'If-None-Match: "sha256-..."' \
  https://www.sharplyphoto.com/api/v1/catalog
```

The endpoint sends `Cache-Control: private, max-age=0, must-revalidate` and
`Vary: Authorization, If-None-Match`. Its shared server snapshot is invalidated
when published catalog membership or an included catalog field changes.

### `GET /api/v1/gear/random-low-completion`

Returns the canonical URL of a random published gear page that would benefit
from more catalog data. The primary selection pool matches
`/lists/under-construction`: items with at least one required field missing or
less than 40% overall completion. When that pool is empty, the endpoint chooses
from the 20 published items with the lowest completion percentage.

The response is not cached, and repeated requests may return the same item. If
there is no published gear, the endpoint still returns `200` with a null URL.

```json
{
  "data": {
    "url": "https://www.sharplyphoto.com/gear/nikon-z6iii"
  },
  "meta": { "requestId": "..." }
}
```

### `GET /api/v1/gear/:slug`

Returns the complete currently publishable catalog record, including available related specifications, aliases, media, and colourways. The response keeps its established field names: `brands`, flattened image URL fields including side-view URLs, `regionalAliases`, and `colorways`.

The response is an explicit public allowlist. It includes catalog identity, release and price data, dimensions, public links, approved relation fields, and type-specific specification values. `mounts` contains `{ value, shortName }` records from the gear-to-mount relationship. `predecessor` and `successor` are nullable `{ slug, name }` objects describing the adjacent product lineage. `cameraSpecs.sensorFormat` and `lensSpecs.imageCircle` / `fixedLensSpecs.imageCircle` contain `{ slug, name, cropFactor }` when the referenced sensor format exists, otherwise `null`.

Price fields are exposed as follows:

- `estimatedUsedPrice` is a nullable object keyed by market (`US`, `UK`, or
  `EU`). Each market entry contains `low`, `typical`, and `high` integer minor
  units, plus `asOf`, `status`, `sourceCount`, `observationCount`, and
  `methodVersion`. Currency is inferred from the market: USD, GBP, or EUR.
  `current` and `stale` entries are both valid display estimates; an absent or
  unavailable entry should be treated as no estimate.
- `mpbMaxPriceUsdCents` contains the MPB-specific used price in USD cents and
  remains available for MPB integrations. `estimatedUsedPrice` contains the
  source-independent estimate, while the MSRP fields represent new pricing.

Digital and analog camera specification objects expose nullable `viewfinderEyePointMm` values in millimeters alongside their viewfinder type.

```json
{
  "data": {
    "slug": "canon-eos-r5-mark-ii",
    "predecessor": { "slug": "canon-eos-r5", "name": "Canon EOS R5" },
    "successor": null
  }
}
```

Lineage is intentionally available only on this full gear endpoint; catalog, search, suggestion, selected-spec, and random-low-completion responses remain lightweight and do not include it.

Primary and foreign keys, audit timestamps, search helpers, publication workflow state, genre tags, raw samples, selected colourway IDs, internal notes, video-mode matrices, and flexible `extra` JSON are never returned. Camera full-gear responses include native ISO values as `cameraSpecs.isoMin`/`isoMax`, optional expanded values as `cameraSpecs.isoMinExpanded`/`isoMaxExpanded`, and native base ISO values as the ascending, deduplicated `cameraSpecs.baseIso: number[] | null`. Adding a public field requires an intentional serializer, contract, and documentation update. Hidden and rumored gear return `404`.

### `GET /api/v1/specs`

Returns the live catalog of selectable specs. Categories such as `camera.sensor` are stable API groupings and intentionally do not mirror the website’s specs-table sections. The catalog reflects the currently deployed registry and sends `Cache-Control: no-store`.

### `GET /api/v1/gear/:slug/specs`

Requires a `fields` query parameter containing one to 50 comma-separated exact field IDs, categories, or a mix of both. For example: `fields=camera.sensor,lens-optics.focalLength`.

Category selectors expand in API registry order; overlapping selectors are deduplicated. Unknown selectors return `400 invalid_request`. Applicable specs without a value are omitted.

Each row returns durable raw data and a helpful current display string:

```json
{
  "id": "camera.sensor.isoRange",
  "raw": { "min": 100, "max": 51200 },
  "display": "ISO 100–51,200"
}
```

Treat `id` and `raw` as the durable contract. `display` is English current presentation output and can change.

Expanded digital-camera ISO is available as `camera.sensor.isoExpandedRange`. Its raw value is `{ "min": number | null, "max": number | null }`, and partial bounds are retained; for example, a minimum-only value displays as `ISO 50+` and a maximum-only value as `ISO ≤ 204,800`.

## Error format

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "The supplied API key is invalid."
  },
  "meta": { "requestId": "..." }
}
```

Possible v1 codes include `missing_api_key`, `invalid_api_key`, `invalid_request`, `not_found`, and `rate_limit_exceeded`.

## Implementation boundary

All public API-specific logic belongs in `src/server/developer-api/**`. Public routes are thin HTTP adapters and reuse the existing `server/search/service.ts` and `server/gear/service.ts` domain services. They do not call the website’s `/api/*` routes or database layer directly.
