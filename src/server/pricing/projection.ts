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

export async function rebuildGearPriceProjection(
  gearId: string,
  options: { preserveExisting?: boolean } = {},
) {
  const observations = await listValidPriceObservationsForGearData(gearId);
  const pooled = observations.filter((o) => o.sourceKey === "campricer");
  const rates = pooled.length ? await getExchangeRates() : null;
  const projection: GearPriceProjection = options.preserveExisting
    ? await getStoredPriceProjectionData(gearId)
    : {};
  const estimates: PriceEstimateInsert[] = [];
  for (const market of PRICE_MARKETS) {
    const currency = inferCurrencyFromMarket(market);
    const inputs: EstimatorObservation[] = observations
      .filter((o) => o.sourceKey !== "campricer" && o.marketKey === market)
      .map((o) => ({ ...o, originalCurrency: o.currency }));
    for (const o of pooled) {
      const point = observationPoint(o);
      const rate = currency === "EUR" ? 1 : rates?.rates[currency];
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
  return projection;
}
