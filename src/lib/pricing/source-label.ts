const PRICE_SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  mpb: "MPB",
  kamerastore: "KameraStore",
};

export function formatPriceSourceLabel(sourceKey: string) {
  return PRICE_SOURCE_LABELS[sourceKey] ?? sourceKey;
}
