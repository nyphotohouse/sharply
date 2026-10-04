import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: { insert: dbMocks.insert },
}));
vi.mock("~/server/db/schema", () => ({
  brands: {
    id: "brands.id",
    name: "brands.name",
    slug: "brands.slug",
    sortOrder: "brands.sort_order",
  },
}));

import { createBrandData } from "~/server/admin/brands/data";

describe("admin brand data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
    dbMocks.insertValues.mockReturnValue({
      returning: dbMocks.insertReturning,
    });
    dbMocks.insertReturning.mockResolvedValue([
      {
        id: "brand-new",
        name: "Acme Cameras",
        slug: "acme-cameras",
        sortOrder: null,
      },
    ]);
  });

  it("inserts a brand without assigning a sort order", async () => {
    await expect(
      createBrandData({ name: "Acme Cameras", slug: "acme-cameras" }),
    ).resolves.toEqual({
      id: "brand-new",
      name: "Acme Cameras",
      slug: "acme-cameras",
      sortOrder: null,
    });
    expect(dbMocks.insertValues).toHaveBeenCalledWith({
      name: "Acme Cameras",
      slug: "acme-cameras",
      sortOrder: null,
    });
  });

  it("translates a database uniqueness race into a conflict error", async () => {
    dbMocks.insertReturning.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    await expect(
      createBrandData({ name: "Acme Cameras", slug: "acme-cameras" }),
    ).rejects.toMatchObject({
      message: "A brand with this name or slug already exists",
      status: 409,
    });
  });
});
