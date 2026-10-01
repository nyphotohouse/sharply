import "server-only";

import { headers } from "next/headers";
import slugify from "slugify";
import { z } from "zod";
import { auth } from "~/auth";
import type { GearPriceProjection } from "~/server/db/schema";
import { getSessionOrThrow } from "~/server/auth";
import { getTrendingStatusForSlugs } from "~/server/popularity/service";
import {
  addGearToListData,
  createUserListData,
  deleteUserListData,
  fetchDefaultListByUserIdData,
  fetchListByUserAndNameData,
  fetchListIdsContainingGearForUserData,
  fetchListItemByIdData,
  fetchListItemIdsData,
  fetchListItemsByListIdsData,
  fetchPublishedUserListsData,
  fetchSharedListByListIdData,
  fetchSharedListByPublicIdData,
  fetchUserListByIdData,
  fetchUserListsForOwnerData,
  normalizeListItemPositionsData,
  removeGearFromListData,
  removeListItemByIdData,
  resolveGearIdFromSlugData,
  unpublishSharedListData,
  updateListItemPositionsData,
  updateSharedListSlugData,
  updateUserListNameData,
  upsertSharedListData,
} from "./data";

export const DEFAULT_USER_LIST_NAME = "Saved Items";

export type UserListItemDto = {
  id: string;
  position: number;
  gear: {
    id: string;
    slug: string;
    name: string;
    regionalAliases: Array<{
      gearId: string;
      region: "GLOBAL" | "US" | "EU" | "JP";
      name: string;
      createdAt: Date;
      updatedAt: Date;
    }> | null;
    brandName: string | null;
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
  };
};

export type SharedListDto = {
  id: string;
  slug: string;
  publicId: string;
  isPublished: boolean;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  path: string;
};

export type UserListDto = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  items: UserListItemDto[];
  shared: SharedListDto | null;
};

export type PublicSharedListPayload = {
  status: "published" | "unpublished";
  shouldRedirect: boolean;
  canonicalPath: string;
  list: {
    id: string;
    name: string;
  };
  owner: {
    id: string;
    handle: string;
    name: string | null;
    image: string | null;
  };
  items: UserListItemDto[];
  trendingSlugs: string[];
  shared: SharedListDto;
};

const listNameSchema = z
  .string()
  .trim()
  .min(1, "List name is required")
  .max(140, "List name must be 140 characters or fewer");

const listIdSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1);

function toListSlug(name: string): string {
  const value = slugify(name, {
    lower: true,
    strict: true,
    trim: true,
  });
  return value || "list";
}

export function buildSharedListPath(slug: string, publicId: string): string {
  return `/list/${slug}-${publicId}`;
}

function parseSharedParam(sharedParam: string): { slug: string; publicId: string } {
  const trimmed = sharedParam.trim();
  const separatorIndex = trimmed.lastIndexOf("-");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw Object.assign(new Error("Invalid shared list URL"), { status: 404 });
  }
  return {
    slug: trimmed.slice(0, separatorIndex),
    publicId: trimmed.slice(separatorIndex + 1),
  };
}

function mapShared(input: {
  id: string | null;
  slug: string | null;
  publicId: string | null;
  isPublished: boolean | null;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
}): SharedListDto | null {
  if (!input.id || !input.slug || !input.publicId) return null;

  return {
    id: input.id,
    slug: input.slug,
    publicId: input.publicId,
    isPublished: Boolean(input.isPublished),
    publishedAt: input.publishedAt,
    unpublishedAt: input.unpublishedAt,
    path: buildSharedListPath(input.slug, input.publicId),
  };
}

async function assertUserOwnsList(listId: string, userId: string) {
  const list = await fetchUserListByIdData(listId);
  if (list?.userId !== userId) {
    throw Object.assign(new Error("List not found"), { status: 404 });
  }
  return list;
}

async function buildUserListsPayload(
  userId: string,
  options?: { onlyPublished?: boolean },
) {
  const lists = options?.onlyPublished
    ? await fetchPublishedUserListsData(userId)
    : await fetchUserListsForOwnerData(userId);

  const listIds = lists.map((list) => list.id);
  const itemsByListId = await fetchListItemsByListIdsData(listIds);

  return lists.map((list): UserListDto => ({
    id: list.id,
    userId: list.userId,
    name: list.name,
    isDefault: list.isDefault,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    itemCount: list.itemCount,
    items: itemsByListId.get(list.id) ?? [],
    shared: mapShared({
      id: list.sharedId,
      slug: list.sharedSlug,
      publicId: list.sharedPublicId,
      isPublished: list.sharedIsPublished,
      publishedAt: list.sharedPublishedAt,
      unpublishedAt: list.sharedUnpublishedAt,
    }),
  }));
}

async function generateUniquePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const existing = await fetchSharedListByPublicIdData(candidate);
    if (!existing) return candidate;
  }
  throw new Error("Unable to generate a unique share id");
}

async function updateSharedSlugFromListName(listId: string, name: string) {
  const shared = await fetchSharedListByListIdData(listId);
  if (!shared) return null;
  const slug = toListSlug(name);
  return updateSharedListSlugData(listId, slug);
}

export async function ensureDefaultSavedItemsList(userId: string) {
  const existingDefault = await fetchDefaultListByUserIdData(userId);
  if (existingDefault) return existingDefault;

  const existingByName = await fetchListByUserAndNameData(
    userId,
    DEFAULT_USER_LIST_NAME,
  );
  if (existingByName) return existingByName;

  const created = await createUserListData({
    userId,
    name: DEFAULT_USER_LIST_NAME,
    isDefault: true,
  });

  if (!created) {
    throw new Error("Failed to create default list");
  }

  return created;
}

export async function fetchUserListsForProfile(params: {
  profileUserId: string;
  viewerUserId?: string | null;
}) {
  const isOwner = params.viewerUserId === params.profileUserId;

  if (isOwner) {
    await ensureDefaultSavedItemsList(params.profileUserId);
  }

  const lists = await buildUserListsPayload(params.profileUserId, {
    onlyPublished: !isOwner,
  });

  return {
    isOwner,
    lists,
  };
}

export async function fetchCurrentUserListPickerStateForGear(slug: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  const userId = session.user.id;
  await ensureDefaultSavedItemsList(userId);

  const gearId = await resolveGearIdFromSlugData(slug);
  if (!gearId) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  const [lists, savedListIds] = await Promise.all([
    fetchUserListsForOwnerData(userId),
    fetchListIdsContainingGearForUserData(userId, gearId),
  ]);

  return {
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      isDefault: list.isDefault,
      itemCount: list.itemCount,
    })),
    savedListIds,
    defaultListId:
      lists.find((list) => list.isDefault)?.id ?? lists[0]?.id ?? null,
  };
}

export async function createUserList(rawName: string) {
  const { user } = await getSessionOrThrow();
  const name = listNameSchema.parse(rawName);

  const created = await createUserListData({
    userId: user.id,
    name,
    isDefault: false,
  });

  if (!created) throw new Error("Failed to create list");

  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, lists };
}

export async function renameUserList(listIdRaw: string, rawName: string) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(listIdRaw);
  const name = listNameSchema.parse(rawName);

  await assertUserOwnsList(listId, user.id);

  await updateUserListNameData(listId, name);
  await updateSharedSlugFromListName(listId, name);

  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, lists };
}

export async function deleteUserList(listIdRaw: string) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(listIdRaw);

  const list = await assertUserOwnsList(listId, user.id);
  if (list.isDefault) {
    throw Object.assign(new Error("Default list cannot be deleted"), {
      status: 400,
    });
  }

  await deleteUserListData(listId);
  await ensureDefaultSavedItemsList(user.id);

  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, lists };
}

export async function addGearToUserList(params: {
  listId: string;
  slug: string;
}) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(params.listId);
  const slug = slugSchema.parse(params.slug);

  await assertUserOwnsList(listId, user.id);
  const gearId = await resolveGearIdFromSlugData(slug);
  if (!gearId) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  const result = await addGearToListData(listId, gearId);
  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, added: result.added, lists };
}

export async function removeGearFromUserList(params: {
  listId: string;
  slug: string;
}) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(params.listId);
  const slug = slugSchema.parse(params.slug);

  await assertUserOwnsList(listId, user.id);
  const gearId = await resolveGearIdFromSlugData(slug);
  if (!gearId) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  const result = await removeGearFromListData(listId, gearId);
  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, removed: result.removed, lists };
}

export async function removeUserListItem(itemIdRaw: string) {
  const { user } = await getSessionOrThrow();
  const itemId = listIdSchema.parse(itemIdRaw);

  const item = await fetchListItemByIdData(itemId);
  if (item?.listUserId !== user.id) {
    throw Object.assign(new Error("List item not found"), { status: 404 });
  }

  await removeListItemByIdData(itemId);
  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, lists };
}

export async function reorderUserListItems(params: {
  listId: string;
  orderedItemIds: string[];
}) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(params.listId);
  const orderedItemIds = z.array(listIdSchema).parse(params.orderedItemIds);

  await assertUserOwnsList(listId, user.id);
  const currentIds = await fetchListItemIdsData(listId);

  if (
    currentIds.length !== orderedItemIds.length ||
    currentIds.some((id) => !orderedItemIds.includes(id))
  ) {
    throw Object.assign(new Error("Invalid reorder payload"), { status: 400 });
  }

  await updateListItemPositionsData(listId, orderedItemIds);
  await normalizeListItemPositionsData(listId);

  const lists = await buildUserListsPayload(user.id);
  return { ok: true as const, lists };
}

export async function publishUserList(listIdRaw: string) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(listIdRaw);

  const list = await assertUserOwnsList(listId, user.id);
  const itemIds = await fetchListItemIdsData(listId);
  if (itemIds.length === 0) {
    throw Object.assign(new Error("Cannot publish an empty list"), {
      status: 400,
    });
  }
  const slug = toListSlug(list.name);

  const existing = await fetchSharedListByListIdData(listId);
  const publicId = existing?.publicId ?? (await generateUniquePublicId());

  const shared = await upsertSharedListData({
    listId,
    slug,
    publicId,
    isPublished: true,
    publishedAt: new Date(),
    unpublishedAt: null,
  });

  if (!shared) throw new Error("Failed to publish list");

  const lists = await buildUserListsPayload(user.id);
  return {
    ok: true as const,
    lists,
    sharedPath: buildSharedListPath(shared.slug, shared.publicId),
  };
}

export async function unpublishUserList(listIdRaw: string) {
  const { user } = await getSessionOrThrow();
  const listId = listIdSchema.parse(listIdRaw);

  await assertUserOwnsList(listId, user.id);
  const updated = await unpublishSharedListData(listId);
  if (!updated) {
    throw Object.assign(new Error("Shared list not found"), { status: 404 });
  }

  const lists = await buildUserListsPayload(user.id);
  return {
    ok: true as const,
    lists,
    sharedPath: buildSharedListPath(updated.slug, updated.publicId),
  };
}

export async function fetchPublicSharedListByParam(
  sharedParam: string,
): Promise<PublicSharedListPayload | null> {
  const parsed = parseSharedParam(sharedParam);
  const record = await fetchSharedListByPublicIdData(parsed.publicId);
  if (!record) return null;

  const canonicalPath = buildSharedListPath(record.slug, record.publicId);
  const shouldRedirect = parsed.slug !== record.slug;

  const listItemsById = await fetchListItemsByListIdsData([record.listId]);
  const items = listItemsById.get(record.listId) ?? [];
  const trendingSet = record.isPublished
    ? await getTrendingStatusForSlugs(
        items.map((item) => item.gear.slug),
        {
          timeframe: "30d",
          limit: 20,
        },
      )
    : new Set<string>();

  return {
    status: record.isPublished ? "published" : "unpublished",
    shouldRedirect,
    canonicalPath,
    list: {
      id: record.listId,
      name: record.listName,
    },
    owner: {
      id: record.ownerId,
      handle: record.ownerHandle ?? `user-${record.ownerMemberNumber}`,
      name: record.ownerName,
      image: record.ownerImage,
    },
    items,
    trendingSlugs: Array.from(trendingSet),
    shared: {
      id: record.sharedId,
      slug: record.slug,
      publicId: record.publicId,
      isPublished: record.isPublished,
      publishedAt: record.publishedAt,
      unpublishedAt: record.unpublishedAt,
      path: canonicalPath,
    },
  };
}
