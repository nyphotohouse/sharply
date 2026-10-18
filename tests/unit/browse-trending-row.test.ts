import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

const gearDataMocks = vi.hoisted(() => ({
  fetchGearAliasesByGearIds: vi.fn(),
}));

const browseDataMocks = vi.hoisted(() => ({
  getBrandBySlug: vi.fn(),
  getMountByShortName: vi.fn(),
  getMountsForBrand: vi.fn(),
  getReleaseOrderedGearPage: vi.fn(),
  searchGear: vi.fn(),
}));

const popularityServiceMocks = vi.hoisted(() => ({
  fetchStableTrending: vi.fn(),
  fetchTrending: vi.fn(),
}));

const listingTableServiceMocks = vi.hoisted(() => ({
  attachGearListingTableFields: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => navigationMocks);
vi.mock("~/server/gear/data", () => gearDataMocks);
vi.mock("~/server/gear/browse/data", () => browseDataMocks);
vi.mock("~/server/popularity/service", () => popularityServiceMocks);
vi.mock("~/server/gear/listing-table-service", () => listingTableServiceMocks);

import {
  fetchBrowseTrendingRowItems,
  selectBrowseTrendingRowItems,
  type BrowseTrendingCardFields,
} from "~/server/gear/browse/service";

function makeItem(
  slug: string,
  overrides: Partial<BrowseTrendingCardFields> = {},
): BrowseTrendingCardFields {
  return {
    slug,
    name: slug,
    regionalAliases: [],
    brandName: "Nikon",
    thumbnailUrl: null,
    gearType: "CAMERA",
    releaseDate: null,
    releaseDatePrecision: null,
    announcedDate: null,
    announceDatePrecision: null,
    msrpNowUsdCents: null,
    mpbMaxPriceUsdCents: null,
    ...overrides,
  };
}

describe("selectBrowseTrendingRowItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gearDataMocks.fetchGearAliasesByGearIds.mockResolvedValue(new Map());
    browseDataMocks.getReleaseOrderedGearPage.mockResolvedValue({
      items: [],
      hasMore: false,
    });
    popularityServiceMocks.fetchTrending.mockResolvedValue([]);
    listingTableServiceMocks.attachGearListingTableFields.mockImplementation(
      async (items: Array<{ id: string }>) =>
        items.map((item) => ({
          ...item,
          mountNames: [],
          sensorFormatName: null,
          analogCaptureMedium: null,
          weightGrams: null,
          focalLengthMinMm: null,
          focalLengthMaxMm: null,
          isPrime: null,
          maxApertureWide: null,
          maxApertureTele: null,
        })),
    );
  });

  it("returns the original 7d trending items when three exist", () => {
    const items = selectBrowseTrendingRowItems({
      trending7d: [makeItem("a"), makeItem("b"), makeItem("c")],
      trending30d: [makeItem("d"), makeItem("e"), makeItem("f")],
      newest: [makeItem("g"), makeItem("h"), makeItem("i")],
    });

    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.source)).toEqual(["7d", "7d", "7d"]);
    expect(items.every((item) => item.isTrending)).toBe(true);
  });

  it("fills missing slots from 30d trending before newest gear", () => {
    const items = selectBrowseTrendingRowItems({
      trending7d: [makeItem("a")],
      trending30d: [makeItem("a"), makeItem("b"), makeItem("c")],
      newest: [makeItem("d"), makeItem("e"), makeItem("f")],
    });

    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.source)).toEqual(["7d", "30d", "30d"]);
    expect(items.every((item) => item.isTrending)).toBe(true);
  });

  it("falls back to newest gear when combined trending is still short", () => {
    const items = selectBrowseTrendingRowItems({
      trending7d: [makeItem("a")],
      trending30d: [makeItem("a")],
      newest: [makeItem("a"), makeItem("b"), makeItem("c")],
    });

    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.source)).toEqual([
      "7d",
      "newest",
      "newest",
    ]);
    expect(items.map((item) => item.isTrending)).toEqual([true, false, false]);
  });

  it("deduplicates overlaps across all sources while preserving priority order", () => {
    const items = selectBrowseTrendingRowItems({
      trending7d: [makeItem("a"), makeItem("b")],
      trending30d: [makeItem("b"), makeItem("c")],
      newest: [makeItem("c"), makeItem("d"), makeItem("e")],
    });

    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.source)).toEqual(["7d", "7d", "30d"]);
  });

  it("uses newest fallback items without a trending badge", () => {
    const items = selectBrowseTrendingRowItems({
      trending7d: [],
      trending30d: [makeItem("a")],
      newest: [makeItem("a"), makeItem("b"), makeItem("c")],
    });

    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.isTrending)).toEqual([true, false, false]);
  });
});

describe("fetchBrowseTrendingRowItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gearDataMocks.fetchGearAliasesByGearIds.mockResolvedValue(new Map());
  });

  it("enriches release fallback rows with shared table fields", async () => {
    const releaseItem = {
      id: "gear-1",
      slug: "camera-one",
      name: "Camera One",
      brandName: "Nikon",
      thumbnailUrl: null,
      gearType: "CAMERA",
      releaseDate: null,
      releaseDatePrecision: null,
      announcedDate: null,
      announceDatePrecision: null,
      msrpNowUsdCents: null,
      mpbMaxPriceUsdCents: null,
    };
    popularityServiceMocks.fetchTrending.mockResolvedValue([]);
    browseDataMocks.getReleaseOrderedGearPage.mockResolvedValue({
      items: [releaseItem],
      hasMore: false,
    });
    listingTableServiceMocks.attachGearListingTableFields.mockResolvedValueOnce(
      [
        {
          ...releaseItem,
          mountNames: ["Nikon Z"],
          sensorFormatName: "Full Frame",
          analogCaptureMedium: null,
          weightGrams: 705,
          focalLengthMinMm: null,
          focalLengthMaxMm: null,
          isPrime: null,
          maxApertureWide: null,
          maxApertureTele: null,
        },
      ],
    );

    const items = await fetchBrowseTrendingRowItems({ limit: 1 });

    expect(items[0]).toMatchObject({
      mountNames: ["Nikon Z"],
      sensorFormatName: "Full Frame",
      analogCaptureMedium: null,
      weightGrams: 705,
    });
  });

  it("forwards brand scope, over-fetches candidates, and merges back to the requested limit", async () => {
    popularityServiceMocks.fetchTrending
      .mockResolvedValueOnce([makeItem("a"), makeItem("b"), makeItem("c")])
      .mockResolvedValueOnce([makeItem("c"), makeItem("d"), makeItem("e")]);
    browseDataMocks.getReleaseOrderedGearPage.mockResolvedValue({
      items: [
        {
          id: "gear-1",
          slug: "e",
          name: "e",
          brandName: "Nikon",
          thumbnailUrl: null,
          gearType: "CAMERA",
          releaseDate: null,
          releaseDatePrecision: null,
          announcedDate: null,
          announceDatePrecision: null,
          msrpNowUsdCents: null,
          mpbMaxPriceUsdCents: null,
        },
        {
          id: "gear-2",
          slug: "f",
          name: "f",
          brandName: "Nikon",
          thumbnailUrl: null,
          gearType: "CAMERA",
          releaseDate: null,
          releaseDatePrecision: null,
          announcedDate: null,
          announceDatePrecision: null,
          msrpNowUsdCents: null,
          mpbMaxPriceUsdCents: null,
        },
      ],
      hasMore: false,
    });

    const items = await fetchBrowseTrendingRowItems({
      brandId: "brand-1",
      limit: 3,
    });

    expect(popularityServiceMocks.fetchTrending).toHaveBeenNthCalledWith(1, {
      timeframe: "7d",
      limit: 12,
      filters: { brandId: "brand-1" },
    });
    expect(popularityServiceMocks.fetchTrending).toHaveBeenNthCalledWith(2, {
      timeframe: "30d",
      limit: 12,
      filters: { brandId: "brand-1" },
    });
    expect(browseDataMocks.getReleaseOrderedGearPage).toHaveBeenCalledWith({
      limit: 12,
      brandId: "brand-1",
      brandSlug: undefined,
      offset: 0,
    });
    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(items.map((item) => item.source)).toEqual(["7d", "7d", "7d"]);
  });

  it("uses the expanded candidate pool to fill gaps after overlap and falls back to newest", async () => {
    popularityServiceMocks.fetchTrending
      .mockResolvedValueOnce([makeItem("a"), makeItem("b")])
      .mockResolvedValueOnce([makeItem("a"), makeItem("b"), makeItem("c")]);
    browseDataMocks.getReleaseOrderedGearPage.mockResolvedValue({
      items: [
        {
          id: "gear-1",
          slug: "c",
          name: "c",
          brandName: "Nikon",
          thumbnailUrl: null,
          gearType: "CAMERA",
          releaseDate: null,
          releaseDatePrecision: null,
          announcedDate: null,
          announceDatePrecision: null,
          msrpNowUsdCents: null,
          mpbMaxPriceUsdCents: null,
        },
        {
          id: "gear-2",
          slug: "d",
          name: "d",
          brandName: "Nikon",
          thumbnailUrl: null,
          gearType: "CAMERA",
          releaseDate: null,
          releaseDatePrecision: null,
          announcedDate: null,
          announceDatePrecision: null,
          msrpNowUsdCents: null,
          mpbMaxPriceUsdCents: null,
        },
      ],
      hasMore: false,
    });

    const items = await fetchBrowseTrendingRowItems({ limit: 4 });

    expect(popularityServiceMocks.fetchTrending).toHaveBeenNthCalledWith(1, {
      timeframe: "7d",
      limit: 16,
      filters: undefined,
    });
    expect(popularityServiceMocks.fetchTrending).toHaveBeenNthCalledWith(2, {
      timeframe: "30d",
      limit: 16,
      filters: undefined,
    });
    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c", "d"]);
    expect(items.map((item) => item.source)).toEqual([
      "7d",
      "7d",
      "30d",
      "newest",
    ]);
    expect(items.map((item) => item.isTrending)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("reads only the stable ranking when server rendering", async () => {
    popularityServiceMocks.fetchStableTrending
      .mockResolvedValueOnce([makeItem("a")])
      .mockResolvedValueOnce([makeItem("b"), makeItem("c")]);
    browseDataMocks.getReleaseOrderedGearPage.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    const items = await fetchBrowseTrendingRowItems({
      brandId: "brand-1",
      limit: 3,
      ranking: "stable",
    });

    // The live ranking reads a two-minute cache, which would shorten the
    // browse page's 24h revalidate window.
    expect(popularityServiceMocks.fetchTrending).not.toHaveBeenCalled();
    expect(popularityServiceMocks.fetchStableTrending).toHaveBeenNthCalledWith(
      1,
      { timeframe: "7d", limit: 12, filters: { brandId: "brand-1" } },
    );
    expect(popularityServiceMocks.fetchStableTrending).toHaveBeenNthCalledWith(
      2,
      { timeframe: "30d", limit: 12, filters: { brandId: "brand-1" } },
    );
    expect(items.map((item) => item.slug)).toEqual(["a", "b", "c"]);
  });
});
