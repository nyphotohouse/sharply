import "server-only";

import { asc, and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { db } from "~/server/db";
import {
  brands,
  developerApiKeys,
  developerApiRateLimitBuckets,
  developerApiUsageDaily,
  gear,
  gearMounts,
  mounts,
  sensorFormats,
  users,
} from "~/server/db/schema";
import type { DeveloperApiEndpoint } from "./constants";
import { pauseDeveloperWebhookTargetsForUserInTransaction } from "./webhooks/data";

export type DeveloperApiKeyRow = typeof developerApiKeys.$inferSelect;

export type DeveloperApiMount = {
  value: string;
  shortName: string | null;
};

export type DeveloperApiSensorFormat = {
  slug: string;
  name: string;
  cropFactor: string;
};

export type DeveloperApiGearLineageItem = {
  id: string;
  slug: string;
  name: string;
};

export async function fetchDeveloperGearLineageData(
  ids: Array<string | null | undefined>,
): Promise<Map<string, DeveloperApiGearLineageItem>> {
  const validIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!validIds.length) return new Map();
  const rows = await db
    .select({ id: gear.id, slug: gear.slug, name: gear.name })
    .from(gear)
    .where(
      and(
        inArray(gear.id, validIds),
        eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED),
      ),
    );
  return new Map(rows.map((row) => [row.id, row]));
}

export type DeveloperApiCatalogItem = {
  name: string;
  slug: string;
  brandName: string;
  gearType: string;
  thumbnailUrl: string | null;
  releaseDate: Date | null;
  releaseDatePrecision: string | null;
  announcedDate: Date | null;
  announceDatePrecision: string | null;
  discontinuedDate: Date | null;
  discontinuedDatePrecision: string | null;
};

/** A deliberately narrow, slug-sorted read for the downloadable API catalog. */
export async function fetchDeveloperCatalogData(): Promise<
  DeveloperApiCatalogItem[]
> {
  return db
    .select({
      name: gear.name,
      slug: gear.slug,
      brandName: brands.name,
      gearType: gear.gearType,
      thumbnailUrl: gear.thumbnailUrl,
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      announcedDate: gear.announcedDate,
      announceDatePrecision: gear.announceDatePrecision,
      discontinuedDate: gear.discontinuedDate,
      discontinuedDatePrecision: gear.discontinuedDatePrecision,
    })
    .from(gear)
    .innerJoin(brands, eq(gear.brandId, brands.id))
    .where(eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED))
    .orderBy(asc(gear.slug));
}

export async function fetchDeveloperGearMountsData(
  gearId: string,
): Promise<DeveloperApiMount[]> {
  return db
    .select({
      value: mounts.value,
      shortName: mounts.shortName,
    })
    .from(gearMounts)
    .innerJoin(mounts, eq(gearMounts.mountId, mounts.id))
    .where(eq(gearMounts.gearId, gearId))
    .orderBy(asc(mounts.value));
}

export async function fetchDeveloperSensorFormatsData(
  formatIds: Array<string | null | undefined>,
): Promise<Map<string, DeveloperApiSensorFormat>> {
  const ids = [...new Set(formatIds.filter((id): id is string => !!id))];
  if (!ids.length) return new Map();

  const rows = await db
    .select({
      id: sensorFormats.id,
      slug: sensorFormats.slug,
      name: sensorFormats.name,
      cropFactor: sensorFormats.cropFactor,
    })
    .from(sensorFormats)
    .where(inArray(sensorFormats.id, ids));

  return new Map(
    rows.map((format) => [
      format.id,
      {
        slug: format.slug,
        name: format.name,
        cropFactor: format.cropFactor,
      },
    ]),
  );
}

export async function findUsableApiKeyByHash(keyHash: string) {
  const rows = await db
    .select({
      key: developerApiKeys,
      developerAccessEnabled: users.developerAccessEnabled,
    })
    .from(developerApiKeys)
    .innerJoin(users, eq(developerApiKeys.userId, users.id))
    .where(
      and(
        eq(developerApiKeys.keyHash, keyHash),
        isNull(developerApiKeys.revokedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function countActiveApiKeysForUser(userId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(developerApiKeys)
    .where(
      and(
        eq(developerApiKeys.userId, userId),
        isNull(developerApiKeys.revokedAt),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

export async function createApiKeyData(params: {
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
}) {
  const rows = await db.insert(developerApiKeys).values(params).returning();
  return rows[0]!;
}

/**
 * Creates a key only when the user remains below the active-key limit. The
 * transaction-scoped advisory lock serializes this check per user so concurrent
 * create requests cannot both consume the last available slot.
 */
export async function createApiKeyWithinActiveLimitData(
  params: {
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
  },
  maxActiveKeys: number,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('developer-api-keys'), hashtext(${params.userId}))`,
    );

    const rows = await tx
      .select({ count: sql<number>`count(*)` })
      .from(developerApiKeys)
      .where(
        and(
          eq(developerApiKeys.userId, params.userId),
          isNull(developerApiKeys.revokedAt),
        ),
      );

    if (Number(rows[0]?.count ?? 0) >= maxActiveKeys) return null;

    const created = await tx
      .insert(developerApiKeys)
      .values(params)
      .returning();
    return created[0]!;
  });
}

export async function listApiKeysForUser(userId: string) {
  return db
    .select()
    .from(developerApiKeys)
    .where(eq(developerApiKeys.userId, userId))
    .orderBy(desc(developerApiKeys.createdAt));
}

export async function listAllApiKeysData() {
  return db
    .select()
    .from(developerApiKeys)
    .orderBy(desc(developerApiKeys.createdAt));
}

export async function revokeApiKeyData(params: {
  keyId: string;
  revokedByUserId: string;
  userId?: string;
}) {
  const conditions = [
    eq(developerApiKeys.id, params.keyId),
    isNull(developerApiKeys.revokedAt),
  ];
  if (params.userId)
    conditions.push(eq(developerApiKeys.userId, params.userId));

  const rows = await db
    .update(developerApiKeys)
    .set({ revokedAt: new Date(), revokedByUserId: params.revokedByUserId })
    .where(and(...conditions))
    .returning({ id: developerApiKeys.id });
  return rows[0] ?? null;
}

export async function revokeAllApiKeysForUser(
  userId: string,
  revokedByUserId: string,
) {
  await db
    .update(developerApiKeys)
    .set({ revokedAt: new Date(), revokedByUserId })
    .where(
      and(
        eq(developerApiKeys.userId, userId),
        isNull(developerApiKeys.revokedAt),
      ),
    );
}

export async function setDeveloperAccessData(userId: string, enabled: boolean) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set({ developerAccessEnabled: enabled, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        developerAccessEnabled: users.developerAccessEnabled,
      });
    if (rows[0] && !enabled) {
      await pauseDeveloperWebhookTargetsForUserInTransaction(tx, userId);
    }
    return rows[0] ?? null;
  });
}

export async function getDeveloperAccessData(userId: string) {
  const rows = await db
    .select({ enabled: users.developerAccessEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.enabled ?? false;
}

export async function consumeRateLimitBucket(params: {
  apiKeyId: string;
  windowStart: Date;
}) {
  const rows = await db
    .insert(developerApiRateLimitBuckets)
    .values({ ...params, requestCount: 1 })
    .onConflictDoUpdate({
      target: [
        developerApiRateLimitBuckets.apiKeyId,
        developerApiRateLimitBuckets.windowStart,
      ],
      set: {
        requestCount: sql`${developerApiRateLimitBuckets.requestCount} + 1`,
      },
    })
    .returning({ requestCount: developerApiRateLimitBuckets.requestCount });
  return rows[0]?.requestCount ?? 1;
}

export async function touchApiKeyLastUsed(apiKeyId: string) {
  await db
    .update(developerApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(developerApiKeys.id, apiKeyId));
}

export async function incrementUsageData(params: {
  apiKeyId: string;
  usageDate: Date;
  endpoint: DeveloperApiEndpoint;
}) {
  await db
    .insert(developerApiUsageDaily)
    .values({
      apiKeyId: params.apiKeyId,
      usageDate: params.usageDate,
      totalRequests: 1,
      searchRequests: params.endpoint === "search" ? 1 : 0,
      suggestionRequests: params.endpoint === "suggestions" ? 1 : 0,
      gearRequests: params.endpoint === "gear" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [
        developerApiUsageDaily.apiKeyId,
        developerApiUsageDaily.usageDate,
      ],
      set: {
        totalRequests: sql`${developerApiUsageDaily.totalRequests} + 1`,
        searchRequests:
          params.endpoint === "search"
            ? sql`${developerApiUsageDaily.searchRequests} + 1`
            : developerApiUsageDaily.searchRequests,
        suggestionRequests:
          params.endpoint === "suggestions"
            ? sql`${developerApiUsageDaily.suggestionRequests} + 1`
            : developerApiUsageDaily.suggestionRequests,
        gearRequests:
          params.endpoint === "gear"
            ? sql`${developerApiUsageDaily.gearRequests} + 1`
            : developerApiUsageDaily.gearRequests,
      },
    });
}

export async function getUsageForKeyIdsSince(apiKeyIds: string[], since: Date) {
  if (apiKeyIds.length === 0) return [];
  return db
    .select()
    .from(developerApiUsageDaily)
    .where(
      and(
        inArray(developerApiUsageDaily.apiKeyId, apiKeyIds),
        gte(developerApiUsageDaily.usageDate, since),
      ),
    );
}

export async function listDeveloperUsersData() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      developerAccessEnabled: users.developerAccessEnabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}
