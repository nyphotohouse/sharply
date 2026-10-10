import type {
  GearPriceProjection,
  gearPriceMappings,
  gearPriceObservations,
} from "~/server/db/schema";
import {
  MARKET_CURRENCY,
  PRICE_MARKETS,
  type PriceMarket,
} from "~/lib/pricing/display-price";

export { MARKET_CURRENCY, PRICE_MARKETS };
export type { PriceMarket };

export const PRICE_METHOD_VERSION = 1;
export const MANUAL_REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const PRICE_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function getPriceFetchRunStatus(
  successCount: number,
  noDataCount: number,
  errorCount: number,
): "SUCCESS" | "PARTIAL" | "ERROR" {
  if (errorCount === 0) return "SUCCESS";
  if (successCount === 0 && noDataCount === 0) return "ERROR";
  return "PARTIAL";
}

export const PRICE_SOURCE_KEYS = [
  "manual",
  "mpb",
  "kamerastore",
  "campricer",
] as const;
export type PriceSourceKey = (typeof PRICE_SOURCE_KEYS)[number];

export function getManualRefreshRetryAt(
  lastFetchedAt: Date | null,
  now = new Date(),
): Date | null {
  if (!lastFetchedAt) return null;
  const retryAt = new Date(
    lastFetchedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS,
  );
  return retryAt.getTime() > now.getTime() ? retryAt : null;
}

export function hasRequiredPriceSourceLink(
  sourceKey: string,
  canonicalUrl: string | null,
  fetchUrl: string | null,
): boolean {
  return sourceKey === "manual" || Boolean(canonicalUrl || fetchUrl);
}

export function inferCurrencyFromMarket(marketKey: string): string {
  const currency = MARKET_CURRENCY[marketKey as PriceMarket];
  if (!currency) {
    throw Object.assign(new Error(`Unsupported price market: ${marketKey}`), {
      status: 400,
      code: "UNSUPPORTED_PRICE_MARKET",
    });
  }
  return currency;
}

export type PriceObservationInput = {
  valueKind: "POINT" | "RANGE";
  amountMinor?: number | null;
  lowMinor?: number | null;
  highMinor?: number | null;
  condition?: string;
  availability?: string;
  observedAt?: Date;
  evidenceUrl?: string | null;
  note?: string | null;
};

export type PriceAdapterObservation = PriceObservationInput & {
  observedAt: Date;
};

export type PriceFetchResult = {
  status: "SUCCESS" | "NO_DATA" | "ERROR";
  observations: PriceAdapterObservation[];
  error?: string;
};

export type PriceAdapterMapping = Pick<
  typeof gearPriceMappings.$inferSelect,
  | "id"
  | "sourceKey"
  | "marketKey"
  | "canonicalUrl"
  | "fetchUrl"
  | "externalProductId"
>;

export type PriceAdapter = {
  sourceKey: PriceSourceKey;
  fetch: (
    mapping: PriceAdapterMapping,
    options?: { signal?: AbortSignal },
  ) => Promise<PriceFetchResult>;
};

export type PriceManagementData = {
  gear: {
    id: string;
    name: string;
    slug: string;
    usedPriceProjection: GearPriceProjection | null;
  };
  mappings: Array<
    typeof gearPriceMappings.$inferSelect & {
      observations: Array<typeof gearPriceObservations.$inferSelect>;
    }
  >;
  estimates: Array<{
    id: string;
    marketKey: string;
    priceKind: string;
    lowMinor: number;
    typicalMinor: number;
    highMinor: number;
    currency: string;
    asOf: Date;
    methodVersion: number;
    sourceCount: number;
    observationCount: number;
  }>;
};

export type PriceOverviewRow = {
  mappingId: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  sourceKey: string;
  marketKey: string;
  priceKind: string;
  status: "ACTIVE" | "DISABLED";
  lastFetchStatus: "NEVER" | "SUCCESS" | "NO_DATA" | "ERROR";
  lastFetchedAt: Date | null;
  nextFetchAt: Date | null;
  observationCount: number;
};
