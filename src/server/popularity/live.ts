import type { LiveTrendingSnapshot, TrendingEntry } from "~/types/popularity";

export function applyLiveBoostToTrending(params: {
  baseline: TrendingEntry[];
  liveSnapshot?: LiveTrendingSnapshot | null;
  limit?: number;
}): TrendingEntry[] {
  const liveItems = params.liveSnapshot?.items ?? [];
  const liveMap = new Map<string, (typeof liveItems)[number]>();
  for (const item of liveItems) {
    liveMap.set(item.gearId, item);
  }
  const baselineIds = new Set(params.baseline.map((item) => item.gearId));

  const merged: TrendingEntry[] = params.baseline.map((item) => {
    const live = liveMap.get(item.gearId);
    const liveBoost = live?.liveScore ?? 0;
    return {
      ...item,
      score: item.score + liveBoost,
      liveBoost: liveBoost || undefined,
      liveStats: live?.stats,
      liveOnly: false,
    };
  });

  for (const live of liveItems) {
    if (baselineIds.has(live.gearId)) continue;
    merged.push({
      gearId: live.gearId,
      slug: live.slug,
      name: live.name,
      brandName: live.brandName,
      gearType: live.gearType,
      thumbnailUrl: live.thumbnailUrl,
      releaseDate: live.releaseDate,
      releaseDatePrecision: live.releaseDatePrecision,
      announcedDate: live.announcedDate,
      announceDatePrecision: live.announceDatePrecision,
      msrpNowUsdCents: live.msrpNowUsdCents,
      msrpAtLaunchUsdCents: live.msrpAtLaunchUsdCents,
      mpbMaxPriceUsdCents: live.mpbMaxPriceUsdCents,
      usedPriceProjection: live.usedPriceProjection,
      lifetimeViews: live.lifetimeViews,
      score: live.liveScore,
      liveBoost: live.liveScore,
      liveStats: live.stats,
      liveOnly: true,
      stats: live.stats,
      asOfDate: live.asOfDate,
    });
  }

  merged.sort((a, b) => b.score - a.score);
  const limit = params.limit ?? merged.length;
  return merged.slice(0, limit);
}
