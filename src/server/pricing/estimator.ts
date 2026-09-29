import type { PriceObservationInput } from "./types";

export type EstimatorObservation = PriceObservationInput & {
  id?: string;
};

export type PriceEstimate = {
  lowMinor: number;
  typicalMinor: number;
  highMinor: number;
  asOf: Date;
  observationCount: number;
  inputObservationIds: string[];
};

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const index = (values.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower]!;
  const weight = index - lower;
  return Math.round(
    values[lower]! + (values[upper]! - values[lower]!) * weight,
  );
}

function observationValue(observation: EstimatorObservation): number | null {
  if (
    observation.valueKind === "RANGE" &&
    Number.isInteger(observation.lowMinor) &&
    Number.isInteger(observation.highMinor) &&
    observation.lowMinor! > 0 &&
    observation.highMinor! >= observation.lowMinor!
  ) {
    return Math.round((observation.lowMinor! + observation.highMinor!) / 2);
  }
  if (
    Number.isInteger(observation.amountMinor) &&
    observation.amountMinor! > 0
  ) {
    return observation.amountMinor!;
  }
  return null;
}

function roundToNearestDollar(amountMinor: number): number {
  return Math.round(amountMinor / 100) * 100;
}

/**
 * Small, deterministic estimator for the first pricing slice. Ranges become
 * their midpoint, then quartiles provide low/typical/high. This is easy to
 * explain and can be replaced by a richer method without changing the schema.
 */
export function estimatePrice(
  observations: EstimatorObservation[],
): PriceEstimate | null {
  const usable = observations
    .map((observation) => ({
      observation,
      value: observationValue(observation),
    }))
    .filter(
      (item): item is { observation: EstimatorObservation; value: number } =>
        item.value !== null,
    )
    .sort((a, b) => a.value - b.value);

  if (usable.length === 0) return null;

  const values = usable.map((item) => item.value);
  const latest = usable.reduce((latestDate, item) => {
    const date = item.observation.observedAt ?? new Date(0);
    return date > latestDate ? date : latestDate;
  }, new Date(0));

  return {
    lowMinor: roundToNearestDollar(percentile(values, 0.25)),
    typicalMinor: roundToNearestDollar(percentile(values, 0.5)),
    highMinor: roundToNearestDollar(percentile(values, 0.75)),
    asOf: latest,
    observationCount: usable.length,
    inputObservationIds: usable
      .map((item) => item.observation.id)
      .filter((id): id is string => Boolean(id)),
  };
}
