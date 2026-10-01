export type UsedPricingMode = "ACTIVE" | "MANUAL" | "NONE";

export type UsedPricingProjection = Record<
  string,
  {
    typical: number;
    status: "current" | "stale" | "unavailable";
  }
>;

const MARKET_CURRENCY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  EU: "EUR",
};

const MARKET_ORDER = ["US", "UK", "EU"] as const;

export function getUsedPricingMode(
  sourceKeys: readonly string[],
): UsedPricingMode {
  if (sourceKeys.some((sourceKey) => sourceKey !== "manual")) return "ACTIVE";
  if (sourceKeys.includes("manual")) return "MANUAL";
  return "NONE";
}

export function getUsedPricingPreview(
  projection: UsedPricingProjection | null | undefined,
  mode: UsedPricingMode,
  locale?: string,
) {
  const market = MARKET_ORDER.find((marketKey) => {
    const entry = projection?.[marketKey];
    return (
      entry &&
      (entry.status === "current" || entry.status === "stale") &&
      Number.isInteger(entry.typical) &&
      entry.typical > 0
    );
  });

  const entry = market ? projection?.[market] : undefined;
  const currency = market ? MARKET_CURRENCY[market] : undefined;

  return {
    price:
      entry && currency
        ? new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(entry.typical / 100)
        : null,
    modeLabel:
      mode === "ACTIVE" ? "Active" : mode === "MANUAL" ? "Manual" : null,
  };
}
