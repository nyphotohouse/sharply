import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/db/schema", () => ({ rollupRuns: {} }));
vi.mock("~/server/popularity/data", () => ({
  getGearPageTrendingTag: (slug: string) => `trending-gear:${slug}`,
  queryGearPageTrendingSlugs: vi.fn(),
}));

import {
  getChangedTrendingGearSlugs,
  revalidatePopularityCachesAfterRollup,
} from "~/server/popularity/rollup";

describe("popularity rollup cache invalidation", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("revalidates the baseline cache and lets the live cache expire naturally", async () => {
    const revalidateTag = vi.fn();
    const revalidateGearPages = vi.fn();

    await revalidatePopularityCachesAfterRollup(
      { before: ["camera-one"], after: ["camera-one"] },
      { revalidateTag, revalidateGearPages },
    );

    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("trending", "max");
    expect(revalidateTag).not.toHaveBeenCalledWith("trending-live", "max");
  });

  it("refreshes no gear pages when the trending set did not change", async () => {
    const revalidateTag = vi.fn();
    const revalidateGearPages = vi.fn();

    const changed = await revalidatePopularityCachesAfterRollup(
      {
        before: ["camera-one", "camera-two"],
        after: ["camera-two", "camera-one"],
      },
      { revalidateTag, revalidateGearPages },
    );

    expect(changed).toEqual([]);
    expect(revalidateGearPages).not.toHaveBeenCalled();
    expect(revalidateTag.mock.calls).toEqual([["trending", "max"]]);
  });

  it("refreshes only gear pages whose slug entered or left the trending set", async () => {
    const revalidateTag = vi.fn();
    const revalidateGearPages = vi.fn();

    const changed = await revalidatePopularityCachesAfterRollup(
      { before: ["kept", "dropped"], after: ["kept", "entered"] },
      { revalidateTag, revalidateGearPages },
    );

    expect(changed).toEqual(["dropped", "entered"]);
    expect(revalidateGearPages).toHaveBeenCalledTimes(1);
    expect(revalidateGearPages).toHaveBeenCalledWith(["dropped", "entered"]);
    expect(revalidateTag.mock.calls).toEqual([
      ["trending", "max"],
      ["trending-gear:dropped", "max"],
      ["trending-gear:entered", "max"],
    ]);
  });
});

describe("getChangedTrendingGearSlugs", () => {
  it("returns the symmetric difference, sorted and deduplicated", () => {
    expect(
      getChangedTrendingGearSlugs(["b", "a", "a"], ["a", "c", "c"]),
    ).toEqual(["b", "c"]);
  });
});
