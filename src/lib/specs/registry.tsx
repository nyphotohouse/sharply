import type { SpecsTableSection } from "~/app/[locale]/(pages)/gear/_components/specs-table";
import { VideoSpecsSummary } from "~/app/[locale]/(pages)/gear/_components/video/video-summary";
import { ApproximatePriceText } from "~/components/gear/approximate-price-text";
import { LensApertureProfile } from "~/components/lens-aperture-profile/lens-aperture-profile";
import { normalizeApertureProfile } from "~/lib/lens-aperture-profile";
import { Badge } from "~/components/ui/badge";
import { isValidElement, type ReactNode } from "react";
import { formatDateWithPrecision, type DatePrecision } from "~/lib/format/date";
import { formatBaseIsoValues, formatIsoRange } from "~/lib/format/iso";
import { type GearRegion } from "~/lib/gear/region";
import { AF_AREA_MODES, MOUNTS } from "~/lib/generated";
import {
  formatCameraType,
  formatCardSlotDetails,
  formatPrecaptureSupport,
  formatDisplayPrice,
  formatPrice,
  formatShutterType,
} from "~/lib/mapping";
import {
  formatAnalogCameraType,
  formatAnalogExposureMode,
  formatAnalogFilmTransport,
  formatAnalogFocusAid,
  formatAnalogIsoSettingMethod,
  formatAnalogMedium,
  formatAnalogMeteringDisplay,
  formatAnalogMeteringMode,
  formatAnalogShutterType,
  formatAnalogViewfinderType,
} from "~/lib/mapping/analog-types-map";
import { formatFilterType } from "~/lib/mapping/filter-types-map";
import { formatFocalLengthRangeDisplay } from "~/lib/mapping/focal-length-map";
import { formatFocusDistance } from "~/lib/mapping/focus-distance-map";
import { formatMaxFpsDisplay } from "~/lib/mapping/max-fps-map";
import { getMountLongNameById } from "~/lib/mapping/mounts-map";
import {
  getDisplayPrice,
  getPriceViewForLocale,
  type PriceView,
} from "~/lib/pricing/display-price";
import {
  sensorNameFromId,
  sensorTypeLabel,
  type SensorTypeSource,
} from "~/lib/mapping/sensor-map";
import { cn } from "~/lib/utils";
import {
  normalizedToCameraVideoModes,
  type VideoModeNormalized,
} from "~/lib/video/mode-schema";
import { buildVideoDisplayBundle } from "~/lib/video/transform";
import type { CameraVideoMode, GearAlias, GearItem } from "~/types/gear";
import { supportsVideoMeaningfully } from "./helpers";
import { supportsViewfinderEyePoint } from "./viewfinder";

export type SpecTranslator = ((key: string) => string) & {
  has?: (key: string) => boolean;
};

type SpecTranslationContext = {
  locale?: string;
  t?: SpecTranslator;
  surface?: "public" | "editor";
  priceView?: PriceView;
};

type SpecLabelDescriptor = {
  label: string;
  labelKey?: string;
};

function coerceCameraVideoModes(
  modes?: GearItem["videoModes"],
): CameraVideoMode[] {
  if (!modes?.length) return [];
  const first = modes[0] as CameraVideoMode | VideoModeNormalized | undefined;
  if (first && "id" in first) {
    return modes as CameraVideoMode[];
  }
  return normalizedToCameraVideoModes((modes ?? []) as VideoModeNormalized[]);
}

function yesNoNull(
  value: boolean | null | undefined,
  hideIfFalse?: boolean,
): string | undefined {
  if (value == null || (value === false && hideIfFalse === true))
    return undefined;
  return value ? "Yes" : "No";
}
// Helper function to format a decimal number in a compact format
// If it's a whole number display as integer, otherwise display with up to 1 decimal
function formatDecimalCompact(
  value: number | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return undefined;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

function formatWeightGrams(
  value: number | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;

  if (n >= 1000) {
    const kg = n / 1000;
    const formattedKg = Number.isInteger(kg)
      ? String(kg)
      : String(Number(kg.toFixed(2)));
    return `${formattedKg} kg`;
  }

  const formattedGrams = Number.isInteger(n)
    ? String(n)
    : String(Number(n.toFixed(1)));
  return `${formattedGrams} g`;
}

function isMultiMountLens(item: GearItem): boolean {
  return item.gearType === "LENS" && (item.mountIds?.length ?? 0) > 1;
}

function formatApproximateWeightGrams(
  value: number | string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return undefined;

  const formatted = formatWeightGrams(Math.round(numericValue));
  return formatted ? `~${formatted}` : undefined;
}

function formatStorageGb(value: unknown): string | undefined {
  if (value == null) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  if (num >= 1000) {
    const tb = num / 1000;
    const formattedTb = Number.isInteger(tb) ? tb.toFixed(0) : tb.toFixed(1);
    return `${formattedTb} TB`;
  }
  const formattedGb = Number.isInteger(num) ? num.toFixed(0) : num.toFixed(1);
  return `${formattedGb} GB`;
}

// Centralized visibility check for registry values
function hasDisplayValue(value: unknown): boolean {
  if (value == null) return false; // null/undefined
  if (typeof value === "string") return value.trim().length > 0; // empty strings
  if (Array.isArray(value)) return value.length > 0; // empty arrays
  return true; // keep 0, false->mapped to Yes/No earlier, and React nodes
}

function renderBadgeColumn(
  values: string[],
  forceLeftAlign?: boolean,
  singleItemPerRow?: boolean,
): React.ReactNode | undefined {
  const cleaned = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (!cleaned.length) return undefined;
  const keyCounts = new Map<string, number>();
  return (
    <div
      className={cn(
        "flex max-w-[320px] flex-wrap items-end gap-2",
        forceLeftAlign
          ? "items-start justify-start text-left"
          : "justify-end text-right",
        singleItemPerRow ? "flex-col" : "",
      )}
    >
      {cleaned.map((value) => {
        const nextCount = (keyCounts.get(value) ?? 0) + 1;
        keyCounts.set(value, nextCount);
        const key = nextCount === 1 ? value : `${value}-${nextCount}`;

        return (
          <Badge
            key={key}
            variant="outline"
            className={cn(
              "text-sm",
              forceLeftAlign ? "text-left" : "text-right",
            )}
          >
            {value}
          </Badge>
        );
      })}
    </div>
  );
}

function getVideoNotes(item: GearItem): string | null {
  const extra = item.cameraSpecs?.extra;
  if (
    extra &&
    typeof extra === "object" &&
    extra !== null &&
    "videoNotes" in extra &&
    typeof (extra as Record<string, unknown>).videoNotes === "string"
  ) {
    const value = (
      (extra as Record<string, unknown>).videoNotes as string
    ).trim();
    return value.length ? value : null;
  }
  return null;
}

function uniqueNonEmptyStrings(
  values: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value && value.length > 0)),
    ),
  );
}

const SHARED_SPEC_VALUE_KEYS = new Map<string, string>([
  ["Yes", "specRegistry.shared.yes"],
  ["No", "specRegistry.shared.no"],
  ["Prime", "specRegistry.shared.prime"],
  ["Zoom", "specRegistry.shared.zoom"],
  ["None", "specRegistry.shared.none"],
  ["Fixed", "specRegistry.shared.fixed"],
  ["Single-axis tilt", "specRegistry.shared.singleAxisTilt"],
  ["Dual-axis tilt", "specRegistry.shared.dualAxisTilt"],
  ["Fully articulated", "specRegistry.shared.fullyArticulated"],
  ["4 Axis Tilt-Flip", "specRegistry.shared.fourAxisTiltFlip"],
  ["Other", "specRegistry.shared.other"],
  ["Not specified", "specRegistry.shared.notSpecified"],
  ["OVF", "specRegistry.shared.ovf"],
  ["EVF", "specRegistry.shared.evf"],
  ["Hybrid", "specRegistry.shared.hybrid"],
]);

function resolveSpecText(
  defaultText: string,
  key: string | undefined,
  context: SpecTranslationContext,
): string {
  if (!defaultText || !key || !context.t || context.locale === "en") {
    return defaultText;
  }

  if (typeof context.t.has === "function" && !context.t.has(key)) {
    return defaultText;
  }

  try {
    return context.t(key);
  } catch {
    return defaultText;
  }
}

function translateSharedSpecValue(
  value: string,
  context: SpecTranslationContext,
): string {
  const key = SHARED_SPEC_VALUE_KEYS.get(value);
  return key ? resolveSpecText(value, key, context) : value;
}

function getSectionTitleKey(section: SpecSectionDef): string {
  return section.titleKey ?? `specRegistry.sections.${section.id}.title`;
}

function getFieldLabelKey(
  section: SpecSectionDef,
  field: SpecFieldDef,
): string {
  return (
    field.labelKey ??
    `specRegistry.sections.${section.id}.fields.${field.key}.label`
  );
}

function resolveSectionTitle(
  section: SpecSectionDef,
  context: SpecTranslationContext,
): string {
  return resolveSpecText(section.title, getSectionTitleKey(section), context);
}

function resolveFieldLabelDescriptor(
  section: SpecSectionDef,
  field: SpecFieldDef,
  item: GearItem,
  context: SpecTranslationContext,
): SpecLabelDescriptor & {
  englishLabel: string;
} {
  const descriptor = field.labelResolver?.(item, context) ?? {
    label: field.labelOverride ? field.labelOverride(item) : field.label,
    labelKey: getFieldLabelKey(section, field),
  };

  return {
    label: resolveSpecText(descriptor.label, descriptor.labelKey, context),
    labelKey: descriptor.labelKey,
    englishLabel: descriptor.label,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type SpecFieldDef = {
  key: string; // Stable identifier (e.g., "announcedDate", "resolutionMp")
  label: string; // Human-readable label for display
  labelKey?: string; // Translation key for display label
  labelOverride?: (item: GearItem) => string; // Optional per-item label
  labelResolver?: (
    item: GearItem,
    context?: SpecTranslationContext,
  ) => SpecLabelDescriptor; // Dynamic label with matching translation key
  searchTerms?: string[]; // Optional aliases used by client-side filtering
  getRawValue: (item: GearItem) => unknown; // Extract raw value from GearItem
  formatDisplay?: (
    raw: unknown,
    item: GearItem,
    forceLeftAlign?: boolean,
    viewerRegion?: GearRegion | null,
    locale?: string,
    priceView?: PriceView,
  ) => React.ReactNode; // Format for display (table, etc.)
  editElementId?: string; // DOM id to focus in the edit UI when navigating from sidebar
  /** Keep this field editable when the editor is filtered to missing values. */
  alwaysShowInEditor?: boolean;
  /** Exclude fields managed outside the gear change form from the editor. */
  hiddenInEditor?: boolean;
  condition?: (item: GearItem) => boolean; // Optional: when to show this field
  hideInSpecsTable?: boolean; // Optional: keep field available to edit/navigation but hide from public specs table
  condenseOnMobile?: boolean; // Whether to condense the field on mobile
  /** Set to null to exclude a website spec from the developer API. */
  api?: null;
};

export type DeveloperApiSpecMetadata = {
  /** Stable public field identifier. */
  id: string;
  /** Stable API grouping, intentionally independent from website sections. */
  category: string;
  /** English display label for the API category. */
  categoryLabel: string;
  /**
   * Optional text-only exception for a field whose website formatter renders
   * interactive or otherwise non-text UI. Normal fields reuse formatDisplay.
   */
  displayOverride?: (raw: unknown, item: GearItem) => string | undefined;
};

export type DeveloperApiSpecField = {
  section: SpecSectionDef;
  field: Omit<SpecFieldDef, "api"> & { api: DeveloperApiSpecMetadata };
};

export type DeveloperApiSpecCategory = {
  id: string;
  label: string;
  fields: Array<{
    id: string;
    label: string;
    searchTerms: string[];
  }>;
};

export type SpecSectionDef = {
  id: string; // Section identifier (e.g., "core", "camera-sensor", etc.)
  title: string; // Display title
  titleKey?: string; // Translation key for section title
  sectionAnchor: string; // ID for scrolling (e.g., "core-section")
  condition?: (item: GearItem) => boolean; // Optional: when to show this section
  fields: SpecFieldDef[];
};

// ============================================================================
// CENTRALIZED SPEC DICTIONARY
// ============================================================================

export const specDictionary: SpecSectionDef[] = [
  // ==========================================================================
  // CORE / BASIC INFORMATION
  // ==========================================================================
  {
    id: "core",
    title: "Basic Information",
    sectionAnchor: "core-section",
    fields: [
      {
        key: "cameraType",
        label: "Camera Type",
        getRawValue: (item) =>
          item.gearType === "CAMERA" ? item.cameraSpecs?.cameraType : undefined,
        formatDisplay: (raw) =>
          typeof raw === "string" ? formatCameraType(raw) : undefined,
        condition: (item) => item.gearType === "CAMERA",
      },
      {
        key: "mounts",
        label: "Mount",
        labelKey: "specRegistry.sections.core.fields.mounts.label",
        searchTerms: ["lens mount", "camera mount"],
        labelResolver: (item) => ({
          label:
            item.gearType === "LENS" &&
            item.mountIds?.length &&
            item.mountIds.length > 1
              ? "Mounts"
              : "Mount",
          labelKey:
            item.gearType === "LENS" &&
            item.mountIds?.length &&
            item.mountIds.length > 1
              ? "specRegistry.sections.core.fields.mounts.labelPlural"
              : "specRegistry.sections.core.fields.mounts.label",
        }),
        getRawValue: (item) => {
          const ids =
            (Array.isArray(item.mountIds) && item.mountIds.length > 0
              ? item.mountIds
              : []) || (item.mountId ? [item.mountId] : []);
          return ids;
        },
        formatDisplay: (raw, item, forceLeftAlign) => {
          const ids = Array.isArray(raw) ? (raw as string[]) : [];
          if (!ids.length) return undefined;
          // Lenses show all mounts, cameras show first mount only (just as a safety)
          const selectedIds = item.gearType === "LENS" ? ids : [ids[0]!];
          const mountLabels = selectedIds
            .map((mountId) => getMountLongNameById(mountId))
            .filter(
              (mountName) =>
                typeof mountName === "string" && mountName.trim().length > 0,
            );
          if (!mountLabels.length) return undefined;
          if (mountLabels.length === 1) return mountLabels[0];
          return renderBadgeColumn(mountLabels, forceLeftAlign);
        },
        editElementId: "mount",
      },
      {
        key: "announcedDate",
        label: "Announced Date",
        searchTerms: ["announcement date", "launch date", "announcement"],
        getRawValue: (item) => item.announcedDate,
        formatDisplay: (_, item, __, ___, locale) =>
          item.announcedDate
            ? formatDateWithPrecision(item.announcedDate, {
                locale: locale ?? "en",
                precision: (item.announceDatePrecision ??
                  "DAY") as DatePrecision,
              })
            : undefined,
        editElementId: "announced-date",
      },
      {
        key: "releaseDate",
        label: "Release Date",
        searchTerms: ["launch date", "availability date", "release"],
        getRawValue: (item) => item.releaseDate,
        formatDisplay: (_, item, __, ___, locale) =>
          item.releaseDate
            ? formatDateWithPrecision(item.releaseDate, {
                locale: locale ?? "en",
                precision: (item.releaseDatePrecision ??
                  "DAY") as DatePrecision,
              })
            : undefined,
        editElementId: "release-date",
      },
      {
        key: "discontinuedDate",
        label: "Discontinued Date",
        searchTerms: [
          "discontinued",
          "end of life",
          "EOL",
          "discontinuation date",
        ],
        getRawValue: (item) => item.discontinuedDate,
        formatDisplay: (_, item, __, ___, locale) =>
          item.discontinuedDate
            ? formatDateWithPrecision(item.discontinuedDate, {
                locale: locale ?? "en",
                precision: (item.discontinuedDatePrecision ??
                  "DAY") as DatePrecision,
              })
            : undefined,
        editElementId: "discontinued-date",
      },
      {
        key: "msrpAtLaunchUsdCents",
        label: "MSRP At Launch",
        searchTerms: ["price", "launch price", "retail price", "cost", "msrp"],
        getRawValue: (item) => item.msrpAtLaunchUsdCents,
        formatDisplay: (raw) => (raw ? formatPrice(raw as number) : undefined),
        editElementId: "msrpAtLaunch",
      },
      {
        key: "msrpNowUsdCents",
        label: "MSRP Now",
        searchTerms: ["price", "current price", "retail price", "cost", "msrp"],
        getRawValue: (item) => item.msrpNowUsdCents,
        formatDisplay: (raw) => (raw ? formatPrice(raw as number) : undefined),
        editElementId: "msrpNow",
      },
      {
        key: "mpbMaxPriceUsdCents",
        label: "MPB Max Price",
        searchTerms: ["price", "used price", "market price", "cost"],
        getRawValue: (item) => item.mpbMaxPriceUsdCents,
        labelResolver: (item, context) => {
          const priceView =
            context?.priceView ?? getPriceViewForLocale(context?.locale);
          const displayPrice =
            context?.surface === "public"
              ? getDisplayPrice(item, {
                  market: priceView.market,
                  exchangeRates: priceView.exchangeRates,
                })
              : null;
          return displayPrice?.source === "USED_ESTIMATE"
            ? {
                label: "Estimated Used Price",
                labelKey:
                  "specRegistry.sections.core.fields.estimatedUsedPrice.label",
              }
            : {
                label: "MPB Max Price",
                labelKey:
                  "specRegistry.sections.core.fields.mpbMaxPriceUsdCents.label",
              };
        },
        formatDisplay: (raw, item, _, __, locale, priceView) => {
          const resolvedPriceView = priceView ?? getPriceViewForLocale(locale);
          const displayPrice = getDisplayPrice(item, {
            market: resolvedPriceView.market,
            exchangeRates: resolvedPriceView.exchangeRates,
          });
          if (displayPrice.source === "USED_ESTIMATE") {
            return (
              <ApproximatePriceText
                value={formatDisplayPrice(displayPrice, {
                  style: "long",
                  locale: resolvedPriceView.locale,
                })}
              />
            );
          }
          return raw ? formatPrice(raw as number) : undefined;
        },
        editElementId: "mpbMaxPrice",
      },
      {
        key: "weightGrams",
        label: "Weight",
        searchTerms: ["mass"],
        getRawValue: (item) => item.weightGrams,
        formatDisplay: (raw, item) =>
          isMultiMountLens(item)
            ? formatApproximateWeightGrams(
                raw as number | string | null | undefined,
              )
            : formatWeightGrams(raw as number | string | null | undefined),
        editElementId: "weight",
      },
      {
        key: "dimensions",
        label: "Dimensions",
        condenseOnMobile: true,
        getRawValue: (item) => ({
          widthMm: item.widthMm,
          heightMm: item.heightMm,
          depthMm: item.depthMm,
        }),
        formatDisplay: (_, item) => {
          // Helper to coerce to number (or null) and format with up to 1 decimal
          const toNumber = (v: unknown): number | null => {
            if (typeof v === "number") return v;
            if (v == null) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const fmt = (n: number, approximate = false): string =>
            approximate
              ? `~${Math.round(n)}`
              : Number.isInteger(n)
                ? String(n)
                : String(Number(n.toFixed(1)));

          const width = toNumber(item.widthMm);
          const height = toNumber(item.heightMm);
          const depth = toNumber(item.depthMm);

          if (width == null && height == null && depth == null)
            return undefined;

          const DimensionRow = ({
            label,
            value,
            approximate = false,
          }: {
            label: string;
            value: number;
            approximate?: boolean;
          }) => (
            <div className="flex min-w-[160px] items-center justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right font-medium">
                {fmt(value, approximate)}
                <span className="text-muted-foreground ml-1">mm</span>
              </span>
            </div>
          );

          // Lenses: show Diameter (from width or height) and Length (from depth)
          if (item.gearType === "LENS") {
            const diameter = width ?? height;
            const length = depth;
            const approximateLength = isMultiMountLens(item);
            return (
              <div className="flex w-fit flex-col items-end gap-1.5 text-right">
                {length != null && (
                  <DimensionRow
                    label="Length"
                    value={length}
                    approximate={approximateLength}
                  />
                )}
                {diameter != null && (
                  <DimensionRow label="Diameter" value={diameter} />
                )}
              </div>
            );
          }

          // Cameras/others: show Width, Height, Length (depth) as a simple column
          return (
            <div className="flex w-fit flex-col items-end gap-1.5 text-right">
              {width != null && <DimensionRow label="Width" value={width} />}
              {height != null && <DimensionRow label="Height" value={height} />}
              {depth != null && <DimensionRow label="Length" value={depth} />}
            </div>
          );
        },
        editElementId: "widthMm",
      },
      {
        key: "regionalAliases",
        label: "Regional Names",
        hiddenInEditor: true,
        condenseOnMobile: true,
        getRawValue: (item) => item.regionalAliases,
        formatDisplay: (
          raw,
          item,
          _forceLeftAlign,
          viewerRegion = "GLOBAL",
        ) => {
          const aliases = (Array.isArray(raw) ? raw : []) as GearAlias[];
          if (!aliases.length) return undefined;

          const viewer = viewerRegion ?? "GLOBAL";
          const entries: Array<{ label: string; name: string }> = [];

          const findAlias = (region: GearRegion): string | undefined =>
            aliases.find((a) => a.region === region)?.name?.trim();

          if (viewer !== "GLOBAL") {
            entries.push({ label: "Default Name", name: item.name });
          }

          const usAlias = findAlias("US");
          if (usAlias && viewer !== "US") {
            entries.push({ label: "US", name: usAlias });
          }

          const euAlias = findAlias("EU");
          if (euAlias && viewer !== "EU") {
            entries.push({ label: "EU Name", name: euAlias });
          }

          const jpAlias = findAlias("JP");
          if (jpAlias && viewer !== "JP") {
            entries.push({ label: "Japan Name", name: jpAlias });
          }

          if (!entries.length) return undefined;

          return (
            <div className="flex w-full max-w-[240px] flex-col gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.label}
                  className="flex w-full items-center justify-between"
                >
                  <span className="text-muted-foreground">{entry.label}</span>
                  <span className="font-medium">{entry.name}</span>
                </div>
              ))}
            </div>
          );
        },
      },
    ],
  },

  // ==========================================================================
  // CAMERA: SENSOR & SHUTTER
  // ==========================================================================
  {
    id: "camera-sensor-shutter",
    title: "Sensor & Shutter",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "resolutionMp",
        label: "Resolution",
        searchTerms: ["megapixels", "megapixel", "mp", "sensor resolution"],
        getRawValue: (item) => item.cameraSpecs?.resolutionMp,
        formatDisplay: (raw) =>
          raw != null ? `${Number(raw).toFixed(1)} megapixels` : undefined,
      },
      {
        key: "sensorFormatId",
        label: "Sensor Format",
        getRawValue: (item) => item.cameraSpecs?.sensorFormatId,
        formatDisplay: (raw) =>
          raw ? sensorNameFromId(raw as string) : undefined,
        editElementId: "sensorFormatId",
      },
      {
        key: "isoRange",
        label: "ISO Range",
        getRawValue: (item) => ({
          min: item.cameraSpecs?.isoMin,
          max: item.cameraSpecs?.isoMax,
        }),
        formatDisplay: (_, item, __, ___, locale) =>
          formatIsoRange(item.cameraSpecs?.isoMin, item.cameraSpecs?.isoMax, {
            allowPartial: false,
            locale,
          }),
        editElementId: "isoRange",
      },
      {
        key: "isoExpandedRange",
        label: "Expanded ISO Range",
        getRawValue: (item) => ({
          min: item.cameraSpecs?.isoMinExpanded,
          max: item.cameraSpecs?.isoMaxExpanded,
        }),
        formatDisplay: (_, item, __, ___, locale) =>
          formatIsoRange(
            item.cameraSpecs?.isoMinExpanded,
            item.cameraSpecs?.isoMaxExpanded,
            { locale },
          ),
        editElementId: "isoExpandedRange",
      },
      {
        key: "baseIso",
        label: "Base ISO",
        getRawValue: (item) => item.cameraSpecs?.baseIso,
        formatDisplay: (raw, _, __, ___, locale) =>
          formatBaseIsoValues(raw, locale),
        editElementId: "baseIso",
      },
      {
        key: "maxFpsByShutter",
        label: "Max Continuous FPS",
        searchTerms: [
          "fps",
          "burst",
          "burst rate",
          "continuous shooting",
          "frame rate",
        ],
        condenseOnMobile: true,
        getRawValue: (item) => ({
          perShutter: item.cameraSpecs?.maxFpsByShutter,
          availableShutters: item.cameraSpecs?.availableShutterTypes,
          maxRaw: item.cameraSpecs?.maxFpsRaw,
          maxJpg: item.cameraSpecs?.maxFpsJpg,
        }),
        formatDisplay: (_, item) => formatMaxFpsDisplay(item),
        editElementId: "maxFpsByShutter",
      },
      {
        key: "sensorType",
        label: "Sensor Type",
        getRawValue: (item) => ({
          sensorStackingType: item.cameraSpecs?.sensorStackingType,
          sensorTechType: item.cameraSpecs?.sensorTechType,
          isBackSideIlluminated: item.cameraSpecs?.isBackSideIlluminated,
        }),
        formatDisplay: (raw) => {
          if (!raw) return undefined;
          const label = sensorTypeLabel(raw as SensorTypeSource);
          return label && label.trim().length > 0 ? label : undefined;
        },
        editElementId: "sensorStackingType",
      },
      {
        key: "sensorReadoutSpeedMs",
        label: "Sensor Readout Speed",
        getRawValue: (item) => item.cameraSpecs?.sensorReadoutSpeedMs,
        formatDisplay: (raw) =>
          typeof raw === "number" || typeof raw === "string"
            ? `${String(raw)} ms`
            : undefined,
      },
      {
        key: "maxRawBitDepth",
        label: "Max Raw Bit Depth",
        searchTerms: [
          "raw",
          "raw photo",
          "photo bit depth",
          "stills bit depth",
        ],
        getRawValue: (item) => item.cameraSpecs?.maxRawBitDepth,
        formatDisplay: (raw) =>
          typeof raw === "string" ? `${raw}-bit` : undefined,
        editElementId: "maxRawBitDepth",
      },
      {
        key: "hasIbis",
        label: "Has IBIS",
        searchTerms: [
          "stabilization",
          "image stabilization",
          "in-body image stabilization",
          "in body stabilization",
        ],
        getRawValue: (item) => item.cameraSpecs?.hasIbis,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "hasElectronicVibrationReduction",
        label: "Has Digital Stabilization",
        searchTerms: [
          "stabilization",
          "digital stabilization",
          "electronic stabilization",
          "eis",
        ],
        getRawValue: (item) =>
          item.cameraSpecs?.hasElectronicVibrationReduction,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "cipaStabilizationRatingStops",
        label: "CIPA Stabilization Rating Stops",
        searchTerms: ["stabilization", "ibis", "image stabilization"],
        getRawValue: (item) => item.cameraSpecs?.cipaStabilizationRatingStops,
        condition: (item) => item.cameraSpecs?.hasIbis === true,
        formatDisplay: (raw) =>
          typeof raw === "number" || typeof raw === "string"
            ? `${formatDecimalCompact(raw)} stops`
            : undefined,
      },
      {
        key: "hasPixelShiftShooting",
        label: "Has Pixel Shift Shooting",
        getRawValue: (item) => item.cameraSpecs?.hasPixelShiftShooting,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "hasAntiAliasingFilter",
        label: "Has Anti Aliasing Filter",
        getRawValue: (item) => item.cameraSpecs?.hasAntiAliasingFilter,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "precaptureSupportLevel",
        label: "Precapture Buffer",
        getRawValue: (item) => item.cameraSpecs?.precaptureSupportLevel,
        formatDisplay: (raw) => formatPrecaptureSupport(raw),
      },
      {
        key: "shutterSpeedMax",
        label: "Longest Shutter Speed",
        getRawValue: (item) => item.cameraSpecs?.shutterSpeedMax,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n} seconds` : undefined;
        },
      },
      {
        key: "shutterSpeedMin",
        label: "Fastest Shutter Speed",
        getRawValue: (item) => item.cameraSpecs?.shutterSpeedMin,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `1/${n}s` : undefined;
        },
      },
      {
        key: "flashSyncSpeed",
        label: "Flash Sync Speed",
        getRawValue: (item) => item.cameraSpecs?.flashSyncSpeed,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `1/${n}s` : undefined;
        },
      },
      {
        key: "hasSilentShootingAvailable",
        label: "Has Silent Shooting Available",
        getRawValue: (item) => item.cameraSpecs?.hasSilentShootingAvailable,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "availableShutterTypes",
        label: "Available Shutter Types",
        getRawValue: (item) => item.cameraSpecs?.availableShutterTypes,
        formatDisplay: (
          raw: unknown,
          _,
          forceLeftAlign,
        ): React.ReactNode | undefined => {
          if (!Array.isArray(raw)) return undefined;
          const entries = raw.reduce<string[]>((acc, value) => {
            if (typeof value !== "string") return acc;
            const trimmed = value.trim();
            if (!trimmed.length) return acc;
            const label = formatShutterType(trimmed) ?? trimmed;
            acc.push(label);
            return acc;
          }, []);
          return renderBadgeColumn(entries, forceLeftAlign);
        },
        editElementId: "availableShutterTypes",
      },
    ],
  },

  // ==========================================================================
  // INTEGRATED LENS (for fixed-lens cameras)
  // ==========================================================================
  {
    id: "fixed-lens",
    title: "Integrated Lens",
    sectionAnchor: "fixed-lens-section",
    condition: (item) => {
      if (item.gearType !== "CAMERA" && item.gearType !== "ANALOG_CAMERA")
        return false;
      const mountValueById = (id: string | null | undefined): string | null => {
        if (!id) return null;
        const m = MOUNTS.find((x) => x.id === id);
        return m && typeof m.value === "string" ? m.value : null;
      };
      const primaryMountId = (() => {
        const arr = Array.isArray(item.mountIds) ? item.mountIds : [];
        if (arr.length > 0) return arr[0]!;
        return (item.mountId as string | null | undefined) ?? null;
      })();
      return mountValueById(primaryMountId) === "fixed-lens";
    },
    fields: [
      {
        key: "isPrime",
        label: "Lens Type",
        getRawValue: (item) => item.fixedLensSpecs?.isPrime,
        formatDisplay: (raw) =>
          raw == null ? undefined : raw ? "Prime" : "Zoom",
      },
      {
        key: "focalLength",
        label: "Focal Length",
        getRawValue: (item) => ({
          isPrime: item.fixedLensSpecs?.isPrime,
          min: item.fixedLensSpecs?.focalLengthMinMm,
          max: item.fixedLensSpecs?.focalLengthMaxMm,
        }),
        formatDisplay: (_, item) => {
          const { actual, equivalent } = formatFocalLengthRangeDisplay({
            isPrime: item.fixedLensSpecs?.isPrime,
            min: item.fixedLensSpecs?.focalLengthMinMm,
            max: item.fixedLensSpecs?.focalLengthMaxMm,
            imageCircleFormatId: item.fixedLensSpecs?.imageCircleSizeId,
            sensorFormatId: item.cameraSpecs?.sensorFormatId,
          });
          if (!actual) return undefined;
          return (
            <span className="flex items-center gap-1">
              {actual}
              {equivalent ? (
                <span className="text-muted-foreground">
                  {`(${equivalent} equiv.)`}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: "fixedImageCircleSize",
        label: "Image Circle Size",
        getRawValue: (item) => item.fixedLensSpecs?.imageCircleSizeId,
        formatDisplay: (raw) =>
          typeof raw === "string" ? sensorNameFromId(raw) : undefined,
        editElementId: "fixed-image-circle-size",
        hideInSpecsTable: true,
      },
      {
        key: "maxAperture",
        label: "Maximum Aperture",
        getRawValue: (item) => ({
          wide: item.fixedLensSpecs?.maxApertureWide,
          tele: item.fixedLensSpecs?.maxApertureTele,
        }),
        formatDisplay: (_, item) =>
          item.fixedLensSpecs?.maxApertureTele &&
          item.fixedLensSpecs?.maxApertureTele !==
            item.fixedLensSpecs?.maxApertureWide
            ? `f/${Number(item.fixedLensSpecs?.maxApertureWide)} - f/${Number(item.fixedLensSpecs?.maxApertureTele)}`
            : item.fixedLensSpecs?.maxApertureWide != null
              ? `f/${Number(item.fixedLensSpecs?.maxApertureWide)}`
              : undefined,
        editElementId: "fixed-lens-aperture-max-wide",
      },
      {
        key: "minAperture",
        label: "Minimum Aperture",
        getRawValue: (item) => ({
          wide: item.fixedLensSpecs?.minApertureWide,
          tele: item.fixedLensSpecs?.minApertureTele,
        }),
        formatDisplay: (_, item) =>
          item.fixedLensSpecs?.minApertureTele &&
          item.fixedLensSpecs?.minApertureTele !==
            item.fixedLensSpecs?.minApertureWide
            ? `f/${Number(item.fixedLensSpecs?.minApertureWide)} - f/${Number(item.fixedLensSpecs?.minApertureTele)}`
            : item.fixedLensSpecs?.minApertureWide != null
              ? `f/${Number(item.fixedLensSpecs?.minApertureWide)}`
              : undefined,
        editElementId: "fixed-lens-aperture-min-wide",
      },
      {
        key: "hasAutofocus",
        label: "Has Autofocus",
        getRawValue: (item) => item.fixedLensSpecs?.hasAutofocus,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "minimumFocusDistanceMm",
        label: "Minimum Focus Distance",
        getRawValue: (item) => item.fixedLensSpecs?.minimumFocusDistanceMm,
        formatDisplay: (raw) =>
          raw != null ? formatFocusDistance(raw as number) : undefined,
      },
      {
        key: "frontElementRotates",
        label: "Front Element Rotates",
        getRawValue: (item) => item.fixedLensSpecs?.frontElementRotates,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "frontFilterThreadSizeMm",
        label: "Front Filter Thread Size",
        getRawValue: (item) => item.fixedLensSpecs?.frontFilterThreadSizeMm,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n}mm` : undefined;
        },
      },
      {
        key: "hasLensHood",
        label: "Has Lens Hood",
        getRawValue: (item) => item.fixedLensSpecs?.hasLensHood,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
    ],
  },

  // ==========================================================================
  // CAMERA: HARDWARE/BUILD
  // ==========================================================================
  {
    id: "camera-hardware",
    title: "Hardware/Build",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "processorName",
        label: "Processor Name",
        getRawValue: (item) => item.cameraSpecs?.processorName,
        formatDisplay: (raw) =>
          typeof raw === "string" && raw.trim().length > 0 ? raw : undefined,
      },
      {
        key: "hasWeatherSealing",
        label: "Weather Sealing",
        getRawValue: (item) => item.cameraSpecs?.hasWeatherSealing,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "internalStorageGb",
        label: "Internal Storage",
        getRawValue: (item) => item.cameraSpecs?.internalStorageGb,
        condition: (item) => {
          const value = item.cameraSpecs?.internalStorageGb;
          if (value == null) return false;
          const num = typeof value === "number" ? value : Number(value);
          return Number.isFinite(num) && num > 0;
        },
        formatDisplay: (raw) => formatStorageGb(raw),
        editElementId: "internalStorageGb",
      },
      {
        key: "rearDisplayType",
        label: "Rear Display Type",
        getRawValue: (item) => item.cameraSpecs?.rearDisplayType,
        formatDisplay: (raw) => {
          if (typeof raw !== "string") return undefined;
          const map: Record<string, string> = {
            none: "None",
            fixed: "Fixed",
            single_axis_tilt: "Single-axis tilt",
            dual_axis_tilt: "Dual-axis tilt",
            fully_articulated: "Fully articulated",
            four_axis_tilt_flip: "4 Axis Tilt-Flip",
            other: "Other",
          };
          return map[raw] ?? raw;
        },
      },
      {
        key: "rearDisplaySizeInches",
        label: "Rear Display Size",
        getRawValue: (item) => item.cameraSpecs?.rearDisplaySizeInches,
        // only show if the camera has a rear display
        condition: (item) => item.cameraSpecs?.rearDisplayType !== "none",
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n.toFixed(2)} inches` : undefined;
        },
      },
      {
        key: "rearDisplayResolutionMillionDots",
        label: "Rear Display Resolution",
        getRawValue: (item) =>
          item.cameraSpecs?.rearDisplayResolutionMillionDots,
        // only show if the camera has a rear display
        condition: (item) => item.cameraSpecs?.rearDisplayType !== "none",
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n)
            ? `${n.toFixed(2)} million dots`
            : undefined;
        },
      },
      {
        key: "viewfinderType",
        label: "Viewfinder Type",
        getRawValue: (item) => item.cameraSpecs?.viewfinderType,
        // "none" is an explicit specification, not a missing value.
        condition: (item) => item.cameraSpecs?.viewfinderType != null,
        formatDisplay: (raw) => {
          if (typeof raw !== "string") return undefined;
          const map: Record<string, string> = {
            none: "None",
            optical: "OVF",
            electronic: "EVF",
            hybrid: "Hybrid",
            other: "Other",
          };
          return map[raw] ?? raw;
        },
      },
      {
        key: "viewfinderMagnification",
        label: "Viewfinder Magnification",
        getRawValue: (item) => item.cameraSpecs?.viewfinderMagnification,
        formatDisplay: (raw, item) => {
          const vfType = item.cameraSpecs?.viewfinderType;
          if (!vfType || vfType === "none") return undefined;
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n.toFixed(2)}x` : undefined;
        },
      },
      {
        key: "viewfinderResolutionMillionDots",
        label: "Viewfinder Resolution",
        getRawValue: (item) =>
          item.cameraSpecs?.viewfinderResolutionMillionDots,
        formatDisplay: (raw, item) => {
          const vfType = item.cameraSpecs?.viewfinderType;
          if (vfType !== "electronic") return undefined;
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n)
            ? `${n.toFixed(2)} million dots`
            : undefined;
        },
      },
      {
        key: "viewfinderEyePointMm",
        label: "Viewfinder Eye Point",
        getRawValue: (item) => item.cameraSpecs?.viewfinderEyePointMm,
        condition: (item) =>
          supportsViewfinderEyePoint(item.cameraSpecs?.viewfinderType),
        formatDisplay: (raw, _item, _forceLeftAlign, _viewerRegion, locale) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n)
            ? `${new Intl.NumberFormat(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(n)} mm`
            : undefined;
        },
      },
      {
        key: "hasTopDisplay",
        label: "Has Top Display",
        getRawValue: (item) => item.cameraSpecs?.hasTopDisplay,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "hasRearTouchscreen",
        label: "Has Rear Touchscreen",
        getRawValue: (item) => item.cameraSpecs?.hasRearTouchscreen,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(raw, item.cameraSpecs?.rearDisplayType === "none")
            : undefined,
      },
      {
        key: "cardSlots",
        label: "Card Slots",
        getRawValue: (item) => item.cameraCardSlots,
        formatDisplay: (_, item, forceLeftAlign) => {
          if (!item.cameraCardSlots || item.cameraCardSlots.length === 0)
            return undefined;

          // Sort slots as in original
          const sortedCardSlots = item.cameraCardSlots
            .slice() // guard: don't mutate original
            .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

          // Each card slot becomes one badge, label uses '|' separated "details".
          const badgeLabels = sortedCardSlots.map((s) => {
            const details = formatCardSlotDetails({
              slotIndex: s.slotIndex,
              supportedFormFactors: s.supportedFormFactors ?? [],
              supportedBuses: s.supportedBuses ?? [],
              supportedSpeedClasses: s.supportedSpeedClasses ?? [],
            });
            return details.length > 0 ? details : "Not specified";
          });

          return renderBadgeColumn(badgeLabels, forceLeftAlign, true);
        },
      },
    ],
  },

  // ==========================================================================
  // CAMERA: FOCUS
  // ==========================================================================
  {
    id: "camera-focus",
    title: "Focus",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "hasAutofocus",
        label: "Has Autofocus",
        alwaysShowInEditor: true,
        searchTerms: ["autofocus", "af"],
        getRawValue: (item) => item.cameraSpecs?.hasAutofocus,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "focusPoints",
        label: "Focus Points",
        searchTerms: ["autofocus", "af points", "af"],
        getRawValue: (item) => item.cameraSpecs?.focusPoints,
        condition: (item) => item.cameraSpecs?.hasAutofocus !== false,
        formatDisplay: (raw) =>
          typeof raw === "number" || typeof raw === "string"
            ? String(raw)
            : undefined,
      },
      {
        key: "hasFocusPeaking",
        label: "Has Focus Peaking",
        searchTerms: ["manual focus", "focus assist", "mf assist"],
        getRawValue: (item) => item.cameraSpecs?.hasFocusPeaking,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "hasFocusBracketing",
        label: "Has Focus Bracketing",
        getRawValue: (item) => item.cameraSpecs?.hasFocusBracketing,
        condition: (item) => item.cameraSpecs?.hasAutofocus !== false,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "afAreaModes",
        label: "AF Area Modes",
        searchTerms: ["autofocus", "af", "focus modes", "focus areas"],
        getRawValue: (item) => item.cameraSpecs?.afAreaModes,
        condition: (item) => item.cameraSpecs?.hasAutofocus !== false,
        formatDisplay: (raw, _, forceLeftAlign) => {
          if (!Array.isArray(raw) || raw.length === 0) return undefined;
          const toName = (
            v:
              | string
              | { id?: string | null; name?: string | null }
              | null
              | undefined,
          ): string | undefined => {
            if (typeof v === "string") {
              const found = AF_AREA_MODES.find((m) => m.id === v);
              return typeof found?.name === "string" ? found.name : v;
            }
            if (v && typeof v === "object") {
              if (typeof v.name === "string" && v.name.trim().length > 0)
                return v.name;
              if (typeof v.id === "string") {
                const found = AF_AREA_MODES.find((m) => m.id === v.id);
                return typeof found?.name === "string" ? found.name : v.id;
              }
            }
            return undefined;
          };
          const names = (
            raw as Array<string | { id?: string | null; name?: string | null }>
          )
            .map(toName)
            .filter((s): s is string => typeof s === "string" && s.length > 0);
          return renderBadgeColumn(names, forceLeftAlign);
        },
        editElementId: "afAreaModes",
      },
      {
        key: "afSubjectCategories",
        label: "AF Subject Categories",
        searchTerms: [
          "autofocus",
          "af",
          "subject detection",
          "subject recognition",
        ],
        getRawValue: (item) => item.cameraSpecs?.afSubjectCategories,
        condition: (item) => item.cameraSpecs?.hasAutofocus !== false,
        formatDisplay: (raw, _, forceLeftAlign) => {
          if (!Array.isArray(raw)) return undefined;
          const categories = raw
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter((value) => value.length > 0)
            .map((value) => value.charAt(0).toUpperCase() + value.slice(1));
          return renderBadgeColumn(categories, forceLeftAlign);
        },
        editElementId: "afSubjectCategories",
      },
    ],
  },

  // ==========================================================================
  // CAMERA: BATTERY & CHARGING
  // ==========================================================================
  {
    id: "camera-battery",
    title: "Battery & Charging",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "cipaBatteryShotsPerCharge",
        label: "CIPA Battery Shots Per Charge",
        searchTerms: ["battery life", "battery", "shots per charge"],
        getRawValue: (item) => item.cameraSpecs?.cipaBatteryShotsPerCharge,
        formatDisplay: (raw) =>
          typeof raw === "number" || typeof raw === "string"
            ? String(raw)
            : undefined,
      },

      {
        key: "usbCharging",
        label: "Supports USB Charging",
        searchTerms: ["charging", "usb-c charging", "usb charge"],
        getRawValue: (item) => item.cameraSpecs?.usbCharging,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "usbPowerDelivery",
        label: "Supports USB Power Delivery",
        searchTerms: ["charging", "power delivery", "usb pd"],
        getRawValue: (item) => item.cameraSpecs?.usbPowerDelivery,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "supportedBatteries",
        label: "Supported Batteries",
        getRawValue: (item) => item.cameraSpecs?.supportedBatteries,
        formatDisplay: (raw) => {
          if (!Array.isArray(raw) || raw.length === 0) return undefined;
          const list = raw
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((s) => s.length > 0);
          if (list.length === 0) return undefined;
          return (
            <ul className="list-none space-y-1 text-left">
              {list.map((battery) => (
                <li key={battery}>{battery}</li>
              ))}
            </ul>
          );
        },
        editElementId: "supportedBatteries",
      },
    ],
  },

  // ==========================================================================
  // CAMERA: VIDEO
  // ==========================================================================
  {
    id: "camera-video",
    title: "Video",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "hasVideo",
        label: "Has Video",
        alwaysShowInEditor: true,
        getRawValue: (item) => item.cameraSpecs?.hasVideo,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "videoSummary",
        label: "Video Summary",
        api: null,
        condenseOnMobile: true,
        editElementId: "video-modes-manager",
        getRawValue: (item) => item.videoModes,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (_, item) => {
          const modes = coerceCameraVideoModes(item.videoModes);
          if (!modes.length) return undefined;
          const bundle = buildVideoDisplayBundle(modes);
          if (!bundle.summaryLines.length) return undefined;
          return (
            <VideoSpecsSummary
              summaryLines={bundle.summaryLines}
              matrix={bundle.matrix}
              codecLabels={bundle.codecLabels}
              videoNotes={getVideoNotes(item)}
            />
          );
        },
      },
      {
        key: "videoAvailableCodecs",
        label: "Available Codecs",
        // Video-mode records are intentionally not part of the beta API.
        api: null,
        getRawValue: (item) => item.videoModes,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (_, item) => {
          const list = Array.from(
            new Set(
              (item.videoModes ?? [])
                .map((mode) =>
                  typeof mode.codecLabel === "string"
                    ? mode.codecLabel.trim()
                    : "",
                )
                .filter((label) => label.length > 0),
            ),
          );
          if (!list.length) return undefined;
          return (
            <div className="flex flex-wrap gap-2">
              {list.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        key: "hasLogColorProfile",
        label: "Has Log Color Profile",
        getRawValue: (item) => item.cameraSpecs?.hasLogColorProfile,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(raw, !supportsVideoMeaningfully(item))
            : undefined,
      },
      {
        key: "has10BitVideo",
        label: "Has 10 Bit Video",
        getRawValue: (item) => item.cameraSpecs?.has10BitVideo,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(raw, !supportsVideoMeaningfully(item))
            : undefined,
      },
      {
        key: "has12BitVideo",
        label: "Has 12 Bit Video",
        getRawValue: (item) => item.cameraSpecs?.has12BitVideo,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(
                raw,
                !supportsVideoMeaningfully(item) &&
                  item.cameraSpecs?.has10BitVideo !== true,
              )
            : undefined,
      },
      {
        key: "hasOpenGateVideo",
        label: "Has Open Gate Video",
        getRawValue: (item) => item.cameraSpecs?.hasOpenGateVideo,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "supportsExternalRecording",
        label: "Supports External Recording",
        getRawValue: (item) => item.cameraSpecs?.supportsExternalRecording,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(raw, !supportsVideoMeaningfully(item))
            : undefined,
      },
      {
        key: "supportsRecordToDrive",
        label: "Supports Recording to Drive",
        getRawValue: (item) => item.cameraSpecs?.supportsRecordToDrive,
        condition: (item) => item.cameraSpecs?.hasVideo !== false,
        formatDisplay: (raw, item) =>
          typeof raw === "boolean"
            ? yesNoNull(raw, !supportsVideoMeaningfully(item))
            : undefined,
      },
    ],
  },

  // ==========================================================================
  // CAMERA: MISC
  // ==========================================================================
  {
    id: "camera-misc",
    title: "Misc",
    sectionAnchor: "camera-section",
    condition: (item) => item.gearType === "CAMERA",
    fields: [
      {
        key: "hasIntervalometer",
        label: "Has Intervalometer",
        getRawValue: (item) => item.cameraSpecs?.hasIntervalometer,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasSelfTimer",
        label: "Has Self Timer",
        getRawValue: (item) => item.cameraSpecs?.hasSelfTimer,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasBuiltInFlash",
        label: "Has Built In Flash",
        getRawValue: (item) => item.cameraSpecs?.hasBuiltInFlash,
        formatDisplay: (raw) =>
          yesNoNull(raw as boolean | null | undefined, true),
      },
      {
        key: "hasHotShoe",
        label: "Has Hot Shoe",
        getRawValue: (item) => item.cameraSpecs?.hasHotShoe,
        formatDisplay: (raw) =>
          yesNoNull(raw as boolean | null | undefined, true),
      },
      {
        key: "hasIlluminatedButtons",
        label: "Has Illuminated Buttons",
        getRawValue: (item) => item.cameraSpecs?.hasIlluminatedButtons,
        formatDisplay: (raw) =>
          yesNoNull(raw as boolean | null | undefined, true),
      },
      {
        key: "hasUsbFileTransfer",
        label: "Has USB File Transfer",
        getRawValue: (item) => item.cameraSpecs?.hasUsbFileTransfer,
        formatDisplay: (raw) =>
          yesNoNull(raw as boolean | null | undefined, true),
      },
    ],
  },

  // ==========================================================================
  // LENS: OPTICS
  // ==========================================================================
  {
    id: "lens-optics",
    title: "Optics",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "isPrime",
        label: "Lens Type",
        getRawValue: (item) => item.lensSpecs?.isPrime,
        formatDisplay: (raw) => (raw ? "Prime" : "Zoom"),
      },
      {
        key: "focalLength",
        label: "Focal Length",
        searchTerms: ["zoom range", "zoom", "mm"],
        getRawValue: (item) => ({
          isPrime: item.lensSpecs?.isPrime,
          min: item.lensSpecs?.focalLengthMinMm,
          max: item.lensSpecs?.focalLengthMaxMm,
          imageCircleFormatId: item.lensSpecs?.imageCircleSizeId,
        }),
        formatDisplay: (_, item) => {
          const { actual, equivalent } = formatFocalLengthRangeDisplay({
            isPrime: item.lensSpecs?.isPrime,
            min: item.lensSpecs?.focalLengthMinMm,
            max: item.lensSpecs?.focalLengthMaxMm,
            imageCircleFormatId: item.lensSpecs?.imageCircleSizeId,
          });
          if (!actual) return undefined;
          if (!equivalent) return actual;
          return (
            <span className="flex items-center gap-1">
              {actual}
              <span className="text-muted-foreground">{`(${equivalent} equiv.)`}</span>
            </span>
          );
        },
      },
      {
        key: "imageCircleSize",
        label: "Image Circle Size",
        getRawValue: (item) => item.lensSpecs?.imageCircleSizeId,
        formatDisplay: (raw) =>
          typeof raw === "string" ? sensorNameFromId(raw) : undefined,
        editElementId: "imageCircleSize",
      },
      {
        key: "magnification",
        label: "Magnification",
        getRawValue: (item) => item.lensSpecs?.magnification,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n}x` : undefined;
        },
      },
      {
        key: "minimumFocusDistanceMm",
        label: "Minimum Focus Distance",
        searchTerms: ["minimum focus distance", "close focus", "mfd"],
        getRawValue: (item) => item.lensSpecs?.minimumFocusDistanceMm,
        formatDisplay: (raw) =>
          raw != null ? formatFocusDistance(raw as number) : undefined,
      },
      {
        key: "numberElements",
        label: "Number of Elements",
        getRawValue: (item) => item.lensSpecs?.numberElements,
      },
      {
        key: "numberElementGroups",
        label: "Number of Element Groups",
        getRawValue: (item) => item.lensSpecs?.numberElementGroups,
      },
      {
        key: "hasDiffractiveOptics",
        label: "Has Diffractive Optics",
        getRawValue: (item) => item.lensSpecs?.hasDiffractiveOptics,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
    ],
  },

  // ==========================================================================
  // LENS: APERTURE
  // ==========================================================================
  {
    id: "lens-aperture",
    title: "Aperture",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "maxAperture",
        label: "Maximum Aperture",
        getRawValue: (item) => ({
          wide: item.lensSpecs?.maxApertureWide,
          tele: item.lensSpecs?.maxApertureTele,
        }),
        formatDisplay: (_, item) =>
          item.lensSpecs?.maxApertureTele &&
          item.lensSpecs?.maxApertureTele !== item.lensSpecs?.maxApertureWide
            ? `f/${Number(item.lensSpecs?.maxApertureWide)} - f/${Number(item.lensSpecs?.maxApertureTele)}`
            : item.lensSpecs?.maxApertureWide != null
              ? `f/${Number(item.lensSpecs?.maxApertureWide)}`
              : undefined,
        editElementId: "aperture-max-wide",
      },
      {
        key: "minAperture",
        label: "Minimum Aperture",
        getRawValue: (item) => ({
          wide: item.lensSpecs?.minApertureWide,
          tele: item.lensSpecs?.minApertureTele,
        }),
        formatDisplay: (_, item) =>
          item.lensSpecs?.minApertureTele &&
          item.lensSpecs?.minApertureTele !== item.lensSpecs?.minApertureWide
            ? `f/${Number(item.lensSpecs?.minApertureWide)} - f/${Number(item.lensSpecs?.minApertureTele)}`
            : item.lensSpecs?.minApertureWide != null
              ? `f/${Number(item.lensSpecs?.minApertureWide)}`
              : undefined,
        editElementId: "aperture-min-wide",
      },
      {
        key: "apertureProfileJson",
        label: "Variable Aperture Profile",
        condenseOnMobile: true,
        getRawValue: (item) => item.lensSpecs?.apertureProfileJson,
        formatDisplay: (raw) => {
          const points = normalizeApertureProfile(raw);
          return points && points.length >= 3 ? (
            <LensApertureProfile
              points={points}
              className="max-w-xs"
              barClassName="h-7"
            />
          ) : undefined;
        },
        editElementId: "aperture-profile",
      },
      {
        key: "numberDiaphragmBlades",
        label: "Number of Diaphragm Blades",
        getRawValue: (item) => item.lensSpecs?.numberDiaphragmBlades,
      },
      {
        key: "hasRoundedDiaphragmBlades",
        label: "Has Rounded Diaphragm Blades",
        getRawValue: (item) => item.lensSpecs?.hasRoundedDiaphragmBlades,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasApertureRing",
        label: "Has Aperture Ring",
        getRawValue: (item) => item.lensSpecs?.hasApertureRing,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
    ],
  },

  // ==========================================================================
  // LENS: FOCUS
  // ==========================================================================
  {
    id: "lens-focus",
    title: "Focus",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "hasAutofocus",
        label: "Has Autofocus",
        getRawValue: (item) => item.lensSpecs?.hasAutofocus,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "focusMotorType",
        label: "Focus Motor Type",
        getRawValue: (item) => item.lensSpecs?.focusMotorType,
        formatDisplay: (raw) => (typeof raw === "string" ? raw : undefined),
        condition: (item) => item.lensSpecs?.hasAutofocus === true,
      },
      {
        key: "hasAfMfSwitch",
        label: "Has AF/MF Switch",
        getRawValue: (item) => item.lensSpecs?.hasAfMfSwitch,
        formatDisplay: (raw) => {
          return typeof raw === "boolean" ? yesNoNull(raw) : undefined;
        },
        condition: (item) => item.lensSpecs?.hasAutofocus === true,
      },
      {
        key: "hasFocusLimiter",
        label: "Has Focus Limiter",
        getRawValue: (item) => item.lensSpecs?.hasFocusLimiter,
        formatDisplay: (raw, item) => {
          if (item.lensSpecs?.hasAutofocus !== true) return undefined;
          return typeof raw === "boolean" ? yesNoNull(raw, true) : undefined;
        },
        condition: (item) => item.lensSpecs?.hasAutofocus === true,
      },
      {
        key: "hasFocusRecallButton",
        label: "Has Focus Recall Button",
        getRawValue: (item) => item.lensSpecs?.hasFocusRecallButton,
        formatDisplay: (raw) => {
          return typeof raw === "boolean" ? yesNoNull(raw, true) : undefined;
        },
        condition: (item) => item.lensSpecs?.hasAutofocus === true,
      },
      {
        key: "hasFocusRing",
        label: "Has Focus Ring",
        getRawValue: (item) => item.lensSpecs?.hasFocusRing,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasInternalFocus",
        label: "Has Internal Focus",
        getRawValue: (item) => item.lensSpecs?.hasInternalFocus,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "frontElementRotates",
        label: "Front Element Rotates",
        getRawValue: (item) => item.lensSpecs?.frontElementRotates,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
    ],
  },

  // ==========================================================================
  // LENS: STABILIZATION
  // ==========================================================================
  {
    id: "lens-stabilization",
    title: "Stabilization",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "hasStabilization",
        label: "Has Image Stabilization",
        searchTerms: [
          "stabilization",
          "ois",
          "vr",
          "os",
          "image stabilization",
        ],
        getRawValue: (item) => item.lensSpecs?.hasStabilization,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasStabilizationSwitch",
        label: "Has Stabilization Switch",
        searchTerms: ["stabilization", "ois switch", "vr switch"],
        getRawValue: (item) => item.lensSpecs?.hasStabilizationSwitch,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
        condition: (item) => item.lensSpecs?.hasStabilization === true,
      },
      {
        key: "cipaStabilizationRatingStops",
        label: "CIPA Stabilization Rating Stops",
        searchTerms: ["stabilization", "ois", "image stabilization"],
        getRawValue: (item) => item.lensSpecs?.cipaStabilizationRatingStops,
        formatDisplay: (raw) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n) ? `${n} stops` : undefined;
        },
        condition: (item) => item.lensSpecs?.hasStabilization === true,
      },
    ],
  },

  // ==========================================================================
  // LENS: BUILD & CONTROLS
  // ==========================================================================
  {
    id: "lens-build",
    title: "Build & Controls",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "hasInternalZoom",
        label: "Has Internal Zoom",
        getRawValue: (item) => item.lensSpecs?.hasInternalZoom,
        // only show if the lens is not a prime lens
        condition: (item) => item.lensSpecs?.isPrime === false,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "mountMaterial",
        label: "Mount Material",
        getRawValue: (item) => item.lensSpecs?.mountMaterial,
        formatDisplay: (raw) =>
          raw != null
            ? (raw as string).charAt(0).toUpperCase() + (raw as string).slice(1)
            : undefined,
      },
      {
        key: "hasWeatherSealing",
        label: "Has Weather Sealing",
        getRawValue: (item) => item.lensSpecs?.hasWeatherSealing,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "numberCustomControlRings",
        label: "Number of Custom Control Rings",
        getRawValue: (item) => item.lensSpecs?.numberCustomControlRings,
        // only show if the lens has custom control rings
        condition: (item) =>
          item.lensSpecs?.numberCustomControlRings != null &&
          item.lensSpecs?.numberCustomControlRings > 0,
      },
      {
        key: "numberFunctionButtons",
        label: "Number of Function Buttons",
        getRawValue: (item) => item.lensSpecs?.numberFunctionButtons,
        // only show if the lens has function buttons
        condition: (item) =>
          item.lensSpecs?.numberFunctionButtons != null &&
          item.lensSpecs?.numberFunctionButtons > 0,
      },
    ],
  },

  // ==========================================================================
  // LENS: FILTERS
  // ==========================================================================
  {
    id: "lens-filters",
    title: "Filters",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "acceptsFilterTypes",
        label: "Accepts Filter Types",
        getRawValue: (item) => item.lensSpecs?.acceptsFilterTypes,
        formatDisplay: (raw) =>
          Array.isArray(raw) && raw.length > 0
            ? raw.map(formatFilterType).join(", ")
            : undefined,
        editElementId: "acceptsFilterTypes",
      },
      {
        key: "frontFilterThreadSizeMm",
        label: "Front Filter Thread Size",
        getRawValue: (item) => item.lensSpecs?.frontFilterThreadSizeMm,
        formatDisplay: (raw, item) =>
          raw != null &&
          item.lensSpecs?.acceptsFilterTypes?.includes("front-screw-on")
            ? `${Number(raw)}mm`
            : undefined,
        condition: (item) =>
          Array.isArray(item.lensSpecs?.acceptsFilterTypes) &&
          item.lensSpecs.acceptsFilterTypes.includes("front-screw-on"),
      },
      {
        key: "rearFilterThreadSizeMm",
        label: "Rear Filter Thread Size",
        getRawValue: (item) => item.lensSpecs?.rearFilterThreadSizeMm,
        formatDisplay: (raw, item) =>
          raw != null &&
          item.lensSpecs?.acceptsFilterTypes?.includes("rear-screw-on")
            ? `${Number(raw)}mm`
            : undefined,
        condition: (item) =>
          Array.isArray(item.lensSpecs?.acceptsFilterTypes) &&
          item.lensSpecs.acceptsFilterTypes.includes("rear-screw-on"),
      },
      {
        key: "dropInFilterSizeMm",
        label: "Drop In Filter Size",
        getRawValue: (item) => item.lensSpecs?.dropInFilterSizeMm,
        formatDisplay: (raw, item) =>
          raw != null &&
          item.lensSpecs?.acceptsFilterTypes?.includes("rear-drop-in")
            ? `${Number(raw)}mm`
            : undefined,
        condition: (item) =>
          Array.isArray(item.lensSpecs?.acceptsFilterTypes) &&
          item.lensSpecs.acceptsFilterTypes.includes("rear-drop-in"),
      },
    ],
  },

  // ==========================================================================
  // LENS: ACCESSORIES
  // ==========================================================================
  {
    id: "lens-accessories",
    title: "Accessories",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "hasBuiltInTeleconverter",
        label: "Has Built In Teleconverter",
        getRawValue: (item) => item.lensSpecs?.hasBuiltInTeleconverter,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "hasLensHood",
        label: "Has Lens Hood",
        getRawValue: (item) => item.lensSpecs?.hasLensHood,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw) : undefined,
      },
      {
        key: "hasTripodCollar",
        label: "Has Tripod Collar/Lens Foot",
        getRawValue: (item) => item.lensSpecs?.hasTripodCollar,
        formatDisplay: (raw, item) => {
          const focalLengthMax = item.lensSpecs?.focalLengthMaxMm ?? 0;
          // if the lens has max focal length under 200 we should hide the row when false
          return typeof raw === "boolean"
            ? yesNoNull(raw, focalLengthMax < 200)
            : undefined;
        },
      },
    ],
  },

  // ==========================================================================
  // LENS: TILT-SHIFT
  // ==========================================================================
  {
    id: "lens-tilt-shift",
    title: "Tilt-Shift",
    sectionAnchor: "lens-section",
    condition: (item) => item.gearType === "LENS",
    fields: [
      {
        key: "isTiltShift",
        label: "Is Tilt-Shift",
        getRawValue: (item) => item.lensSpecs?.isTiltShift,
        formatDisplay: (raw) =>
          typeof raw === "boolean" ? yesNoNull(raw, true) : undefined,
      },
      {
        key: "tiltDegrees",
        label: "Tilt Range",
        getRawValue: (item) => item.lensSpecs?.tiltDegrees,
        formatDisplay: (raw) => {
          if (raw == null) return undefined;
          const n = Number(raw);
          return Number.isFinite(n)
            ? `±${Number.isInteger(n) ? n : n.toFixed(1)}°`
            : undefined;
        },
        condition: (item) => item.lensSpecs?.isTiltShift === true,
      },
      {
        key: "shiftMm",
        label: "Shift Range",
        getRawValue: (item) => item.lensSpecs?.shiftMm,
        formatDisplay: (raw) => {
          if (raw == null) return undefined;
          const n = Number(raw);
          return Number.isFinite(n)
            ? `±${Number.isInteger(n) ? n : n.toFixed(1)}mm`
            : undefined;
        },
        condition: (item) => item.lensSpecs?.isTiltShift === true,
      },
    ],
  },

  // ==========================================================================
  // ANALOG CAMERAS
  // ==========================================================================
  {
    id: "analog-camera",
    title: "Analog Camera",
    sectionAnchor: "analog-camera-section",
    condition: (item) => item.gearType === "ANALOG_CAMERA",
    fields: [
      {
        key: "cameraType",
        label: "Camera Type",
        getRawValue: (item) => item.analogCameraSpecs?.cameraType,
        formatDisplay: (raw) => formatAnalogCameraType(raw as string),
      },
      {
        key: "captureMedium",
        label: "Capture Medium",
        getRawValue: (item) => item.analogCameraSpecs?.captureMedium,
        formatDisplay: (raw) => formatAnalogMedium(raw as string),
      },
      {
        key: "filmTransportType",
        label: "Film Transport",
        getRawValue: (item) => item.analogCameraSpecs?.filmTransportType,
        formatDisplay: (raw) => formatAnalogFilmTransport(raw as string),
      },
      {
        key: "viewfinderType",
        label: "Viewfinder Type",
        getRawValue: (item) => item.analogCameraSpecs?.viewfinderType,
        formatDisplay: (raw) => formatAnalogViewfinderType(raw as string),
      },
      {
        key: "viewfinderEyePointMm",
        label: "Viewfinder Eye Point",
        getRawValue: (item) => item.analogCameraSpecs?.viewfinderEyePointMm,
        condition: (item) =>
          supportsViewfinderEyePoint(item.analogCameraSpecs?.viewfinderType),
        formatDisplay: (raw, _item, _forceLeftAlign, _viewerRegion, locale) => {
          const n = raw == null ? NaN : Number(raw);
          return Number.isFinite(n)
            ? `${new Intl.NumberFormat(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(n)} mm`
            : undefined;
        },
      },
      {
        key: "shutterType",
        label: "Shutter Type",
        getRawValue: (item) => item.analogCameraSpecs?.shutterType,
        formatDisplay: (raw) => formatAnalogShutterType(raw as string),
      },
      {
        key: "shutterSpeeds",
        label: "Shutter Speeds",
        getRawValue: (item) => ({
          min: item.analogCameraSpecs?.shutterSpeedMin,
          max: item.analogCameraSpecs?.shutterSpeedMax,
        }),
        formatDisplay: (_, item) => {
          const min = item.analogCameraSpecs?.shutterSpeedMin ?? null;
          const max = item.analogCameraSpecs?.shutterSpeedMax ?? null;
          if (min == null && max == null) return undefined;
          const maxText = max != null ? `${max}s` : "";
          const minText = min != null ? `1/${min}s` : "";
          if (maxText && minText) return `${maxText} to ${minText}`;
          return maxText || minText || undefined;
        },
      },
      {
        key: "flashSyncSpeed",
        label: "Flash Sync Speed",
        getRawValue: (item) => item.analogCameraSpecs?.flashSyncSpeed,
        formatDisplay: (raw) =>
          raw != null ? `1/${Number(raw as number)}s` : undefined,
      },
      {
        key: "hasBulbMode",
        label: "Bulb Mode",
        getRawValue: (item) => item.analogCameraSpecs?.hasBulbMode,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "hasMetering",
        label: "Has Metering",
        getRawValue: (item) => item.analogCameraSpecs?.hasMetering,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "meteringModes",
        label: "Metering Modes",
        getRawValue: (item) => item.analogCameraSpecs?.meteringModes ?? [],
        // only show if the camera has metering
        condition: (item) => item.analogCameraSpecs?.hasMetering === true,
        formatDisplay: (raw) =>
          Array.isArray(raw)
            ? renderBadgeColumn(
                (raw as string[]).map((r) => formatAnalogMeteringMode(r) ?? r),
                true,
                true,
              )
            : undefined,
      },
      {
        key: "meteringDisplayTypes",
        label: "Metering Display",
        getRawValue: (item) =>
          item.analogCameraSpecs?.meteringDisplayTypes ?? [],
        // only show if the camera has metering
        condition: (item) => item.analogCameraSpecs?.hasMetering === true,
        formatDisplay: (raw) =>
          Array.isArray(raw)
            ? renderBadgeColumn(
                (raw as string[]).map(
                  (r) => formatAnalogMeteringDisplay(r) ?? r,
                ),
                true,
                true,
              )
            : undefined,
      },
      {
        key: "exposureModes",
        label: "Exposure Modes",
        getRawValue: (item) => item.analogCameraSpecs?.exposureModes ?? [],
        formatDisplay: (raw) =>
          Array.isArray(raw)
            ? renderBadgeColumn(
                (raw as string[]).map((r) => formatAnalogExposureMode(r) ?? r),
                true,
                true,
              )
            : undefined,
      },
      {
        key: "isoSettingMethod",
        label: "ISO Setting",
        getRawValue: (item) => item.analogCameraSpecs?.isoSettingMethod,
        formatDisplay: (raw) => formatAnalogIsoSettingMethod(raw as string),
      },
      {
        key: "isoRange",
        label: "ISO Range",
        getRawValue: (item) => ({
          min: item.analogCameraSpecs?.isoMin,
          max: item.analogCameraSpecs?.isoMax,
        }),
        formatDisplay: (_, item) => {
          const min = item.analogCameraSpecs?.isoMin ?? null;
          const max = item.analogCameraSpecs?.isoMax ?? null;
          if (min == null && max == null) return undefined;
          if (min != null && max != null) return `${min} - ${max}`;
          return (min ?? max)?.toString();
        },
      },
      {
        key: "hasExposureCompensation",
        label: "Exposure Compensation",
        getRawValue: (item) => item.analogCameraSpecs?.hasExposureCompensation,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "hasAutoFocus",
        label: "Autofocus",
        getRawValue: (item) => item.analogCameraSpecs?.hasAutoFocus,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "focusAidTypes",
        label: "Focus Aids",
        getRawValue: (item) => item.analogCameraSpecs?.focusAidTypes ?? [],
        formatDisplay: (raw) =>
          Array.isArray(raw)
            ? renderBadgeColumn(
                (raw as string[]).map((r) => formatAnalogFocusAid(r) ?? r),
                true,
                true,
              )
            : undefined,
      },
      {
        key: "hasContinuousDrive",
        label: "Continuous Drive",
        getRawValue: (item) => item.analogCameraSpecs?.hasContinuousDrive,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "maxContinuousFps",
        label: "Max FPS",
        getRawValue: (item) => item.analogCameraSpecs?.maxContinuousFps,
        // only show if the camera has continuous drive
        condition: (item) =>
          item.analogCameraSpecs?.hasContinuousDrive === true,
        formatDisplay: (raw) => {
          const formatted = formatDecimalCompact(raw as number | string | null);
          return formatted ? `${formatted} FPS` : undefined;
        },
      },
      {
        key: "requiresBatteryForShutter",
        label: "Battery Required (Shutter)",
        getRawValue: (item) =>
          item.analogCameraSpecs?.requiresBatteryForShutter,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "requiresBatteryForMetering",
        label: "Battery Required (Metering)",
        getRawValue: (item) =>
          item.analogCameraSpecs?.requiresBatteryForMetering,
        // only show if camera has metering
        condition: (item) => item.analogCameraSpecs?.hasMetering === true,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "supportedBatteries",
        label: "Supported Batteries",
        getRawValue: (item) => item.analogCameraSpecs?.supportedBatteries,
        formatDisplay: (raw) => {
          if (!raw) return undefined;
          const arr = raw as string[];
          if (!Array.isArray(arr) || arr.length === 0) return undefined;
          return arr.join(", ");
        },
        // only show if there are batteries
        condition: (item) =>
          Array.isArray(item.analogCameraSpecs?.supportedBatteries) &&
          (item.analogCameraSpecs?.supportedBatteries).length > 0,
        editElementId: "supportedBatteries",
      },
      {
        key: "hasHotShoe",
        label: "Hot Shoe",
        getRawValue: (item) => item.analogCameraSpecs?.hasHotShoe,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "hasSelfTimer",
        label: "Self Timer",
        getRawValue: (item) => item.analogCameraSpecs?.hasSelfTimer,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
      {
        key: "hasIntervalometer",
        label: "Intervalometer",
        getRawValue: (item) => item.analogCameraSpecs?.hasIntervalometer,
        formatDisplay: (raw) => yesNoNull(raw as any),
      },
    ],
  },

  // ==========================================================================
  // NOTES
  // ==========================================================================
  {
    id: "notes",
    title: "Notes",
    sectionAnchor: "notes-section",
    fields: [
      {
        key: "notes",
        label: "",
        getRawValue: (item) => item.notes,
        formatDisplay: (raw) => {
          if (!Array.isArray(raw)) return undefined;
          const list = raw.filter(
            (n) => typeof n === "string" && n.trim().length > 0,
          );
          return list.length ? (
            <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
              {list.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : undefined;
        },
      },
    ],
  },
];

// ============================================================================
// DEVELOPER API SPEC REGISTRY
// ============================================================================

type DeveloperApiSectionConfig = {
  category: string;
  label: string;
  fieldCategories?: Record<
    string,
    Pick<DeveloperApiSectionConfig, "category" | "label">
  >;
  displayOverrides?: Record<
    string,
    (raw: unknown, item: GearItem) => string | undefined
  >;
};

/**
 * The public API has its own stable, purpose-built grouping layer. It maps
 * website sections into categories that are useful to API consumers without
 * constraining how the specs table is organized or displayed.
 */
const developerApiSectionConfig: Record<string, DeveloperApiSectionConfig> = {
  core: {
    category: "gear.basics",
    label: "Gear basics",
    displayOverrides: {
      mpbMaxPriceUsdCents: (raw) =>
        raw ? formatPrice(raw as number) : undefined,
    },
  },
  "camera-sensor-shutter": {
    category: "camera.sensor",
    label: "Camera sensor",
    fieldCategories: {
      maxFpsByShutter: { category: "camera.shutter", label: "Camera shutter" },
      shutterSpeedMax: { category: "camera.shutter", label: "Camera shutter" },
      shutterSpeedMin: { category: "camera.shutter", label: "Camera shutter" },
      flashSyncSpeed: { category: "camera.shutter", label: "Camera shutter" },
      hasSilentShootingAvailable: {
        category: "camera.shutter",
        label: "Camera shutter",
      },
      availableShutterTypes: {
        category: "camera.shutter",
        label: "Camera shutter",
      },
    },
  },
  "fixed-lens": { category: "camera.fixed-lens", label: "Integrated lens" },
  "camera-hardware": { category: "camera.build", label: "Camera build" },
  "camera-focus": { category: "camera.focus", label: "Camera focus" },
  "camera-battery": { category: "camera.power", label: "Camera power" },
  "camera-video": {
    category: "camera.video",
    label: "Camera video",
    displayOverrides: {
      videoSummary: (_raw, item) => {
        const modes = coerceCameraVideoModes(item.videoModes);
        if (!modes.length) return undefined;
        const summaryLines = buildVideoDisplayBundle(modes).summaryLines;
        return summaryLines.length ? summaryLines.join(" · ") : undefined;
      },
    },
  },
  "camera-misc": { category: "camera.features", label: "Camera features" },
  "lens-optics": { category: "lens.optics", label: "Lens optics" },
  "lens-aperture": { category: "lens.aperture", label: "Lens aperture" },
  "lens-focus": { category: "lens.focus", label: "Lens focus" },
  "lens-stabilization": {
    category: "lens.stabilization",
    label: "Lens stabilization",
  },
  "lens-build": { category: "lens.build", label: "Lens build" },
  "lens-filters": { category: "lens.filters", label: "Lens filters" },
  "lens-accessories": {
    category: "lens.accessories",
    label: "Lens accessories",
  },
  "lens-tilt-shift": { category: "lens.tiltShift", label: "Lens tilt-shift" },
  "analog-camera": { category: "analog.camera", label: "Analog camera" },
};

function getDeveloperApiMetadata(
  section: SpecSectionDef,
  field: SpecFieldDef,
): DeveloperApiSpecMetadata | undefined {
  const config = developerApiSectionConfig[section.id];
  if (!config || field.hideInSpecsTable || field.api === null) return undefined;
  const category = config.fieldCategories?.[field.key] ?? config;
  return {
    id: `${category.category}.${field.key}`,
    category: category.category,
    categoryLabel: category.label,
    displayOverride: config.displayOverrides?.[field.key],
  };
}

/** Returns live public API fields in their stable API category and field order. */
export function getDeveloperApiSpecFields(): DeveloperApiSpecField[] {
  const fields: DeveloperApiSpecField[] = [];
  for (const section of specDictionary) {
    for (const field of section.fields) {
      const api = getDeveloperApiMetadata(section, field);
      if (!api) continue;
      fields.push({ section, field: { ...field, api } });
    }
  }
  return fields;
}

/** Generates the developer catalog from the currently deployed spec registry. */
export function getDeveloperApiSpecCatalog(): DeveloperApiSpecCategory[] {
  const categories = new Map<string, DeveloperApiSpecCategory>();
  for (const { field } of getDeveloperApiSpecFields()) {
    const category = categories.get(field.api.category) ?? {
      id: field.api.category,
      label: field.api.categoryLabel,
      fields: [],
    };
    category.fields.push({
      id: field.api.id,
      label: field.label,
      searchTerms: field.searchTerms ?? [],
    });
    categories.set(category.id, category);
  }
  return [...categories.values()];
}

function textFromSpecDisplay(value: ReactNode): string | undefined {
  if (value == null || typeof value === "boolean") return undefined;
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) {
    const values = value
      .map((child) => textFromSpecDisplay(child))
      .filter((child): child is string => Boolean(child));
    return values.length ? values.join(" ") : undefined;
  }
  if (isValidElement(value)) {
    return textFromSpecDisplay(
      (value.props as { children?: ReactNode }).children,
    );
  }
  return undefined;
}

/**
 * Derives the API's English text display from the website formatter by
 * default. Fields with interactive website UI can opt into api.displayOverride.
 */
export function getDeveloperApiSpecValue(
  item: GearItem,
  definition: DeveloperApiSpecField,
) {
  const { field } = definition;
  if (definition.section.condition && !definition.section.condition(item)) {
    return undefined;
  }
  if (field.condition && !field.condition(item)) return undefined;

  const raw = field.getRawValue(item);
  const formatted = field.api.displayOverride
    ? field.api.displayOverride(raw, item)
    : field.formatDisplay
      ? field.formatDisplay(raw, item, true, "GLOBAL", "en-US")
      : raw;
  const display = textFromSpecDisplay(formatted as ReactNode);
  if (!display?.trim()) return undefined;

  return { id: field.api.id, raw, display };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build sections for the specs table display
 */
export function buildGearSpecsSections(
  item: GearItem,
  options?:
    | boolean
    | {
        forceLeftAlign?: boolean;
        viewerRegion?: GearRegion | null;
        locale?: string;
        t?: SpecTranslator;
        priceView?: PriceView;
      },
): SpecsTableSection[] {
  const normalizedOptions =
    typeof options === "boolean"
      ? { forceLeftAlign: options }
      : (options ?? {});
  const forceLeftAlign = normalizedOptions.forceLeftAlign;
  const viewerRegion = normalizedOptions.viewerRegion ?? "GLOBAL";
  const locale = normalizedOptions.locale ?? "en";
  const translationContext: SpecTranslationContext = {
    locale,
    t: normalizedOptions.t,
    surface: "public",
    priceView: normalizedOptions.priceView ?? getPriceViewForLocale(locale),
  };
  return specDictionary
    .filter((section) => !section.condition || section.condition(item))
    .map((section) => ({
      id: section.id,
      title: resolveSectionTitle(section, translationContext),
      searchTerms: uniqueNonEmptyStrings([section.title]),
      data: section.fields
        .filter(
          (field) =>
            !field.hideInSpecsTable &&
            (!field.condition || field.condition(item)),
        )
        .map((field) => {
          const raw = field.getRawValue(item);
          const rawValue = field.formatDisplay
            ? field.formatDisplay(
                raw,
                item,
                forceLeftAlign,
                viewerRegion,
                locale,
                translationContext.priceView,
              )
            : (raw as React.ReactNode);
          const value =
            typeof rawValue === "string"
              ? translateSharedSpecValue(rawValue, translationContext)
              : rawValue;
          const { label, englishLabel } = resolveFieldLabelDescriptor(
            section,
            field,
            item,
            translationContext,
          );
          return {
            key: field.key,
            label,
            value: value,
            searchTerms: uniqueNonEmptyStrings([
              ...(field.searchTerms ?? []),
              englishLabel,
            ]),
            fullWidth: !label,
            condenseOnMobile: field.condenseOnMobile,
          };
        })
        .filter((row) => hasDisplayValue(row.value)),
    }))
    .filter((section) => section.data.length > 0);
}

/**
 * Build sections for the edit sidebar (tree view)
 */
export type SidebarSection = {
  id: string;
  title: string;
  anchor: string;
  fields: {
    key: string;
    label: string;
    rawValue: unknown;
    targetId: string;
  }[];
};

export function buildEditSidebarSections(
  item: GearItem,
  options?: SpecTranslationContext,
): SidebarSection[] {
  const translationContext: SpecTranslationContext = {
    ...options,
    surface: "editor",
  };
  return specDictionary
    .filter((section) => !section.condition || section.condition(item))
    .map((section) => ({
      id: section.id,
      title: resolveSectionTitle(section, translationContext),
      anchor: section.sectionAnchor,
      fields: section.fields
        .filter((field) => {
          if (field.hiddenInEditor) {
            return false;
          }
          if (field.condition && !field.condition(item)) {
            return false;
          }
          const descriptor = resolveFieldLabelDescriptor(
            section,
            field,
            item,
            translationContext,
          );
          return descriptor.englishLabel.length > 0;
        })
        .map((field) => {
          const { label } = resolveFieldLabelDescriptor(
            section,
            field,
            item,
            translationContext,
          );
          return {
            key: field.key,
            label,
            rawValue: field.getRawValue(item),
            targetId: field.editElementId ?? field.key,
          };
        }),
    }));
}

/**
 * Fetch a spec field definition by its key.
 * Useful for table rendering so callers can reuse getRawValue and formatDisplay.
 */
export function getSpecFieldDefByKey(
  fieldKey: string,
): SpecFieldDef | undefined {
  for (const section of specDictionary) {
    for (const field of section.fields) {
      if (field.key === fieldKey) {
        return field;
      }
    }
  }
  return undefined;
}

/** Whether a field must remain editable in the editor's missing-only mode. */
export function isSpecAlwaysShownInEditor(
  sectionId: string | undefined,
  fieldKey: string,
): boolean {
  return (
    specDictionary
      .find((section) => section.id === sectionId)
      ?.fields.find((field) => field.key === fieldKey)?.alwaysShowInEditor ===
    true
  );
}
