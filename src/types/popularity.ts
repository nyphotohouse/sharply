import type { GearType } from "~/types/gear";
import type { PriceProjection } from "~/lib/pricing/display-price";

import type { GearAlias } from "~/types/gear";

export type TrendingFiltersInput = {
  brandId?: string;
  mountId?: string;
  gearType?: GearType;
};

export type TrendingEntry = {
  gearId: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName: string;
  gearType: GearType;
  thumbnailUrl: string | null;
  releaseDate: string | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  announcedDate: string | null;
  announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents?: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection?: PriceProjection | null;
  lifetimeViews: number;
  score: number;
  liveBoost?: number;
  liveStats?: {
    views: number;
    wishlistAdds: number;
    ownerAdds: number;
    compareAdds: number;
    reviewSubmits: number;
  };
  liveOnly?: boolean;
  stats: {
    views: number;
    wishlistAdds: number;
    ownerAdds: number;
    compareAdds: number;
    reviewSubmits: number;
  };
  asOfDate: string;
};

export type LiveTrendingSnapshotItem = {
  gearId: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName: string;
  gearType: GearType;
  thumbnailUrl: string | null;
  releaseDate: string | null;
  releaseDatePrecision: TrendingEntry["releaseDatePrecision"];
  announcedDate: string | null;
  announceDatePrecision: TrendingEntry["announceDatePrecision"];
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents?: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection?: PriceProjection | null;
  lifetimeViews: number;
  liveScore: number;
  stats: TrendingEntry["stats"];
  asOfDate: string;
};

export type LiveTrendingSnapshot = {
  items: LiveTrendingSnapshotItem[];
};

export type TrendingPageResult = {
  items: TrendingEntry[];
  total: number;
  page: number;
  perPage: number;
  timeframe: "7d" | "30d";
  filters: TrendingFiltersInput;
  topScore?: number;
};
