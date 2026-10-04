import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const nextHeaderMocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
  },
}));

const popularityDataMocks = vi.hoisted(() => ({
  fetchHighTrafficGearSlugsData: vi.fn(),
  fetchTopComparePairs: vi.fn(),
  getLiveTrendingSnapshot: vi.fn(),
  getTrendingData: vi.fn(),
  getTrendingTotalCount: vi.fn(),
  hasEventForIdentityToday: vi.fn(),
  hasViewEventForIdentityToday: vi.fn(),
  incrementComparePairCountBySlugs: vi.fn(),
  insertCompareAddEvent: vi.fn(),
  insertViewEvent: vi.fn(),
}));

const gearDataMocks = vi.hoisted(() => ({
  fetchGearAliasesByGearIds: vi.fn(),
}));

const popularityLiveMocks = vi.hoisted(() => ({
  applyLiveBoostToTrending: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/auth", () => authMocks);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => nextHeaderMocks);
vi.mock("~/server/db", () => dbMocks);
vi.mock("~/server/db/schema", () => ({
  gear: {
    id: "id",
    slug: "slug",
  },
}));
vi.mock("~/server/gear/data", () => gearDataMocks);
vi.mock("~/server/popularity/data", () => popularityDataMocks);
vi.mock("~/server/popularity/live", () => popularityLiveMocks);

import {
  fetchStableTrending,
  fetchTrending,
  fetchTrendingSlugs,
  getLiveTrendingStatusForSlugs,
  recordGearView,
} from "~/server/popularity/service";

const baselineItem = {
  gearId: "gear-baseline",
  slug: "baseline-camera",
  score: 10,
};

const liveSnapshot = {
  items: [{ gearId: "gear-live", slug: "live-camera", liveScore: 20 }],
};

type TestRankingItem = typeof baselineItem & { score: number };
type TestLiveItem = (typeof liveSnapshot.items)[number];

describe("popularity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gearDataMocks.fetchGearAliasesByGearIds.mockResolvedValue(new Map());
  });

  it("keeps the UA denylist skip path for known crawlers", async () => {
    const result = await recordGearView({
      slug: "nikon-zf",
      userAgent:
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)",
    });

    expect(result).toEqual({
      success: true,
      deduped: false,
      skipped: "bot",
    });
    expect(dbMocks.db.select).not.toHaveBeenCalled();
    expect(authMocks.auth.api.getSession).not.toHaveBeenCalled();
    expect(popularityDataMocks.insertViewEvent).not.toHaveBeenCalled();
  });

  it("reads baseline rankings only for server-rendered badge slugs", async () => {
    popularityDataMocks.getTrendingData.mockResolvedValue([baselineItem]);

    await expect(
      fetchTrendingSlugs({ timeframe: "30d", limit: 20 }),
    ).resolves.toEqual(["baseline-camera"]);

    expect(popularityDataMocks.getTrendingData).toHaveBeenCalledWith(
      "30d",
      20,
      {},
      0,
    );
    expect(popularityDataMocks.getLiveTrendingSnapshot).not.toHaveBeenCalled();
    expect(popularityLiveMocks.applyLiveBoostToTrending).not.toHaveBeenCalled();
  });

  it("loads the stable ranking for the Home server-rendered baseline", async () => {
    popularityDataMocks.getTrendingData.mockResolvedValue([baselineItem]);

    const result = await fetchStableTrending({ timeframe: "7d", limit: 10 });

    expect(result).toEqual([{ ...baselineItem, regionalAliases: [] }]);
    expect(popularityDataMocks.getTrendingData).toHaveBeenCalledWith(
      "7d",
      10,
      {},
      0,
    );
    expect(gearDataMocks.fetchGearAliasesByGearIds).toHaveBeenCalledWith([
      "gear-baseline",
    ]);
    expect(popularityDataMocks.getLiveTrendingSnapshot).not.toHaveBeenCalled();
  });

  it("still merges baseline and live data for full trending results", async () => {
    const mergedItem = { ...baselineItem, slug: "live-camera" };
    popularityDataMocks.getTrendingData.mockResolvedValue([baselineItem]);
    popularityDataMocks.getLiveTrendingSnapshot.mockResolvedValue(liveSnapshot);
    popularityLiveMocks.applyLiveBoostToTrending.mockReturnValue([mergedItem]);

    const result = await fetchTrending({ timeframe: "7d", limit: 1 });

    expect(popularityLiveMocks.applyLiveBoostToTrending).toHaveBeenCalledWith({
      baseline: [baselineItem],
      liveSnapshot,
    });
    expect(result[0]).toMatchObject({ slug: "live-camera" });
  });

  it("uses merged rankings for hydrated live badge checks", async () => {
    const merged = [
      { ...baselineItem, slug: "live-camera", score: 30 },
      baselineItem,
    ];
    popularityDataMocks.getTrendingData.mockResolvedValue([baselineItem]);
    popularityDataMocks.getLiveTrendingSnapshot.mockResolvedValue(liveSnapshot);
    popularityLiveMocks.applyLiveBoostToTrending.mockReturnValue(merged);

    const result = await getLiveTrendingStatusForSlugs(
      ["baseline-camera", "live-camera", "other-camera"],
      { timeframe: "30d", limit: 1 },
    );

    expect(result).toEqual(new Set(["live-camera"]));
  });

  it("includes an item that reaches the top limit only after stable and live scores combine", async () => {
    const sourceItems = Array.from({ length: 501 }, (_, index) => ({
      gearId: `gear-${index}`,
      slug: `camera-${index}`,
      score: index === 0 ? 10 : 6,
    }));
    const liveItems = sourceItems.map((item, index) => ({
      gearId: item.gearId,
      slug: item.slug,
      liveScore: index === 500 ? 6 : 0,
    }));
    popularityDataMocks.getTrendingData.mockImplementation(
      (_timeframe, limit) => Promise.resolve(sourceItems.slice(0, limit)),
    );
    popularityDataMocks.getLiveTrendingSnapshot.mockImplementation((limit) =>
      Promise.resolve({ items: liveItems.slice(0, limit) }),
    );
    popularityLiveMocks.applyLiveBoostToTrending.mockImplementation(
      ({
        baseline,
        liveSnapshot,
      }: {
        baseline: TestRankingItem[];
        liveSnapshot: { items: TestLiveItem[] };
      }) => {
        const liveScores = new Map(
          liveSnapshot.items.map((item) => [item.gearId, item.liveScore]),
        );
        return baseline
          .map((item) => ({
            ...item,
            score: item.score + (liveScores.get(item.gearId) ?? 0),
          }))
          .sort((a, b) => b.score - a.score);
      },
    );

    const result = await getLiveTrendingStatusForSlugs(["camera-500"], {
      limit: 1,
    });

    expect(result).toEqual(new Set(["camera-500"]));
    expect(popularityDataMocks.getTrendingData).toHaveBeenCalledTimes(2);
    expect(popularityDataMocks.getLiveTrendingSnapshot).toHaveBeenCalledTimes(
      2,
    );
  });
});
