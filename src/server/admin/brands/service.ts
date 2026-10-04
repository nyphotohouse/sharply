import "server-only";

import slugify from "slugify";

import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import {
  fetchAdminBrandsData,
  type AdminBrand,
  type BrandSortOrderUpdate,
  createBrandData,
  findBrandConflictsData,
  updateBrandSortOrdersData,
} from "./data";

export type CreateAdminBrandInput = {
  name: string;
  slug: string;
};

function invalidBrandField(
  field: "name" | "slug",
  message: string,
  status = 400,
) {
  return Object.assign(new Error(message), { status, field });
}

async function editorSession() {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["EDITOR"])) {
    throw Object.assign(new Error("Editor access required"), {
      status: 403,
    });
  }
  return session;
}

async function adminSession() {
  const session = await getSessionOrThrow();
  if (!requireRole(session.user, ["ADMIN"])) {
    throw Object.assign(new Error("Administrator access required"), {
      status: 403,
    });
  }
  return session;
}

function normalizeSortOrder(value: number | null) {
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw Object.assign(
      new Error("Brand sort order must be a positive integer or null"),
      { status: 400 },
    );
  }

  return value;
}

export async function fetchAdminBrands(): Promise<AdminBrand[]> {
  await editorSession();
  return fetchAdminBrandsData();
}

export async function createBrandService(
  input: CreateAdminBrandInput,
): Promise<AdminBrand> {
  await adminSession();

  const name = input.name.trim().replace(/\s+/g, " ");
  const slug = input.slug.trim();

  if (!name) throw invalidBrandField("name", "Brand name is required");
  if (name.length > 200) {
    throw invalidBrandField(
      "name",
      "Brand name must be 200 characters or fewer",
    );
  }
  if (!slug) throw invalidBrandField("slug", "Brand slug is required");
  if (slug.length > 200) {
    throw invalidBrandField(
      "slug",
      "Brand slug must be 200 characters or fewer",
    );
  }
  if (slugify(slug, { lower: true, strict: true }) !== slug) {
    throw invalidBrandField(
      "slug",
      "Use lowercase letters, numbers, and single hyphens in the slug",
    );
  }

  const conflicts = await findBrandConflictsData({ name, slug });
  if (conflicts.name) {
    throw invalidBrandField(
      "name",
      "A brand with this name already exists",
      409,
    );
  }
  if (conflicts.slug) {
    throw invalidBrandField(
      "slug",
      "A brand with this slug already exists",
      409,
    );
  }

  return createBrandData({ name, slug });
}

export async function updateBrandSortOrdersService(params: {
  updates: BrandSortOrderUpdate[];
}) {
  await adminSession();

  if (!params.updates.length) {
    throw Object.assign(new Error("No brand updates were provided"), {
      status: 400,
    });
  }

  const normalizedUpdates = params.updates.map((update) => ({
    id: update.id.trim(),
    sortOrder: normalizeSortOrder(update.sortOrder),
  }));

  if (
    normalizedUpdates.some((update) => !update.id) ||
    new Set(normalizedUpdates.map((update) => update.id)).size !==
      normalizedUpdates.length
  ) {
    throw Object.assign(new Error("Brand updates must have unique ids"), {
      status: 400,
    });
  }

  return updateBrandSortOrdersData({ updates: normalizedUpdates });
}
