import { beforeEach, describe, expect, it, vi } from "vitest";

const popularityMocks = vi.hoisted(() => ({
  fetchTrending: vi.fn(),
}));

vi.mock("~/server/popularity/service", () => popularityMocks);

import { GET } from "~/app/api/trending/home/route";

describe("home trending route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    popularityMocks.fetchTrending.mockResolvedValue([
      {
        gearId: "gear-1",
        slug: "nikon-zf",
        name: "Nikon Zf",
        regionalAliases: null,
        brandName: "Nikon",
        gearType: "CAMERA",
        thumbnailUrl: "/camera.jpg",
        releaseDate: null,
        releaseDatePrecision: null,
        announcedDate: null,
        announceDatePrecision: null,
        msrpNowUsdCents: null,
        mpbMaxPriceUsdCents: null,
        lifetimeViews: 100,
        score: 30,
        liveBoost: 12,
        liveStats: {
          views: 4,
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
        asOfDate: "2026-10-02",
      },
    ]);
  });

  it("returns compact live rows and Vercel CDN cache headers", async () => {
    const response = await GET();

    expect(popularityMocks.fetchTrending).toHaveBeenCalledWith({
      timeframe: "7d",
      limit: 10,
    });
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          gearId: "gear-1",
          slug: "nikon-zf",
          name: "Nikon Zf",
          regionalAliases: null,
          filled: 3,
        },
      ],
    });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe(
      "public, s-maxage=120, stale-while-revalidate=60",
    );
  });
});
