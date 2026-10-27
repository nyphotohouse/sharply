import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  unstable_cache: vi.fn(() => () => Promise.resolve([])),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cacheMocks);
vi.mock("~/server/db", () => ({ db: {} }));

import {
  getStableTrendingData,
  getTrendingData,
  STABLE_TRENDING_REVALIDATE_SECONDS,
} from "~/server/popularity/data";

describe("trending cache policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the shared trending ranking on its 12h cache", async () => {
    await getTrendingData("30d", 20);

    expect(cacheMocks.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["pop-trending", "30d", "20", "-", "-", "-", "0"],
      { revalidate: 60 * 60 * 12, tags: ["trending"] },
    );
  });

  it("caches Home's stable baseline for a day under the rollup tag", async () => {
    await getStableTrendingData("7d", 10);

    // Home revalidates daily; a shorter cache here would cap the page.
    expect(STABLE_TRENDING_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(86400);
    expect(cacheMocks.unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["pop-trending-stable", "7d", "10", "-", "-", "-", "0"],
      { revalidate: STABLE_TRENDING_REVALIDATE_SECONDS, tags: ["trending"] },
    );
  });
});
