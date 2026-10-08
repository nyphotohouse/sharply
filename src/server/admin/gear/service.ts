import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AuthUser } from "~/auth";
import { requireRole } from "~/lib/auth/auth-helpers";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { buildGearSearchName } from "~/lib/gear/naming";
import { GEAR_REGIONS, type GearRegion } from "~/lib/gear/region";
import { shouldBlockFuzzyResults } from "~/lib/utils/gear-creation";
import { getSessionOrThrow } from "~/server/auth";
import { reviewGearImageUpload } from "~/server/gear-image-review/service";
import { isUploadThingFileUrl } from "~/server/raw-samples/uploadthing";
import { db } from "~/server/db";
import {
  auditLogs,
  brands,
  gear,
  gearAliases,
  gearEdits,
} from "~/server/db/schema";
import { invalidateDeveloperApiCatalogCache } from "~/server/developer-api/cache";
import { clearImageRequestsForGear, getGearIdBySlug } from "~/server/gear/data";
import {
  proposeLensOpticsBackfillFromName,
  type LensOpticsBackfillProposal,
} from "~/lib/admin/lens-optics-backfill";
import {
  checkGearCreationData,
  createGearData,
  deleteGearData,
  fetchGearOgBackfillCandidatesData,
  fetchAdminGearItemsData,
  fetchLensOpticsBackfillCandidateByIdData,
  fetchLensOpticsBackfillCandidatesData,
  performFuzzySearch as performFuzzySearchData,
  renameGearData,
  updateGearOgImageData,
  updateGearLeftViewData,
  updateGearPublicationStateData,
  updateGearRearViewData,
  updateGearRightViewData,
  updateGearThumbnailData,
  updateGearTopViewData,
  updateLensOpticsBackfillData,
  type DeleteGearResult,
  type FetchGearOgBackfillCandidatesResult,
  type FetchAdminGearItemsParams,
  type FetchAdminGearItemsResult,
  type GearCreationCheckParams,
  type GearCreationCheckResult,
  type GearCreationParams,
  type GearCreationResult,
  type LensOpticsBackfillCandidateRow,
  type UpdateGearPublicationStateResult,
} from "./data";

export type { AdminGearTableRow, GearCreationParams } from "./data";

function assertRearViewSupported(gearType: string) {
  if (gearType === "LENS") {
    throw Object.assign(
      new Error("Rear-view images are only supported for cameras"),
      {
        status: 400,
        code: "REAR_VIEW_UNSUPPORTED_GEAR_TYPE",
      },
    );
  }
}

function assertSideViewSupported(gearType: string) {
  if (gearType === "LENS") {
    throw Object.assign(
      new Error("Side-view images are only supported for cameras"),
      {
        status: 400,
        code: "SIDE_VIEW_UNSUPPORTED_GEAR_TYPE",
      },
    );
  }
}

function requireImageMutationRole(
  user: AuthUser | null | undefined,
  imageUrl: string | null,
) {
  const roles: Parameters<typeof requireRole>[1] = imageUrl
    ? ["ADMIN", "EDITOR"]
    : ["ADMIN"];
  if (!requireRole(user, roles)) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
}

export async function performFuzzySearchAdmin(params: {
  inputName: string;
  brandName: string;
  brandId: string;
}) {
  const session = await getSessionOrThrow();
  const user = session.user;
  if (!requireRole(user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return performFuzzySearchData(params);
}

export async function checkGearCreationAdmin(
  params: GearCreationCheckParams,
): Promise<GearCreationCheckResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return checkGearCreationData(params);
}

export async function createGearAdmin(
  params: GearCreationParams,
): Promise<GearCreationResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const { name, brandId, force } = params;

  // Get brand name for fuzzy search
  const { performFuzzySearch } = await import("./data");
  const { results: fuzzy } = await performFuzzySearch({
    inputName: name,
    brandName: "", // Will be filled in createGearData
    brandId,
  });

  // Check if fuzzy results should block creation
  const blockResult = shouldBlockFuzzyResults(fuzzy, force);
  if (blockResult) {
    console.log("[gear:create] fuzzy block", {
      input: name,
      brandId,
      results: fuzzy,
    });
    throw Object.assign(new Error(blockResult.error), {
      status: 409,
      ...blockResult,
    });
  }

  const created = await createGearData(params);

  // Audit: gear created
  const { db } = await import("~/server/db");
  const { auditLogs } = await import("~/server/db/schema");
  await db.insert(auditLogs).values({
    action: "GEAR_CREATE",
    actorUserId: session.user?.id ?? "",
    gearId: created.id,
  });

  invalidateDeveloperApiCatalogCache();
  if (
    (params.publicationState ?? GEAR_PUBLICATION_STATES.PUBLISHED) ===
    GEAR_PUBLICATION_STATES.PUBLISHED
  ) {
    const { scheduleDeveloperWebhookDispatch } =
      await import("~/server/developer-api/webhooks/service");
    scheduleDeveloperWebhookDispatch();
  }

  return created;
}

export async function updateGearPublicationStateService(params: {
  gearId: string;
  publicationState: "PUBLISHED" | "RUMORED" | "HIDDEN";
}): Promise<UpdateGearPublicationStateResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  if (
    params.publicationState !== GEAR_PUBLICATION_STATES.PUBLISHED &&
    params.publicationState !== GEAR_PUBLICATION_STATES.RUMORED &&
    params.publicationState !== GEAR_PUBLICATION_STATES.HIDDEN
  ) {
    throw Object.assign(new Error("Invalid publication state"), {
      status: 400,
    });
  }

  const updated = await updateGearPublicationStateData(params);
  invalidateDeveloperApiCatalogCache();
  if (params.publicationState === GEAR_PUBLICATION_STATES.PUBLISHED) {
    const { scheduleDeveloperWebhookDispatch } =
      await import("~/server/developer-api/webhooks/service");
    scheduleDeveloperWebhookDispatch();
  }
  return updated;
}

export async function fetchAdminGearItems(
  params: FetchAdminGearItemsParams,
): Promise<FetchAdminGearItemsResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return fetchAdminGearItemsData(params);
}

export async function renameGearService(params: {
  gearId: string;
  newName: string;
}): Promise<{
  id: string;
  name: string;
  previousSlug: string;
  slug: string;
  searchName: string;
}> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const updated = await renameGearData({
    gearId: params.gearId,
    newName: params.newName,
  });

  try {
    await db.insert(auditLogs).values({
      action: "GEAR_RENAME",
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });
  } catch {}

  invalidateDeveloperApiCatalogCache();

  return updated;
}

export async function updateGearAliasesService(params: {
  gearId: string;
  aliases: { region: GearRegion; name: string | null }[];
}): Promise<{
  aliases: { region: GearRegion; name: string }[];
  slug: string;
  searchName: string;
}> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const allowed = new Set<GearRegion>(Array.from(GEAR_REGIONS));
  const desired = params.aliases
    .filter((entry) => allowed.has(entry.region))
    .map((entry) => ({
      region: entry.region,
      name: (entry.name ?? "").trim(),
    }))
    .filter((entry) => entry.name.length > 0);

  const desiredMap = new Map<GearRegion, string>();
  for (const entry of desired) {
    desiredMap.set(entry.region, entry.name);
  }

  return db.transaction(async (tx) => {
    const currentAliases = await tx
      .select({ region: gearAliases.region, name: gearAliases.name })
      .from(gearAliases)
      .where(eq(gearAliases.gearId, params.gearId));

    // Delete aliases that are no longer present
    const desiredRegions = new Set(desiredMap.keys());
    const toDelete = currentAliases
      .filter((row) => !desiredRegions.has(row.region))
      .map((row) => row.region);

    if (toDelete.length > 0) {
      await tx
        .delete(gearAliases)
        .where(
          and(
            eq(gearAliases.gearId, params.gearId),
            inArray(gearAliases.region, toDelete),
          ),
        );
    }

    // Upsert desired aliases
    for (const [region, name] of desiredMap.entries()) {
      await tx
        .insert(gearAliases)
        .values({ gearId: params.gearId, region, name })
        .onConflictDoUpdate({
          target: [gearAliases.gearId, gearAliases.region],
          set: { name, updatedAt: new Date() },
        });
    }

    // Rebuild search name
    const gearRow = await tx
      .select({ name: gear.name, slug: gear.slug, brandName: brands.name })
      .from(gear)
      .leftJoin(brands, eq(gear.brandId, brands.id))
      .where(eq(gear.id, params.gearId))
      .limit(1);

    if (!gearRow[0]) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    const searchName = buildGearSearchName({
      name: gearRow[0].name,
      brandName: gearRow[0].brandName ?? null,
      aliases: Array.from(desiredMap.values()),
    });

    await tx
      .update(gear)
      .set({ searchName, updatedAt: new Date() })
      .where(eq(gear.id, params.gearId));

    return {
      aliases: desired.map((entry) => ({
        region: entry.region,
        name: entry.name,
      })),
      slug: gearRow[0].slug,
      searchName,
    };
  });
}

export async function setGearThumbnailService(params: {
  gearId?: string;
  slug?: string;
  thumbnailUrl: string | null;
  ogImageUrl?: string | null;
}): Promise<{
  id: string;
  slug: string;
  thumbnailUrl: string | null;
  ogImageUrl: string | null;
}> {
  const session = await getSessionOrThrow();

  const { gearId: maybeId, slug, thumbnailUrl, ogImageUrl } = params;
  requireImageMutationRole(session.user, thumbnailUrl);
  let gearId = maybeId;
  if (!gearId) {
    if (!slug)
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }
  if (thumbnailUrl) {
    await reviewGearImageUpload({
      actor: session.user,
      gearId,
      imageType: "thumbnail",
      imageUrl: thumbnailUrl,
    });
  }

  // Fetch current gear state to determine if this is an upload, replace, or remove
  const { fetchGearMetadataById } = await import("~/server/gear/data");
  const currentGear = await fetchGearMetadataById(gearId);
  const hadThumbnail = !!currentGear.thumbnailUrl;

  const updated = await updateGearThumbnailData({
    gearId,
    thumbnailUrl,
    ogImageUrl,
  });
  const thumbnailChanged =
    (currentGear.thumbnailUrl ?? null) !== updated.thumbnailUrl;

  if (thumbnailUrl) {
    // Clear outstanding image requests once an image is provided
    await clearImageRequestsForGear(gearId);
  }

  try {
    // Determine the appropriate audit action
    let action:
      | "GEAR_IMAGE_UPLOAD"
      | "GEAR_IMAGE_REPLACE"
      | "GEAR_IMAGE_REMOVE";
    if (thumbnailUrl) {
      // Setting a new thumbnail
      action = hadThumbnail ? "GEAR_IMAGE_REPLACE" : "GEAR_IMAGE_UPLOAD";
    } else {
      // Removing thumbnail
      action = "GEAR_IMAGE_REMOVE";
    }

    await db.insert(auditLogs).values({
      action,
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });

    // Create a contribution record for image uploads (not removals)
    if (thumbnailUrl) {
      await db.insert(gearEdits).values({
        id: nanoid(),
        gearId: updated.id,
        createdById: session.user?.id ?? "",
        status: "APPROVED",
        payload: {
          imageUpload: {
            type: "thumbnail",
            url: thumbnailUrl,
            action: hadThumbnail ? "replace" : "upload",
          },
        },
      });
    }
  } catch {}

  if (thumbnailChanged) invalidateDeveloperApiCatalogCache();

  return updated;
}

export async function clearGearThumbnailService(params: {
  gearId?: string;
  slug?: string;
}): Promise<{
  id: string;
  slug: string;
  thumbnailUrl: string | null;
  ogImageUrl: string | null;
}> {
  return setGearThumbnailService({
    ...params,
    thumbnailUrl: null,
    ogImageUrl: null,
  });
}

export async function setGearOgImageService(params: {
  gearId?: string;
  slug?: string;
  ogImageUrl: string | null;
}): Promise<{ id: string; slug: string; ogImageUrl: string | null }> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const { gearId: maybeId, slug, ogImageUrl } = params;
  const isAdmin = requireRole(session.user, ["ADMIN"]);
  if (ogImageUrl && !isAdmin && !isUploadThingFileUrl(ogImageUrl)) {
    throw Object.assign(new Error("Invalid image upload URL"), { status: 422 });
  }
  let gearId = maybeId;
  if (!gearId) {
    if (!slug) {
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    }
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }

  return await updateGearOgImageData({ gearId, ogImageUrl });
}

export async function fetchGearOgBackfillCandidatesService(params: {
  includeExisting: boolean;
  limit: number;
}): Promise<FetchGearOgBackfillCandidatesResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  return await fetchGearOgBackfillCandidatesData(params);
}

export async function setGearTopViewService(params: {
  gearId?: string;
  slug?: string;
  topViewUrl: string | null;
}): Promise<{ id: string; slug: string; topViewUrl: string | null }> {
  const session = await getSessionOrThrow();

  const { gearId: maybeId, slug, topViewUrl } = params;
  requireImageMutationRole(session.user, topViewUrl);
  let gearId = maybeId;
  if (!gearId) {
    if (!slug)
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }
  if (topViewUrl) {
    await reviewGearImageUpload({
      actor: session.user,
      gearId,
      imageType: "topView",
      imageUrl: topViewUrl,
    });
  }

  // Fetch current gear state to determine if this is an upload, replace, or remove
  const { fetchGearMetadataById } = await import("~/server/gear/data");
  const currentGear = await fetchGearMetadataById(gearId);
  const hadTopView = !!currentGear.topViewUrl;

  const updated = await updateGearTopViewData({ gearId, topViewUrl });

  if (currentGear.gearType === "LENS" && !currentGear.thumbnailUrl?.trim()) {
    await updateGearOgImageData({ gearId, ogImageUrl: null });
  }

  if (topViewUrl) {
    // Clear outstanding image requests once an image is provided
    await clearImageRequestsForGear(gearId);
  }

  try {
    // Determine the appropriate audit action
    let action:
      | "GEAR_TOP_VIEW_UPLOAD"
      | "GEAR_TOP_VIEW_REPLACE"
      | "GEAR_TOP_VIEW_REMOVE";
    if (topViewUrl) {
      // Setting a new top view
      action = hadTopView ? "GEAR_TOP_VIEW_REPLACE" : "GEAR_TOP_VIEW_UPLOAD";
    } else {
      // Removing top view
      action = "GEAR_TOP_VIEW_REMOVE";
    }

    await db.insert(auditLogs).values({
      action,
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });

    // Create a contribution record for image uploads (not removals)
    if (topViewUrl) {
      await db.insert(gearEdits).values({
        id: nanoid(),
        gearId: updated.id,
        createdById: session.user?.id ?? "",
        status: "APPROVED",
        payload: {
          imageUpload: {
            type: "topView",
            url: topViewUrl,
            action: hadTopView ? "replace" : "upload",
          },
        },
      });
    }
  } catch {}

  return updated;
}

export async function clearGearTopViewService(params: {
  gearId?: string;
  slug?: string;
}): Promise<{ id: string; slug: string; topViewUrl: string | null }> {
  return setGearTopViewService({ ...params, topViewUrl: null });
}

export async function setGearRearViewService(params: {
  gearId?: string;
  slug?: string;
  rearViewUrl: string | null;
}): Promise<{ id: string; slug: string; rearViewUrl: string | null }> {
  const session = await getSessionOrThrow();

  const { gearId: maybeId, slug, rearViewUrl } = params;
  requireImageMutationRole(session.user, rearViewUrl);
  let gearId = maybeId;
  if (!gearId) {
    if (!slug)
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }
  if (rearViewUrl) {
    await reviewGearImageUpload({
      actor: session.user,
      gearId,
      imageType: "rearView",
      imageUrl: rearViewUrl,
    });
  }

  // Fetch current gear state to determine if this is an upload, replace, or remove
  const { fetchGearMetadataById } = await import("~/server/gear/data");
  const currentGear = await fetchGearMetadataById(gearId);
  assertRearViewSupported(currentGear.gearType);
  const hadRearView = !!currentGear.rearViewUrl;

  const updated = await updateGearRearViewData({ gearId, rearViewUrl });

  if (rearViewUrl) {
    // Clear outstanding image requests once an image is provided
    await clearImageRequestsForGear(gearId);
  }

  try {
    // Determine the appropriate audit action
    let action:
      | "GEAR_REAR_VIEW_UPLOAD"
      | "GEAR_REAR_VIEW_REPLACE"
      | "GEAR_REAR_VIEW_REMOVE";
    if (rearViewUrl) {
      // Setting a new rear view
      action = hadRearView ? "GEAR_REAR_VIEW_REPLACE" : "GEAR_REAR_VIEW_UPLOAD";
    } else {
      // Removing rear view
      action = "GEAR_REAR_VIEW_REMOVE";
    }

    await db.insert(auditLogs).values({
      action,
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });

    // Create a contribution record for image uploads (not removals)
    if (rearViewUrl) {
      await db.insert(gearEdits).values({
        id: nanoid(),
        gearId: updated.id,
        createdById: session.user?.id ?? "",
        status: "APPROVED",
        payload: {
          imageUpload: {
            type: "rearView",
            url: rearViewUrl,
            action: hadRearView ? "replace" : "upload",
          },
        },
      });
    }
  } catch {}

  return updated;
}

export async function clearGearRearViewService(params: {
  gearId?: string;
  slug?: string;
}): Promise<{ id: string; slug: string; rearViewUrl: string | null }> {
  return setGearRearViewService({ ...params, rearViewUrl: null });
}

export async function setGearLeftViewService(params: {
  gearId?: string;
  slug?: string;
  leftViewUrl: string | null;
}): Promise<{ id: string; slug: string; leftViewUrl: string | null }> {
  const session = await getSessionOrThrow();

  const { gearId: maybeId, slug, leftViewUrl } = params;
  requireImageMutationRole(session.user, leftViewUrl);
  let gearId = maybeId;
  if (!gearId) {
    if (!slug)
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }
  if (leftViewUrl) {
    await reviewGearImageUpload({
      actor: session.user,
      gearId,
      imageType: "leftView",
      imageUrl: leftViewUrl,
    });
  }

  const { fetchGearMetadataById } = await import("~/server/gear/data");
  const currentGear = await fetchGearMetadataById(gearId);
  assertSideViewSupported(currentGear.gearType);
  const hadLeftView = !!currentGear.leftViewUrl;

  const updated = await updateGearLeftViewData({ gearId, leftViewUrl });

  if (leftViewUrl) {
    await clearImageRequestsForGear(gearId);
  }

  try {
    const action = leftViewUrl
      ? hadLeftView
        ? "GEAR_LEFT_VIEW_REPLACE"
        : "GEAR_LEFT_VIEW_UPLOAD"
      : "GEAR_LEFT_VIEW_REMOVE";

    await db.insert(auditLogs).values({
      action,
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });

    if (leftViewUrl) {
      await db.insert(gearEdits).values({
        id: nanoid(),
        gearId: updated.id,
        createdById: session.user?.id ?? "",
        status: "APPROVED",
        payload: {
          imageUpload: {
            type: "leftView",
            url: leftViewUrl,
            action: hadLeftView ? "replace" : "upload",
          },
        },
      });
    }
  } catch {}

  return updated;
}

export async function clearGearLeftViewService(params: {
  gearId?: string;
  slug?: string;
}): Promise<{ id: string; slug: string; leftViewUrl: string | null }> {
  return setGearLeftViewService({ ...params, leftViewUrl: null });
}

export async function setGearRightViewService(params: {
  gearId?: string;
  slug?: string;
  rightViewUrl: string | null;
}): Promise<{ id: string; slug: string; rightViewUrl: string | null }> {
  const session = await getSessionOrThrow();

  const { gearId: maybeId, slug, rightViewUrl } = params;
  requireImageMutationRole(session.user, rightViewUrl);
  let gearId = maybeId;
  if (!gearId) {
    if (!slug)
      throw Object.assign(new Error("Missing gear reference"), { status: 400 });
    const id = await getGearIdBySlug(slug);
    if (!id) throw Object.assign(new Error("Gear not found"), { status: 404 });
    gearId = id;
  }
  if (rightViewUrl) {
    await reviewGearImageUpload({
      actor: session.user,
      gearId,
      imageType: "rightView",
      imageUrl: rightViewUrl,
    });
  }

  const { fetchGearMetadataById } = await import("~/server/gear/data");
  const currentGear = await fetchGearMetadataById(gearId);
  assertSideViewSupported(currentGear.gearType);
  const hadRightView = !!currentGear.rightViewUrl;

  const updated = await updateGearRightViewData({ gearId, rightViewUrl });

  if (rightViewUrl) {
    await clearImageRequestsForGear(gearId);
  }

  try {
    const action = rightViewUrl
      ? hadRightView
        ? "GEAR_RIGHT_VIEW_REPLACE"
        : "GEAR_RIGHT_VIEW_UPLOAD"
      : "GEAR_RIGHT_VIEW_REMOVE";

    await db.insert(auditLogs).values({
      action,
      actorUserId: session.user?.id ?? "",
      gearId: updated.id,
    });

    if (rightViewUrl) {
      await db.insert(gearEdits).values({
        id: nanoid(),
        gearId: updated.id,
        createdById: session.user?.id ?? "",
        status: "APPROVED",
        payload: {
          imageUpload: {
            type: "rightView",
            url: rightViewUrl,
            action: hadRightView ? "replace" : "upload",
          },
        },
      });
    }
  } catch {}

  return updated;
}

export async function clearGearRightViewService(params: {
  gearId?: string;
  slug?: string;
}): Promise<{ id: string; slug: string; rightViewUrl: string | null }> {
  return setGearRightViewService({ ...params, rightViewUrl: null });
}

export async function deleteGearService(
  gearId: string,
): Promise<DeleteGearResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const deleted = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: gear.id })
      .from(gear)
      .where(eq(gear.id, gearId))
      .limit(1);

    const capturedId = existing[0]?.id;
    if (!capturedId) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    try {
      // Use a savepoint so audit failures do not abort the delete transaction.
      await tx.transaction(async (auditTx) => {
        await auditTx.insert(auditLogs).values({
          action: "GEAR_DELETE",
          actorUserId: session.user.id,
          gearId: capturedId,
        });
      });
    } catch {
      // Audit log failures are intentionally non-fatal.
    }

    return deleteGearData(gearId, tx);
  });

  invalidateDeveloperApiCatalogCache();
  return deleted;
}

export type LensOpticsBackfillCandidateItem = LensOpticsBackfillCandidateRow & {
  proposal: LensOpticsBackfillProposal;
};

export type FetchLensOpticsBackfillCandidatesResult = {
  eligibleCount: number;
  actionableCount: number;
  skippedCount: number;
  items: LensOpticsBackfillCandidateItem[];
};

function toOpticsCurrent(row: LensOpticsBackfillCandidateRow) {
  return {
    focalLengthMinMm: row.focalLengthMinMm,
    focalLengthMaxMm: row.focalLengthMaxMm,
    isPrime: row.isPrime,
    maxApertureWide: row.maxApertureWide,
    maxApertureTele: row.maxApertureTele,
  };
}

export async function fetchLensOpticsBackfillCandidatesService(params: {
  limit: number;
}): Promise<FetchLensOpticsBackfillCandidatesResult> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  // Over-fetch incomplete rows so a 25–50 review page can fill with actionable proposals.
  const fetchLimit = Math.min(200, Math.max(params.limit * 4, params.limit));
  const result = await fetchLensOpticsBackfillCandidatesData({
    limit: fetchLimit,
  });
  const withProposals = result.items.map((item) => ({
    ...item,
    proposal: proposeLensOpticsBackfillFromName(
      item.name,
      toOpticsCurrent(item),
    ),
  }));

  const actionable = withProposals
    .filter((item) => item.proposal.actionable)
    .slice(0, params.limit);
  const considered = withProposals.slice(
    0,
    Math.min(withProposals.length, fetchLimit),
  );
  const skippedInBatch = considered.filter(
    (item) => !item.proposal.actionable,
  ).length;

  return {
    eligibleCount: result.eligibleCount,
    actionableCount: actionable.length,
    skippedCount: skippedInBatch,
    items: actionable,
  };
}

export async function applyLensOpticsBackfillService(params: {
  gearId: string;
}): Promise<{
  id: string;
  slug: string;
  fills: LensOpticsBackfillProposal["fills"];
  proposed: LensOpticsBackfillProposal["proposed"];
}> {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN", "EDITOR"])) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const row = await fetchLensOpticsBackfillCandidateByIdData(params.gearId);
  if (!row) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  const proposal = proposeLensOpticsBackfillFromName(
    row.name,
    toOpticsCurrent(row),
  );
  if (!proposal.actionable) {
    throw Object.assign(
      new Error("No high-confidence optics fills available"),
      { status: 400 },
    );
  }

  const updated = await updateLensOpticsBackfillData({
    gearId: params.gearId,
    update: proposal.proposed,
  });

  invalidateDeveloperApiCatalogCache();

  return {
    id: updated.id,
    slug: updated.slug,
    fills: proposal.fills,
    proposed: proposal.proposed,
  };
}
