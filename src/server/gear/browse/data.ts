import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import "server-only";
import { orderBrandsWithPriority } from "~/lib/brands";
import { GEAR_PUBLICATION_STATES } from "~/lib/gear/publication-state";
import type { BrowseFilters } from "~/lib/browse/filters";
import type { GearCategorySlug } from "~/lib/browse/routing";
import {
  BRANDS as BRAND_CONSTANTS,
  MOUNTS as MOUNT_CONSTANTS,
} from "~/lib/constants";
import { db } from "~/server/db";
import { brands, gear, gearMounts, lensSpecs } from "~/server/db/schema";
import type { GearListingTableFields } from "~/server/gear/listing-table-data";
import type { GearAlias, GearType } from "~/types/gear";
import {
  LENS_FOCAL_LENGTH_SORT,
  lensFocalLengthSortExpression,
} from "./lens-sort";
import { getGearDisplayImageSql } from "../display-image";

export type BrowseGearRow = {
  id: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandId: string;
  brandName: string | null;
  gearType: string | null;
  thumbnailUrl: string | null;
  releaseDate: Date | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  announcedDate: Date | null;
  announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  msrpNowUsdCents: number | null;
  mpbMaxPriceUsdCents: number | null;
  lensFocalLengthMinMm?: number | null;
  lensFocalLengthMaxMm?: number | null;
} & Partial<GearListingTableFields>;

export type SearchGearResult = {
  items: BrowseGearRow[];
  total: number;
};

const gearCategoryToTypes: Record<GearCategorySlug, GearType[]> = {
  cameras: ["CAMERA", "ANALOG_CAMERA"],
  lenses: ["LENS"],
};

function buildPublishedGearClause() {
  return eq(gear.publicationState, GEAR_PUBLICATION_STATES.PUBLISHED);
}

function buildPrecisionAwareDateExpression(
  dateColumn: SQLWrapper,
  precisionColumn: SQLWrapper,
) {
  return sql`
    CASE
      WHEN ${dateColumn} IS NULL THEN NULL
      WHEN ${precisionColumn} = 'YEAR' THEN date_trunc('year', ${dateColumn})
      WHEN ${precisionColumn} = 'MONTH' THEN date_trunc('month', ${dateColumn})
      ELSE ${dateColumn}
    END
  `;
}

function buildNewestGearOrderBy() {
  const releaseDate = buildPrecisionAwareDateExpression(
    gear.releaseDate,
    gear.releaseDatePrecision,
  );
  const announcementDate = buildPrecisionAwareDateExpression(
    gear.announcedDate,
    gear.announceDatePrecision,
  );
  const effectiveReleaseDate = sql`coalesce(${releaseDate}, ${announcementDate})`;

  return [
    sql`${effectiveReleaseDate} DESC NULLS LAST`,
    sql`${announcementDate} DESC NULLS LAST`,
    desc(gear.createdAt),
    asc(gear.name),
    asc(gear.id),
  ];
}

// Prefer using BRANDS directly from constants at call sites; kept for legacy imports
export async function getBrands() {
  return orderBrandsWithPriority(
    BRAND_CONSTANTS.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      sortOrder: b.sort_order ?? null,
    })),
  );
}

export async function getBrandBySlug(slug: string) {
  const target = BRAND_CONSTANTS.find(
    (b) => b.slug.toLowerCase() === slug.toLowerCase(),
  );
  return target
    ? { id: target.id, name: target.name, slug: target.slug }
    : null;
}

export function getCategories() {
  return ["cameras", "lenses"] as GearCategorySlug[];
}

export type PublishedGearCategoryCounts = Record<GearCategorySlug, number>;

export async function getPublishedGearCategoryCountsForBrand(
  brandId: string,
): Promise<PublishedGearCategoryCounts> {
  const countCategory = async (category: GearCategorySlug) => {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(gear)
      .where(
        and(
          buildPublishedGearClause(),
          eq(gear.brandId, brandId),
          inArray(gear.gearType, gearCategoryToTypes[category]),
        ),
      );

    return Number(rows[0]?.count ?? 0);
  };

  const [cameras, lenses] = await Promise.all([
    countCategory("cameras"),
    countCategory("lenses"),
  ]);

  return { cameras, lenses };
}

export async function getMountByShortName(shortName: string, brandId?: string) {
  const lc = shortName.toLowerCase();
  const row = MOUNT_CONSTANTS.find((m) => {
    if (brandId && m.brand_id !== brandId) return false;
    const s = m.short_name?.toLowerCase();
    return s === lc;
  });
  return row
    ? {
        id: row.id,
        value: row.value,
        shortName: row.short_name,
        brandId: row.brand_id ?? null,
      }
    : null;
}

export async function getMountsForBrand(brandId: string) {
  return MOUNT_CONSTANTS.filter((m) => m.brand_id === brandId)
    .map((m) => ({ id: m.id, value: m.value, shortName: m.short_name }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export type SearchInput = {
  brandId?: string;
  category?: GearCategorySlug;
  mountId?: string;
  filters: BrowseFilters;
};

export async function searchGear(
  input: SearchInput,
): Promise<SearchGearResult> {
  const where: SQL[] = [buildPublishedGearClause()];
  if (input.brandId) where.push(eq(gear.brandId, input.brandId));
  if (input.category)
    where.push(inArray(gear.gearType, gearCategoryToTypes[input.category]));

  const f = input.filters;
  const needsLensFocalSort = f.sort === LENS_FOCAL_LENGTH_SORT;

  const selectFields: Record<string, any> = {
    id: gear.id,
    slug: gear.slug,
    name: gear.name,
    brandId: gear.brandId,
    brandName: brands.name,
    gearType: gear.gearType,
    thumbnailUrl: getGearDisplayImageSql(),
    releaseDate: gear.releaseDate,
    releaseDatePrecision: gear.releaseDatePrecision,
    announcedDate: gear.announcedDate,
    announceDatePrecision: gear.announceDatePrecision,
    msrpNowUsdCents: gear.msrpNowUsdCents,
    mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
  };

  if (needsLensFocalSort) {
    selectFields.lensFocalLengthMinMm = lensSpecs.focalLengthMinMm;
    selectFields.lensFocalLengthMaxMm = lensSpecs.focalLengthMaxMm;
  }

  let base = db
    .select(selectFields)
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id));

  if (input.mountId) {
    base = base.leftJoin(gearMounts, sql`${gear.id} = ${gearMounts.gearId}`);
  }
  if (needsLensFocalSort) {
    base = base.leftJoin(lensSpecs, eq(gear.id, lensSpecs.gearId));
  }

  if (input.mountId) {
    where.push(eq(gearMounts.mountId, input.mountId));
  }

  // Traits filters
  if (f.minPrice != null)
    where.push(sql`${gear.msrpNowUsdCents} >= ${f.minPrice * 100}`);
  if (f.maxPrice != null)
    where.push(sql`${gear.msrpNowUsdCents} <= ${f.maxPrice * 100}`);
  if (f.minYear != null)
    where.push(
      sql`extract(year from coalesce(${gear.releaseDate}, ${gear.announcedDate})) >= ${f.minYear}`,
    );
  if (f.maxYear != null)
    where.push(
      sql`extract(year from coalesce(${gear.releaseDate}, ${gear.announcedDate})) <= ${f.maxYear}`,
    );

  const effectiveReleaseDate = sql`coalesce(${gear.releaseDate}, ${gear.announcedDate})`;

  // Sorting
  const orderBy = (() => {
    // Default sort is resolved upstream; coerce invalid values to newest
    const allowed = [
      "newest",
      "oldest",
      "recently_added",
      "price_asc",
      "price_desc",
      "rating",
      "popularity",
      "relevance",
      LENS_FOCAL_LENGTH_SORT,
    ] as const;
    type SortKey = (typeof allowed)[number];
    const sortKey: SortKey = allowed.includes(f.sort) ? f.sort : "newest";
    switch (sortKey) {
      case "newest":
        return buildNewestGearOrderBy();
      case "oldest":
        return [sql`${effectiveReleaseDate} ASC NULLS LAST`, asc(gear.name)];
      case "recently_added":
        return [desc(gear.createdAt), asc(gear.name)];
      case "price_asc":
        return [asc(gear.msrpNowUsdCents), asc(gear.name)];
      case "price_desc":
        return [sql`${gear.msrpNowUsdCents} DESC NULLS LAST`, asc(gear.name)];
      case "popularity":
        return [desc(gear.createdAt), asc(gear.name)];
      case "relevance":
        return [asc(gear.name)];
      case LENS_FOCAL_LENGTH_SORT:
        return [lensFocalLengthSortExpression(), asc(gear.name)];
      default:
        return buildNewestGearOrderBy();
    }
  })();

  const pageSize = input.filters.perPage;
  const offset = (input.filters.page - 1) * pageSize;

  const rows = await base
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  // Total count (replicate join when filtering by mount)
  const countQuery = input.mountId
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(gear)
        .leftJoin(gearMounts, sql`${gear.id} = ${gearMounts.gearId}`)
    : db.select({ count: sql<number>`count(*)` }).from(gear);

  const countRows = await countQuery.where(
    where.length ? and(...where) : undefined,
  );

  return {
    items: rows as BrowseGearRow[],
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function getReleaseOrderedGearPage(params: {
  limit: number;
  brandId?: string;
  brandSlug?: string;
  offset?: number;
}) {
  const limit = Math.max(1, Math.min(params.limit ?? 12, 60));
  // No upper bound on offset - large offsets are expected for deep pagination
  const offset = Math.max(0, Math.floor(params.offset ?? 0));
  const where: SQL[] = [buildPublishedGearClause()];
  if (params.brandId) where.push(eq(gear.brandId, params.brandId));
  else if (params.brandSlug) where.push(eq(brands.slug, params.brandSlug));

  const rows = await db
    .select({
      id: gear.id,
      slug: gear.slug,
      name: gear.name,
      brandName: brands.name,
      thumbnailUrl: getGearDisplayImageSql(),
      gearType: gear.gearType,
      releaseDate: gear.releaseDate,
      releaseDatePrecision: gear.releaseDatePrecision,
      announcedDate: gear.announcedDate,
      announceDatePrecision: gear.announceDatePrecision,
      msrpNowUsdCents: gear.msrpNowUsdCents,
      mpbMaxPriceUsdCents: gear.mpbMaxPriceUsdCents,
    })
    .from(gear)
    .leftJoin(brands, eq(gear.brandId, brands.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...buildNewestGearOrderBy())
    .limit(limit + 1)
    .offset(offset);

  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return { items, hasMore };
}

// Deprecated: static params are now generated directly in the browse page
