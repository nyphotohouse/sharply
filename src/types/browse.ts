import type { GearAlias } from "~/types/gear";
import type { PriceProjection } from "~/lib/pricing/display-price";

export type BrowseFeedItem = {
  id: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName: string | null;
  thumbnailUrl: string | null;
  gearType: string | null;
  releaseDate: string | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  announcedDate: string | null;
  announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection: PriceProjection | null;
  mountNames: string[];
  sensorFormatName: string | null;
  analogCaptureMedium: string | null;
  weightGrams: number | null;
  focalLengthMinMm: number | null;
  focalLengthMaxMm: number | null;
  isPrime: boolean | null;
  maxApertureWide: number | null;
  maxApertureTele: number | null;
};

export type BrowseFeedPage = {
  items: BrowseFeedItem[];
  nextCursor: {
    offset: number;
  } | null;
  hasMore: boolean;
};

export type BrowseListItem = BrowseFeedItem;

export type BrowseListPage = {
  items: BrowseListItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
};
