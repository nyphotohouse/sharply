import { describe, expect, it } from "vitest";
import { toTrendingListRowItems } from "~/lib/popularity/trending-display";
import type { TrendingEntry } from "~/types/popularity";

function makeTrendingEntry(overrides: Partial<TrendingEntry>): TrendingEntry {
  return {
    gearId: "gear-1",
    slug: "camera",
    name: "Camera",
    regionalAliases: null,
    brandName: "Brand",
    gearType: "CAMERA",
    thumbnailUrl: null,
    releaseDate: null,
    releaseDatePrecision: null,
    announcedDate: null,
    announceDatePrecision: null,
    msrpNowUsdCents: null,
    mpbMaxPriceUsdCents: null,
    lifetimeViews: 0,
    score: 0,
    stats: {
      views: 0,
      wishlistAdds: 0,
      ownerAdds: 0,
      compareAdds: 0,
      reviewSubmits: 0,
    },
    asOfDate: "2026-10-02",
    ...overrides,
  };
}

describe("trending list display projection", () => {
  it("keeps only row fields and computes the relative flame count", () => {
    const items = toTrendingListRowItems([
      makeTrendingEntry({
        gearId: "gear-top",
        slug: "top-camera",
        name: "Top Camera",
        regionalAliases: null,
        score: 12,
        liveBoost: 4,
        liveStats: {
          views: 8,
          wishlistAdds: 0,
          ownerAdds: 0,
          compareAdds: 0,
          reviewSubmits: 0,
        },
        stats: {
          views: 20,
          wishlistAdds: 1,
          ownerAdds: 0,
          compareAdds: 0,
          reviewSubmits: 0,
        },
      }),
      makeTrendingEntry({
        gearId: "gear-second",
        slug: "second-camera",
        name: "Second Camera",
        regionalAliases: null,
        score: 6,
      }),
    ]);

    expect(items).toEqual([
      {
        gearId: "gear-top",
        slug: "top-camera",
        name: "Top Camera",
        regionalAliases: null,
        filled: 3,
      },
      {
        gearId: "gear-second",
        slug: "second-camera",
        name: "Second Camera",
        regionalAliases: null,
        filled: 2,
      },
    ]);
    expect(items[0]).not.toHaveProperty("score");
    expect(items[0]).not.toHaveProperty("stats");
    expect(items[0]).not.toHaveProperty("liveStats");
  });
});
