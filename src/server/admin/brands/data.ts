import "server-only";

import { asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { brands } from "~/server/db/schema";

export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number | null;
};

export type BrandSortOrderUpdate = {
  id: string;
  sortOrder: number | null;
};

export type CreateBrandInput = {
  name: string;
  slug: string;
};

export async function findBrandConflictsData(input: CreateBrandInput) {
  const rows = await db
    .select({ name: brands.name, slug: brands.slug })
    .from(brands)
    .where(
      or(
        sql`lower(${brands.name}) = ${input.name.toLowerCase()}`,
        sql`lower(${brands.slug}) = ${input.slug.toLowerCase()}`,
      ),
    );

  return {
    name: rows.some(
      (row) => row.name.toLowerCase() === input.name.toLowerCase(),
    ),
    slug: rows.some(
      (row) => row.slug.toLowerCase() === input.slug.toLowerCase(),
    ),
  };
}

export async function createBrandData(
  input: CreateBrandInput,
): Promise<AdminBrand> {
  try {
    const [brand] = await db
      .insert(brands)
      .values({ name: input.name, slug: input.slug, sortOrder: null })
      .returning({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        sortOrder: brands.sortOrder,
      });

    if (!brand) throw new Error("Brand insert did not return a row");
    return brand as AdminBrand;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      throw Object.assign(
        new Error("A brand with this name or slug already exists"),
        {
          status: 409,
        },
      );
    }
    throw error;
  }
}

export async function fetchAdminBrandsData(): Promise<AdminBrand[]> {
  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      sortOrder: brands.sortOrder,
    })
    .from(brands)
    .orderBy(sql`${brands.sortOrder} ASC NULLS LAST`, asc(brands.name));
  return rows as AdminBrand[];
}

export async function updateBrandSortOrdersData(params: {
  updates: BrandSortOrderUpdate[];
}) {
  await db.transaction(async (tx) => {
    const updateIds = params.updates.map((update) => update.id);
    const existingRows = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(inArray(brands.id, updateIds));

    if (existingRows.length !== updateIds.length) {
      throw Object.assign(new Error("One or more brands could not be found"), {
        status: 404,
      });
    }

    for (const update of params.updates) {
      await tx
        .update(brands)
        .set({
          sortOrder: update.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(brands.id, update.id));
    }
  });

  return fetchAdminBrandsData();
}
