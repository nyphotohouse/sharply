import type { GearAlias } from "~/types/gear";
import type { PriceProjection } from "~/lib/pricing/display-price";

export type GearTableScope = "camera" | "lens" | "mixed";

export type GearTableRow = {
  id: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName: string | null;
  gearType: string | null;
  isUnderConstruction: boolean;
  mountNames: string[];
  releaseDate: string | Date | null;
  releaseDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  announcedDate: string | Date | null;
  announceDatePrecision: "DAY" | "MONTH" | "YEAR" | null;
  msrpNowUsdCents: number | null;
  msrpAtLaunchUsdCents?: number | null;
  mpbMaxPriceUsdCents: number | null;
  usedPriceProjection?: PriceProjection | null;
  sensorFormatName: string | null;
  analogCaptureMedium: string | null;
  weightGrams: number | null;
  focalLengthMinMm: number | null;
  focalLengthMaxMm: number | null;
  isPrime: boolean | null;
  maxApertureWide: number | null;
  maxApertureTele: number | null;
};

export type GearTableSource = {
  id: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName?: string | null;
  gearType?: string | null;
  isUnderConstruction?: boolean;
  mountNames?: string[] | null;
  releaseDate?: string | Date | null;
  releaseDatePrecision?: string | null;
  announcedDate?: string | Date | null;
  announceDatePrecision?: string | null;
  msrpNowUsdCents?: number | null;
  msrpAtLaunchUsdCents?: number | null;
  mpbMaxPriceUsdCents?: number | null;
  usedPriceProjection?: PriceProjection | null;
  sensorFormatName?: string | null;
  analogCaptureMedium?: string | null;
  weightGrams?: number | null;
  focalLengthMinMm?: number | null;
  focalLengthMaxMm?: number | null;
  isPrime?: boolean | null;
  maxApertureWide?: number | null;
  maxApertureTele?: number | null;
};
