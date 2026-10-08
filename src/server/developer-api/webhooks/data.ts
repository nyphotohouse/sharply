import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  developerWebhookDeliveries,
  developerWebhookEvents,
  developerWebhookTargets,
  users,
} from "~/server/db/schema";
import {
  DEVELOPER_WEBHOOK_EVENT_TYPES,
  DEVELOPER_WEBHOOK_ADMIN_RECENT_LIMIT,
  type DeveloperWebhookEventType,
} from "../constants";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GearCreatedWebhookData = {
  gearId: string;
  name: string;
  slug: string;
  gearType: string;
  publicBaseUrl: string;
  now?: Date;
};

/**
 * Writes one immutable public event and snapshots the matching active
 * destinations in the same transaction as the catalog publication.
 */
export async function enqueueGearCreatedWebhookEvent(
  tx: DbTransaction,
  input: GearCreatedWebhookData,
) {
  const now = input.now ?? new Date();
  const id = randomUUID();
  const payload = {
    id,
    type: "gear.created" as const,
    createdAt: now.toISOString(),
    data: {
      slug: input.slug,
      name: input.name,
      gearType: input.gearType,
      url: new URL(
        `/gear/${encodeURIComponent(input.slug)}`,
        input.publicBaseUrl,
      ).toString(),
      apiUrl: new URL(
        `/api/v1/gear/${encodeURIComponent(input.slug)}`,
        input.publicBaseUrl,
      ).toString(),
    },
  };

  const inserted = await tx
    .insert(developerWebhookEvents)
    .values({
      id,
      eventType: "gear.created",
      gearId: input.gearId,
      payload,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [developerWebhookEvents.eventType, developerWebhookEvents.gearId],
    })
    .returning({ id: developerWebhookEvents.id });

  if (inserted.length === 0) return null;

  const targets = await tx
    .select({ id: developerWebhookTargets.id })
    .from(developerWebhookTargets)
    .innerJoin(users, eq(developerWebhookTargets.userId, users.id))
    .where(
      and(
        eq(developerWebhookTargets.eventType, "gear.created"),
        eq(developerWebhookTargets.isEnabled, true),
        eq(users.developerAccessEnabled, true),
      ),
    );

  if (targets.length > 0) {
    await tx
      .insert(developerWebhookDeliveries)
      .values(
        targets.map(({ id: targetId }) => ({
          eventId: id,
          targetId,
          status: "PENDING",
          attemptCount: 0,
          nextAttemptAt: now,
          createdAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  return id;
}

export async function listDeveloperWebhookTargetsData(userId: string) {
  return db
    .select({
      id: developerWebhookTargets.id,
      eventType: developerWebhookTargets.eventType,
      endpointUrl: developerWebhookTargets.endpointUrl,
      isEnabled: developerWebhookTargets.isEnabled,
      createdAt: developerWebhookTargets.createdAt,
    })
    .from(developerWebhookTargets)
    .where(eq(developerWebhookTargets.userId, userId))
    .orderBy(asc(developerWebhookTargets.createdAt));
}

/** Recent target summaries for the administrator's webhook observability view. */
export async function listDeveloperWebhookTargetsForAdminData() {
  return db
    .select({
      id: developerWebhookTargets.id,
      eventType: developerWebhookTargets.eventType,
      endpointUrl: developerWebhookTargets.endpointUrl,
      isEnabled: developerWebhookTargets.isEnabled,
      createdAt: developerWebhookTargets.createdAt,
      userName: users.name,
      userEmail: users.email,
      developerAccessEnabled: users.developerAccessEnabled,
    })
    .from(developerWebhookTargets)
    .innerJoin(users, eq(developerWebhookTargets.userId, users.id))
    .orderBy(desc(developerWebhookTargets.createdAt))
    .limit(DEVELOPER_WEBHOOK_ADMIN_RECENT_LIMIT);
}

/** Recent delivery state and last-attempt details, without selecting secrets. */
export async function listDeveloperWebhookDeliveriesForAdminData() {
  return db
    .select({
      id: developerWebhookDeliveries.id,
      eventId: developerWebhookEvents.id,
      eventType: developerWebhookEvents.eventType,
      gearSlug: sql<
        string | null
      >`${developerWebhookEvents.payload}->'data'->>'slug'`,
      endpointUrl: developerWebhookTargets.endpointUrl,
      status: developerWebhookDeliveries.status,
      attemptCount: developerWebhookDeliveries.attemptCount,
      lastAttemptAt: developerWebhookDeliveries.lastAttemptAt,
      nextAttemptAt: developerWebhookDeliveries.nextAttemptAt,
      deliveredAt: developerWebhookDeliveries.deliveredAt,
      lastStatusCode: developerWebhookDeliveries.lastStatusCode,
      lastError: developerWebhookDeliveries.lastError,
      createdAt: developerWebhookDeliveries.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(developerWebhookDeliveries)
    .innerJoin(
      developerWebhookEvents,
      eq(developerWebhookDeliveries.eventId, developerWebhookEvents.id),
    )
    .innerJoin(
      developerWebhookTargets,
      eq(developerWebhookDeliveries.targetId, developerWebhookTargets.id),
    )
    .innerJoin(users, eq(developerWebhookTargets.userId, users.id))
    .orderBy(
      desc(
        sql`coalesce(${developerWebhookDeliveries.lastAttemptAt}, ${developerWebhookDeliveries.createdAt})`,
      ),
    )
    .limit(DEVELOPER_WEBHOOK_ADMIN_RECENT_LIMIT);
}

export async function createDeveloperWebhookTargetData(params: {
  userId: string;
  eventType: DeveloperWebhookEventType;
  endpointUrl: string;
  signingSecretCiphertext: string;
  maxTargets: number;
}) {
  return db.transaction(async (tx) => {
    // Serialize creation and access revocation for this user.
    const account = await tx
      .select({ enabled: users.developerAccessEnabled })
      .from(users)
      .where(eq(users.id, params.userId))
      .for("update")
      .limit(1);
    if (!account[0]?.enabled) return { status: "access_disabled" as const };

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('developer-webhook-targets'), hashtext(${params.userId}))`,
    );
    const existing = await tx
      .select({ count: sql<number>`count(*)` })
      .from(developerWebhookTargets)
      .where(eq(developerWebhookTargets.userId, params.userId));
    if (Number(existing[0]?.count ?? 0) >= params.maxTargets) {
      return { status: "limit_reached" as const };
    }

    const rows = await tx
      .insert(developerWebhookTargets)
      .values({
        userId: params.userId,
        eventType: params.eventType,
        endpointUrl: params.endpointUrl,
        signingSecretCiphertext: params.signingSecretCiphertext,
      })
      .returning({
        id: developerWebhookTargets.id,
        eventType: developerWebhookTargets.eventType,
        endpointUrl: developerWebhookTargets.endpointUrl,
        isEnabled: developerWebhookTargets.isEnabled,
        createdAt: developerWebhookTargets.createdAt,
      });

    return { status: "created" as const, target: rows[0]! };
  });
}

export async function setDeveloperWebhookTargetEnabledData(params: {
  targetId: string;
  userId: string;
  enabled: boolean;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(developerWebhookTargets)
      .set({ isEnabled: params.enabled, updatedAt: new Date() })
      .where(
        and(
          eq(developerWebhookTargets.id, params.targetId),
          eq(developerWebhookTargets.userId, params.userId),
        ),
      )
      .returning({ id: developerWebhookTargets.id });
    if (!rows[0]) return false;

    if (!params.enabled) {
      await tx
        .update(developerWebhookDeliveries)
        .set({ status: "CANCELED", lockedAt: null })
        .where(
          and(
            eq(developerWebhookDeliveries.targetId, params.targetId),
            inArray(developerWebhookDeliveries.status, [
              "PENDING",
              "PROCESSING",
            ]),
          ),
        );
    }
    return true;
  });
}

export async function deleteDeveloperWebhookTargetData(params: {
  targetId: string;
  userId: string;
}) {
  const rows = await db
    .delete(developerWebhookTargets)
    .where(
      and(
        eq(developerWebhookTargets.id, params.targetId),
        eq(developerWebhookTargets.userId, params.userId),
      ),
    )
    .returning({ id: developerWebhookTargets.id });
  return Boolean(rows[0]);
}

export type ClaimedWebhookDelivery = {
  id: string;
  attemptCount: number;
  targetId: string;
  userId: string;
  userAccessEnabled: boolean;
  targetEnabled: boolean;
  endpointUrl: string;
  signingSecretCiphertext: string;
  payload: Record<string, unknown>;
};

export async function claimDueDeveloperWebhookDeliveries(params: {
  now: Date;
  staleLockBefore: Date;
  limit: number;
}) {
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        id: developerWebhookDeliveries.id,
        attemptCount: developerWebhookDeliveries.attemptCount,
        targetId: developerWebhookTargets.id,
        userId: developerWebhookTargets.userId,
        userAccessEnabled: users.developerAccessEnabled,
        targetEnabled: developerWebhookTargets.isEnabled,
        endpointUrl: developerWebhookTargets.endpointUrl,
        signingSecretCiphertext:
          developerWebhookTargets.signingSecretCiphertext,
        payload: developerWebhookEvents.payload,
      })
      .from(developerWebhookDeliveries)
      .innerJoin(
        developerWebhookEvents,
        eq(developerWebhookDeliveries.eventId, developerWebhookEvents.id),
      )
      .innerJoin(
        developerWebhookTargets,
        eq(developerWebhookDeliveries.targetId, developerWebhookTargets.id),
      )
      .innerJoin(users, eq(developerWebhookTargets.userId, users.id))
      .where(
        or(
          and(
            eq(developerWebhookDeliveries.status, "PENDING"),
            lte(developerWebhookDeliveries.nextAttemptAt, params.now),
          ),
          and(
            eq(developerWebhookDeliveries.status, "PROCESSING"),
            lt(developerWebhookDeliveries.lockedAt, params.staleLockBefore),
          ),
        ),
      )
      .orderBy(asc(developerWebhookDeliveries.nextAttemptAt))
      .limit(params.limit)
      .for("update", { of: developerWebhookDeliveries, skipLocked: true });

    if (candidates.length === 0) return [];

    const ids = candidates.map((delivery) => delivery.id);
    const claimed = await tx
      .update(developerWebhookDeliveries)
      .set({
        status: "PROCESSING",
        lockedAt: params.now,
        lastAttemptAt: params.now,
        attemptCount: sql`${developerWebhookDeliveries.attemptCount} + 1`,
      })
      .where(inArray(developerWebhookDeliveries.id, ids))
      .returning({
        id: developerWebhookDeliveries.id,
        attemptCount: developerWebhookDeliveries.attemptCount,
      });
    const attemptsById = new Map(
      claimed.map((delivery) => [delivery.id, delivery.attemptCount]),
    );

    return candidates.map((delivery) => ({
      ...delivery,
      attemptCount: attemptsById.get(delivery.id) ?? delivery.attemptCount + 1,
    })) satisfies ClaimedWebhookDelivery[];
  });
}

export async function completeDeveloperWebhookDelivery(params: {
  id: string;
  attemptCount: number;
  now: Date;
  succeeded: boolean;
  statusCode?: number;
  error?: string;
  maxAttempts: number;
  retryIntervalMs: number;
}) {
  const succeeded = params.succeeded;
  const status = succeeded
    ? "DELIVERED"
    : params.attemptCount >= params.maxAttempts
      ? "FAILED"
      : "PENDING";

  await db
    .update(developerWebhookDeliveries)
    .set({
      status,
      lockedAt: null,
      deliveredAt: succeeded ? params.now : null,
      nextAttemptAt: new Date(params.now.getTime() + params.retryIntervalMs),
      lastStatusCode: params.statusCode ?? null,
      lastError: succeeded
        ? null
        : (params.error?.slice(0, 500) ?? "Delivery failed"),
    })
    .where(
      and(
        eq(developerWebhookDeliveries.id, params.id),
        eq(developerWebhookDeliveries.status, "PROCESSING"),
      ),
    );
}

export async function cancelDeveloperWebhookDeliveryData(id: string) {
  await db
    .update(developerWebhookDeliveries)
    .set({ status: "CANCELED", lockedAt: null })
    .where(
      and(
        eq(developerWebhookDeliveries.id, id),
        eq(developerWebhookDeliveries.status, "PROCESSING"),
      ),
    );
}

/** Disable all destinations and cancel queued sends when access is removed. */
export async function pauseDeveloperWebhookTargetsForUserInTransaction(
  tx: DbTransaction,
  userId: string,
) {
  const rows = await tx
    .update(developerWebhookTargets)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(eq(developerWebhookTargets.userId, userId))
    .returning({ id: developerWebhookTargets.id });
  if (rows.length === 0) return;

  await tx
    .update(developerWebhookDeliveries)
    .set({ status: "CANCELED", lockedAt: null })
    .where(
      and(
        inArray(
          developerWebhookDeliveries.targetId,
          rows.map((row) => row.id),
        ),
        inArray(developerWebhookDeliveries.status, ["PENDING", "PROCESSING"]),
      ),
    );
}

export function isWebhookEventType(
  value: unknown,
): value is DeveloperWebhookEventType {
  return (
    typeof value === "string" &&
    (DEVELOPER_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
  );
}
