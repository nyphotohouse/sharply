import type { GearPriceProjection } from "~/server/db/schema";
import {
  listValidPriceObservationsForGearData,
  persistGearPriceProjectionData,
  getStoredPriceProjectionData,
  type PriceEstimateInsert,
} from "./data";
import {
  estimatePrice,
  observationPoint,
  type EstimatorObservation,
} from "./estimator";
import { getExchangeRates } from "./exchange-rates";
import {
  PRICE_METHOD_VERSION,
  PRICE_STALE_AFTER_MS,
  PRICE_MARKETS,
  inferCurrencyFromMarket,
} from "./types";

type RebuildOptions = { preserveExisting?: boolean };

// Serializes with sorted keys so two projections compare equal regardless of
// the order their markets or fields were written in.
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function rebuildGearPriceProjection(
  gearId: string,
  options: RebuildOptions = {},
) {
  const { projection } = await rebuildGearPriceProjectionReportingChange(
    gearId,
    options,
  );
  return projection;
}

// Same rebuild, but also reports whether the displayed projection changed so
// callers can skip revalidating gear pages whose prices are identical.
export async function rebuildGearPriceProjectionReportingChange(
  gearId: string,
  options: RebuildOptions = {},
): Promise<{ projection: GearPriceProjection; changed: boolean }> {
  const observations = await listValidPriceObservationsForGearData(gearId);
  const pooled = observations.filter((o) => o.sourceKey === "campricer");
  const rates = pooled.length ? await getExchangeRates() : null;
  const previousProjection = await getStoredPriceProjectionData(gearId);
  // Clone so preserving existing markets never mutates the snapshot we compare against.
  const projection: GearPriceProjection = options.preserveExisting
    ? structuredClone(previousProjection)
    : {};
  const estimates: PriceEstimateInsert[] = [];
  for (const market of PRICE_MARKETS) {
    const currency = inferCurrencyFromMarket(market);
    const rate = currency === "EUR" ? 1 : rates?.rates[currency];
    if (pooled.length && !rate && options.preserveExisting) continue;
    const inputs: EstimatorObservation[] = observations
      .filter((o) => o.sourceKey !== "campricer" && o.marketKey === market)
      .map((o) => ({ ...o, originalCurrency: o.currency }));
    for (const o of pooled) {
      const point = observationPoint(o);
      if (point === null || !rate) continue;
      inputs.push({
        ...o,
        valueKind: "POINT",
        amountMinor: Math.round(point * rate),
        originalAmountMinor: point,
        originalCurrency: "EUR",
        conversionRate: rate,
        ratesDate: currency === "EUR" ? null : rates?.date,
      });
    }
    const estimate = estimatePrice(inputs);
    if (!estimate) continue;
    estimates.push({
      marketKey: market,
      priceKind: "used_retail",
      currency,
      lowMinor: estimate.lowMinor,
      typicalMinor: estimate.typicalMinor,
      highMinor: estimate.highMinor,
      asOf: estimate.asOf,
      methodVersion: PRICE_METHOD_VERSION,
      sourceCount: estimate.observationCount,
      observationCount: estimate.observationCount,
      inputObservationIds: estimate.inputObservationIds,
      calculationInputs: estimate.calculationInputs,
    });
    projection[market] = {
      low: estimate.lowMinor,
      typical: estimate.typicalMinor,
      high: estimate.highMinor,
      asOf: estimate.asOf.toISOString(),
      status:
        Date.now() - estimate.asOf.getTime() > PRICE_STALE_AFTER_MS
          ? "stale"
          : "current",
      sourceCount: estimate.observationCount,
      observationCount: estimate.observationCount,
      methodVersion: PRICE_METHOD_VERSION,
    };
  }
  await persistGearPriceProjectionData({ gearId, projection, estimates });
  const changed =
    stableSerialize(previousProjection) !== stableSerialize(projection);
  return { projection, changed };
}
