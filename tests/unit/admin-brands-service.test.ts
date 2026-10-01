import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
}));

const authHelperMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  fetchAdminBrandsData: vi.fn(),
  updateBrandSortOrdersData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => authMocks);
vi.mock("~/lib/auth/auth-helpers", () => authHelperMocks);
vi.mock("~/server/admin/brands/data", () => dataMocks);

import {
  fetchAdminBrands,
  updateBrandSortOrdersService,
} from "~/server/admin/brands/service";

describe("admin brands service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getSessionOrThrow.mockResolvedValue({
      user: { id: "user-1", role: "ADMIN" },
    });
    authHelperMocks.requireRole.mockReturnValue(true);
    dataMocks.fetchAdminBrandsData.mockResolvedValue([]);
    dataMocks.updateBrandSortOrdersData.mockResolvedValue([
      { id: "brand-1", name: "Canon", slug: "canon", sortOrder: 1 },
    ]);
  });

  it("allows editors to read brands", async () => {
    const editor = { id: "editor-1", role: "EDITOR" };
    authMocks.getSessionOrThrow.mockResolvedValue({ user: editor });

    await expect(fetchAdminBrands()).resolves.toEqual([]);
    expect(authHelperMocks.requireRole).toHaveBeenCalledWith(editor, [
      "EDITOR",
    ]);
    expect(dataMocks.fetchAdminBrandsData).toHaveBeenCalledOnce();
  });

  it("rejects users without editor access", async () => {
    authHelperMocks.requireRole.mockReturnValue(false);

    await expect(fetchAdminBrands()).rejects.toThrow("Editor access required");
    expect(dataMocks.fetchAdminBrandsData).not.toHaveBeenCalled();
  });

  it("accepts nullable sort order updates", async () => {
    await expect(
      updateBrandSortOrdersService({
        updates: [
          { id: "brand-1", sortOrder: 1 },
          { id: "brand-2", sortOrder: null },
        ],
      }),
    ).resolves.toEqual([
      { id: "brand-1", name: "Canon", slug: "canon", sortOrder: 1 },
    ]);

    expect(dataMocks.updateBrandSortOrdersData).toHaveBeenCalledWith({
      updates: [
        { id: "brand-1", sortOrder: 1 },
        { id: "brand-2", sortOrder: null },
      ],
    });
  });

  it("rejects non-integer sort orders", async () => {
    await expect(
      updateBrandSortOrdersService({
        updates: [{ id: "brand-1", sortOrder: 1.5 }],
      }),
    ).rejects.toThrow("Brand sort order must be a positive integer or null");
  });

  it("rejects zero and negative sort orders", async () => {
    await expect(
      updateBrandSortOrdersService({
        updates: [{ id: "brand-1", sortOrder: 0 }],
      }),
    ).rejects.toThrow("Brand sort order must be a positive integer or null");

    await expect(
      updateBrandSortOrdersService({
        updates: [{ id: "brand-1", sortOrder: -1 }],
      }),
    ).rejects.toThrow("Brand sort order must be a positive integer or null");
  });

  it("allows duplicate sort order values", async () => {
    await updateBrandSortOrdersService({
      updates: [
        { id: "brand-1", sortOrder: 1 },
        { id: "brand-2", sortOrder: 1 },
      ],
    });

    expect(dataMocks.updateBrandSortOrdersData).toHaveBeenCalledWith({
      updates: [
        { id: "brand-1", sortOrder: 1 },
        { id: "brand-2", sortOrder: 1 },
      ],
    });
  });
});
