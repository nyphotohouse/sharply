# Developer webhooks

Approved developers can configure webhook targets in the developer portal at `/developer`. A target is one HTTPS endpoint subscribed to one event type. The current limit is three targets per developer account; paused targets still count toward the limit.

## Available event

### `gear.created`

This event fires once when a gear item first becomes publicly available. Gear created as published emits the event during creation. Rumored or hidden gear does not emit it; a later transition to published emits it then. The event is one-time even if the item is hidden and published again later.

The event contains the public gear identity and canonical URLs:

```json
{
  "id": "f3483f3a-c820-4f08-864f-e5f1f6fe3886",
  "type": "gear.created",
  "createdAt": "2026-10-08T15:04:05.000Z",
  "data": {
    "slug": "nikon-z6-iii",
    "name": "Nikon Z6 III",
    "gearType": "CAMERA",
    "url": "https://www.sharplyphoto.com/gear/nikon-z6-iii",
    "apiUrl": "https://www.sharplyphoto.com/api/v1/gear/nikon-z6-iii"
  }
}
```

## Verify a delivery

The developer portal shows the target's `whsec_...` signing secret only once, immediately after creation. Store it securely. Sharply stores an encrypted copy so it can sign deliveries; the encryption key is configured through `DEVELOPER_WEBHOOK_ENCRYPTION_KEY`.

Every request includes:

- `X-Sharply-Event-Id`: stable event ID. Use it as an idempotency key because a retry can deliver an event more than once.
- `X-Sharply-Timestamp`: Unix timestamp in seconds.
- `X-Sharply-Signature`: `v1=<hex digest>`.

The signature is HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed by the exact signing secret shown by Sharply. Verify against the raw request body before parsing JSON. Compare digests in constant time and reject timestamps outside a short tolerance window.

Example verification in Node.js:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySharplyWebhook(params: {
  rawBody: Buffer;
  timestamp: string;
  signatureHeader: string;
  secret: string;
}) {
  const timestampSeconds = Number(params.timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const supplied = /^v1=([a-f0-9]{64})$/.exec(params.signatureHeader)?.[1];
  if (!supplied) return false;

  const expected = createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.rawBody.toString("utf8")}`)
    .digest();
  const received = Buffer.from(supplied, "hex");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
```

Read and retain the raw request body in your framework's request handler before JSON parsing it. After a signature is verified, parse the body and deduplicate using `id` or `X-Sharply-Event-Id`.

## Delivery and retries

Sharply records the event and matching per-target deliveries in the same database transaction as the publication change. Delivery starts promptly after that change. A five-minute scheduled sweep recovers pending work if immediate dispatch is interrupted.

A 2xx response marks the delivery successful. Network failures and non-2xx responses are failures. Sharply makes at most two retries after the initial attempt, with five minutes between attempts. Delivery is at least once, so endpoints should be idempotent. Redirects are not followed.

Targets must use HTTPS and resolve to public IP addresses. Private, loopback, link-local, and local destinations are rejected when configured and checked again before delivery. The resolved public address is pinned for each outbound request.

## Target lifecycle and developer access

Targets can be paused, resumed, or deleted in the developer portal. Paused targets count toward the account's three-target limit. Disabling a target cancels pending deliveries. Deleting a target removes its delivery records.

Removing developer access pauses every target and cancels pending sends. Restoring access leaves targets paused until their owner resumes them. Existing API keys are revoked by the developer-access policy as documented in the [developer API overview](api/overview.md).

The admin Developer API page shows the latest 100 webhook targets and the latest 100 delivery records. Delivery rows include the owner, endpoint, event, current status, attempt count, last attempt time, HTTP status, and latest error. Each row summarizes one event-to-target delivery and keeps the latest result rather than a full log of every attempt. Signing secrets are never shown. The v1 developer portal does not expose delivery history or a test-send action.

## Deployment configuration

Set `DEVELOPER_WEBHOOK_ENCRYPTION_KEY` in every production environment. Generate a 32-byte key with:

```bash
openssl rand -hex 32
```

Keep the value stable across deployments and backups. Losing or replacing it makes existing target secrets unreadable. The five-minute retry sweep is configured in `vercel.json` and uses `CRON_SECRET` like other protected cron routes.

The schema includes webhook target, event, and delivery tables. Per repository database instructions, contributors update the Drizzle schema but do not generate or apply migrations; operators must generate and apply the migration before deploying this feature.
