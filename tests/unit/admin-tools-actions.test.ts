import { beforeEach,describe,expect,it,vi } from "vitest";

const revalidationMocks = vi.hoisted(() => ({
  revalidateGearPages: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/auth", () => authMocks);
vi.mock("~/server/revalidation", () => revalidationMocks);

import { actionRevalidateGearPage } from "~/server/admin/tools/actions";

describe("admin tools actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates the selected gear page for admins", async () => {
    authMocks.getSessionOrThrow.mockResolvedValue({
      user: { id: "user-1", role: "ADMIN" },
    });

    const result = await actionRevalidateGearPage({ gearSlug: "nikon-fm2" });

    expect(result).toEqual({ ok: true, path: "/gear/nikon-fm2" });
    expect(revalidationMocks.revalidateGearPages).toHaveBeenCalledWith([
      "nikon-fm2",
    ]);
  });

  it("rejects non-admin users", async () => {
    authMocks.getSessionOrThrow.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    await expect(
      actionRevalidateGearPage({ gearSlug: "nikon-fm2" }),
    ).rejects.toMatchObject({ message: "Unauthorized", status: 401 });
    expect(revalidationMocks.revalidateGearPages).not.toHaveBeenCalled();
  });
});
