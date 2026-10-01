export const PRICE_MARKETS = ["US", "UK", "EU"] as const;
export type PriceMarket = (typeof PRICE_MARKETS)[number];

export const MARKET_CURRENCY: Record<PriceMarket, string> = {
  US: "USD",
  UK: "GBP",
  EU: "EUR",
};

export type ExchangeRates = {
  base: string;
  date: string | null;
  rates: Record<string, number>;
};

export type PriceView = {
  market: PriceMarket;
  locale: string;
  exchangeRates: ExchangeRates | null;
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
  isConverted: boolean;
};

export type DisplayPriceOptions = {
  market: PriceMarket;
  range?: boolean;
  exchangeRates?: ExchangeRates | null;
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
    isConverted: false,
  };
}

function getRate(
  currency: string,
  exchangeRates: ExchangeRates,
): number | null {
  if (currency === exchangeRates.base) return 1;
  const rate = exchangeRates.rates[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : null;
}

function convertMinor(
  amountMinor: number,
  sourceCurrency: string,
  targetCurrency: string,
  exchangeRates: ExchangeRates | null | undefined,
): number | null {
  if (sourceCurrency === targetCurrency) return amountMinor;
  if (!exchangeRates) return null;

  const sourceRate = getRate(sourceCurrency, exchangeRates);
  const targetRate = getRate(targetCurrency, exchangeRates);
  if (sourceRate === null || targetRate === null) return null;

  const convertedMinor = (amountMinor / sourceRate) * targetRate;
  return Math.round(convertedMinor / 100) * 100;
}

function convertPriceValue(
  value: DisplayPriceValue,
  sourceCurrency: string,
  targetCurrency: string,
  exchangeRates: ExchangeRates | null | undefined,
): DisplayPriceValue | null {
  if (value.kind === "POINT") {
    const amountMinor = convertMinor(
      value.amountMinor,
      sourceCurrency,
      targetCurrency,
      exchangeRates,
    );
    return amountMinor === null ? null : createPointValue(amountMinor);
  }

  const lowMinor = convertMinor(
    value.lowMinor,
    sourceCurrency,
    targetCurrency,
    exchangeRates,
  );
  const typicalMinor = convertMinor(
    value.typicalMinor,
    sourceCurrency,
    targetCurrency,
    exchangeRates,
  );
  const highMinor = convertMinor(
    value.highMinor,
    sourceCurrency,
    targetCurrency,
    exchangeRates,
  );
  if (lowMinor === null || typicalMinor === null || highMinor === null) {
    return null;
  }

  return { kind: "RANGE", lowMinor, typicalMinor, highMinor };
}

function createProjectionPrice(
  projection: NonNullable<ReturnType<typeof getProjectionEntry>>,
  sourceMarket: PriceMarket,
  requestedMarket: PriceMarket,
  range: boolean,
  exchangeRates: ExchangeRates | null | undefined,
): DisplayPrice {
  const sourceCurrency = MARKET_CURRENCY[sourceMarket];
  const targetCurrency = MARKET_CURRENCY[requestedMarket];
  const sourceValue: DisplayPriceValue =
    range && projection.lowMinor !== projection.highMinor
      ? {
          kind: "RANGE",
          lowMinor: projection.lowMinor,
          typicalMinor: projection.typicalMinor,
          highMinor: projection.highMinor,
        }
      : createPointValue(projection.typicalMinor);
  const convertedValue = convertPriceValue(
    sourceValue,
    sourceCurrency,
    targetCurrency,
    exchangeRates,
  );
  const isConverted =
    sourceMarket !== requestedMarket && convertedValue !== null;
  const value = convertedValue ?? sourceValue;

  return {
    requestedMarket,
    market: sourceMarket,
    marketMatch: sourceMarket === requestedMarket ? "exact" : "fallback",
    currency: isConverted ? targetCurrency : sourceCurrency,
    condition: "USED",
    source: "USED_ESTIMATE",
    status: projection.status,
    value,
    asOf: projection.asOf,
    sourceCount: projection.sourceCount,
    observationCount: projection.observationCount,
    isConverted,
  };
}

export function getPriceMarketForLocale(locale?: string): PriceMarket {
  const normalized = locale?.toLowerCase() ?? "en";
  if (normalized === "en-gb" || normalized.startsWith("en-gb-")) {
    return "UK";
  }

  const language = normalized.split("-")[0] ?? "";
  if (["de", "fr", "es", "it"].includes(language)) return "EU";
  return "US";
}

export function getPriceMarketForLocaleId(localeId?: string): PriceMarket {
  if (localeId === "uk") return "UK";
  if (["eu", "de", "fr", "es", "it"].includes(localeId ?? "")) {
    return "EU";
  }
  return "US";
}

export function getPriceLocaleForMarket(market: PriceMarket): string {
  if (market === "UK") return "en-GB";
  if (market === "EU") return "de-DE";
  return "en-US";
}

export function createPriceView(
  market: PriceMarket,
  exchangeRates?: ExchangeRates | null,
): PriceView {
  return {
    market,
    locale: getPriceLocaleForMarket(market),
    exchangeRates: exchangeRates ?? null,
  };
}

export function getPriceViewForLocale(
  locale?: string,
  exchangeRates?: ExchangeRates | null,
): PriceView {
  return createPriceView(getPriceMarketForLocale(locale), exchangeRates);
}

export function displayPriceNeedsExchangeRates(
  input: DisplayPriceInput | null | undefined,
  { market }: Pick<DisplayPriceOptions, "market">,
): boolean {
  if (getProjectionEntry(input?.usedPriceProjection, market)) return false;

  const hasAlternateProjection = PRICE_MARKETS.some(
    (sourceMarket) =>
      sourceMarket !== market &&
      Boolean(getProjectionEntry(input?.usedPriceProjection, sourceMarket)),
  );
  if (hasAlternateProjection) return true;

  return (
    market !== "US" &&
    [
      input?.mpbMaxPriceUsdCents,
      input?.msrpNowUsdCents,
      input?.msrpAtLaunchUsdCents,
    ].some((value) => normalizeMinor(value) !== null)
  );
}

export function getDisplayPrice(
  input: DisplayPriceInput | null | undefined,
  { market, range = false, exchangeRates = null }: DisplayPriceOptions,
): DisplayPrice {
  const projection = getProjectionEntry(input?.usedPriceProjection, market);
  if (projection) {
    return createProjectionPrice(
      projection,
      market,
      market,
      range,
      exchangeRates,
    );
  }

  for (const sourceMarket of PRICE_MARKETS) {
    if (sourceMarket === market) continue;
    const alternateProjection = getProjectionEntry(
      input?.usedPriceProjection,
      sourceMarket,
    );
    if (alternateProjection) {
      return createProjectionPrice(
        alternateProjection,
        sourceMarket,
        market,
        range,
        exchangeRates,
      );
    }
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
    const convertedAmountMinor = convertMinor(
      amountMinor,
      MARKET_CURRENCY.US,
      MARKET_CURRENCY[market],
      exchangeRates,
    );
    const isConverted = market !== "US" && convertedAmountMinor !== null;
    return {
      requestedMarket: market,
      market: null,
      marketMatch: "fallback",
      currency: isConverted ? MARKET_CURRENCY[market] : MARKET_CURRENCY.US,
      condition: fallback.condition,
      source: fallback.source,
      status: "fallback",
      value: createPointValue(convertedAmountMinor ?? amountMinor),
      asOf: null,
      sourceCount: null,
      observationCount: null,
      isConverted,
    };
  }

  return createUnavailablePrice(market);
}

export function getComparablePrice(
  input: DisplayPriceInput | null | undefined,
  {
    market,
    exchangeRates,
  }: Pick<DisplayPriceOptions, "market" | "exchangeRates">,
): ComparablePrice {
  const displayPrice = getDisplayPrice(input, { market, exchangeRates });
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
