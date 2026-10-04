import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
}));

const authHelperMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

const dataMocks = vi.hoisted(() => ({
  fetchAdminBrandsData: vi.fn(),
  findBrandConflictsData: vi.fn(),
  createBrandData: vi.fn(),
  updateBrandSortOrdersData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => authMocks);
vi.mock("~/lib/auth/auth-helpers", () => authHelperMocks);
vi.mock("~/server/admin/brands/data", () => dataMocks);

import {
  createBrandService,
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
    dataMocks.findBrandConflictsData.mockResolvedValue({
      name: false,
      slug: false,
    });
    dataMocks.createBrandData.mockResolvedValue({
      id: "brand-new",
      name: "Acme Cameras",
      slug: "acme-cameras",
      sortOrder: null,
    });
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

  it("normalizes and creates an unranked brand for admins", async () => {
    await expect(
      createBrandService({ name: "  Acme   Cameras ", slug: "acme-cameras" }),
    ).resolves.toEqual({
      id: "brand-new",
      name: "Acme Cameras",
      slug: "acme-cameras",
      sortOrder: null,
    });
    expect(authHelperMocks.requireRole).toHaveBeenCalledWith(
      { id: "user-1", role: "ADMIN" },
      ["ADMIN"],
    );
    expect(dataMocks.findBrandConflictsData).toHaveBeenCalledWith({
      name: "Acme Cameras",
      slug: "acme-cameras",
    });
    expect(dataMocks.createBrandData).toHaveBeenCalledWith({
      name: "Acme Cameras",
      slug: "acme-cameras",
    });
  });

  it("rejects non-admins from creating brands", async () => {
    authHelperMocks.requireRole.mockReturnValue(false);

    await expect(
      createBrandService({ name: "Acme", slug: "acme" }),
    ).rejects.toThrow("Administrator access required");
    expect(dataMocks.findBrandConflictsData).not.toHaveBeenCalled();
  });

  it("validates required, length-limited, and URL-safe brand fields", async () => {
    await expect(
      createBrandService({ name: "  ", slug: "acme" }),
    ).rejects.toMatchObject({
      field: "name",
      status: 400,
    });
    await expect(
      createBrandService({ name: "Acme", slug: "Upper Case" }),
    ).rejects.toMatchObject({
      field: "slug",
      status: 400,
    });
    await expect(
      createBrandService({ name: "a".repeat(201), slug: "acme" }),
    ).rejects.toMatchObject({ field: "name", status: 400 });
    await expect(
      createBrandService({ name: "Acme", slug: "a".repeat(201) }),
    ).rejects.toMatchObject({ field: "slug", status: 400 });
    expect(dataMocks.createBrandData).not.toHaveBeenCalled();
  });

  it("reports duplicate name and slug conflicts on their respective fields", async () => {
    dataMocks.findBrandConflictsData.mockResolvedValueOnce({
      name: true,
      slug: false,
    });
    await expect(
      createBrandService({ name: "Canon", slug: "new-slug" }),
    ).rejects.toMatchObject({ field: "name", status: 409 });

    dataMocks.findBrandConflictsData.mockResolvedValueOnce({
      name: false,
      slug: true,
    });
    await expect(
      createBrandService({ name: "New Brand", slug: "canon" }),
    ).rejects.toMatchObject({ field: "slug", status: 409 });
    expect(dataMocks.createBrandData).not.toHaveBeenCalled();
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
