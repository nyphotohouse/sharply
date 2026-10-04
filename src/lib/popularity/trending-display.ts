import type { TrendingEntry } from "~/types/popularity";

/** The trending list only needs these stable display fields and flame count. */
export type TrendingListRowItem = Pick<
  TrendingEntry,
  "gearId" | "slug" | "name" | "regionalAliases"
> & {
  filled: number;
};

export function toTrendingListRowItems(
  items: TrendingEntry[],
): TrendingListRowItem[] {
  const topScore = items[0]?.score ?? 0;
  const getFilledFlames = (score: number) => {
    if (topScore <= 0) return 0;
    const scaled = (score / topScore) * 3;
    return Math.max(0, Math.min(3, Math.round(scaled)));
  };

  return items.map((item) => ({
    gearId: item.gearId,
    slug: item.slug,
    name: item.name,
    regionalAliases: item.regionalAliases,
    filled: getFilledFlames(item.score),
  }));
}
