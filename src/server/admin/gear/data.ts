import "server-only";

import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import { buildGearSearchName } from "~/lib/gear/naming";
import { normalizeMpbLinkForStorage } from "~/lib/links/mpb";
import { normalizeFuzzyTokens } from "~/lib/utils/fuzzy";
import { db } from "~/server/db";
import {
  analogCameraSpecs,
  brands,
  cameraSpecs,
  fixedLensSpecs,
  gear,
  gearPriceMappings,
  gearAliases,
  gearMounts,
  lensSpecs,
  mounts,
  recommendationItems,
} from "~/server/db/schema";
import { getUsedPricingMode } from "~/lib/pricing/used-pricing-preview";
import type { GearPublicationState, GearType } from "~/types/gear";
import { enqueueGearCreatedWebhookEvent } from "~/server/developer-api/webhooks/data";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = typeof db | DbTx;

function isForeignKeyViolation(error: unknown): error is {
  code: string;
  constraint?: string;
  constraint_name?: string;
  table?: string;
  table_name?: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23503"
  );
}
export interface FuzzySearchResult {
  id: string;
  name: string;
  slug: string;
}

export interface PerformFuzzySearchParams {
  inputName: string;
  brandName: string;
  brandId: string;
}

/**
 * Performs fuzzy search for similar gear items within the same brand.
 * Excludes brand tokens, splits letter-digit boundaries, and requires all tokens to match.
 */
export async function performFuzzySearch(
  params: PerformFuzzySearchParams,
): Promise<{
  results: FuzzySearchResult[];
  tokens: string[];
  normalized: string;
}> {
  const fuzzyStopWords = new Set(["nikkor", "eos", "lumix"]);
  const { inputName, brandName, brandId } = params;
  const normalized = buildGearSearchName({ name: inputName, brandName });

  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Exclude brand tokens from the input name
  const brandTokenSet = new Set(
    sanitize(brandName).split(/\s+/).filter(Boolean),
  );

  // Exclude stop words from the input name
  const inputNameWithoutStopWords = sanitize(inputName)
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !fuzzyStopWords.has(t));

  const rawTokens = inputNameWithoutStopWords.filter(
    (t) => !brandTokenSet.has(t),
  );

  const expanded: string[] = [];
  for (const token of rawTokens) {
    const parts = token.match(/[a-z]+|\d+/gi) || [];
    for (const part of parts) {
      if (part.length >= 2 || /\d+/.test(part)) expanded.push(part);
    }
  }

  const tokensForMatch = expanded.length > 0 ? expanded : rawTokens;
  if (tokensForMatch.length === 0) {
    return { results: [], tokens: [], normalized };
  }

  const andParts = tokensForMatch.map((t) => ilike(gear.searchName, `%${t}%`));

  const results = await db
    .select({ id: gear.id, name: gear.name, slug: gear.slug })
    .from(gear)
    .where(and(eq(gear.brandId, brandId), ...andParts))
    .limit(10);

  return { results, tokens: tokensForMatch, normalized };
}

export interface GearCreationCheckParams {
  brandId: string;
  name: string;
  modelNumber?: string;
}

export interface GearCreationCheckResult {
  slugPreview: string;
  hard: {
    slug: FuzzySearchResult | null;
    modelName: FuzzySearchResult | null;
  };
  fuzzy: FuzzySearchResult[];
}

export async function checkGearCreationData(
  params: GearCreationCheckParams,
): Promise<GearCreationCheckResult> {
  const { brandId, name, modelNumber } = params;

  if (!brandId || !name.trim()) {
    return {
      slugPreview: "",
      hard: { slug: null, modelName: null },
      fuzzy: [],
    };
  }

  // Load brand name
  const b = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (b.length === 0) {
    return {
      slugPreview: "",
      hard: { slug: null, modelName: null },
      fuzzy: [],
    };
  }
  const brandName = b[0]!.name;

  const slugPreview = buildSlug(brandName, name);
  // Hard conflicts
  const slugHit = await db
    .select({ id: gear.id, name: gear.name, slug: gear.slug })
    .from(gear)
    .where(eq(gear.slug, slugPreview))
    .limit(1);

  let modelHit: FuzzySearchResult[] = [];
  if (modelNumber?.trim()) {
    const lower = modelNumber.trim().toLowerCase();
    modelHit = await db
      .select({ id: gear.id, name: gear.name, slug: gear.slug })
      .from(gear)
      .where(eq(sql`lower(${gear.modelNumber})`, lower))
      .limit(1);
  }

  // Fuzzy search using centralized logic
  const { results: fuzzy } = await performFuzzySearch({
    inputName: name,
    brandName,
    brandId,
  });

  return {
    slugPreview,
    hard: {
      slug: slugHit[0] || null,
      modelName: modelHit[0] || null,
    },
    fuzzy,
  };
}

export interface GearCreationParams {
  name: string;
  brandId: string;
  gearType: GearType;
  publicationState?: GearPublicationState;
  modelNumber?: string;
  /**
   * Optional mounts to associate. Multi-mount is supported via the junction
   * table; mountId is deprecated in favor of mountIds.
   */
  mountIds?: string[];
  mountId?: string;
  linkManufacturer?: string;
  linkMpb?: string;
  linkAmazon?: string;
  initialCore?: {
    announcedDate?: string | Date;
    releaseDate?: string | Date;
    msrpNowUsdCents?: number;
    msrpAtLaunchUsdCents?: number;
    weightGrams?: number;
    linkManufacturer?: string;
    linkMpb?: string;
    linkAmazon?: string;
    notes?: string[];
  };
  initialLensSpecs?: {
    isPrime?: boolean;
    focalLengthMinMm?: number;
    focalLengthMaxMm?: number;
    imageCircleSizeId?: string;
    maxApertureWide?: number;
    maxApertureTele?: number;
    minApertureWide?: number;
    minApertureTele?: number;
    hasAutofocus?: boolean;
    hasStabilization?: boolean;
    isMacro?: boolean;
    frontFilterThreadSizeMm?: number;
    hasWeatherSealing?: boolean;
  };
  initialCameraSpecs?: {
    sensorFormatId?: string;
    resolutionMp?: number;
  };
  initialAnalogCameraSpecs?: {
    cameraType?: typeof analogCameraSpecs.$inferInsert.cameraType;
    captureMedium?: typeof analogCameraSpecs.$inferInsert.captureMedium;
  };
  initialFixedLensSpecs?: {
    isPrime?: boolean;
    focalLengthMinMm?: number;
    focalLengthMaxMm?: number;
    maxApertureWide?: number;
    maxApertureTele?: number;
  };
  force?: boolean;
}

export interface GearCreationResult {
  id: string;
  slug: string;
}

export async function createGearData(
  params: GearCreationParams,
): Promise<GearCreationResult> {
  const {
    name,
    brandId,
    gearType,
    publicationState = GEAR_PUBLICATION_STATES.PUBLISHED,
    modelNumber,
    mountIds,
    mountId,
    linkManufacturer,
    linkMpb,
    linkAmazon,
    initialCore,
    initialLensSpecs,
    initialCameraSpecs,
    initialAnalogCameraSpecs,
    initialFixedLensSpecs,
  } = params;

  const normalizedLinkMpb = normalizeMpbLinkForStorage(
    linkMpb ?? initialCore?.linkMpb,
  );

  // Validate brand exists
  const b = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (b.length === 0) {
    throw new Error("Invalid brand");
  }

  const requestedMountIds = mountIds ?? (mountId ? [mountId] : []);
  const normalizedMountIds = Array.from(
    new Set(
      requestedMountIds
        .map((m) => m.trim())
        .filter((m): m is string => m.length > 0),
    ),
  );

  if (normalizedMountIds.length > 0) {
    const found = await db
      .select({ id: mounts.id })
      .from(mounts)
      .where(inArray(mounts.id, normalizedMountIds));
    if (found.length !== normalizedMountIds.length) {
      throw new Error("Invalid mount");
    }
  }

  // Ensure brand is prefixed in display name
  const brandName = b[0]!.name;
  const inputName = name.trim();
  const hasBrandPrefix = inputName
    .toLowerCase()
    .startsWith(brandName.toLowerCase());
  const displayName = hasBrandPrefix ? inputName : `${brandName} ${inputName}`;

  // Create slug from display name (brand + name)
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  // Hard duplicate by slug
  const slugExists = await db
    .select({ id: gear.id })
    .from(gear)
    .where(eq(gear.slug, slug))
    .limit(1);
  if (slugExists.length > 0) {
    throw new Error("Slug already exists");
  }

  // Hard duplicate by modelName (case-insensitive), if provided
  if (modelNumber) {
    const lower = modelNumber.toLowerCase();
    const hit = await db
      .select({ id: gear.id })
      .from(gear)
      .where(eq(sql`lower(${gear.modelNumber})`, lower))
      .limit(1);
    if (hit.length > 0) {
      throw new Error("Model number already exists");
    }
  }

  const created = await db.transaction(async (tx) => {
    const parseDate = (value: string | Date | undefined): Date | null => {
      if (!value) return null;
      if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const pruneUndefined = <T extends Record<string, unknown>>(value: T): T =>
      Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
      ) as T;
    const toDecimalInput = (value: number | undefined) =>
      value === undefined ? undefined : String(value);

    const inserted = await tx
      .insert(gear)
      .values({
        name: displayName,
        slug,
        gearType,
        publicationState,
        brandId,
        modelNumber: modelNumber || null,
        announcedDate: parseDate(initialCore?.announcedDate),
        releaseDate: parseDate(initialCore?.releaseDate),
        msrpNowUsdCents: initialCore?.msrpNowUsdCents,
        msrpAtLaunchUsdCents: initialCore?.msrpAtLaunchUsdCents,
        weightGrams: initialCore?.weightGrams,
        linkManufacturer:
          linkManufacturer || initialCore?.linkManufacturer || null,
        linkMpb: normalizedLinkMpb,
        linkAmazon: linkAmazon || initialCore?.linkAmazon || null,
        notes: initialCore?.notes,
        mountId: normalizedMountIds[0] ?? null,
        searchName: buildGearSearchName({ name: displayName, brandName }),
      })
      .returning({ id: gear.id, slug: gear.slug });

    const createdGear = inserted[0]!;

    if (normalizedMountIds.length > 0) {
      await tx.insert(gearMounts).values(
        normalizedMountIds.map((id) => ({
          gearId: createdGear.id,
          mountId: id,
        })),
      );
    }

    // Create an empty specs row matching the gear type
    if (gearType === "CAMERA") {
      const values = pruneUndefined({
        gearId: createdGear.id,
        sensorFormatId: initialCameraSpecs?.sensorFormatId,
        resolutionMp: toDecimalInput(initialCameraSpecs?.resolutionMp),
      } satisfies typeof cameraSpecs.$inferInsert);
      await tx.insert(cameraSpecs).values(values);
    } else if (gearType === "ANALOG_CAMERA") {
      const values = pruneUndefined({
        gearId: createdGear.id,
        cameraType: initialAnalogCameraSpecs?.cameraType,
        captureMedium: initialAnalogCameraSpecs?.captureMedium,
      } satisfies typeof analogCameraSpecs.$inferInsert);
      await tx.insert(analogCameraSpecs).values(values);
    } else if (gearType === "LENS") {
      const values = pruneUndefined({
        gearId: createdGear.id,
        isPrime: initialLensSpecs?.isPrime,
        focalLengthMinMm: initialLensSpecs?.focalLengthMinMm,
        focalLengthMaxMm: initialLensSpecs?.focalLengthMaxMm,
        imageCircleSizeId: initialLensSpecs?.imageCircleSizeId,
        maxApertureWide: toDecimalInput(initialLensSpecs?.maxApertureWide),
        maxApertureTele: toDecimalInput(initialLensSpecs?.maxApertureTele),
        minApertureWide: toDecimalInput(initialLensSpecs?.minApertureWide),
        minApertureTele: toDecimalInput(initialLensSpecs?.minApertureTele),
        hasAutofocus: initialLensSpecs?.hasAutofocus,
        hasStabilization: initialLensSpecs?.hasStabilization,
        isMacro: initialLensSpecs?.isMacro,
        frontFilterThreadSizeMm: initialLensSpecs?.frontFilterThreadSizeMm,
        hasWeatherSealing: initialLensSpecs?.hasWeatherSealing,
      } satisfies typeof lensSpecs.$inferInsert);
      await tx.insert(lensSpecs).values(values);
    }

    if (
      (gearType === "CAMERA" || gearType === "ANALOG_CAMERA") &&
      initialFixedLensSpecs
    ) {
      const values = pruneUndefined({
        gearId: createdGear.id,
        isPrime: initialFixedLensSpecs.isPrime,
        focalLengthMinMm: initialFixedLensSpecs.focalLengthMinMm,
        focalLengthMaxMm: initialFixedLensSpecs.focalLengthMaxMm,
        maxApertureWide: toDecimalInput(initialFixedLensSpecs.maxApertureWide),
        maxApertureTele: toDecimalInput(initialFixedLensSpecs.maxApertureTele),
      } satisfies typeof fixedLensSpecs.$inferInsert);
      await tx.insert(fixedLensSpecs).values(values);
    }

    if (publicationState === GEAR_PUBLICATION_STATES.PUBLISHED) {
      await enqueueGearCreatedWebhookEvent(tx, {
        gearId: createdGear.id,
        name: displayName,
        slug: createdGear.slug,
        gearType,
        publicBaseUrl: getPublicBaseUrl(),
      });
    }

    return createdGear;
  });

  return created;
}

function buildSlug(brandName: string, name: string) {
  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const brandTokens = new Set(sanitize(brandName).split(/\s+/).filter(Boolean));
  const nameTokens = sanitize(name)
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !brandTokens.has(t));
  const nameNoBrand = nameTokens.join(" ");
  return `${brandName} ${nameNoBrand}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export interface FetchAdminGearItemsParams {
  limit: number;
  offset: number;
  q?: string;
}

const adminGearSelect = {
  id: gear.id,
  name: gear.name,
  slug: gear.slug,
  gearType: gear.gearType,
  publicationState: gear.publicationState,
  brandId: gear.brandId,
  brandName: brands.name,
  thumbnailUrl: gear.thumbnailUrl,
  topViewUrl: gear.topViewUrl,
  rearViewUrl: gear.rearViewUrl,
  leftViewUrl: gear.leftViewUrl,
  rightViewUrl: gear.rightViewUrl,
  usedPriceProjection: gear.usedPriceProjection,
  createdAt: gear.createdAt,
};

export async function fetchAdminGearItemsData(
  params: FetchAdminGearItemsParams,
) {
  const { limit, offset, q } = params;

  // Build optional where filter using tokenized search across searchName and slug
  const trimmed = (q ?? "").trim();
  const tokens = trimmed ? normalizeFuzzyTokens(trimmed) : [];
  const whereFilter =
    tokens.length > 0
      ? and(
          ...tokens.map((t) =>
            or(ilike(gear.searchName, `%${t}%`), ilike(gear.slug, `%${t}%`)),
          ),
        )
      : undefined;

  const itemsQuery = db
    .select(adminGearSelect)
    .from(gear)
    .innerJoin(brands, eq(brands.id, gear.brandId));
  const countQuery = db
    .select({ count: count() })
    .from(gear)
    .innerJoin(brands, eq(brands.id, gear.brandId));

  const [items, totalResult] = await Promise.all([
    (whereFilter ? itemsQuery.where(whereFilter) : itemsQuery)
      .orderBy(desc(gear.createdAt))
      .limit(limit)
      .offset(offset),
    whereFilter ? countQuery.where(whereFilter) : countQuery,
  ]);

  const gearIds = items.map((item) => item.id);
  const activePricingMappings = gearIds.length
    ? await db
        .select({
          gearId: gearPriceMappings.gearId,
          sourceKey: gearPriceMappings.sourceKey,
        })
        .from(gearPriceMappings)
        .where(
          and(
            inArray(gearPriceMappings.gearId, gearIds),
            eq(gearPriceMappings.status, "ACTIVE"),
          ),
        )
    : [];
  const sourceKeysByGearId = new Map<string, string[]>();
  for (const mapping of activePricingMappings) {
    const sourceKeys = sourceKeysByGearId.get(mapping.gearId) ?? [];
    sourceKeys.push(mapping.sourceKey);
    sourceKeysByGearId.set(mapping.gearId, sourceKeys);
  }

  return {
    items: items.map((item) => ({
      ...item,
      usedPricingMode: getUsedPricingMode(
        sourceKeysByGearId.get(item.id) ?? [],
      ),
    })),
    totalCount: Number(totalResult[0]?.count ?? 0),
  };
}

export type FetchAdminGearItemsResult = Awaited<
  ReturnType<typeof fetchAdminGearItemsData>
>;

export type AdminGearTableRow = FetchAdminGearItemsResult["items"][number];

export interface UpdateGearPublicationStateParams {
  gearId: string;
  publicationState: GearPublicationState;
}

export interface UpdateGearPublicationStateResult {
  id: string;
  slug: string;
  publicationState: GearPublicationState;
}

export async function updateGearPublicationStateData(
  params: UpdateGearPublicationStateParams,
  publicBaseUrl?: string,
): Promise<UpdateGearPublicationStateResult> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: gear.id,
        name: gear.name,
        slug: gear.slug,
        gearType: gear.gearType,
        publicationState: gear.publicationState,
      })
      .from(gear)
      .where(eq(gear.id, params.gearId))
      .limit(1);
    if (!existing[0]) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    const updated = await tx
      .update(gear)
      .set({
        publicationState: params.publicationState,
        updatedAt: new Date(),
      })
      .where(eq(gear.id, params.gearId))
      .returning({
        id: gear.id,
        slug: gear.slug,
        publicationState: gear.publicationState,
      });
    const result = updated[0];
    if (!result) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    if (
      existing[0].publicationState !== GEAR_PUBLICATION_STATES.PUBLISHED &&
      params.publicationState === GEAR_PUBLICATION_STATES.PUBLISHED
    ) {
      await enqueueGearCreatedWebhookEvent(tx, {
        gearId: existing[0].id,
        name: existing[0].name,
        slug: existing[0].slug,
        gearType: existing[0].gearType,
        publicBaseUrl: publicBaseUrl ?? getPublicBaseUrl(),
      });
    }

    return result;
  });
}

function getPublicBaseUrl() {
  const value = process.env.NEXT_PUBLIC_BASE_URL;
  if (!value)
    throw new Error("NEXT_PUBLIC_BASE_URL is required for webhook URLs.");
  return value;
}

export interface RenameGearParams {
  gearId: string;
  newName: string;
}

export interface RenameGearResult {
  id: string;
  name: string;
  previousSlug: string;
  slug: string;
  searchName: string;
}

/**
 * Rename an existing gear item by id.
 * - Computes display name with brand prefix if missing
 * - Rebuilds slug (brand + name, kebab) and searchName (normalized)
 * - Validates slug uniqueness
 * - Updates in a single transaction and returns updated core fields
 */
export async function renameGearData(
  params: RenameGearParams,
): Promise<RenameGearResult> {
  const { gearId, newName } = params;

  const input = (newName ?? "").trim();
  if (!gearId || !input) {
    throw Object.assign(new Error("Invalid input"), { status: 400 });
  }

  return db.transaction(async (tx) => {
    // Load existing gear with brand for normalization
    const existing = await tx
      .select({ id: gear.id, brandId: gear.brandId, slug: gear.slug })
      .from(gear)
      .where(eq(gear.id, gearId))
      .limit(1);
    if (existing.length === 0) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    const brandRow = await tx
      .select({ name: brands.name })
      .from(brands)
      .where(eq(brands.id, existing[0]!.brandId))
      .limit(1);
    if (brandRow.length === 0) {
      throw Object.assign(new Error("Brand not found for gear"), {
        status: 500,
      });
    }
    const brandName = brandRow[0]!.name;

    // Ensure display name is brand-prefixed
    const hasBrandPrefix = input
      .toLowerCase()
      .startsWith(brandName.toLowerCase());
    const displayName = hasBrandPrefix ? input : `${brandName} ${input}`;

    // Build slug from display name
    const nextSlug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    // Enforce slug uniqueness (exclude current row by id)
    const slugHit = await tx
      .select({ id: gear.id })
      .from(gear)
      .where(and(eq(gear.slug, nextSlug), ne(gear.id, gearId)))
      .limit(1);
    if (slugHit.length > 0) {
      throw Object.assign(new Error("Slug already exists"), { status: 409 });
    }

    // Compute normalized search name
    const aliasRows = await tx
      .select({ name: gearAliases.name })
      .from(gearAliases)
      .where(eq(gearAliases.gearId, gearId));

    const search = buildGearSearchName({
      name: displayName,
      brandName,
      aliases: aliasRows.map((alias) => alias.name),
    });

    const updated = await tx
      .update(gear)
      .set({
        name: displayName,
        slug: nextSlug,
        searchName: search,
        updatedAt: new Date(),
      })
      .where(eq(gear.id, gearId))
      .returning({
        id: gear.id,
        name: gear.name,
        slug: gear.slug,
        searchName: gear.searchName,
      });

    const row = updated[0]!;
    return {
      id: row.id,
      name: row.name,
      previousSlug: existing[0]!.slug,
      slug: row.slug,
      searchName: row.searchName as unknown as string,
    };
  });
}

export interface UpdateGearThumbnailParams {
  gearId: string;
  thumbnailUrl: string | null;
  ogImageUrl?: string | null;
}

export interface UpdateGearThumbnailResult {
  id: string;
  slug: string;
  thumbnailUrl: string | null;
  ogImageUrl: string | null;
}

/**
 * Update a gear item's thumbnail URL by id.
 */
export async function updateGearThumbnailData(
  params: UpdateGearThumbnailParams,
): Promise<UpdateGearThumbnailResult> {
  const { gearId, thumbnailUrl, ogImageUrl } = params;
  const updated = await db
    .update(gear)
    .set({
      thumbnailUrl,
      ...(ogImageUrl !== undefined ? { ogImageUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(gear.id, gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      thumbnailUrl: gear.thumbnailUrl,
      ogImageUrl: gear.ogImageUrl,
    });
  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return updated[0];
}

export interface UpdateGearOgImageParams {
  gearId: string;
  ogImageUrl: string | null;
}

export interface UpdateGearOgImageResult {
  id: string;
  slug: string;
  ogImageUrl: string | null;
}

export async function updateGearOgImageData(
  params: UpdateGearOgImageParams,
): Promise<UpdateGearOgImageResult> {
  const updated = await db
    .update(gear)
    .set({
      ogImageUrl: params.ogImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(gear.id, params.gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      ogImageUrl: gear.ogImageUrl,
    });

  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }

  return updated[0];
}

export interface GearOgBackfillCandidate {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string;
  ogImageUrl: string | null;
}

export interface FetchGearOgBackfillCandidatesParams {
  includeExisting: boolean;
  limit: number;
}

export interface FetchGearOgBackfillCandidatesResult {
  eligibleCount: number;
  items: GearOgBackfillCandidate[];
}

function buildGearOgBackfillWhereClause(includeExisting: boolean) {
  const hasThumbnail = sql`${gear.thumbnailUrl} is not null and ${gear.thumbnailUrl} <> ''`;

  if (includeExisting) {
    return hasThumbnail;
  }

  return and(
    hasThumbnail,
    or(isNull(gear.ogImageUrl), eq(gear.ogImageUrl, "")),
  );
}

export async function fetchGearOgBackfillCandidatesData(
  params: FetchGearOgBackfillCandidatesParams,
): Promise<FetchGearOgBackfillCandidatesResult> {
  const whereClause = buildGearOgBackfillWhereClause(params.includeExisting);
  const countRows = await db
    .select({ value: count() })
    .from(gear)
    .where(whereClause);
  const eligibleCount = countRows[0]?.value ?? 0;

  const items = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      thumbnailUrl: gear.thumbnailUrl,
      ogImageUrl: gear.ogImageUrl,
    })
    .from(gear)
    .where(whereClause)
    .orderBy(gear.slug)
    .limit(params.limit);

  return {
    eligibleCount,
    items: items.filter((item): item is GearOgBackfillCandidate =>
      Boolean(item.thumbnailUrl),
    ),
  };
}

export interface UpdateGearTopViewParams {
  gearId: string;
  topViewUrl: string | null;
}

export interface UpdateGearRearViewParams {
  gearId: string;
  rearViewUrl: string | null;
}

export interface UpdateGearLeftViewParams {
  gearId: string;
  leftViewUrl: string | null;
}

export interface UpdateGearRightViewParams {
  gearId: string;
  rightViewUrl: string | null;
}

export interface DeleteGearResult {
  id: string;
  slug: string;
}

async function deleteGearDataWithConn(
  conn: DbLike,
  gearId: string,
): Promise<DeleteGearResult> {
  await conn
    .delete(recommendationItems)
    .where(eq(recommendationItems.gearId, gearId));

  const deleted = await conn
    .delete(gear)
    .where(eq(gear.id, gearId))
    .returning({ id: gear.id, slug: gear.slug });
  if (!deleted[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return deleted[0];
}

/**
 * Delete a gear item by id. Restricting references are cleared explicitly and
 * the remaining related rows are removed by their ON DELETE actions.
 */
export async function deleteGearData(
  gearId: string,
  conn: DbLike = db,
): Promise<DeleteGearResult> {
  try {
    if (conn === db) {
      return await db.transaction(async (tx) =>
        deleteGearDataWithConn(tx, gearId),
      );
    }

    return await deleteGearDataWithConn(conn, gearId);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw Object.assign(
        new Error(
          "Cannot delete gear because related records still reference it",
        ),
        {
          status: 409,
          constraint: error.constraint_name ?? error.constraint ?? null,
          table: error.table_name ?? error.table ?? null,
        },
      );
    }

    throw error;
  }
}

export interface UpdateGearTopViewResult {
  id: string;
  slug: string;
  topViewUrl: string | null;
}

/**
 * Update a gear item's top view URL by id.
 */
export async function updateGearTopViewData(
  params: UpdateGearTopViewParams,
): Promise<UpdateGearTopViewResult> {
  const { gearId, topViewUrl } = params;
  const updated = await db
    .update(gear)
    .set({ topViewUrl, updatedAt: new Date() })
    .where(eq(gear.id, gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      topViewUrl: gear.topViewUrl,
    });
  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return updated[0];
}

export interface UpdateGearRearViewResult {
  id: string;
  slug: string;
  rearViewUrl: string | null;
}

/**
 * Update a gear item's rear view URL by id.
 */
export async function updateGearRearViewData(
  params: UpdateGearRearViewParams,
): Promise<UpdateGearRearViewResult> {
  const { gearId, rearViewUrl } = params;
  const updated = await db
    .update(gear)
    .set({ rearViewUrl, updatedAt: new Date() })
    .where(eq(gear.id, gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      rearViewUrl: gear.rearViewUrl,
    });
  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return updated[0];
}

export interface UpdateGearLeftViewResult {
  id: string;
  slug: string;
  leftViewUrl: string | null;
}

/**
 * Update a gear item's left side view URL by id.
 */
export async function updateGearLeftViewData(
  params: UpdateGearLeftViewParams,
): Promise<UpdateGearLeftViewResult> {
  const { gearId, leftViewUrl } = params;
  const updated = await db
    .update(gear)
    .set({ leftViewUrl, updatedAt: new Date() })
    .where(eq(gear.id, gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      leftViewUrl: gear.leftViewUrl,
    });
  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return updated[0];
}

export interface UpdateGearRightViewResult {
  id: string;
  slug: string;
  rightViewUrl: string | null;
}

/**
 * Update a gear item's right side view URL by id.
 */
export async function updateGearRightViewData(
  params: UpdateGearRightViewParams,
): Promise<UpdateGearRightViewResult> {
  const { gearId, rightViewUrl } = params;
  const updated = await db
    .update(gear)
    .set({ rightViewUrl, updatedAt: new Date() })
    .where(eq(gear.id, gearId))
    .returning({
      id: gear.id,
      slug: gear.slug,
      rightViewUrl: gear.rightViewUrl,
    });
  if (!updated[0]) {
    throw Object.assign(new Error("Gear not found"), { status: 404 });
  }
  return updated[0];
}

export type LensOpticsBackfillCandidateRow = {
  id: string;
  slug: string;
  name: string;
  publicationState: GearPublicationState;
  focalLengthMinMm: number | null;
  focalLengthMaxMm: number | null;
  isPrime: boolean | null;
  maxApertureWide: number | null;
  maxApertureTele: number | null;
};

function buildLensOpticsIncompleteWhere() {
  return and(
    eq(gear.gearType, "LENS"),
    or(
      isNull(lensSpecs.focalLengthMinMm),
      isNull(lensSpecs.focalLengthMaxMm),
      isNull(lensSpecs.isPrime),
      isNull(lensSpecs.maxApertureWide),
    ),
  );
}

export async function fetchLensOpticsBackfillCandidatesData(params: {
  limit: number;
}): Promise<{
  eligibleCount: number;
  items: LensOpticsBackfillCandidateRow[];
}> {
  const whereClause = buildLensOpticsIncompleteWhere();
  const countRows = await db
    .select({ value: count() })
    .from(gear)
    .innerJoin(lensSpecs, eq(lensSpecs.gearId, gear.id))
    .where(whereClause);
  const eligibleCount = countRows[0]?.value ?? 0;

  const items = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      publicationState: gear.publicationState,
      focalLengthMinMm: lensSpecs.focalLengthMinMm,
      focalLengthMaxMm: lensSpecs.focalLengthMaxMm,
      isPrime: lensSpecs.isPrime,
      maxApertureWide: lensSpecs.maxApertureWide,
      maxApertureTele: lensSpecs.maxApertureTele,
    })
    .from(gear)
    .innerJoin(lensSpecs, eq(lensSpecs.gearId, gear.id))
    .where(whereClause)
    .orderBy(gear.name)
    .limit(params.limit);

  return {
    eligibleCount,
    items: items.map((item) => ({
      ...item,
      focalLengthMinMm:
        item.focalLengthMinMm == null ? null : Number(item.focalLengthMinMm),
      focalLengthMaxMm:
        item.focalLengthMaxMm == null ? null : Number(item.focalLengthMaxMm),
      maxApertureWide:
        item.maxApertureWide == null ? null : Number(item.maxApertureWide),
      maxApertureTele:
        item.maxApertureTele == null ? null : Number(item.maxApertureTele),
    })),
  };
}

export async function fetchLensOpticsBackfillCandidateByIdData(
  gearId: string,
): Promise<LensOpticsBackfillCandidateRow | null> {
  const rows = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      publicationState: gear.publicationState,
      focalLengthMinMm: lensSpecs.focalLengthMinMm,
      focalLengthMaxMm: lensSpecs.focalLengthMaxMm,
      isPrime: lensSpecs.isPrime,
      maxApertureWide: lensSpecs.maxApertureWide,
      maxApertureTele: lensSpecs.maxApertureTele,
    })
    .from(gear)
    .innerJoin(lensSpecs, eq(lensSpecs.gearId, gear.id))
    .where(and(eq(gear.id, gearId), eq(gear.gearType, "LENS")))
    .limit(1);

  const item = rows[0];
  if (!item) return null;

  return {
    ...item,
    focalLengthMinMm:
      item.focalLengthMinMm == null ? null : Number(item.focalLengthMinMm),
    focalLengthMaxMm:
      item.focalLengthMaxMm == null ? null : Number(item.focalLengthMaxMm),
    maxApertureWide:
      item.maxApertureWide == null ? null : Number(item.maxApertureWide),
    maxApertureTele:
      item.maxApertureTele == null ? null : Number(item.maxApertureTele),
  };
}

export type LensOpticsBackfillUpdate = {
  focalLengthMinMm?: number;
  focalLengthMaxMm?: number;
  isPrime?: boolean;
  maxApertureWide?: number;
  maxApertureTele?: number;
};

export async function updateLensOpticsBackfillData(params: {
  gearId: string;
  update: LensOpticsBackfillUpdate;
}): Promise<{ id: string; slug: string }> {
  const { gearId, update } = params;
  if (Object.keys(update).length === 0) {
    throw Object.assign(new Error("No optics fields to update"), {
      status: 400,
    });
  }

  // Focal decimals use mode:"number"; aperture decimals default to string mode.
  const drizzleUpdate: {
    focalLengthMinMm?: number;
    focalLengthMaxMm?: number;
    isPrime?: boolean;
    maxApertureWide?: string;
    maxApertureTele?: string;
  } = {};
  if (update.focalLengthMinMm !== undefined) {
    drizzleUpdate.focalLengthMinMm = update.focalLengthMinMm;
  }
  if (update.focalLengthMaxMm !== undefined) {
    drizzleUpdate.focalLengthMaxMm = update.focalLengthMaxMm;
  }
  if (update.isPrime !== undefined) {
    drizzleUpdate.isPrime = update.isPrime;
  }
  if (update.maxApertureWide !== undefined) {
    drizzleUpdate.maxApertureWide = String(update.maxApertureWide);
  }
  if (update.maxApertureTele !== undefined) {
    drizzleUpdate.maxApertureTele = String(update.maxApertureTele);
  }

  return await db.transaction(async (tx) => {
    const updatedSpecs = await tx
      .update(lensSpecs)
      .set(drizzleUpdate)
      .where(eq(lensSpecs.gearId, gearId))
      .returning({ gearId: lensSpecs.gearId });

    if (!updatedSpecs[0]) {
      throw Object.assign(new Error("Lens specs not found"), { status: 404 });
    }

    const updatedGear = await tx
      .update(gear)
      .set({ updatedAt: new Date() })
      .where(eq(gear.id, gearId))
      .returning({ id: gear.id, slug: gear.slug });

    if (!updatedGear[0]) {
      throw Object.assign(new Error("Gear not found"), { status: 404 });
    }

    return updatedGear[0];
  });
}
