export const PRICE_MARKETS = ["US", "UK", "EU"] as const;
export type PriceMarket = (typeof PRICE_MARKETS)[number];

export const MARKET_CURRENCY: Record<PriceMarket, string> = {
  US: "USD",
  UK: "GBP",
  EU: "EUR",
};

export type PriceProjectionEntry = {
  low: number;
  typical: number;
  high: number;
  asOf: string;
  status: "current" | "stale" | "unavailable";
  sourceCount: number;
  observationCount: number;
  methodVersion: number;
};

export type PriceProjection = Record<string, PriceProjectionEntry>;

export type DisplayPriceInput = {
  usedPriceProjection?: PriceProjection | null;
  mpbMaxPriceUsdCents?: unknown;
  msrpNowUsdCents?: unknown;
  msrpAtLaunchUsdCents?: unknown;
};

export type DisplayPriceValue =
  | {
      kind: "POINT";
      amountMinor: number;
    }
  | {
      kind: "RANGE";
      lowMinor: number;
      typicalMinor: number;
      highMinor: number;
    };

export type DisplayPriceSource =
  | "USED_ESTIMATE"
  | "LEGACY_MPB"
  | "MSRP_NOW"
  | "MSRP_LAUNCH";

export type DisplayPriceStatus =
  | "current"
  | "stale"
  | "fallback"
  | "unavailable";

export type DisplayPrice = {
  requestedMarket: PriceMarket;
  market: PriceMarket | null;
  marketMatch: "exact" | "fallback" | "none";
  currency: string | null;
  condition: "USED" | "NEW" | null;
  source: DisplayPriceSource | null;
  status: DisplayPriceStatus;
  value: DisplayPriceValue | null;
  asOf: string | null;
  sourceCount: number | null;
  observationCount: number | null;
};

export type DisplayPriceOptions = {
  market: PriceMarket;
  range?: boolean;
};

export type ComparablePrice = {
  comparisonMarket: PriceMarket;
  currency: string | null;
  source: DisplayPriceSource | null;
  status: DisplayPriceStatus;
  valueMinor: number | null;
  comparable: boolean;
};

function normalizeMinor(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  ) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
      ? parsed
      : null;
  }
  return null;
}

function normalizeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProjectionEntry(
  projection: PriceProjection | null | undefined,
  market: PriceMarket,
) {
  const rawEntry = projection?.[market];
  if (!isRecord(rawEntry)) return null;
  if (rawEntry.status !== "current" && rawEntry.status !== "stale") {
    return null;
  }

  const lowMinor = normalizeMinor(rawEntry.low);
  const typicalMinor = normalizeMinor(rawEntry.typical);
  const highMinor = normalizeMinor(rawEntry.high);
  if (
    lowMinor === null ||
    typicalMinor === null ||
    highMinor === null ||
    highMinor < lowMinor ||
    typicalMinor < lowMinor ||
    typicalMinor > highMinor
  ) {
    return null;
  }

  return {
    lowMinor,
    typicalMinor,
    highMinor,
    asOf:
      typeof rawEntry.asOf === "string" && rawEntry.asOf.trim() !== ""
        ? rawEntry.asOf
        : null,
    status: rawEntry.status,
    sourceCount: normalizeCount(rawEntry.sourceCount),
    observationCount: normalizeCount(rawEntry.observationCount),
  };
}

function createPointValue(amountMinor: number): DisplayPriceValue {
  return { kind: "POINT", amountMinor };
}

function createUnavailablePrice(market: PriceMarket): DisplayPrice {
  return {
    requestedMarket: market,
    market: null,
    marketMatch: "none",
    currency: null,
    condition: null,
    source: null,
    status: "unavailable",
    value: null,
    asOf: null,
    sourceCount: null,
    observationCount: null,
  };
}

export function getDisplayPrice(
  input: DisplayPriceInput | null | undefined,
  { market, range = false }: DisplayPriceOptions,
): DisplayPrice {
  const projection = getProjectionEntry(input?.usedPriceProjection, market);
  if (projection) {
    const value: DisplayPriceValue =
      range && projection.lowMinor !== projection.highMinor
        ? {
            kind: "RANGE",
            lowMinor: projection.lowMinor,
            typicalMinor: projection.typicalMinor,
            highMinor: projection.highMinor,
          }
        : createPointValue(projection.typicalMinor);

    return {
      requestedMarket: market,
      market,
      marketMatch: "exact",
      currency: MARKET_CURRENCY[market],
      condition: "USED",
      source: "USED_ESTIMATE",
      status: projection.status,
      value,
      asOf: projection.asOf,
      sourceCount: projection.sourceCount,
      observationCount: projection.observationCount,
    };
  }

  const legacyFallbacks: Array<{
    source: "LEGACY_MPB" | "MSRP_NOW" | "MSRP_LAUNCH";
    condition: "USED" | "NEW";
    value: unknown;
  }> = [
    {
      source: "LEGACY_MPB",
      condition: "USED",
      value: input?.mpbMaxPriceUsdCents,
    },
    {
      source: "MSRP_NOW",
      condition: "NEW",
      value: input?.msrpNowUsdCents,
    },
    {
      source: "MSRP_LAUNCH",
      condition: "NEW",
      value: input?.msrpAtLaunchUsdCents,
    },
  ];

  for (const fallback of legacyFallbacks) {
    const amountMinor = normalizeMinor(fallback.value);
    if (amountMinor === null) continue;
    return {
      requestedMarket: market,
      market: null,
      marketMatch: "fallback",
      currency: "USD",
      condition: fallback.condition,
      source: fallback.source,
      status: "fallback",
      value: createPointValue(amountMinor),
      asOf: null,
      sourceCount: null,
      observationCount: null,
    };
  }

  return createUnavailablePrice(market);
}

export function getComparablePrice(
  input: DisplayPriceInput | null | undefined,
  { market }: Pick<DisplayPriceOptions, "market">,
): ComparablePrice {
  const displayPrice = getDisplayPrice(input, { market });
  const isComparable =
    displayPrice.value?.kind === "POINT" &&
    displayPrice.currency === MARKET_CURRENCY[market];

  return {
    comparisonMarket: market,
    currency: displayPrice.currency,
    source: displayPrice.source,
    status: displayPrice.status,
    valueMinor:
      isComparable && displayPrice.value?.kind === "POINT"
        ? displayPrice.value.amountMinor
        : null,
    comparable: isComparable,
  };
}
