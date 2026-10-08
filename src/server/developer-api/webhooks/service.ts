import "server-only";

import { after } from "next/server";
import {
  DEVELOPER_WEBHOOK_DISPATCH_BATCH_SIZE,
  DEVELOPER_WEBHOOK_EVENT_TYPES,
  DEVELOPER_WEBHOOK_LOCK_TIMEOUT_MS,
  DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
  DEVELOPER_WEBHOOK_MAX_TARGETS,
  DEVELOPER_WEBHOOK_RETRY_INTERVAL_MS,
  type DeveloperWebhookEventType,
} from "../constants";
import { DeveloperApiError } from "../errors";
import { requireDeveloperPortalUser } from "../service";
import {
  cancelDeveloperWebhookDeliveryData,
  claimDueDeveloperWebhookDeliveries,
  completeDeveloperWebhookDelivery,
  createDeveloperWebhookTargetData,
  deleteDeveloperWebhookTargetData,
  listDeveloperWebhookTargetsData,
  setDeveloperWebhookTargetEnabledData,
  type ClaimedWebhookDelivery,
} from "./data";
import {
  createWebhookSigningSecret,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
  postSignedWebhook,
  resolvePublicWebhookEndpoint,
} from "./security";

type CreateWebhookTargetInput = {
  endpointUrl: unknown;
  eventType: unknown;
};

function parseEventType(value: unknown): DeveloperWebhookEventType {
  if (
    typeof value === "string" &&
    (DEVELOPER_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
  ) {
    return value as DeveloperWebhookEventType;
  }
  throw new DeveloperApiError(
    "invalid_request",
    400,
    "Choose a supported webhook event type.",
  );
}

export async function getDeveloperWebhookTargets() {
  const user = await requireDeveloperPortalUser();
  const targets = await listDeveloperWebhookTargetsData(user.id);
  return {
    maxTargets: DEVELOPER_WEBHOOK_MAX_TARGETS,
    eventTypes: DEVELOPER_WEBHOOK_EVENT_TYPES,
    targets,
  };
}

export async function createDeveloperWebhookTarget(
  input: CreateWebhookTargetInput,
) {
  const user = await requireDeveloperPortalUser();
  const eventType = parseEventType(input.eventType);
  if (typeof input.endpointUrl !== "string") {
    throw new DeveloperApiError(
      "invalid_request",
      400,
      "A valid HTTPS webhook URL is required.",
    );
  }

  let endpointUrl: string;
  try {
    const resolved = await resolvePublicWebhookEndpoint(
      input.endpointUrl.trim(),
    );
    endpointUrl = resolved.url.toString();
  } catch (error) {
    throw new DeveloperApiError(
      "invalid_request",
      400,
      error instanceof Error
        ? error.message
        : "Enter a valid public HTTPS URL.",
    );
  }

  const secret = createWebhookSigningSecret();
  const result = await createDeveloperWebhookTargetData({
    userId: user.id,
    eventType,
    endpointUrl,
    signingSecretCiphertext: encryptWebhookSigningSecret(secret),
    maxTargets: DEVELOPER_WEBHOOK_MAX_TARGETS,
  });
  if (result.status === "access_disabled") {
    throw new DeveloperApiError(
      "developer_access_required",
      403,
      "Developer API access has not been enabled for this account.",
    );
  }
  if (result.status === "limit_reached") {
    throw new DeveloperApiError(
      "target_limit_reached",
      409,
      `You can have up to ${DEVELOPER_WEBHOOK_MAX_TARGETS} webhook targets.`,
    );
  }

  return { target: result.target, secret };
}

export async function setDeveloperWebhookTargetEnabled(params: {
  targetId: string;
  enabled: boolean;
}) {
  const user = await requireDeveloperPortalUser();
  const updated = await setDeveloperWebhookTargetEnabledData({
    ...params,
    userId: user.id,
  });
  if (!updated) {
    throw new DeveloperApiError("not_found", 404, "Webhook target not found.");
  }
}

export async function deleteDeveloperWebhookTarget(targetId: string) {
  const user = await requireDeveloperPortalUser();
  const deleted = await deleteDeveloperWebhookTargetData({
    targetId,
    userId: user.id,
  });
  if (!deleted) {
    throw new DeveloperApiError("not_found", 404, "Webhook target not found.");
  }
}

async function processClaimedDelivery(
  delivery: ClaimedWebhookDelivery,
  now: Date,
) {
  if (!delivery.userAccessEnabled || !delivery.targetEnabled) {
    await cancelDeveloperWebhookDeliveryData(delivery.id);
    return "canceled" as const;
  }

  try {
    const secret = decryptWebhookSigningSecret(
      delivery.signingSecretCiphertext,
    );
    const result = await postSignedWebhook({
      endpointUrl: delivery.endpointUrl,
      secret,
      payload: delivery.payload,
      now,
    });
    await completeDeveloperWebhookDelivery({
      id: delivery.id,
      attemptCount: delivery.attemptCount,
      now,
      succeeded: result.succeeded,
      statusCode: result.statusCode,
      error: result.succeeded
        ? undefined
        : `Endpoint returned HTTP ${result.statusCode}.`,
      maxAttempts: DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
      retryIntervalMs: DEVELOPER_WEBHOOK_RETRY_INTERVAL_MS,
    });
    return result.succeeded ? ("delivered" as const) : ("retry" as const);
  } catch (error) {
    await completeDeveloperWebhookDelivery({
      id: delivery.id,
      attemptCount: delivery.attemptCount,
      now,
      succeeded: false,
      error:
        error instanceof Error ? error.message : "Webhook delivery failed.",
      maxAttempts: DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
      retryIntervalMs: DEVELOPER_WEBHOOK_RETRY_INTERVAL_MS,
    });
    return "retry" as const;
  }
}

export async function dispatchDueDeveloperWebhookDeliveries(now = new Date()) {
  const deliveries = await claimDueDeveloperWebhookDeliveries({
    now,
    staleLockBefore: new Date(
      now.getTime() - DEVELOPER_WEBHOOK_LOCK_TIMEOUT_MS,
    ),
    limit: DEVELOPER_WEBHOOK_DISPATCH_BATCH_SIZE,
  });
  const counts = {
    claimed: deliveries.length,
    delivered: 0,
    retrying: 0,
    canceled: 0,
  };

  // Small parallel batches keep a slow endpoint from blocking every other target.
  for (let index = 0; index < deliveries.length; index += 10) {
    const batch = deliveries.slice(index, index + 10);
    const results = await Promise.all(
      batch.map((delivery) => processClaimedDelivery(delivery, now)),
    );
    for (const result of results) {
      if (result === "delivered") counts.delivered += 1;
      else if (result === "canceled") counts.canceled += 1;
      else counts.retrying += 1;
    }
  }
  return counts;
}

export function scheduleDeveloperWebhookDispatch() {
  try {
    after(async () => {
      try {
        await dispatchDueDeveloperWebhookDeliveries();
      } catch (error) {
        console.error(
          "[developer-webhooks] post-response dispatch failed",
          error,
        );
      }
    });
  } catch (error) {
    // A cron sweep remains the durable recovery path outside a request context.
    console.error(
      "[developer-webhooks] immediate dispatch was not scheduled",
      error,
    );
  }
}
