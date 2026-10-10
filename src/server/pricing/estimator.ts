import type { PriceObservationInput } from "./types";
import type { PriceCalculationInput } from "~/server/db/schema";

export const SOURCE_WEIGHTS: Record<string, number> = {
  campricer: 3,
  mpb: 1,
  kamerastore: 1,
  manual: 1,
};
export type EstimatorObservation = PriceObservationInput & {
  id?: string;
  createdAt?: Date;
  sourceKey?: string;
  originalAmountMinor?: number;
  originalCurrency?: string;
  conversionRate?: number;
  ratesDate?: string | null;
};
export type PriceEstimate = {
  lowMinor: number;
  typicalMinor: number;
  highMinor: number;
  asOf: Date;
  observationCount: number;
  inputObservationIds: string[];
  calculationInputs: PriceCalculationInput[];
};

/** Compatibility only: old ranges become one midpoint, never estimate bounds. */
export function observationPoint(
  observation: PriceObservationInput,
): number | null {
  if (observation.valueKind === "RANGE") {
    const { lowMinor: low, highMinor: high } = observation;
    return Number.isInteger(low) &&
      Number.isInteger(high) &&
      low! > 0 &&
      high! >= low!
      ? Math.round((low! + high!) / 2)
      : null;
  }
  return Number.isInteger(observation.amountMinor) &&
    observation.amountMinor! > 0
    ? observation.amountMinor!
    : null;
}

export function estimatePrice(
  observations: EstimatorObservation[],
): PriceEstimate | null {
  const latest = new Map<
    string,
    { observation: EstimatorObservation; point: number }
  >();
  const ordered = observations
    .slice()
    .sort(
      (a, b) =>
        (b.observedAt?.getTime() ?? 0) - (a.observedAt?.getTime() ?? 0) ||
        (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) ||
        (b.id ?? "").localeCompare(a.id ?? ""),
    );
  for (const observation of ordered) {
    const point = observationPoint(observation);
    const source = observation.sourceKey ?? "manual";
    if (point === null || latest.has(source)) continue;
    latest.set(source, { observation, point });
  }
  if (!latest.size) return null;
  const inputs: PriceCalculationInput[] = Array.from(latest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceKey, { observation: o, point }]) => ({
      observationId: o.id ?? "",
      sourceKey,
      amountMinor: point,
      weight: SOURCE_WEIGHTS[sourceKey] ?? 1,
      observedAt: (o.observedAt ?? new Date(0)).toISOString(),
      originalAmountMinor: o.originalAmountMinor ?? point,
      originalCurrency: o.originalCurrency ?? "",
      pooled: sourceKey === "campricer",
      conversionRate: o.conversionRate ?? 1,
      ratesDate: o.ratesDate ?? null,
    }));
  const totalWeight = inputs.reduce((sum, x) => sum + x.weight, 0);
  const round = (value: number) => Math.round(value / 100) * 100;
  return {
    typicalMinor: round(
      inputs.reduce((sum, x) => sum + x.amountMinor * x.weight, 0) /
        totalWeight,
    ),
    lowMinor: round(Math.min(...inputs.map((x) => x.amountMinor))),
    highMinor: round(Math.max(...inputs.map((x) => x.amountMinor))),
    asOf: new Date(
      Math.min(...inputs.map((x) => new Date(x.observedAt).getTime())),
    ),
    observationCount: inputs.length,
    inputObservationIds: inputs.map((x) => x.observationId).filter(Boolean),
    calculationInputs: inputs,
  };
}
