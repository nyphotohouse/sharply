import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  brands,
  gear,
  sharedLists,
  userListItems,
  userLists,
  users,
} from "~/server/db/schema";
import type { GearPriceProjection } from "~/server/db/schema";
import { fetchGearAliasesByGearIds, getGearIdBySlug } from "~/server/gear/data";
import type { GearAlias } from "~/types/gear";
import { getGearDisplayImageSql } from "~/server/gear/display-image";
import { getResolvedUserImageSql } from "~/server/users/data";

export type UserListRow = typeof userLists.$inferSelect;
export type SharedListRow = typeof sharedLists.$inferSelect;

export type UserListListRow = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  sharedId: string | null;
  sharedSlug: string | null;
  sharedPublicId: string | null;
  sharedIsPublished: boolean | null;
  sharedPublishedAt: Date | null;
  sharedUnpublishedAt: Date | null;
};

export type UserListItemGearRow = {
  id: string;
  listId: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  gear: {
    id: string;
    slug: string;
    name: string;
    gearType: string;
    thumbnailUrl: string | null;
    releaseDate: Date | null;
    releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
    announcedDate: Date | null;
    announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
    msrpNowUsdCents: number | null;
    msrpAtLaunchUsdCents: number | null;
    mpbMaxPriceUsdCents: number | null;
    usedPriceProjection: GearPriceProjection | null;
    regionalAliases: GearAlias[] | null;
    brandName: string | null;
  };
};

export type SharedListLookupRow = {
  sharedId: string;
  listId: string;
  slug: string;
  publicId: string;
  isPublished: boolean;
  publishedAt: Date;
  unpublishedAt: Date | null;
  ownerId: string;
  ownerHandle: string | null;
  ownerMemberNumber: number;
  ownerName: string | null;
  ownerImage: string | null;
  listName: string;
};

export async function fetchDefaultListByUserIdData(userId: string) {
  const rows = await db
    .select()
    .from(userLists)
    .where(and(eq(userLists.userId, userId), eq(userLists.isDefault, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function fetchListByUserAndNameData(userId: string, name: string) {
  const rows = await db
    .select()
    .from(userLists)
    .where(and(eq(userLists.userId, userId), eq(userLists.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUserListData(params: {
  userId: string;
  name: string;
  isDefault?: boolean;
}) {
  const rows = await db
    .insert(userLists)
    .values({
      userId: params.userId,
      name: params.name,
      isDefault: Boolean(params.isDefault),
    })
    .returning();
  return rows[0] ?? null;
}

export async function updateUserListNameData(listId: string, name: string) {
  const rows = await db
    .update(userLists)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(eq(userLists.id, listId))
    .returning();
  return rows[0] ?? null;
}

export async function deleteUserListData(listId: string) {
  await db.delete(userLists).where(eq(userLists.id, listId));
}

export async function fetchUserListByIdData(listId: string) {
  const rows = await db
    .select()
    .from(userLists)
    .where(eq(userLists.id, listId))
    .limit(1);
  return rows[0] ?? null;
}

export async function fetchUserListsForOwnerData(
  userId: string,
): Promise<UserListListRow[]> {
  const rows = await db
    .select({
      id: userLists.id,
      userId: userLists.userId,
      name: userLists.name,
      isDefault: userLists.isDefault,
      createdAt: userLists.createdAt,
      updatedAt: userLists.updatedAt,
      itemCount: sql<number>`cast(count(${userListItems.id}) as int)`,
      sharedId: sharedLists.id,
      sharedSlug: sharedLists.slug,
      sharedPublicId: sharedLists.publicId,
      sharedIsPublished: sharedLists.isPublished,
      sharedPublishedAt: sharedLists.publishedAt,
      sharedUnpublishedAt: sharedLists.unpublishedAt,
    })
    .from(userLists)
    .leftJoin(sharedLists, eq(sharedLists.listId, userLists.id))
    .leftJoin(userListItems, eq(userListItems.listId, userLists.id))
    .where(eq(userLists.userId, userId))
    .groupBy(
      userLists.id,
      userLists.userId,
      userLists.name,
      userLists.isDefault,
      userLists.createdAt,
      userLists.updatedAt,
      sharedLists.id,
      sharedLists.slug,
      sharedLists.publicId,
      sharedLists.isPublished,
      sharedLists.publishedAt,
      sharedLists.unpublishedAt,
    )
    .orderBy(desc(userLists.isDefault), asc(userLists.createdAt));

  return rows;
}

export async function fetchPublishedUserListsData(
  userId: string,
): Promise<UserListListRow[]> {
  const rows = await db
    .select({
      id: userLists.id,
      userId: userLists.userId,
      name: userLists.name,
      isDefault: userLists.isDefault,
      createdAt: userLists.createdAt,
      updatedAt: userLists.updatedAt,
      itemCount: sql<number>`cast(count(${userListItems.id}) as int)`,
      sharedId: sharedLists.id,
      sharedSlug: sharedLists.slug,
      sharedPublicId: sharedLists.publicId,
      sharedIsPublished: sharedLists.isPublished,
      sharedPublishedAt: sharedLists.publishedAt,
      sharedUnpublishedAt: sharedLists.unpublishedAt,
    })
    .from(userLists)
    .innerJoin(sharedLists, eq(sharedLists.listId, userLists.id))
    .leftJoin(userListItems, eq(userListItems.listId, userLists.id))
    .where(and(eq(userLists.userId, userId), eq(sharedLists.isPublished, true)))
    .groupBy(
      userLists.id,
      userLists.userId,
      userLists.name,
      userLists.isDefault,
      userLists.createdAt,
      userLists.updatedAt,
      sharedLists.id,
      sharedLists.slug,
      sharedLists.publicId,
      sharedLists.isPublished,
      sharedLists.publishedAt,
      sharedLists.unpublishedAt,
    )
    .orderBy(desc(sharedLists.publishedAt), asc(userLists.createdAt));
  return rows;
}

export async function fetchListItemsByListIdsData(
  listIds: string[],
): Promise<Map<string, UserListItemGearRow[]>> {
  if (!listIds.length) return new Map();

  const rows = await db
    .select({
      id: userListItems.id,
      listId: userListItems.listId,
      position: userListItems.position,
      createdAt: userListItems.createdAt,
      updatedAt: userListItems.updatedAt,
      gearId: gear.id,
      slug: gear.slug,
      name: gear.name,
      gearType: gear.gearType,
      thumbnailUrl: getGearDisplayImageSql(),
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      announcedDate: gear.announcedDate,
      announceDatePrecision: gear.announceDatePrecision,
      msrpNowUsdCents: gear.msrpNowUsdCents,
      msrpAtLaunchUsdCents: gear.msrpAtLaunchUsdCents,
      mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
      usedPriceProjection: gear.usedPriceProjection,
      brandName: brands.name,
    })
    .from(userListItems)
    .innerJoin(gear, eq(userListItems.gearId, gear.id))
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(inArray(userListItems.listId, listIds))
    .orderBy(asc(userListItems.position), asc(userListItems.createdAt));

  const aliasesByGearId = await fetchGearAliasesByGearIds(
    rows.map((row) => row.gearId),
  );

  const map = new Map<string, UserListItemGearRow[]>();
  for (const row of rows) {
    const current = map.get(row.listId) ?? [];
    current.push({
      id: row.id,
      listId: row.listId,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      gear: {
        id: row.gearId,
        slug: row.slug,
        name: row.name,
        gearType: row.gearType,
        thumbnailUrl: row.thumbnailUrl,
        releaseDate: row.releaseDate,
        releaseDatePrecision: row.releaseDatePrecision,
        announcedDate: row.announcedDate,
        announceDatePrecision: row.announceDatePrecision,
        msrpNowUsdCents: row.msrpNowUsdCents,
        msrpAtLaunchUsdCents: row.msrpAtLaunchUsdCents,
        mpbMaxPriceUsdCents: row.mpbMaxPriceUsdCents,
        usedPriceProjection: row.usedPriceProjection,
        regionalAliases: aliasesByGearId.get(row.gearId) ?? null,
        brandName: row.brandName ?? null,
      },
    });
    map.set(row.listId, current);
  }

  return map;
}

export async function fetchListItemByIdData(itemId: string) {
  const rows = await db
    .select({
      id: userListItems.id,
      listId: userListItems.listId,
      position: userListItems.position,
      listUserId: userLists.userId,
    })
    .from(userListItems)
    .innerJoin(userLists, eq(userLists.id, userListItems.listId))
    .where(eq(userListItems.id, itemId))
    .limit(1);

  return rows[0] ?? null;
}

export async function fetchListItemIdsData(listId: string) {
  const rows = await db
    .select({ id: userListItems.id })
    .from(userListItems)
    .where(eq(userListItems.listId, listId))
    .orderBy(asc(userListItems.position), asc(userListItems.createdAt));
  return rows.map((row) => row.id);
}

export async function fetchListIdsContainingGearForUserData(
  userId: string,
  gearId: string,
) {
  const rows = await db
    .select({ listId: userListItems.listId })
    .from(userListItems)
    .innerJoin(userLists, eq(userLists.id, userListItems.listId))
    .where(and(eq(userLists.userId, userId), eq(userListItems.gearId, gearId)));
  return rows.map((row) => row.listId);
}

export async function addGearToListData(listId: string, gearId: string) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: userListItems.id })
      .from(userListItems)
      .where(
        and(eq(userListItems.listId, listId), eq(userListItems.gearId, gearId)),
      )
      .limit(1);

    if (existing[0]) {
      return { added: false as const };
    }

    const maxPositionRows = await tx
      .select({
        max: sql<number>`coalesce(max(${userListItems.position}), -1)`,
      })
      .from(userListItems)
      .where(eq(userListItems.listId, listId));
    const nextPosition = Number(maxPositionRows[0]?.max ?? -1) + 1;

    await tx.insert(userListItems).values({
      listId,
      gearId,
      position: nextPosition,
    });

    return { added: true as const };
  });
}

export async function removeGearFromListData(listId: string, gearId: string) {
  const deleted = await db
    .delete(userListItems)
    .where(
      and(eq(userListItems.listId, listId), eq(userListItems.gearId, gearId)),
    )
    .returning({ id: userListItems.id });

  if (!deleted.length) {
    return { removed: false as const };
  }

  await normalizeListItemPositionsData(listId);
  return { removed: true as const };
}

export async function removeListItemByIdData(itemId: string) {
  const deleted = await db
    .delete(userListItems)
    .where(eq(userListItems.id, itemId))
    .returning({ id: userListItems.id, listId: userListItems.listId });

  const row = deleted[0] ?? null;
  if (!row) return null;

  await normalizeListItemPositionsData(row.listId);
  return row;
}

export async function updateListItemPositionsData(
  listId: string,
  orderedItemIds: string[],
) {
  await db.transaction(async (tx) => {
    for (const [position, itemId] of orderedItemIds.entries()) {
      await tx
        .update(userListItems)
        .set({ position, updatedAt: new Date() })
        .where(
          and(eq(userListItems.id, itemId), eq(userListItems.listId, listId)),
        );
    }
  });
}

export async function normalizeListItemPositionsData(listId: string) {
  const orderedIds = await fetchListItemIdsData(listId);
  if (!orderedIds.length) return;
  await updateListItemPositionsData(listId, orderedIds);
}

export async function fetchSharedListByListIdData(listId: string) {
  const rows = await db
    .select()
    .from(sharedLists)
    .where(eq(sharedLists.listId, listId))
    .limit(1);
  return rows[0] ?? null;
}

export async function fetchSharedListByPublicIdData(publicId: string) {
  const rows = await db
    .select({
      sharedId: sharedLists.id,
      listId: sharedLists.listId,
      slug: sharedLists.slug,
      publicId: sharedLists.publicId,
      isPublished: sharedLists.isPublished,
      publishedAt: sharedLists.publishedAt,
      unpublishedAt: sharedLists.unpublishedAt,
      ownerId: users.id,
      ownerHandle: users.handle,
      ownerMemberNumber: users.memberNumber,
      ownerName: users.name,
      ownerImage: getResolvedUserImageSql(),
      listName: userLists.name,
    })
    .from(sharedLists)
    .innerJoin(userLists, eq(userLists.id, sharedLists.listId))
    .innerJoin(users, eq(users.id, userLists.userId))
    .where(eq(sharedLists.publicId, publicId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertSharedListData(params: {
  listId: string;
  slug: string;
  publicId: string;
  isPublished: boolean;
  publishedAt: Date;
  unpublishedAt: Date | null;
}) {
  const rows = await db
    .insert(sharedLists)
    .values({
      listId: params.listId,
      slug: params.slug,
      publicId: params.publicId,
      isPublished: params.isPublished,
      publishedAt: params.publishedAt,
      unpublishedAt: params.unpublishedAt,
    })
    .onConflictDoUpdate({
      target: sharedLists.listId,
      set: {
        slug: params.slug,
        publicId: params.publicId,
        isPublished: params.isPublished,
        publishedAt: params.publishedAt,
        unpublishedAt: params.unpublishedAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0] ?? null;
}

export async function unpublishSharedListData(listId: string) {
  const rows = await db
    .update(sharedLists)
    .set({
      isPublished: false,
      unpublishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sharedLists.listId, listId))
    .returning();
  return rows[0] ?? null;
}

export async function updateSharedListSlugData(listId: string, slug: string) {
  const rows = await db
    .update(sharedLists)
    .set({
      slug,
      updatedAt: new Date(),
    })
    .where(eq(sharedLists.listId, listId))
    .returning();
  return rows[0] ?? null;
}

export async function resolveGearIdFromSlugData(slug: string) {
  return getGearIdBySlug(slug);
}
