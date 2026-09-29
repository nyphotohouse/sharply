import type { GearTableRow } from "./gear-table-types";
import { formatAnalogMedium } from "~/lib/mapping/analog-types-map";
import { getMountLongName } from "~/lib/mapping/mounts-map";
import { getComparablePrice } from "~/lib/pricing/display-price";

export function getMountDisplayNames(mountNames: string[]) {
  return mountNames.map(getMountLongName);
}

export function formatMountNames(mountNames: string[]) {
  return getMountDisplayNames(mountNames).join(", ");
}

export function getCameraTypeDisplay(row: GearTableRow) {
  return row.gearType === "ANALOG_CAMERA"
    ? (formatAnalogMedium(row.analogCaptureMedium) ?? null)
    : row.sensorFormatName;
}

export function compareNullable<T>(
  left: T | null | undefined,
  right: T | null | undefined,
  compare: (a: T, b: T) => number,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return compare(left, right);
}

export function getEffectiveDateValue(row: GearTableRow) {
  const raw = row.releaseDate ?? row.announcedDate;
  if (!raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getEffectivePrice(row: GearTableRow) {
  return getComparablePrice(row, { market: "US" }).valueMinor;
}

export function compareEffectivePriceRows(
  left: GearTableRow,
  right: GearTableRow,
) {
  const priceComparison = compareNullable(
    getEffectivePrice(left),
    getEffectivePrice(right),
    (a, b) => a - b,
  );
  if (priceComparison !== 0) return priceComparison;

  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}
