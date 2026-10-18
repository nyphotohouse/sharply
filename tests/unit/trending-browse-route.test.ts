import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const browseServiceMocks = vi.hoisted(() => ({
  fetchBrowseTrendingRowItems: vi.fn(),
}));

vi.mock("~/server/gear/browse/service", () => browseServiceMocks);

import { GET } from "~/app/api/trending/browse/route";

const BRAND_ID = "3f2b8a2e-4c1d-4e5f-9a6b-7c8d9e0f1a2b";

describe("browse trending route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browseServiceMocks.fetchBrowseTrendingRowItems.mockResolvedValue([
      { slug: "nikon-zf", isTrending: true, source: "7d" },
    ]);
  });

  it("returns the live-boosted row for a brand with CDN cache headers", async () => {
    const response = await GET(
      new NextRequest(
        `https://example.com/api/trending/browse?brandId=${BRAND_ID}`,
      ),
    );

    // No ranking option: the route serves the live ranking.
    expect(browseServiceMocks.fetchBrowseTrendingRowItems).toHaveBeenCalledWith(
      {
        brandId: BRAND_ID,
        limit: 3,
      },
    );
    await expect(response.json()).resolves.toEqual({
      items: [{ slug: "nikon-zf", isTrending: true, source: "7d" }],
    });
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe(
      "public, s-maxage=120, stale-while-revalidate=60",
    );
  });

  it("serves the all-brands row when no brand is given", async () => {
    await GET(new NextRequest("https://example.com/api/trending/browse"));

    expect(browseServiceMocks.fetchBrowseTrendingRowItems).toHaveBeenCalledWith(
      {
        brandId: undefined,
        limit: 3,
      },
    );
  });

  it("rejects malformed brand ids", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/trending/browse?brandId=canon"),
    );

    expect(response.status).toBe(400);
    expect(
      browseServiceMocks.fetchBrowseTrendingRowItems,
    ).not.toHaveBeenCalled();
  });
});
