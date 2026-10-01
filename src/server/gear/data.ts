import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { cache } from "react";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { buildGearSearchName } from "~/lib/gear/naming";
import type { AutoApprovalMetadata } from "~/lib/gear/auto-approval-reasons";
import { db } from "~/server/db";
import {
  afAreaModes,
  analogCameraSpecs,
  auditLogs,
  brands,
  cameraAfAreaSpecs,
  cameraCardSlots,
  cameraSpecs,
  fixedLensSpecs,
  gear,
  gearAliases,
  gearAlternatives,
  gearCreatorVideos,
  gearColorways,
  gearEdits,
  gearMounts,
  gearPopularityDaily,
  gearPopularityIntraday,
  gearPopularityLifetime,
  gearPopularityWindows,
  gearRawSamples,
  gearTags,
  genres,
  imageRequests,
  lensSpecs,
  mounts,
  ownerships,
  popularityEvents,
  rawSamples,
  reviewFlags,
  reviews,
  staffVerdicts,
  tags,
  useCaseRatings,
  users,
  wishlists,
} from "~/server/db/schema";
import { incrementGearPopularityIntraday } from "~/server/popularity/data";
import { hasEventForUserOnUtcDay } from "~/server/validation/dedupe";
import { fetchVideoModesByGearId } from "~/server/video-modes/data";
import { getResolvedUserImageSql } from "~/server/users/data";
import type { GearPriceProjection } from "~/server/db/schema";
import type {
  Gear,
  GearAlias,
  GearColorway,
  GearItem,
  GearSummary,
  GearRegion,
} from "~/types/gear";
import type { GearActivityRow } from "./home-activity";
import { getGearDisplayImageSql } from "./display-image";

type DbClient = Pick<typeof db, "select" | "update" | "insert" | "delete">;

export type GearExportRow = {
  name: string;
  brand: string | null;
  mounts: string[];
};

function publishedGearWhereClause() {
  return eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED);
}

// Reads
export async function getGearIdBySlug(slug: string): Promise<string | null> {
  const row = await db
    .select({ id: gear.id })
    .from(gear)
    .where(eq(gear.slug, slug))
    .limit(1);
  return row[0]?.id ?? null;
}

export async function fetchGearSummariesBySlugs(
  slugs: string[],
): Promise<GearSummary[]> {
  if (!slugs.length) return [];

  return db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      brandName: brands.name,
      thumbnailUrl: getGearDisplayImageSql(),
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      announcedDate: gear.announcedDate,
      announceDatePrecision: gear.announceDatePrecision,
      publicationState: gear.publicationState,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(inArray(gear.slug, slugs));
}

export async function fetchGearAliasesByGearIds(
  gearIds: string[],
): Promise<Map<string, GearAlias[]>> {
  if (!gearIds.length) return new Map();

  const rows = await db
    .select({
      gearId: gearAliases.gearId,
      region: gearAliases.region,
      name: gearAliases.name,
      createdAt: gearAliases.createdAt,
      updatedAt: gearAliases.updatedAt,
    })
    .from(gearAliases)
    .where(inArray(gearAliases.gearId, gearIds));

  const byGearId = new Map<string, GearAlias[]>();
  for (const row of rows) {
    const existing = byGearId.get(row.gearId) ?? [];
    existing.push({
      gearId: row.gearId,
      region: row.region,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    byGearId.set(row.gearId, existing);
  }

  return byGearId;
}

export async function fetchGearAliasesByGearId(
  gearId: string,
): Promise<GearAlias[]> {
  const map = await fetchGearAliasesByGearIds([gearId]);
  return map.get(gearId) ?? [];
}

export async function fetchGearColorwaysByGearId(gearId: string) {
  return db
    .select()
    .from(gearColorways)
    .where(eq(gearColorways.gearId, gearId))
    .orderBy(asc(gearColorways.sortOrder), asc(gearColorways.createdAt));
}

export async function fetchGearColorwaysByGearIds(
  gearIds: string[],
): Promise<Map<string, GearColorway[]>> {
  if (!gearIds.length) return new Map();

  const rows = await db
    .select()
    .from(gearColorways)
    .where(inArray(gearColorways.gearId, gearIds))
    .orderBy(asc(gearColorways.sortOrder), asc(gearColorways.createdAt));

  const byGearId = new Map<string, GearColorway[]>();
  for (const row of rows) {
    const existing = byGearId.get(row.gearId) ?? [];
    existing.push(row);
    byGearId.set(row.gearId, existing);
  }

  return byGearId;
}

async function buildSearchNameForGearId(
  tx: DbClient,
  gearId: string,
): Promise<string> {
  const row = await tx
    .select({ name: gear.name, brandName: brands.name })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(eq(gear.id, gearId))
    .limit(1);

  if (!row[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  const aliases: { name: string }[] = await tx
    .select({ name: gearAliases.name })
    .from(gearAliases)
    .where(eq(gearAliases.gearId, gearId));

  return buildGearSearchName({
    name: row[0].name,
    brandName: row[0].brandName ?? null,
    aliases: aliases.map((alias) => alias.name),
  });
}

export async function upsertGearAlias(params: {
  gearId: string;
  region: GearRegion;
  name: string;
}): Promise<void> {
  const { gearId, region, name } = params;

  await db.transaction(async (tx) => {
    await tx
      .insert(gearAliases)
      .values({ gearId, region, name })
      .onConflictDoUpdate({
        target: [gearAliases.gearId, gearAliases.region],
        set: { name, updatedAt: new Date() },
      });

    const searchName = await buildSearchNameForGearId(tx, gearId);
    await tx
      .update(gear)
      .set({ searchName, updatedAt: new Date() })
      .where(eq(gear.id, gearId));
  });
}

export async function deleteGearAlias(params: {
  gearId: string;
  region: GearRegion;
}): Promise<void> {
  const { gearId, region } = params;

  await db.transaction(async (tx) => {
    await tx
      .delete(gearAliases)
      .where(
        and(eq(gearAliases.gearId, gearId), eq(gearAliases.region, region)),
      );

    const searchName = await buildSearchNameForGearId(tx, gearId);
    await tx
      .update(gear)
      .set({ searchName, updatedAt: new Date() })
      .where(eq(gear.id, gearId));
  });
}

export async function getGearLinkMpb(params: {
  slug?: string | null;
  gearId?: string | null;
}): Promise<string | null> {
  const { slug, gearId } = params;
  if (!slug && !gearId) return null;

  const row = await db
    .select({ linkMpb: gear.linkMpb })
    .from(gear)
    .where(slug ? eq(gear.slug, slug) : eq(gear.id, gearId ?? ""))
    .limit(1);

  return row[0]?.linkMpb ?? null;
}

export async function updateGearInstructionManualLink(params: {
  gearId: string;
  linkInstructionManual: string | null;
}): Promise<Pick<Gear, "id" | "slug" | "linkInstructionManual">> {
  const rows = await db
    .update(gear)
    .set({
      linkInstructionManual: params.linkInstructionManual,
      updatedAt: new Date(),
    })
    .where(eq(gear.id, params.gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      linkInstructionManual: gear.linkInstructionManual,
    });

  const updatedGear = rows[0];
  if (!updatedGear) {
    throw new Error("Failed to update instruction manual link");
  }

  return updatedGear;
}

/** Fetch full gearItem  by id */
export async function fetchGearMetadataById(id: string): Promise<Gear> {
  const result = await db
    .select()
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(eq(gear.id, id))
    .limit(1);

  if (!result.length) {
    throw Object.assign(new Error("Not Found"), { status: 404 });
  }

  if (!result[0]?.gear) {
    throw Object.assign(new Error("Not Found"), { status: 404 });
  }

  // // fetch all mount ids
  // const mountIdRows = await db
  //   .select({ mountId: gearMounts.mountId })
  //   .from(gearMounts)
  //   .where(eq(gearMounts.gearId, gearItem[0]!.gear.id));

  // return the gear item
  return {
    ...result[0].gear,
  };
}

/**
 * Fetch comprehensive gear item with related specs by slug. Used by lib proxy.
 */
export const fetchGearBySlug = cache(async function fetchGearBySlug(
  slug: string,
): Promise<GearItem> {
  const gearItem = await db
    .select()
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(eq(gear.slug, slug))
    .limit(1);

  if (!gearItem.length) {
    // mirror old behavior (caller may handle notFound)
    throw Object.assign(new Error("Not Found"), { status: 404 });
  }

  // Fetch all mount IDs for this gear from junction table
  const gearId = gearItem[0]!.gear.id;
  const [mountIdRows, rawSampleRows, aliasRows, colorwayRows, tagRows] =
    await Promise.all([
      db
        .select({ mountId: gearMounts.mountId })
        .from(gearMounts)
        .where(eq(gearMounts.gearId, gearId)),
      fetchRawSamplesByGearId(gearId),
      fetchGearAliasesByGearId(gearId),
      fetchGearColorwaysByGearId(gearId),
      db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          description: tags.description,
          icon: tags.icon,
          createdAt: tags.createdAt,
          updatedAt: tags.updatedAt,
        })
        .from(gearTags)
        .innerJoin(tags, eq(gearTags.tagId, tags.id))
        .where(and(eq(gearTags.gearId, gearId), eq(tags.unlisted, false)))
        .orderBy(asc(tags.name)),
    ]);

  const base: GearItem = {
    ...gearItem[0]!.gear,
    brands: gearItem[0]!.brands ?? null,
    cameraSpecs: null,
    analogCameraSpecs: null,
    lensSpecs: null,
    fixedLensSpecs: null,
    mountIds: mountIdRows.map((r) => r.mountId),
    regionalAliases: aliasRows,
    rawSamples: rawSampleRows,
    colorways: colorwayRows,
    tags: tagRows,
  };

  // CAMERA SPECS
  if (gearItem[0]!.gear.gearType === "CAMERA") {
    const [camera, afRows, slots, fixed, videoModes] = await Promise.all([
      db
        .select()
        .from(cameraSpecs)
        .where(eq(cameraSpecs.gearId, gearItem[0]!.gear.id))
        .limit(1),
      db
        .select()
        .from(cameraAfAreaSpecs)
        .innerJoin(
          afAreaModes,
          eq(cameraAfAreaSpecs.afAreaModeId, afAreaModes.id),
        )
        .where(
          and(
            eq(cameraAfAreaSpecs.gearId, gearItem[0]!.gear.id),
            eq(afAreaModes.brandId, gearItem[0]!.gear.brandId),
          ),
        ),
      db
        .select()
        .from(cameraCardSlots)
        .where(eq(cameraCardSlots.gearId, gearItem[0]!.gear.id)),
      db
        .select()
        .from(fixedLensSpecs)
        .where(eq(fixedLensSpecs.gearId, gearItem[0]!.gear.id))
        .limit(1),
      fetchVideoModesByGearId(gearItem[0]!.gear.id),
    ]);

    const modes = afRows.map((r) => r.af_area_modes);

    return {
      ...base,
      cameraSpecs: camera[0] ? { ...camera[0], afAreaModes: modes } : null,
      cameraCardSlots: slots.length > 0 ? slots : [],
      fixedLensSpecs: fixed[0] ?? null,
      videoModes: videoModes.length ? videoModes : [],
    };
  } else if (gearItem[0]!.gear.gearType === "ANALOG_CAMERA") {
    const analog = await db
      .select()
      .from(analogCameraSpecs)
      .where(eq(analogCameraSpecs.gearId, gearItem[0]!.gear.id))
      .limit(1);

    const fixed = await db
      .select()
      .from(fixedLensSpecs)
      .where(eq(fixedLensSpecs.gearId, gearItem[0]!.gear.id))
      .limit(1);

    return {
      ...base,
      analogCameraSpecs: analog[0] ?? null,
      fixedLensSpecs: fixed[0] ?? null,
    };
    // LENS SPECS
  } else if (gearItem[0]!.gear.gearType === "LENS") {
    const lens = await db
      .select()
      .from(lensSpecs)
      .where(eq(lensSpecs.gearId, gearItem[0]!.gear.id))
      .limit(1);
    return { ...base, lensSpecs: lens[0] ?? null };
  } else {
    return base;
  }
});

export async function fetchAllGearExportRowsData(): Promise<GearExportRow[]> {
  const rows = await db
    .select({
      id: gear.id,
      name: gear.name,
      brandName: brands.name,
      legacyMountId: gear.mountId,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .orderBy(asc(gear.name));

  if (!rows.length) return [];

  const gearIds = rows.map((row) => row.id);
  const mountRows = await db
    .select({
      gearId: gearMounts.gearId,
      mountValue: mounts.value,
    })
    .from(gearMounts)
    .innerJoin(mounts, eq(gearMounts.mountId, mounts.id))
    .where(inArray(gearMounts.gearId, gearIds))
    .orderBy(asc(mounts.value));

  const mountsByGearId = new Map<string, string[]>();
  for (const row of mountRows) {
    if (!row.mountValue) continue;
    const existing = mountsByGearId.get(row.gearId) ?? [];
    existing.push(row.mountValue);
    mountsByGearId.set(row.gearId, existing);
  }

  const legacyMountIds = Array.from(
    new Set(
      rows
        .filter(
          (row) =>
            !mountsByGearId.has(row.id) &&
            typeof row.legacyMountId === "string",
        )
        .map((row) => row.legacyMountId!),
    ),
  );

  const legacyMountMap = new Map<string, string>();
  if (legacyMountIds.length > 0) {
    const legacyRows = await db
      .select({ id: mounts.id, value: mounts.value })
      .from(mounts)
      .where(inArray(mounts.id, legacyMountIds));

    for (const row of legacyRows) {
      legacyMountMap.set(row.id, row.value);
    }
  }

  return rows.map((row) => {
    const mountList = [...(mountsByGearId.get(row.id) ?? [])];
    if (!mountList.length && row.legacyMountId) {
      const fallbackMountName = legacyMountMap.get(row.legacyMountId);
      if (fallbackMountName) mountList.push(fallbackMountName);
    }

    return {
      name: row.name,
      brand: row.brandName ?? null,
      mounts: Array.from(new Set(mountList)),
    };
  });
}

export async function fetchRawSamplesByGearId(
  gearId: string,
): Promise<(typeof rawSamples.$inferSelect)[]> {
  const rows = await db
    .select()
    .from(rawSamples)
    .innerJoin(gearRawSamples, eq(rawSamples.id, gearRawSamples.rawSampleId))
    .where(
      and(eq(gearRawSamples.gearId, gearId), eq(rawSamples.isDeleted, false)),
    )
    .orderBy(desc(gearRawSamples.createdAt));

  return rows.map((r) => r.raw_samples);
}

export type RawSampleInsertParams = {
  gearId: string;
  fileUrl: string;
  originalFilename?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId?: string | null;
};

export async function insertRawSample(
  params: RawSampleInsertParams,
): Promise<typeof rawSamples.$inferSelect> {
  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(rawSamples)
      .values({
        fileUrl: params.fileUrl,
        originalFilename: params.originalFilename ?? null,
        contentType: params.contentType ?? null,
        sizeBytes: params.sizeBytes ?? null,
        uploadedByUserId: params.uploadedByUserId ?? null,
      })
      .returning();

    const sample = inserted[0];
    if (!sample) {
      throw new Error("Failed to insert raw sample");
    }

    await tx.insert(gearRawSamples).values({
      gearId: params.gearId,
      rawSampleId: sample.id,
    });
    return sample;
  });
}

export async function deleteRawSample(sampleId: string, gearId: string) {
  return await db.transaction(async (tx) => {
    // Remove the junction table relationship
    await tx
      .delete(gearRawSamples)
      .where(
        and(
          eq(gearRawSamples.gearId, gearId),
          eq(gearRawSamples.rawSampleId, sampleId),
        ),
      );

    // Soft delete the raw sample
    await tx
      .update(rawSamples)
      .set({
        isDeleted: true,
        deletedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(rawSamples.id, sampleId));
  });
}

export type GearCardRow = {
  id: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  searchName: string | null;
  gearType: string;
  brandName: string | null;
  brandSlug: string | null;
  thumbnailUrl: string | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents: number | null;
  releaseDate: Date | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  createdAt: Date;
  resolutionMp: number | null;
  focalLengthMinMm: number | null;
  focalLengthMaxMm: number | null;
};

export async function fetchLatestGearCardsData(
  limit: number,
): Promise<GearCardRow[]> {
  const rows = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      searchName: gear.searchName,
      gearType: gear.gearType,
      brandName: brands.name,
      brandSlug: brands.slug,
      thumbnailUrl: getGearDisplayImageSql(),
      msrpNowUsdCents: gear.msrpNowUsdCents,
      msrpAtLaunchUsdCents: gear.msrpAtLaunchUsdCents,
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      createdAt: gear.createdAt,
      resolutionMp: cameraSpecs.resolutionMp,
      focalLengthMinMm: lensSpecs.focalLengthMinMm,
      focalLengthMaxMm: lensSpecs.focalLengthMaxMm,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .leftJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
    .leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId))
    .where(publishedGearWhereClause())
    .orderBy(desc(gear.createdAt))
    .limit(limit);
  const aliasesById = await fetchGearAliasesByGearIds(
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    regionalAliases: aliasesById.get(row.id) ?? [],
  })) as unknown as GearCardRow[];
}

export async function fetchRecentGearActivityRows(
  limit: number,
): Promise<GearActivityRow[]> {
  const eventAt = sql<Date>`greatest(${gear.updatedAt}, ${gear.createdAt})`;

  return db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      createdAt: gear.createdAt,
      updatedAt: gear.updatedAt,
      eventAt,
    })
    .from(gear)
    .where(publishedGearWhereClause())
    .orderBy(desc(eventAt), desc(gear.updatedAt), desc(gear.createdAt))
    .limit(limit);
}

export type BrandGearCard = GearCardRow;

export async function fetchBrandGearData(
  brandId: string,
): Promise<BrandGearCard[]> {
  const rows = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      searchName: gear.searchName,
      gearType: gear.gearType,
      brandName: brands.name,
      brandSlug: brands.slug,
      thumbnailUrl: getGearDisplayImageSql(),
      msrpUsdCents: gear.msrpNowUsdCents,
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      createdAt: gear.createdAt,
      resolutionMp: cameraSpecs.resolutionMp,
      focalLengthMinMm: lensSpecs.focalLengthMinMm,
      focalLengthMaxMm: lensSpecs.focalLengthMaxMm,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .leftJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
    .leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId))
    .where(and(eq(gear.brandId, brandId), publishedGearWhereClause()))
    .orderBy(desc(gear.createdAt));

  // Fetch mounts for all gear items in one query
  const gearIds = rows.map((r) => r.id);
  const mountsForGear = gearIds.length
    ? await db
        .select({
          gearId: gearMounts.gearId,
          mountId: mounts.id,
          mountValue: mounts.value,
        })
        .from(gearMounts)
        .innerJoin(mounts, eq(gearMounts.mountId, mounts.id))
        .where(
          sql`${gearMounts.gearId} IN (${sql.join(
            gearIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
    : [];

  // Group mounts by gear ID
  const mountsByGearId = new Map<
    string,
    Array<{ id: string; value: string }>
  >();
  for (const m of mountsForGear) {
    if (!mountsByGearId.has(m.gearId)) {
      mountsByGearId.set(m.gearId, []);
    }
    mountsByGearId.get(m.gearId)!.push({ id: m.mountId, value: m.mountValue });
  }

  const aliasesById = await fetchGearAliasesByGearIds(gearIds);

  // Attach mounts array to each gear item
  return rows.map((row) => ({
    ...row,
    mounts: mountsByGearId.get(row.id) || [],
    regionalAliases: aliasesById.get(row.id) ?? [],
  })) as unknown as BrandGearCard[];
}

export async function hasPendingEditsForGear(gearId: string): Promise<boolean> {
  const row = await db
    .select({ id: gearEdits.id })
    .from(gearEdits)
    .where(and(eq(gearEdits.gearId, gearId), eq(gearEdits.status, "PENDING")))
    .limit(1);
  return row.length > 0;
}

export async function fetchPendingEditForGear(gearId: string) {
  const rows = await db
    .select({
      id: gearEdits.id,
      status: gearEdits.status,
      createdById: gearEdits.createdById,
    })
    .from(gearEdits)
    .where(and(eq(gearEdits.gearId, gearId), eq(gearEdits.status, "PENDING")))
    .limit(1);
  return rows[0] ?? null;
}

export async function countPendingEditsForGear(
  gearId: string,
): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(gearEdits)
    .where(and(eq(gearEdits.gearId, gearId), eq(gearEdits.status, "PENDING")));
  return Number(rows[0]?.c ?? 0);
}

export async function isInWishlist(
  gearId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: wishlists.userId })
    .from(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.gearId, gearId)))
    .limit(1);
  return row.length > 0;
}

export async function isOwned(
  gearId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: ownerships.userId })
    .from(ownerships)
    .where(and(eq(ownerships.userId, userId), eq(ownerships.gearId, gearId)))
    .limit(1);
  return row.length > 0;
}

export async function getApprovedReviewsByGearId(gearId: string) {
  return db
    .select({
      id: reviews.id,
      content: reviews.content,
      genres: reviews.genres,
      recommend: reviews.recommend,
      createdAt: reviews.createdAt,
      createdBy: {
        id: users.id,
        name: users.name,
        handle: users.handle,
        memberNumber: users.memberNumber,
        image: getResolvedUserImageSql(),
      },
    })
    .from(reviews)
    .leftJoin(users, eq(reviews.createdById, users.id))
    .where(and(eq(reviews.gearId, gearId), eq(reviews.status, "APPROVED")))
    .orderBy(desc(reviews.createdAt));
}

export async function getMyReviewStatus(gearId: string, userId: string) {
  const row = await db
    .select({ id: reviews.id, status: reviews.status })
    .from(reviews)
    .where(and(eq(reviews.gearId, gearId), eq(reviews.createdById, userId)))
    .limit(1);
  return row[0] ?? null;
}

export async function getGearStatsById(gearId: string) {
  const lifetimeRow = await db
    .select({ v: gearPopularityLifetime.viewsLifetime })
    .from(gearPopularityLifetime)
    .where(eq(gearPopularityLifetime.gearId, gearId))
    .limit(1);
  const lifetimeViews = Number(lifetimeRow[0]?.v ?? 0);

  const win30Row = await db
    .select({
      v: gearPopularityWindows.viewsSum,
      d: gearPopularityWindows.asOfDate,
    })
    .from(gearPopularityWindows)
    .where(
      and(
        eq(gearPopularityWindows.gearId, gearId),
        eq(gearPopularityWindows.timeframe, "30d"),
      ),
    )
    .orderBy(desc(gearPopularityWindows.asOfDate))
    .limit(1);
  let views30d = Number(win30Row[0]?.v ?? 0);

  if (!views30d) {
    const d30Row = await db
      .select({
        v: sql<number>`COALESCE(SUM(${gearPopularityDaily.views}), 0)`,
      })
      .from(gearPopularityDaily)
      .where(
        and(
          eq(gearPopularityDaily.gearId, gearId),
          gte(gearPopularityDaily.date, sql`CURRENT_DATE - INTERVAL '30 days'`),
          lt(gearPopularityDaily.date, sql`CURRENT_DATE`),
        ),
      );
    views30d = Number(d30Row[0]?.v ?? 0);
  }

  const intradayRow = await db
    .select({ v: gearPopularityIntraday.views })
    .from(gearPopularityIntraday)
    .where(
      and(
        eq(gearPopularityIntraday.gearId, gearId),
        eq(gearPopularityIntraday.date, sql`CURRENT_DATE`),
      ),
    )
    .limit(1);
  const intradayViews = Number(intradayRow[0]?.v ?? 0);

  const [wlRow, ownRow] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(wishlists)
      .where(eq(wishlists.gearId, gearId)),
    db
      .select({ c: sql<number>`count(*)` })
      .from(ownerships)
      .where(eq(ownerships.gearId, gearId)),
  ]);

  const wishlistTotal = Number(wlRow[0]?.c ?? 0);
  const ownershipTotal = Number(ownRow[0]?.c ?? 0);

  return {
    viewsToday: intradayViews,
    lifetimeViews: lifetimeViews + intradayViews,
    views30d: views30d + intradayViews,
    wishlistTotal,
    ownershipTotal,
  };
}

export async function fetchUseCaseRatingsByGearIdData(gearId: string) {
  return db
    .select({
      score: useCaseRatings.score,
      note: useCaseRatings.note,
      genreId: genres.id,
      genreName: genres.name,
      genreSlug: genres.slug,
    })
    .from(useCaseRatings)
    .leftJoin(genres, eq(useCaseRatings.genreId, genres.id))
    .where(eq(useCaseRatings.gearId, gearId));
}

export const fetchStaffVerdictByGearIdData = cache(
  async function fetchStaffVerdictByGearIdData(gearId: string) {
    const rows = await db
      .select()
      .from(staffVerdicts)
      .where(eq(staffVerdicts.gearId, gearId))
      .limit(1);
    return rows[0] ?? null;
  },
);

export async function upsertStaffVerdictByGearIdData(params: {
  gearId: string;
  content?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  whoFor?: string | null;
  notFor?: string | null;
  alternatives?: string[] | null;
  authorUserId: string;
}) {
  const {
    gearId,
    content,
    pros,
    cons,
    whoFor,
    notFor,
    alternatives,
    authorUserId,
  } = params;
  const values = {
    gearId,
    content: content ?? null,
    pros: (pros ?? null) as any,
    cons: (cons ?? null) as any,
    whoFor: whoFor ?? null,
    notFor: notFor ?? null,
    alternatives: (alternatives ?? null) as any,
    authorUserId,
  };

  const rows = await db
    .insert(staffVerdicts)
    .values(values)
    .onConflictDoUpdate({
      target: staffVerdicts.gearId,
      set: {
        content: values.content,
        pros: values.pros,
        cons: values.cons,
        whoFor: values.whoFor,
        notFor: values.notFor,
        alternatives: values.alternatives,
        authorUserId: values.authorUserId,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return rows[0] ?? null;
}

export async function fetchAllGearSlugsData() {
  const rows = await db
    .select({ slug: gear.slug })
    .from(gear)
    .where(publishedGearWhereClause());
  return rows.map((r) => r.slug);
}

export type GearSitemapEntry = {
  slug: string;
  updatedAt: Date | null;
};

export async function fetchGearSitemapEntriesData(): Promise<
  GearSitemapEntry[]
> {
  return db
    .select({ slug: gear.slug, updatedAt: gear.updatedAt })
    .from(gear)
    .where(publishedGearWhereClause());
}

export async function fetchNewestGearSlugsData(limit: number) {
  const effectiveReleaseDate = sql`coalesce(${gear.releaseDate}, ${gear.announcedDate}, ${gear.createdAt})`;
  const rows = await db
    .select({ slug: gear.slug })
    .from(gear)
    .where(publishedGearWhereClause())
    .orderBy(desc(effectiveReleaseDate), desc(gear.createdAt), gear.slug)
    .limit(limit);

  return rows.map((row) => row.slug);
}

export type GearEditView = {
  id: string;
  createdAt: Date;
  status: (typeof gearEdits.status.enumValues)[number];
  payload: unknown;
  gearId: string | null;
  gearName: string | null;
  gearSlug: string | null;
  gearType: string | null;
};

export async function fetchGearEditByIdData(
  id: string,
): Promise<GearEditView | null> {
  const rows = await db
    .select({
      id: gearEdits.id,
      createdAt: gearEdits.createdAt,
      status: gearEdits.status,
      payload: gearEdits.payload,
      gearId: gearEdits.gearId,
      gearName: gear.name,
      gearSlug: gear.slug,
      gearType: gear.gearType,
    })
    .from(gearEdits)
    .leftJoin(gear, eq(gearEdits.gearId, gear.id))
    .where(eq(gearEdits.id, id))
    .limit(1);
  return (rows[0] as unknown as GearEditView) ?? null;
}

export type ContributorRow = {
  userId: string;
  name: string | null;
  handle: string | null;
  memberNumber: number;
  image: string | null;
  payload: unknown;
  videoContributionCount: number;
};

export async function fetchContributorsByGearIdData(
  gearId: string,
): Promise<ContributorRow[]> {
  const editRows = await db
    .select({
      userId: users.id,
      name: users.name,
      handle: users.handle,
      memberNumber: users.memberNumber,
      image: getResolvedUserImageSql(),
      payload: gearEdits.payload,
      videoContributionCount: sql<number>`0`,
    })
    .from(gearEdits)
    .innerJoin(users, eq(gearEdits.createdById, users.id))
    .where(eq(gearEdits.gearId, gearId));

  const videoRows = await db
    .select({
      userId: users.id,
      name: users.name,
      handle: users.handle,
      memberNumber: users.memberNumber,
      image: getResolvedUserImageSql(),
      videoContributionCount: count(gearCreatorVideos.id),
    })
    .from(gearCreatorVideos)
    .innerJoin(users, eq(gearCreatorVideos.createdByUserId, users.id))
    .where(
      and(
        eq(gearCreatorVideos.gearId, gearId),
        eq(gearCreatorVideos.isActive, true),
      ),
    )
    .groupBy(
      users.id,
      users.name,
      users.handle,
      users.memberNumber,
      users.image,
      users.discordImage,
      users.avatarSource,
    );

  const contributorRows: ContributorRow[] = editRows.map((row) => ({
    ...row,
    payload: row.payload,
    videoContributionCount: 0,
  }));

  const contributorByUserId = new Map<string, ContributorRow[]>();
  for (const row of contributorRows) {
    const existing = contributorByUserId.get(row.userId) ?? [];
    existing.push(row);
    contributorByUserId.set(row.userId, existing);
  }

  for (const videoRow of videoRows) {
    const existingRows = contributorByUserId.get(videoRow.userId);
    if (existingRows && existingRows.length > 0) {
      for (const row of existingRows) {
        row.videoContributionCount = Number(
          videoRow.videoContributionCount ?? 0,
        );
      }
      continue;
    }

    contributorRows.push({
      userId: videoRow.userId,
      name: videoRow.name,
      handle: videoRow.handle,
      memberNumber: videoRow.memberNumber,
      image: videoRow.image,
      payload: null,
      videoContributionCount: Number(videoRow.videoContributionCount ?? 0),
    });
  }

  return contributorRows;
}

/** Minimal fields across ALL gear needed to evaluate construction state */
export type ConstructionMinimalRow = {
  id: string;
  slug: string;
  name: string;
  gearType: string;
  publicationState: typeof gear.$inferSelect.publicationState;
  thumbnailUrl: string | null;
  topViewUrl: string | null;
  rearViewUrl: string | null;
  leftViewUrl: string | null;
  rightViewUrl: string | null;
  brandId: string | null;
  brandName: string | null;
  mountId: string | null; // legacy single-mount pointer
  createdAt: Date;
  // Camera bits
  camera_sensorFormatId: string | null;
  camera_resolutionMp: number | string | null;
  analog_cameraType: string | null;
  analog_captureMedium: string | null;
  fixed_focalMin: number | null;
  fixed_focalMax: number | null;
  // Lens bits
  lens_focalMin: number | null;
  lens_focalMax: number | null;
  lens_isPrime: boolean | null;
  lens_maxApertureWide: number | string | null;
  lens_imageCircleSizeId: string | null;
  // Full spec rows (optional, for completion computation)
  cameraAll?: Record<string, unknown> | null;
  analogAll?: Record<string, unknown> | null;
  lensAll?: Record<string, unknown> | null;
  fixedAll?: Record<string, unknown> | null;
};

async function fetchGearForConstructionData(
  gearIds?: string[],
  includeFullSpecs = false,
): Promise<Array<ConstructionMinimalRow & { mountIds: string[] }>> {
  if (gearIds?.length === 0) return [];

  // Base rows with minimal joins
  const rows = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      gearType: gear.gearType,
      publicationState: gear.publicationState,
      thumbnailUrl: gear.thumbnailUrl,
      topViewUrl: gear.topViewUrl,
      rearViewUrl: gear.rearViewUrl,
      leftViewUrl: gear.leftViewUrl,
      rightViewUrl: gear.rightViewUrl,
      brandId: gear.brandId,
      brandName: brands.name,
      mountId: gear.mountId,
      createdAt: gear.createdAt,
      camera_sensorFormatId: cameraSpecs.sensorFormatId,
      camera_resolutionMp: cameraSpecs.resolutionMp,
      analog_cameraType: analogCameraSpecs.cameraType,
      analog_captureMedium: analogCameraSpecs.captureMedium,
      fixed_focalMin: fixedLensSpecs.focalLengthMinMm,
      fixed_focalMax: fixedLensSpecs.focalLengthMaxMm,
      lens_focalMin: lensSpecs.focalLengthMinMm,
      lens_focalMax: lensSpecs.focalLengthMaxMm,
      lens_isPrime: lensSpecs.isPrime,
      lens_maxApertureWide: lensSpecs.maxApertureWide,
      lens_imageCircleSizeId: lensSpecs.imageCircleSizeId,
      ...(includeFullSpecs
        ? {
            cameraAll: cameraSpecs,
            analogAll: analogCameraSpecs,
            lensAll: lensSpecs,
            fixedAll: fixedLensSpecs,
          }
        : {}),
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .leftJoin(cameraSpecs, eq(gear.id, cameraSpecs.gearId))
    .leftJoin(analogCameraSpecs, eq(gear.id, analogCameraSpecs.gearId))
    .leftJoin(fixedLensSpecs, eq(gear.id, fixedLensSpecs.gearId))
    .leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId))
    .where(
      gearIds
        ? and(publishedGearWhereClause(), inArray(gear.id, gearIds))
        : publishedGearWhereClause(),
    );

  const fetchedGearIds = rows.map((r) => r.id);
  const mountsRows = fetchedGearIds.length
    ? await db
        .select({ gearId: gearMounts.gearId, mountId: gearMounts.mountId })
        .from(gearMounts)
        .where(inArray(gearMounts.gearId, fetchedGearIds))
    : [];

  const mountIdsByGearId = new Map<string, string[]>();
  for (const mr of mountsRows) {
    if (!mountIdsByGearId.has(mr.gearId)) mountIdsByGearId.set(mr.gearId, []);
    mountIdsByGearId.get(mr.gearId)!.push(mr.mountId);
  }

  return rows.map((r) => ({
    ...r,
    mountIds: mountIdsByGearId.get(r.id) ?? [],
  }));
}

export async function fetchAllGearForConstructionData(): Promise<
  Array<ConstructionMinimalRow & { mountIds: string[] }>
> {
  return fetchGearForConstructionData(undefined, true);
}

export async function fetchGearConstructionDataByIds(
  gearIds: string[],
): Promise<Array<ConstructionMinimalRow & { mountIds: string[] }>> {
  return fetchGearForConstructionData(gearIds);
}

// Writes
export async function addToWishlist(gearId: string, userId: string) {
  const exists = await db
    .select({ userId: wishlists.userId })
    .from(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.gearId, gearId)))
    .limit(1);
  if (exists.length > 0) return { alreadyExists: true } as const;

  await db.insert(wishlists).values({ userId, gearId });

  const deduped = await hasEventForUserOnUtcDay({
    gearId,
    userId,
    eventType: "wishlist_add",
  });
  if (!deduped) {
    await db.insert(popularityEvents).values({
      gearId,
      userId,
      eventType: "wishlist_add",
    });

    await incrementGearPopularityIntraday({
      gearId,
      eventType: "wishlist_add",
    });
  }
  return { added: true, alreadyExists: false } as const;
}

export async function removeFromWishlist(gearId: string, userId: string) {
  await db
    .delete(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.gearId, gearId)));
  return { removed: true } as const;
}

export async function addOwnership(gearId: string, userId: string) {
  const exists = await db
    .select({ userId: ownerships.userId })
    .from(ownerships)
    .where(and(eq(ownerships.userId, userId), eq(ownerships.gearId, gearId)))
    .limit(1);
  if (exists.length > 0) return { alreadyExists: true } as const;

  await db.insert(ownerships).values({ userId, gearId });

  const deduped = await hasEventForUserOnUtcDay({
    gearId,
    userId,
    eventType: "owner_add",
  });
  if (!deduped) {
    await db.insert(popularityEvents).values({
      gearId,
      userId,
      eventType: "owner_add",
    });

    await incrementGearPopularityIntraday({
      gearId,
      eventType: "owner_add",
    });
  }
  return { added: true, alreadyExists: false } as const;
}

export async function removeOwnership(gearId: string, userId: string) {
  await db
    .delete(ownerships)
    .where(and(eq(ownerships.userId, userId), eq(ownerships.gearId, gearId)));
  return { removed: true } as const;
}

export async function updateOwnershipColorway(params: {
  gearId: string;
  userId: string;
  colorwayId: string | null;
}) {
  const updated = await db
    .update(ownerships)
    .set({ colorwayId: params.colorwayId })
    .where(
      and(
        eq(ownerships.userId, params.userId),
        eq(ownerships.gearId, params.gearId),
      ),
    )
    .returning({
      gearId: ownerships.gearId,
      userId: ownerships.userId,
      colorwayId: ownerships.colorwayId,
    });

  return updated[0] ?? null;
}

export async function hasImageRequest(
  gearId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: imageRequests.userId })
    .from(imageRequests)
    .where(
      and(eq(imageRequests.userId, userId), eq(imageRequests.gearId, gearId)),
    )
    .limit(1);
  return row.length > 0;
}

export async function addImageRequest(gearId: string, userId: string) {
  // Single insert with conflict handling to avoid race conditions on the composite key
  const inserted = await db
    .insert(imageRequests)
    .values({ userId, gearId })
    .onConflictDoNothing({
      target: [imageRequests.userId, imageRequests.gearId],
    })
    .returning({ userId: imageRequests.userId });

  const added = inserted.length > 0;
  return { added, alreadyExists: !added } as const;
}

export async function removeImageRequest(gearId: string, userId: string) {
  await db
    .delete(imageRequests)
    .where(
      and(eq(imageRequests.userId, userId), eq(imageRequests.gearId, gearId)),
    );
  return { removed: true } as const;
}

/** Remove all image requests for a gear once an image has been added */
export async function clearImageRequestsForGear(gearId: string) {
  await db.delete(imageRequests).where(eq(imageRequests.gearId, gearId));
}

export async function fetchAllImageRequests() {
  return db
    .select({
      gearId: imageRequests.gearId,
      gearName: gear.name,
      gearSlug: gear.slug,
      requestCount: sql<number>`count(*)`,
      latestRequestDate: sql<Date>`max(${imageRequests.createdAt})`,
    })
    .from(imageRequests)
    .leftJoin(gear, eq(imageRequests.gearId, gear.id))
    .groupBy(imageRequests.gearId, gear.name, gear.slug)
    .orderBy(sql`count(*) desc, max(${imageRequests.createdAt}) desc`);
}

export async function createReview(params: {
  gearId: string;
  userId: string;
  content: string;
  genres: string[];
  recommend: boolean;
  status?: "PENDING" | "APPROVED" | "REJECTED";
}) {
  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.gearId, params.gearId),
        eq(reviews.createdById, params.userId),
      ),
    )
    .limit(1);
  if (existing.length > 0)
    return { alreadyExists: true, review: null as any } as const;

  const inserted = await db
    .insert(reviews)
    .values({
      gearId: params.gearId,
      createdById: params.userId,
      status: params.status ?? "PENDING",
      content: params.content,
      genres: params.genres as any,
      recommend: params.recommend,
    })
    .returning();

  await db.insert(popularityEvents).values({
    gearId: params.gearId,
    userId: params.userId,
    eventType: "review_submit",
  });

  await incrementGearPopularityIntraday({
    gearId: params.gearId,
    eventType: "review_submit",
  });

  return { alreadyExists: false, review: inserted[0]! } as const;
}

export async function getReviewById(reviewId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      gearId: reviews.gearId,
      createdById: reviews.createdById,
      status: reviews.status,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasOpenReviewFlag(params: {
  reviewId: string;
  reporterUserId: string;
}) {
  const rows = await db
    .select({ id: reviewFlags.id })
    .from(reviewFlags)
    .where(
      and(
        eq(reviewFlags.reviewId, params.reviewId),
        eq(reviewFlags.reporterUserId, params.reporterUserId),
        eq(reviewFlags.status, "OPEN"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function insertReviewFlag(params: {
  reviewId: string;
  reporterUserId: string;
}) {
  const inserted = await db
    .insert(reviewFlags)
    .values({
      reviewId: params.reviewId,
      reporterUserId: params.reporterUserId,
      status: "OPEN",
    })
    .returning({ id: reviewFlags.id });
  return inserted[0]?.id ?? null;
}

export async function resolveOpenReviewFlags(params: {
  reviewId: string;
  status: "RESOLVED_KEEP" | "RESOLVED_REJECTED" | "RESOLVED_DELETED";
  resolvedByUserId: string;
}) {
  const now = new Date();
  await db
    .update(reviewFlags)
    .set({
      status: params.status,
      resolvedByUserId: params.resolvedByUserId,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviewFlags.reviewId, params.reviewId),
        eq(reviewFlags.status, "OPEN"),
      ),
    );
}

export async function deleteReviewById(reviewId: string) {
  await db.delete(reviews).where(eq(reviews.id, reviewId));
}

/** Insert a new gear edit proposal (normalized payload should be provided by service layer) */
export async function createGearEditProposal(params: {
  gearId: string;
  userId: string;
  payload: Record<string, unknown>;
  metadata?: AutoApprovalMetadata | null;
  note?: string | null;
}) {
  const inserted = await db
    .insert(gearEdits)
    .values({
      gearId: params.gearId,
      createdById: params.userId,
      payload: params.payload as any,
      metadata: params.metadata ?? null,
      note: params.note ?? null,
      status: "PENDING",
    })
    .returning();
  return inserted[0]!;
}

export async function countApprovedGearEditsByUser(
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(gearEdits)
    .where(
      and(eq(gearEdits.createdById, userId), eq(gearEdits.status, "APPROVED")),
    );

  return Number(row?.count ?? 0);
}

/** Insert audit log entry */
export async function insertAuditLog(params: {
  action:
    | "GEAR_CREATE"
    | "GEAR_EDIT_PROPOSE"
    | "GEAR_EDIT_APPROVE"
    | "GEAR_EDIT_REJECT"
    | "GEAR_EDIT_MERGE";
  actorUserId: string;
  gearId?: string;
  gearEditId?: string;
  metadata?: AutoApprovalMetadata | null;
}) {
  await db.insert(auditLogs).values(params);
}

export async function updateGearEditMetadata(params: {
  gearEditId: string;
  metadata: AutoApprovalMetadata | null;
}) {
  await db
    .update(gearEdits)
    .set({
      metadata: params.metadata ?? null,
      updatedAt: new Date(),
    })
    .where(eq(gearEdits.id, params.gearEditId));
}

/** Get pending edit ID for a user and gear */
export async function getPendingEditIdData(
  gearId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .select({ id: gearEdits.id })
    .from(gearEdits)
    .where(
      and(
        eq(gearEdits.gearId, gearId),
        eq(gearEdits.createdById, userId),
        eq(gearEdits.status, "PENDING"),
      ),
    )
    .limit(1);
  return row[0]?.id ?? null;
}

// --- Gear Alternatives ---

export type GearAlternativeRow = {
  gearId: string;
  name: string;
  slug: string;
  regionalAliases?: GearAlias[] | null;
  brandName: string | null;
  thumbnailUrl: string | null;
  gearType: string;
  isCompetitor: boolean;
  releaseDate: string | null;
  releaseDatePrecision: string | null;
  announcedDate: string | null;
  announceDatePrecision: string | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection: GearPriceProjection | null;
};

export type GearLineageItem = {
  gearId: string;
  name: string;
  slug: string;
  brandName: string | null;
  gearType: string;
};

export type GearLineageRelationships = {
  predecessor: GearLineageItem | null;
  successor: GearLineageItem | null;
};

export async function fetchGearLineageByGearId(
  gearId: string,
): Promise<GearLineageRelationships> {
  const current = await db
    .select({
      predecessorGearId: gear.predecessorGearId,
      successorGearId: gear.successorGearId,
    })
    .from(gear)
    .where(eq(gear.id, gearId))
    .limit(1);
  const relationshipIds = [
    current[0]?.predecessorGearId,
    current[0]?.successorGearId,
  ].filter((id): id is string => Boolean(id));
  if (!relationshipIds.length) return { predecessor: null, successor: null };

  const rows = await db
    .select({
      gearId: gear.id,
      name: gear.name,
      slug: gear.slug,
      brandName: brands.name,
      gearType: gear.gearType,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(inArray(gear.id, relationshipIds));
  const byId = new Map(rows.map((row) => [row.gearId, row]));
  return {
    predecessor: current[0]?.predecessorGearId
      ? (byId.get(current[0].predecessorGearId) ?? null)
      : null,
    successor: current[0]?.successorGearId
      ? (byId.get(current[0].successorGearId) ?? null)
      : null,
  };
}

export type GearLineageValidationRow = {
  id: string;
  slug: string;
  gearType: string;
  predecessorGearId: string | null;
  successorGearId: string | null;
};

export async function fetchGearLineageValidationRows(
  ids: string[],
): Promise<GearLineageValidationRow[]> {
  if (!ids.length) return [];
  return db
    .select({
      id: gear.id,
      slug: gear.slug,
      gearType: gear.gearType,
      predecessorGearId: gear.predecessorGearId,
      successorGearId: gear.successorGearId,
    })
    .from(gear)
    .where(inArray(gear.id, [...new Set(ids)]));
}

/** Atomically reconciles reciprocal, one-to-one predecessor/successor links. */
export async function setGearLineage(params: {
  gearId: string;
  predecessorGearId: string | null;
  successorGearId: string | null;
}): Promise<string[]> {
  const { gearId, predecessorGearId, successorGearId } = params;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('gear-lineage'))`,
    );
    const affectedIds = new Set<string>([gearId]);
    const getRow = async (id: string) => {
      const rows = await tx
        .select({
          id: gear.id,
          gearType: gear.gearType,
          predecessorGearId: gear.predecessorGearId,
          successorGearId: gear.successorGearId,
        })
        .from(gear)
        .where(eq(gear.id, id))
        .limit(1);
      return rows[0] ?? null;
    };
    const current = await getRow(gearId);
    if (!current) throw new Error("Gear item not found");
    const targets = [predecessorGearId, successorGearId].filter(
      (id): id is string => Boolean(id),
    );
    if (targets.includes(gearId))
      throw new Error("A gear item cannot be its own predecessor or successor");
    if (predecessorGearId && predecessorGearId === successorGearId)
      throw new Error("Predecessor and successor must be different gear items");
    for (const id of targets) {
      const target = await getRow(id);
      if (!target) throw new Error("Selected gear item was not found");
      if (target.gearType !== current.gearType)
        throw new Error(
          "Predecessor and successor must have the same gear type",
        );
    }
    const assertNoCycle = async (
      startId: string | null,
      field: "predecessorGearId" | "successorGearId",
    ) => {
      const seen = new Set<string>([gearId]);
      let cursor = startId;
      for (let depth = 0; cursor; depth++) {
        if (depth >= MAX_GEAR_LINEAGE_TRAVERSAL_DEPTH)
          throw new Error("Gear lineage exceeds the maximum traversal depth");
        if (seen.has(cursor))
          throw new Error("This relationship would create a lineage cycle");
        seen.add(cursor);
        cursor = (await getRow(cursor))?.[field] ?? null;
      }
    };
    await assertNoCycle(successorGearId, "successorGearId");
    await assertNoCycle(predecessorGearId, "predecessorGearId");

    if (
      current.predecessorGearId &&
      current.predecessorGearId !== predecessorGearId
    ) {
      affectedIds.add(current.predecessorGearId);
      await tx
        .update(gear)
        .set({ successorGearId: null })
        .where(
          and(
            eq(gear.id, current.predecessorGearId),
            eq(gear.successorGearId, gearId),
          ),
        );
    }
    if (
      current.successorGearId &&
      current.successorGearId !== successorGearId
    ) {
      affectedIds.add(current.successorGearId);
      await tx
        .update(gear)
        .set({ predecessorGearId: null })
        .where(
          and(
            eq(gear.id, current.successorGearId),
            eq(gear.predecessorGearId, gearId),
          ),
        );
    }

    if (predecessorGearId) {
      const predecessor = await getRow(predecessorGearId);
      if (!predecessor) throw new Error("Predecessor gear item not found");
      affectedIds.add(predecessorGearId);
      if (
        predecessor.successorGearId &&
        predecessor.successorGearId !== gearId
      ) {
        affectedIds.add(predecessor.successorGearId);
        await tx
          .update(gear)
          .set({ predecessorGearId: null })
          .where(
            and(
              eq(gear.id, predecessor.successorGearId),
              eq(gear.predecessorGearId, predecessorGearId),
            ),
          );
      }
      await tx
        .update(gear)
        .set({ successorGearId: gearId })
        .where(eq(gear.id, predecessorGearId));
    }

    if (successorGearId) {
      const successor = await getRow(successorGearId);
      if (!successor) throw new Error("Successor gear item not found");
      affectedIds.add(successorGearId);
      if (
        successor.predecessorGearId &&
        successor.predecessorGearId !== gearId
      ) {
        affectedIds.add(successor.predecessorGearId);
        await tx
          .update(gear)
          .set({ successorGearId: null })
          .where(
            and(
              eq(gear.id, successor.predecessorGearId),
              eq(gear.successorGearId, successorGearId),
            ),
          );
      }
      await tx
        .update(gear)
        .set({ predecessorGearId: gearId })
        .where(eq(gear.id, successorGearId));
    }

    await tx
      .update(gear)
      .set({ predecessorGearId, successorGearId })
      .where(eq(gear.id, gearId));
    return [...affectedIds];
  });
}

/**
 * Fetch all alternatives for a gear item (both directions due to symmetric storage).
 * Returns the "other" gear item in each pair along with metadata.
 */
export async function fetchAlternativesByGearId(
  gearId: string,
): Promise<GearAlternativeRow[]> {
  // Query both directions: where gearId is gearAId or gearBId
  const rows = await db
    .select({
      gearAId: gearAlternatives.gearAId,
      gearBId: gearAlternatives.gearBId,
      isCompetitor: gearAlternatives.isCompetitor,
      // Gear A info
      gearAName: sql<string>`ga.name`.as("gear_a_name"),
      gearASlug: sql<string>`ga.slug`.as("gear_a_slug"),
      gearAThumbnail: sql<string | null>`CASE
        WHEN ga.gear_type = 'LENS'
          THEN COALESCE(NULLIF(ga.thumbnail_url, ''), NULLIF(ga.top_view_url, ''))
        ELSE ga.thumbnail_url
      END`.as("gear_a_thumbnail"),
      gearAType: sql<string>`ga.gear_type`.as("gear_a_type"),
      gearABrandName: sql<string | null>`ba.name`.as("gear_a_brand_name"),
      gearAReleaseDate: sql<string | null>`ga.release_date`.as(
        "gear_a_release_date",
      ),
      gearAReleaseDatePrecision: sql<
        string | null
      >`ga.release_date_precision`.as("gear_a_release_date_precision"),
      gearAAnnouncedDate: sql<string | null>`ga.announced_date`.as(
        "gear_a_announced_date",
      ),
      gearAAnnounceDatePrecision: sql<
        string | null
      >`ga.announce_date_precision`.as("gear_a_announce_date_precision"),
      gearAMsrpNowUsdCents: sql<number | null>`ga.msrp_now_usd_cents`.as(
        "gear_a_msrp_now_usd_cents",
      ),
      gearAMsrpAtLaunchUsdCents: sql<
        number | null
      >`ga.msrp_at_launch_usd_cents`.as("gear_a_msrp_at_launch_usd_cents"),
      gearAMpbMaxPriceUsdCents: sql<
        number | null
      >`ga.mpb_max_price_usd_cents`.as("gear_a_mpb_max_price_usd_cents"),
      gearAUsedPriceProjection:
        sql<GearPriceProjection | null>`ga.used_price_projection`.as(
          "gear_a_used_price_projection",
        ),
      // Gear B info
      gearBName: sql<string>`gb.name`.as("gear_b_name"),
      gearBSlug: sql<string>`gb.slug`.as("gear_b_slug"),
      gearBThumbnail: sql<string | null>`CASE
        WHEN gb.gear_type = 'LENS'
          THEN COALESCE(NULLIF(gb.thumbnail_url, ''), NULLIF(gb.top_view_url, ''))
        ELSE gb.thumbnail_url
      END`.as("gear_b_thumbnail"),
      gearBType: sql<string>`gb.gear_type`.as("gear_b_type"),
      gearBBrandName: sql<string | null>`bb.name`.as("gear_b_brand_name"),
      gearBReleaseDate: sql<string | null>`gb.release_date`.as(
        "gear_b_release_date",
      ),
      gearBReleaseDatePrecision: sql<
        string | null
      >`gb.release_date_precision`.as("gear_b_release_date_precision"),
      gearBAnnouncedDate: sql<string | null>`gb.announced_date`.as(
        "gear_b_announced_date",
      ),
      gearBAnnounceDatePrecision: sql<
        string | null
      >`gb.announce_date_precision`.as("gear_b_announce_date_precision"),
      gearBMsrpNowUsdCents: sql<number | null>`gb.msrp_now_usd_cents`.as(
        "gear_b_msrp_now_usd_cents",
      ),
      gearBMsrpAtLaunchUsdCents: sql<
        number | null
      >`gb.msrp_at_launch_usd_cents`.as("gear_b_msrp_at_launch_usd_cents"),
      gearBMpbMaxPriceUsdCents: sql<
        number | null
      >`gb.mpb_max_price_usd_cents`.as("gear_b_mpb_max_price_usd_cents"),
      gearBUsedPriceProjection:
        sql<GearPriceProjection | null>`gb.used_price_projection`.as(
          "gear_b_used_price_projection",
        ),
    })
    .from(gearAlternatives)
    .innerJoin(sql`${gear} AS ga`, sql`ga.id = ${gearAlternatives.gearAId}`)
    .innerJoin(sql`${gear} AS gb`, sql`gb.id = ${gearAlternatives.gearBId}`)
    .leftJoin(sql`${brands} AS ba`, sql`ba.id = ga.brand_id`)
    .leftJoin(sql`${brands} AS bb`, sql`bb.id = gb.brand_id`)
    .where(
      or(
        eq(gearAlternatives.gearAId, gearId),
        eq(gearAlternatives.gearBId, gearId),
      ),
    );

  // Map to return the "other" gear item (not the one we're querying for)
  const mapped = rows.map((row) => {
    const isA = row.gearAId === gearId;
    return {
      gearId: isA ? row.gearBId : row.gearAId,
      name: isA ? row.gearBName : row.gearAName,
      slug: isA ? row.gearBSlug : row.gearASlug,
      brandName: isA ? row.gearBBrandName : row.gearABrandName,
      thumbnailUrl: isA ? row.gearBThumbnail : row.gearAThumbnail,
      gearType: isA ? row.gearBType : row.gearAType,
      isCompetitor: row.isCompetitor,
      releaseDate: isA ? row.gearBReleaseDate : row.gearAReleaseDate,
      releaseDatePrecision: isA
        ? row.gearBReleaseDatePrecision
        : row.gearAReleaseDatePrecision,
      announcedDate: isA ? row.gearBAnnouncedDate : row.gearAAnnouncedDate,
      announceDatePrecision: isA
        ? row.gearBAnnounceDatePrecision
        : row.gearAAnnounceDatePrecision,
      msrpNowUsdCents: isA
        ? row.gearBMsrpNowUsdCents
        : row.gearAMsrpNowUsdCents,
      msrpAtLaunchUsdCents: isA
        ? row.gearBMsrpAtLaunchUsdCents
        : row.gearAMsrpAtLaunchUsdCents,
      mpbMaxPriceUsdCents: isA
        ? row.gearBMpbMaxPriceUsdCents
        : row.gearAMpbMaxPriceUsdCents,
      usedPriceProjection: isA
        ? row.gearBUsedPriceProjection
        : row.gearAUsedPriceProjection,
    };
  });

  const aliasesById = await fetchGearAliasesByGearIds(
    mapped.map((item) => item.gearId),
  );

  return mapped.map((item) => ({
    ...item,
    regionalAliases: aliasesById.get(item.gearId) ?? [],
  }));
}

/**
 * Helper to ensure canonical ordering for pair storage.
 * Returns [smaller, larger] by lexicographic comparison.
 */
function canonicalPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

/**
 * Add an alternative relationship between two gear items.
 * Handles canonical ordering internally.
 */
export async function addGearAlternative(params: {
  gearId: string;
  alternativeGearId: string;
  isCompetitor: boolean;
}): Promise<void> {
  const { gearId, alternativeGearId, isCompetitor } = params;
  if (gearId === alternativeGearId) {
    throw new Error("Cannot add a gear item as its own alternative");
  }

  const [gearAId, gearBId] = canonicalPair(gearId, alternativeGearId);

  await db
    .insert(gearAlternatives)
    .values({ gearAId, gearBId, isCompetitor })
    .onConflictDoUpdate({
      target: [gearAlternatives.gearAId, gearAlternatives.gearBId],
      set: { isCompetitor },
    });
}

/**
 * Remove an alternative relationship between two gear items.
 */
export async function removeGearAlternative(params: {
  gearId: string;
  alternativeGearId: string;
}): Promise<void> {
  const { gearId, alternativeGearId } = params;
  const [gearAId, gearBId] = canonicalPair(gearId, alternativeGearId);

  await db
    .delete(gearAlternatives)
    .where(
      and(
        eq(gearAlternatives.gearAId, gearAId),
        eq(gearAlternatives.gearBId, gearBId),
      ),
    );
}

/**
 * Update the competitor flag for an existing alternative relationship.
 */
export async function updateGearAlternativeCompetitor(params: {
  gearId: string;
  alternativeGearId: string;
  isCompetitor: boolean;
}): Promise<void> {
  const { gearId, alternativeGearId, isCompetitor } = params;
  const [gearAId, gearBId] = canonicalPair(gearId, alternativeGearId);

  await db
    .update(gearAlternatives)
    .set({ isCompetitor })
    .where(
      and(
        eq(gearAlternatives.gearAId, gearAId),
        eq(gearAlternatives.gearBId, gearBId),
      ),
    );
}

/**
 * Bulk replace all alternatives for a gear item.
 * Removes existing alternatives not in the new list, adds/updates others.
 */
export async function setGearAlternatives(
  gearId: string,
  alternatives: Array<{ alternativeGearId: string; isCompetitor: boolean }>,
): Promise<void> {
  // Get current alternatives
  const current = await fetchAlternativesByGearId(gearId);
  const newIds = new Set(alternatives.map((a) => a.alternativeGearId));

  // Remove alternatives not in new list
  for (const curr of current) {
    if (!newIds.has(curr.gearId)) {
      await removeGearAlternative({ gearId, alternativeGearId: curr.gearId });
    }
  }

  // Add or update alternatives in new list
  for (const alt of alternatives) {
    await addGearAlternative({
      gearId,
      alternativeGearId: alt.alternativeGearId,
      isCompetitor: alt.isCompetitor,
    });
  }
}

export const MAX_GEAR_LINEAGE_TRAVERSAL_DEPTH = 100;

/**
 * Atomically replaces alternatives and reciprocal lineage. A transaction-scoped
 * advisory lock serializes this intentionally rare editor workflow.
 */
export async function updateGearRelationshipsData(params: {
  gearId: string;
  alternatives: Array<{ alternativeGearId: string; isCompetitor: boolean }>;
  predecessorGearId: string | null;
  successorGearId: string | null;
}): Promise<string[]> {
  const { gearId, alternatives, predecessorGearId, successorGearId } = params;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('gear-lineage'))`,
    );
    const affectedIds = new Set<string>([gearId]);
    const getRow = async (id: string) => {
      const rows = await tx
        .select({
          id: gear.id,
          gearType: gear.gearType,
          predecessorGearId: gear.predecessorGearId,
          successorGearId: gear.successorGearId,
        })
        .from(gear)
        .where(eq(gear.id, id))
        .limit(1);
      return rows[0] ?? null;
    };
    const current = await getRow(gearId);
    if (!current) throw new Error("Gear item not found");
    const targets = [predecessorGearId, successorGearId].filter(
      (id): id is string => Boolean(id),
    );
    if (targets.includes(gearId))
      throw new Error("A gear item cannot be its own predecessor or successor");
    if (predecessorGearId && predecessorGearId === successorGearId)
      throw new Error("Predecessor and successor must be different gear items");
    for (const id of targets) {
      const target = await getRow(id);
      if (!target) throw new Error("Selected gear item was not found");
      if (target.gearType !== current.gearType)
        throw new Error(
          "Predecessor and successor must have the same gear type",
        );
    }
    const assertNoCycle = async (
      startId: string | null,
      field: "predecessorGearId" | "successorGearId",
    ) => {
      const seen = new Set<string>([gearId]);
      let cursor = startId;
      for (let depth = 0; cursor; depth++) {
        if (depth >= MAX_GEAR_LINEAGE_TRAVERSAL_DEPTH)
          throw new Error("Gear lineage exceeds the maximum traversal depth");
        if (seen.has(cursor))
          throw new Error("This relationship would create a lineage cycle");
        seen.add(cursor);
        cursor = (await getRow(cursor))?.[field] ?? null;
      }
    };
    await assertNoCycle(successorGearId, "successorGearId");
    await assertNoCycle(predecessorGearId, "predecessorGearId");

    const clearInverse = async (
      id: string | null,
      field: "predecessorGearId" | "successorGearId",
      expectedLinkedGearId: string = gearId,
    ) => {
      if (!id) return;
      affectedIds.add(id);
      await tx
        .update(gear)
        .set({ [field]: null })
        .where(and(eq(gear.id, id), eq(gear[field], expectedLinkedGearId)));
    };
    if (current.predecessorGearId !== predecessorGearId)
      await clearInverse(current.predecessorGearId, "successorGearId");
    if (current.successorGearId !== successorGearId)
      await clearInverse(current.successorGearId, "predecessorGearId");
    if (predecessorGearId) {
      const predecessor = await getRow(predecessorGearId);
      if (
        predecessor?.successorGearId &&
        predecessor.successorGearId !== gearId
      )
        await clearInverse(
          predecessor.successorGearId,
          "predecessorGearId",
          predecessorGearId,
        );
      affectedIds.add(predecessorGearId);
      await tx
        .update(gear)
        .set({ successorGearId: gearId })
        .where(eq(gear.id, predecessorGearId));
    }
    if (successorGearId) {
      const successor = await getRow(successorGearId);
      if (
        successor?.predecessorGearId &&
        successor.predecessorGearId !== gearId
      )
        await clearInverse(
          successor.predecessorGearId,
          "successorGearId",
          successorGearId,
        );
      affectedIds.add(successorGearId);
      await tx
        .update(gear)
        .set({ predecessorGearId: gearId })
        .where(eq(gear.id, successorGearId));
    }
    await tx
      .update(gear)
      .set({ predecessorGearId, successorGearId })
      .where(eq(gear.id, gearId));

    const currentAlternativeRows = await tx
      .select({
        gearAId: gearAlternatives.gearAId,
        gearBId: gearAlternatives.gearBId,
      })
      .from(gearAlternatives)
      .where(
        or(
          eq(gearAlternatives.gearAId, gearId),
          eq(gearAlternatives.gearBId, gearId),
        ),
      );
    for (const row of currentAlternativeRows)
      affectedIds.add(row.gearAId === gearId ? row.gearBId : row.gearAId);
    for (const alternative of alternatives) {
      if (alternative.alternativeGearId === gearId)
        throw new Error("Cannot add a gear item as its own alternative");
      affectedIds.add(alternative.alternativeGearId);
    }
    await tx
      .delete(gearAlternatives)
      .where(
        or(
          eq(gearAlternatives.gearAId, gearId),
          eq(gearAlternatives.gearBId, gearId),
        ),
      );
    if (alternatives.length)
      await tx.insert(gearAlternatives).values(
        alternatives.map((alternative) => {
          const [gearAId, gearBId] = canonicalPair(
            gearId,
            alternative.alternativeGearId,
          );
          return { gearAId, gearBId, isCompetitor: alternative.isCompetitor };
        }),
      );
    const affectedRows = await tx
      .select({ slug: gear.slug })
      .from(gear)
      .where(inArray(gear.id, [...affectedIds]));
    return affectedRows.map((row) => row.slug);
  });
}
