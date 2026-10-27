import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

const revalidationMocks = vi.hoisted(() => ({
  revalidateGearPages: vi.fn(),
  revalidateHomePage: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  createGearAdmin: vi.fn(),
  updateGearPublicationStateService: vi.fn(),
}));

vi.mock("next/cache", () => cacheMocks);
vi.mock("server-only", () => ({}));
vi.mock("~/server/admin/gear/service", () => serviceMocks);
vi.mock("~/server/revalidation", () => revalidationMocks);

import {
  actionCreateGear,
  actionUpdateGearPublicationState,
} from "~/server/admin/gear/actions";

describe("gear publication state admin action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates public and admin surfaces after a state change", async () => {
    serviceMocks.updateGearPublicationStateService.mockResolvedValue({
      id: "gear-1",
      slug: "nikon-z9ii",
      publicationState: "RUMORED",
    });

    const result = await actionUpdateGearPublicationState({
      gearId: "gear-1",
      publicationState: "RUMORED",
    });

    expect(result).toMatchObject({
      slug: "nikon-z9ii",
      publicationState: "RUMORED",
    });
    expect(cacheMocks.revalidatePath).toHaveBeenNthCalledWith(1, "/admin/gear");
    expect(cacheMocks.revalidatePath).toHaveBeenNthCalledWith(
      2,
      "/lists/under-construction",
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidationMocks.revalidateHomePage).toHaveBeenCalledTimes(1);
    expect(revalidationMocks.revalidateGearPages).toHaveBeenCalledWith(
      ["nikon-z9ii"],
      { includeBrowse: true },
    );
  });
});

describe("gear create admin action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createGearAdmin.mockResolvedValue({
      id: "gear-2",
      slug: "sony-a1-iii",
    });
  });

  it("revalidates Home when new gear is published", async () => {
    await actionCreateGear({ publicationState: "PUBLISHED" } as Parameters<
      typeof actionCreateGear
    >[0]);

    expect(revalidationMocks.revalidateGearPages).toHaveBeenCalledWith(
      ["sony-a1-iii"],
      { includeBrowse: true },
    );
    expect(revalidationMocks.revalidateHomePage).toHaveBeenCalledTimes(1);
  });

  it("defaults to published when no state is given", async () => {
    await actionCreateGear({} as Parameters<typeof actionCreateGear>[0]);

    expect(revalidationMocks.revalidateHomePage).toHaveBeenCalledTimes(1);
  });

  it("leaves Home alone for hidden or rumored gear", async () => {
    await actionCreateGear({ publicationState: "HIDDEN" } as Parameters<
      typeof actionCreateGear
    >[0]);

    expect(revalidationMocks.revalidateHomePage).not.toHaveBeenCalled();
  });
});
