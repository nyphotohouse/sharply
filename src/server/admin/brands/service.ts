import "server-only";

import { requireRole } from "~/lib/auth/auth-helpers";
import { getSessionOrThrow } from "~/server/auth";
import {
  fetchAdminBrandsData,
  type AdminBrand,
  type BrandSortOrderUpdate,
  updateBrandSortOrdersData,
} from "./data";

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
