if (process.env.NEXT_RUNTIME) {
  import("server-only").catch(() => undefined);
}

import type { SearchResponse } from "~/types/search-results";
import type { Suggestion } from "~/types/search";
import type {
  AfAreaMode,
  AnalogCameraSpecs,
  Brand,
  CameraCardSlot,
  GearAlias,
  GearColorway,
} from "~/types/gear";
import type {
  DeveloperApiCatalogItem,
  DeveloperApiMount,
  DeveloperApiSensorFormat,
} from "./data";
import type {
  DeveloperApiCameraSpecs,
  DeveloperApiFixedLensSpecs,
  DeveloperApiGear,
  DeveloperApiLensSpecs,
} from "./service";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function serializeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => serializeJsonValue(item));
  }
  if (typeof value === "object") {
    const serialized: Record<string, JsonValue> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) continue;
      serialized[key] = serializeJsonValue(nestedValue);
    }
    return serialized;
  }
  if (typeof value === "bigint") return value.toString();
  return null;
}

/** Convert database values to a JSON-only public API representation. */
export function serializeJson(value: unknown): JsonValue {
  return serializeJsonValue(value);
}

function serializeDate(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** The complete, intentionally lightweight allowlist for catalog downloads. */
export function serializeDeveloperCatalogData(
  items: DeveloperApiCatalogItem[],
) {
  return items.map((item) => ({
    name: item.name,
    slug: item.slug,
    brandName: item.brandName,
    gearType: item.gearType,
    thumbnailUrl: item.thumbnailUrl,
    releaseDate: serializeDate(item.releaseDate),
    releaseDatePrecision: item.releaseDatePrecision,
    announcedDate: serializeDate(item.announcedDate),
    announceDatePrecision: item.announceDatePrecision,
    discontinuedDate: serializeDate(item.discontinuedDate),
    discontinuedDatePrecision: item.discontinuedDatePrecision,
  }));
}

function serializeStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function serializeFpsPair(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const pair = value as Record<string, unknown>;
  const raw = typeof pair.raw === "number" ? pair.raw : undefined;
  const jpg = typeof pair.jpg === "number" ? pair.jpg : undefined;
  if (raw === undefined && jpg === undefined) return undefined;
  return { raw, jpg };
}

function serializeMaxFpsByShutter(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const shutters = value as Record<string, unknown>;
  return {
    mechanical: serializeFpsPair(shutters.mechanical),
    efc: serializeFpsPair(shutters.efc),
    electronic: serializeFpsPair(shutters.electronic),
  };
}

function serializeBrand(brand: Brand | null | undefined) {
  if (!brand) return null;
  return {
    name: brand.name,
    slug: brand.slug,
  };
}

function serializeAlias(alias: GearAlias) {
  return {
    region: alias.region,
    name: alias.name,
  };
}

function serializeAliases(aliases: GearAlias[] | null | undefined) {
  return (aliases ?? []).map(serializeAlias);
}

function serializeMedia(item: DeveloperApiGear) {
  return {
    thumbnailUrl: item.thumbnailUrl,
    ogImageUrl: item.ogImageUrl,
    topViewUrl: item.topViewUrl,
    rearViewUrl: item.rearViewUrl,
    leftViewUrl: item.leftViewUrl,
    rightViewUrl: item.rightViewUrl,
  };
}

function serializeMount(mount: DeveloperApiMount) {
  return {
    value: mount.value,
    shortName: mount.shortName,
  };
}

function serializeSensorFormat(format: DeveloperApiSensorFormat | null) {
  if (!format) return null;
  return {
    slug: format.slug,
    name: format.name,
    cropFactor: format.cropFactor,
  };
}

function serializeColorway(colorway: GearColorway) {
  return {
    name: colorway.name,
    slug: colorway.slug,
    swatchColorA: colorway.swatchColorA,
    swatchColorB: colorway.swatchColorB,
    sortOrder: colorway.sortOrder,
    frontImageUrl: colorway.frontImageUrl,
    topViewUrl: colorway.topViewUrl,
    rearViewUrl: colorway.rearViewUrl,
    leftViewUrl: colorway.leftViewUrl,
    rightViewUrl: colorway.rightViewUrl,
  };
}

function serializeAfAreaMode(mode: AfAreaMode) {
  return {
    name: mode.name,
    description: mode.description,
    aliases: serializeStringArray(mode.aliases),
  };
}

function serializeCameraCardSlot(slot: CameraCardSlot) {
  return {
    slotIndex: slot.slotIndex,
    supportedFormFactors: slot.supportedFormFactors,
    supportedBuses: slot.supportedBuses,
    supportedSpeedClasses: slot.supportedSpeedClasses,
  };
}

function serializeCameraSpecs(
  specs: DeveloperApiCameraSpecs | null | undefined,
) {
  if (!specs) return null;
  return {
    sensorFormat: serializeSensorFormat(specs.sensorFormat),
    resolutionMp: specs.resolutionMp,
    sensorStackingType: specs.sensorStackingType,
    sensorTechType: specs.sensorTechType,
    isBackSideIlluminated: specs.isBackSideIlluminated,
    isoMin: specs.isoMin,
    isoMax: specs.isoMax,
    isoMinExpanded: specs.isoMinExpanded,
    isoMaxExpanded: specs.isoMaxExpanded,
    baseIso: specs.baseIso,
    sensorReadoutSpeedMs: specs.sensorReadoutSpeedMs,
    maxRawBitDepth: specs.maxRawBitDepth,
    hasIbis: specs.hasIbis,
    hasElectronicVibrationReduction: specs.hasElectronicVibrationReduction,
    cipaStabilizationRatingStops: specs.cipaStabilizationRatingStops,
    hasPixelShiftShooting: specs.hasPixelShiftShooting,
    hasAntiAliasingFilter: specs.hasAntiAliasingFilter,
    precaptureSupportLevel: specs.precaptureSupportLevel,
    cameraType: specs.cameraType,
    processorName: specs.processorName,
    hasWeatherSealing: specs.hasWeatherSealing,
    hasAutofocus: specs.hasAutofocus,
    focusPoints: specs.focusPoints,
    afSubjectCategories: specs.afSubjectCategories,
    hasFocusPeaking: specs.hasFocusPeaking,
    hasFocusBracketing: specs.hasFocusBracketing,
    shutterSpeedMax: specs.shutterSpeedMax,
    shutterSpeedMin: specs.shutterSpeedMin,
    maxFpsRaw: specs.maxFpsRaw,
    maxFpsJpg: specs.maxFpsJpg,
    maxFpsByShutter: serializeMaxFpsByShutter(specs.maxFpsByShutter),
    flashSyncSpeed: specs.flashSyncSpeed,
    hasSilentShootingAvailable: specs.hasSilentShootingAvailable,
    availableShutterTypes: specs.availableShutterTypes,
    internalStorageGb: specs.internalStorageGb,
    cipaBatteryShotsPerCharge: specs.cipaBatteryShotsPerCharge,
    supportedBatteries: specs.supportedBatteries,
    usbPowerDelivery: specs.usbPowerDelivery,
    usbCharging: specs.usbCharging,
    hasVideo: specs.hasVideo,
    hasLogColorProfile: specs.hasLogColorProfile,
    has10BitVideo: specs.has10BitVideo,
    has12BitVideo: specs.has12BitVideo,
    hasOpenGateVideo: specs.hasOpenGateVideo,
    supportsExternalRecording: specs.supportsExternalRecording,
    supportsRecordToDrive: specs.supportsRecordToDrive,
    hasIntervalometer: specs.hasIntervalometer,
    hasSelfTimer: specs.hasSelfTimer,
    hasBuiltInFlash: specs.hasBuiltInFlash,
    hasHotShoe: specs.hasHotShoe,
    hasIlluminatedButtons: specs.hasIlluminatedButtons,
    hasUsbFileTransfer: specs.hasUsbFileTransfer,
    rearDisplayType: specs.rearDisplayType,
    rearDisplayResolutionMillionDots: specs.rearDisplayResolutionMillionDots,
    rearDisplaySizeInches: specs.rearDisplaySizeInches,
    hasRearTouchscreen: specs.hasRearTouchscreen,
    viewfinderType: specs.viewfinderType,
    viewfinderMagnification: specs.viewfinderMagnification,
    viewfinderEyePointMm: specs.viewfinderEyePointMm,
    viewfinderResolutionMillionDots: specs.viewfinderResolutionMillionDots,
    hasTopDisplay: specs.hasTopDisplay,
    afAreaModes: (specs.afAreaModes ?? []).map(serializeAfAreaMode),
  };
}

function serializeAnalogCameraSpecs(
  specs: AnalogCameraSpecs | null | undefined,
) {
  if (!specs) return null;
  return {
    cameraType: specs.cameraType,
    captureMedium: specs.captureMedium,
    filmTransportType: specs.filmTransportType,
    hasAutoFilmAdvance: specs.hasAutoFilmAdvance,
    hasOptionalMotorizedDrive: specs.hasOptionalMotorizedDrive,
    viewfinderType: specs.viewfinderType,
    viewfinderEyePointMm: specs.viewfinderEyePointMm,
    shutterType: specs.shutterType,
    shutterSpeedMax: specs.shutterSpeedMax,
    shutterSpeedMin: specs.shutterSpeedMin,
    flashSyncSpeed: specs.flashSyncSpeed,
    hasBulbMode: specs.hasBulbMode,
    hasMetering: specs.hasMetering,
    meteringModes: specs.meteringModes,
    exposureModes: specs.exposureModes,
    meteringDisplayTypes: specs.meteringDisplayTypes,
    hasExposureCompensation: specs.hasExposureCompensation,
    isoSettingMethod: specs.isoSettingMethod,
    isoMin: specs.isoMin,
    isoMax: specs.isoMax,
    hasAutoFocus: specs.hasAutoFocus,
    focusAidTypes: specs.focusAidTypes,
    requiresBatteryForShutter: specs.requiresBatteryForShutter,
    requiresBatteryForMetering: specs.requiresBatteryForMetering,
    supportedBatteries: specs.supportedBatteries,
    hasContinuousDrive: specs.hasContinuousDrive,
    maxContinuousFps: specs.maxContinuousFps,
    hasHotShoe: specs.hasHotShoe,
    hasSelfTimer: specs.hasSelfTimer,
    hasIntervalometer: specs.hasIntervalometer,
  };
}

function serializeLensSpecs(specs: DeveloperApiLensSpecs | null | undefined) {
  if (!specs) return null;
  return {
    imageCircle: serializeSensorFormat(specs.imageCircle),
    isPrime: specs.isPrime,
    focalLengthMinMm: specs.focalLengthMinMm,
    focalLengthMaxMm: specs.focalLengthMaxMm,
    maxApertureWide: specs.maxApertureWide,
    maxApertureTele: specs.maxApertureTele,
    minApertureWide: specs.minApertureWide,
    minApertureTele: specs.minApertureTele,
    apertureProfileJson: specs.apertureProfileJson,
    hasStabilization: specs.hasStabilization,
    cipaStabilizationRatingStops: specs.cipaStabilizationRatingStops,
    hasStabilizationSwitch: specs.hasStabilizationSwitch,
    hasAutofocus: specs.hasAutofocus,
    isMacro: specs.isMacro,
    magnification: specs.magnification,
    minimumFocusDistanceMm: specs.minimumFocusDistanceMm,
    hasFocusRing: specs.hasFocusRing,
    focusMotorType: specs.focusMotorType,
    focusThrowDegrees: specs.focusThrowDegrees,
    hasAfMfSwitch: specs.hasAfMfSwitch,
    hasFocusLimiter: specs.hasFocusLimiter,
    hasFocusRecallButton: specs.hasFocusRecallButton,
    numberElements: specs.numberElements,
    numberElementGroups: specs.numberElementGroups,
    hasDiffractiveOptics: specs.hasDiffractiveOptics,
    lensZoomType: specs.lensZoomType,
    numberDiaphragmBlades: specs.numberDiaphragmBlades,
    hasRoundedDiaphragmBlades: specs.hasRoundedDiaphragmBlades,
    hasInternalZoom: specs.hasInternalZoom,
    hasInternalFocus: specs.hasInternalFocus,
    frontElementRotates: specs.frontElementRotates,
    mountMaterial: specs.mountMaterial,
    hasWeatherSealing: specs.hasWeatherSealing,
    hasApertureRing: specs.hasApertureRing,
    numberCustomControlRings: specs.numberCustomControlRings,
    numberFunctionButtons: specs.numberFunctionButtons,
    acceptsFilterTypes: specs.acceptsFilterTypes,
    frontFilterThreadSizeMm: specs.frontFilterThreadSizeMm,
    rearFilterThreadSizeMm: specs.rearFilterThreadSizeMm,
    dropInFilterSizeMm: specs.dropInFilterSizeMm,
    hasBuiltInTeleconverter: specs.hasBuiltInTeleconverter,
    hasLensHood: specs.hasLensHood,
    hasTripodCollar: specs.hasTripodCollar,
    isTiltShift: specs.isTiltShift,
    tiltDegrees: specs.tiltDegrees,
    shiftMm: specs.shiftMm,
  };
}

function serializeFixedLensSpecs(
  specs: DeveloperApiFixedLensSpecs | null | undefined,
) {
  if (!specs) return null;
  return {
    imageCircle: serializeSensorFormat(specs.imageCircle),
    isPrime: specs.isPrime,
    focalLengthMinMm: specs.focalLengthMinMm,
    focalLengthMaxMm: specs.focalLengthMaxMm,
    maxApertureWide: specs.maxApertureWide,
    maxApertureTele: specs.maxApertureTele,
    minApertureWide: specs.minApertureWide,
    minApertureTele: specs.minApertureTele,
    hasAutofocus: specs.hasAutofocus,
    minimumFocusDistanceMm: specs.minimumFocusDistanceMm,
    frontElementRotates: specs.frontElementRotates,
    frontFilterThreadSizeMm: specs.frontFilterThreadSizeMm,
    hasLensHood: specs.hasLensHood,
  };
}

export function serializeSearchResponse(result: SearchResponse) {
  return {
    data: result.results.map((item) => ({
      slug: item.slug,
      name: item.name,
      brandName: item.brandName,
      gearType: item.gearType,
      thumbnailUrl: item.thumbnailUrl,
      releaseDate: item.releaseDate ? serializeJson(item.releaseDate) : null,
      releaseDatePrecision: item.releaseDatePrecision ?? null,
      announcedDate: item.announcedDate
        ? serializeJson(item.announcedDate)
        : null,
      announceDatePrecision: item.announceDatePrecision ?? null,
      msrpNowUsdCents: item.msrpNowUsdCents ?? null,
      msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents ?? null,
      estimatedUsedPrice: serializeJson(item.usedPriceProjection),
      // MPB-specific price field retained alongside the estimate.
      mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents ?? null,
      regionalAliases: serializeAliases(item.regionalAliases),
    })),
    pagination: {
      page: result.page,
      limit: result.pageSize,
      total: result.total ?? 0,
      totalPages: result.totalPages ?? 0,
    },
  };
}

export function serializeSuggestions(suggestions: Suggestion[]) {
  const data: Array<
    | { kind: "brand"; slug: string; name: string }
    | {
        kind: "gear";
        slug: string;
        name: string;
        canonicalName: string;
        matchedName: string;
        matchSource: string;
        isBestMatch: boolean;
        brandName: string | null;
        gearType: string;
      }
  > = [];

  for (const suggestion of suggestions) {
    if (suggestion.kind === "smart-action") continue;
    if (suggestion.kind === "brand") {
      data.push({
        kind: "brand",
        slug: suggestion.href.replace("/brand/", ""),
        name: suggestion.brandName,
      });
      continue;
    }

    data.push({
      kind: "gear",
      slug: suggestion.href.replace("/gear/", ""),
      name: suggestion.localizedName,
      canonicalName: suggestion.canonicalName,
      matchedName: suggestion.matchedName,
      matchSource: suggestion.matchSource,
      isBestMatch: suggestion.isBestMatch,
      brandName: suggestion.brandName,
      gearType: suggestion.gearType,
    });
  }

  return {
    data,
  };
}

export function serializeGear(item: DeveloperApiGear) {
  const media = serializeMedia(item);
  return {
    data: serializeJson({
      slug: item.slug,
      name: item.name,
      modelNumber: item.modelNumber,
      gearType: item.gearType,
      announcedDate: serializeDate(item.announcedDate),
      announceDatePrecision: item.announceDatePrecision,
      releaseDate: serializeDate(item.releaseDate),
      releaseDatePrecision: item.releaseDatePrecision,
      discontinuedDate: serializeDate(item.discontinuedDate),
      discontinuedDatePrecision: item.discontinuedDatePrecision,
      msrpNowUsdCents: item.msrpNowUsdCents,
      msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents,
      estimatedUsedPrice: serializeJson(item.usedPriceProjection),
      // MPB-specific price field retained alongside the estimate.
      mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents,
      thumbnailUrl: media.thumbnailUrl,
      ogImageUrl: media.ogImageUrl,
      topViewUrl: media.topViewUrl,
      rearViewUrl: media.rearViewUrl,
      leftViewUrl: media.leftViewUrl,
      rightViewUrl: media.rightViewUrl,
      weightGrams: item.weightGrams,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      depthMm: item.depthMm,
      linkManufacturer: item.linkManufacturer,
      linkInstructionManual: item.linkInstructionManual,
      linkMpb: item.linkMpb,
      linkBh: item.linkBh,
      linkAmazon: item.linkAmazon,
      predecessor: item.predecessor,
      successor: item.successor,
      brands: serializeBrand(item.brands),
      mounts: item.mounts.map(serializeMount),
      regionalAliases: serializeAliases(item.regionalAliases),
      cameraSpecs: serializeCameraSpecs(item.cameraSpecs),
      analogCameraSpecs: serializeAnalogCameraSpecs(item.analogCameraSpecs),
      lensSpecs: serializeLensSpecs(item.lensSpecs),
      fixedLensSpecs: serializeFixedLensSpecs(item.fixedLensSpecs),
      cameraCardSlots: (item.cameraCardSlots ?? []).map(
        serializeCameraCardSlot,
      ),
      colorways: (item.colorways ?? []).map(serializeColorway),
    }),
  };
}

export function serializeDeveloperApiSpecs(
  specs: Array<{ id: string; raw: unknown; display: string }>,
) {
  return {
    data: specs.map((spec) => ({
      id: spec.id,
      raw: serializeJson(spec.raw),
      display: spec.display,
    })),
  };
}
