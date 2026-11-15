import { SENSOR_FORMATS } from "~/lib/constants";

type FocalLengthRangeInput = {
  isPrime?: boolean | null;
  min?: number | string | null;
  max?: number | string | null;
  /**
   * Sensor format to use for 35mm equivalent calculation (e.g., lens image circle).
   * Falls back to sensorFormatId.
   */
  imageCircleFormatId?: string | null;
  sensorFormatId?: string | null;
};

function getSensorCropFactorById(
  sensorFormatId: string | null | undefined,
): number | null {
  if (!sensorFormatId) return null;
  const format = SENSOR_FORMATS.find((entry) => entry.id === sensorFormatId);
  if (!format) return null;
  const cropFactorRaw =
    (format as any).crop_factor ?? (format as any).cropFactor;
  const cropFactor =
    typeof cropFactorRaw === "number" ? cropFactorRaw : Number(cropFactorRaw);
  if (!Number.isFinite(cropFactor)) return null;
  return cropFactor;
}

function toNumber(value: unknown): number | null {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMmValue(value: number | null): string | undefined {
  if (value == null) return undefined;
  // Keep decimals if present, but trim trailing .0
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatRange(
  minValue: number | null,
  maxValue: number | null,
  isPrime: boolean,
): string | undefined {
  if (minValue == null && maxValue == null) return undefined;
  if (isPrime || maxValue == null || minValue === maxValue) {
    const single = minValue ?? maxValue;
    const formatted = formatMmValue(single);
    return formatted ? `${formatted}mm` : undefined;
  }
  const leftValue = formatMmValue(minValue) ?? "";
  const rightValue = formatMmValue(maxValue) ?? "";
  const left = leftValue ? `${leftValue}mm` : "";
  const right = rightValue ? `${rightValue}mm` : "";
  return `${left}${left && right ? "-" : ""}${right}`;
}

export function formatFocalLengthRangeDisplay({
  isPrime,
  min,
  max,
  imageCircleFormatId,
  sensorFormatId,
}: FocalLengthRangeInput): {
  actual: string | undefined;
  equivalent: string | undefined;
} {
  const isPrimeBool = Boolean(isPrime);
  const minValue = toNumber(min);
  const maxValue = toNumber(max);
  const actual = formatRange(minValue, maxValue, isPrimeBool);

  const cropFactor =
    getSensorCropFactorById(imageCircleFormatId ?? sensorFormatId) ?? null;
  if (!cropFactor || Math.abs(cropFactor - 1) < 0.01) {
    return { actual, equivalent: undefined };
  }

  const equivalentMin =
    minValue != null ? Math.round(minValue * cropFactor) : null;
  const equivalentMax =
    maxValue != null ? Math.round(maxValue * cropFactor) : null;
  const equivalent = formatRange(equivalentMin, equivalentMax, isPrimeBool);

  return { actual, equivalent };
}

/**
 * Format a sensor/image-circle name for use mid-sentence in the FOV tooltip.
 * Keeps acronyms like APS-C intact; lowercases plain names like Medium Format.
 */
export function formatSensorFormatNameForSentence(formatName: string): string {
  const trimmed = formatName.trim();
  if (!trimmed) return trimmed;
  if (/aps/i.test(trimmed)) return trimmed;
  if (/^\d/.test(trimmed) || /["/]/.test(trimmed)) return trimmed;
  return trimmed.toLowerCase();
}

/** Indefinite article for a format name based on leading pronunciation. */
export function indefiniteArticleForFormatName(formatName: string): "a" | "an" {
  const trimmed = formatName.trim();
  if (/^aps/i.test(trimmed)) return "an";
  const firstLetter = trimmed[0]?.toLowerCase();
  if (firstLetter && "aeiou".includes(firstLetter)) return "an";
  return "a";
}

/**
 * Tooltip explaining full-frame-equivalent focal length.
 * `equivalent` is the same display string shown in the UI (e.g. "19mm", "29-72mm").
 */
export function buildFocalLengthEquivalentTooltip({
  formatName,
  equivalent,
}: {
  formatName: string;
  equivalent: string;
}): string {
  const format = formatSensorFormatNameForSentence(formatName);
  const article = indefiniteArticleForFormatName(format);
  return `On ${article} ${format} camera, this lens has a field of view similar to a ${equivalent} lens on a full-frame camera.`;
}
