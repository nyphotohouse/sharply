import type { PriceObservationInput } from "./types";

export type EstimatorObservation = PriceObservationInput & {
  id?: string;
  createdAt?: Date;
};

export const RECENT_OBSERVATION_LIMIT = 5;

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

type ObservationEstimateValue = {
  low: number;
  typical: number;
  high: number;
};

function observationValue(
  observation: EstimatorObservation,
): ObservationEstimateValue | null {
  if (
    observation.valueKind === "RANGE" &&
    Number.isInteger(observation.lowMinor) &&
    Number.isInteger(observation.highMinor) &&
    observation.lowMinor! > 0 &&
    observation.highMinor! >= observation.lowMinor!
  ) {
    return {
      low: observation.lowMinor!,
      typical: Math.round((observation.lowMinor! + observation.highMinor!) / 2),
      high: observation.highMinor!,
    };
  }
  if (
    Number.isInteger(observation.amountMinor) &&
    observation.amountMinor! > 0
  ) {
    return {
      low: observation.amountMinor!,
      typical: observation.amountMinor!,
      high: observation.amountMinor!,
    };
  }
  return null;
}

function roundToNearestDollar(amountMinor: number): number {
  return Math.round(amountMinor / 100) * 100;
}

/**
 * Small, deterministic estimator for the first pricing slice. The most recent
 * observations are sampled before range bounds contribute to projected
 * low/high and their midpoints contribute to typical. Quartiles keep outliers
 * from defining the result by themselves. This can be replaced by a richer
 * method without changing the schema.
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
      (
        item,
      ): item is {
        observation: EstimatorObservation;
        value: ObservationEstimateValue;
      } => item.value !== null,
    )
    .sort((a, b) => {
      const observedAtDifference =
        (b.observation.observedAt?.getTime() ?? 0) -
        (a.observation.observedAt?.getTime() ?? 0);
      if (observedAtDifference !== 0) return observedAtDifference;

      const createdAtDifference =
        (b.observation.createdAt?.getTime() ?? 0) -
        (a.observation.createdAt?.getTime() ?? 0);
      if (createdAtDifference !== 0) return createdAtDifference;

      return (b.observation.id ?? "").localeCompare(a.observation.id ?? "");
    });

  if (usable.length === 0) return null;

  // Keep the complete observation history, but make the current estimate
  // responsive to recent movement. With fewer observations, this naturally
  // falls back to the complete available set.
  const sample = usable.slice(0, RECENT_OBSERVATION_LIMIT);
  const orderedSample = sample.slice().sort((a, b) => {
    const typicalDifference = a.value.typical - b.value.typical;
    if (typicalDifference !== 0) return typicalDifference;
    return (a.observation.id ?? "").localeCompare(b.observation.id ?? "");
  });

  const lowValues = sample.map((item) => item.value.low).sort((a, b) => a - b);
  const typicalValues = orderedSample.map((item) => item.value.typical);
  const highValues = sample
    .map((item) => item.value.high)
    .sort((a, b) => a - b);
  const latest = sample.reduce((latestDate, item) => {
    const date = item.observation.observedAt ?? new Date(0);
    return date > latestDate ? date : latestDate;
  }, new Date(0));

  return {
    lowMinor: roundToNearestDollar(percentile(lowValues, 0.25)),
    typicalMinor: roundToNearestDollar(percentile(typicalValues, 0.5)),
    highMinor: roundToNearestDollar(percentile(highValues, 0.75)),
    asOf: latest,
    observationCount: sample.length,
    inputObservationIds: orderedSample
      .map((item) => item.observation.id)
      .filter((id): id is string => Boolean(id)),
  };
}
