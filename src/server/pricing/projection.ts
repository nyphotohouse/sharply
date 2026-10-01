import type { GearPriceProjection } from "~/server/db/schema";
import {
  listValidPriceObservationsForGearData,
  persistGearPriceProjectionData,
  type PriceEstimateInsert,
} from "./data";
import { estimatePrice } from "./estimator";
import {
  PRICE_METHOD_VERSION,
  PRICE_STALE_AFTER_MS,
  inferCurrencyFromMarket,
} from "./types";

function projectionKey(marketKey: string, priceKind: string): string {
  return priceKind === "used_retail" ? marketKey : `${marketKey}:${priceKind}`;
}

export async function rebuildGearPriceProjection(gearId: string) {
  const observations = await listValidPriceObservationsForGearData(gearId);
  const grouped = new Map<string, typeof observations>();

  for (const observation of observations) {
    const key = `${observation.marketKey}:${observation.priceKind}`;
    const current = grouped.get(key) ?? [];
    current.push(observation);
    grouped.set(key, current);
  }

  const projection: GearPriceProjection = {};
  const estimates: PriceEstimateInsert[] = [];
  const now = Date.now();

  for (const group of grouped.values()) {
    const first = group[0];
    if (!first) continue;
    const estimate = estimatePrice(group);
    if (!estimate) continue;

    const sourceCount = new Set(
      group.map((observation) => observation.mappingId),
    ).size;
    const currency = inferCurrencyFromMarket(first.marketKey);

    estimates.push({
      marketKey: first.marketKey,
      priceKind: first.priceKind,
      lowMinor: estimate.lowMinor,
      typicalMinor: estimate.typicalMinor,
      highMinor: estimate.highMinor,
      currency,
      asOf: estimate.asOf,
      methodVersion: PRICE_METHOD_VERSION,
      sourceCount,
      observationCount: estimate.observationCount,
      inputObservationIds: estimate.inputObservationIds,
    });

    projection[projectionKey(first.marketKey, first.priceKind)] = {
      low: estimate.lowMinor,
      typical: estimate.typicalMinor,
      high: estimate.highMinor,
      asOf: estimate.asOf.toISOString(),
      status:
        now - estimate.asOf.getTime() > PRICE_STALE_AFTER_MS
          ? "stale"
          : "current",
      sourceCount,
      observationCount: estimate.observationCount,
      methodVersion: PRICE_METHOD_VERSION,
    };
  }

  await persistGearPriceProjectionData({ gearId, projection, estimates });
  return projection;
}
