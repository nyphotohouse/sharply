import type {
  GearTableRow,
  GearTableScope,
  GearTableSource,
} from "./gear-table-types";

const CAMERA_GEAR_TYPES = new Set(["CAMERA", "ANALOG_CAMERA"]);
const DATE_PRECISIONS = new Set(["DAY", "MONTH", "YEAR"]);

function normalizeDatePrecision(value: string | null | undefined) {
  return value && DATE_PRECISIONS.has(value)
    ? (value as GearTableRow["releaseDatePrecision"])
    : null;
}

export function toGearTableRow(item: GearTableSource): GearTableRow {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    regionalAliases: item.regionalAliases ?? [],
    brandName: item.brandName ?? null,
    gearType: item.gearType ?? null,
    isUnderConstruction: item.isUnderConstruction ?? false,
    mountNames: item.mountNames ?? [],
    releaseDate: item.releaseDate ?? null,
    releaseDatePrecision: normalizeDatePrecision(item.releaseDatePrecision),
    announcedDate: item.announcedDate ?? null,
    announceDatePrecision: normalizeDatePrecision(item.announceDatePrecision),
    msrpNowUsdCents: item.msrpNowUsdCents ?? null,
    msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents ?? null,
    mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents ?? null,
    usedPriceProjection: item.usedPriceProjection ?? null,
    sensorFormatName: item.sensorFormatName ?? null,
    analogCaptureMedium: item.analogCaptureMedium ?? null,
    weightGrams: item.weightGrams ?? null,
    focalLengthMinMm: item.focalLengthMinMm ?? null,
    focalLengthMaxMm: item.focalLengthMaxMm ?? null,
    isPrime: item.isPrime ?? null,
    maxApertureWide: item.maxApertureWide ?? null,
    maxApertureTele: item.maxApertureTele ?? null,
  };
}

export function toGearTableRows(items: GearTableSource[]): GearTableRow[] {
  return items.map(toGearTableRow);
}

export function resolveGearTableScope(rows: GearTableRow[]): GearTableScope {
  if (
    rows.length > 0 &&
    rows.every((row) => CAMERA_GEAR_TYPES.has(row.gearType ?? ""))
  ) {
    return "camera";
  }
  if (rows.length > 0 && rows.every((row) => row.gearType === "LENS")) {
    return "lens";
  }
  return "mixed";
}
