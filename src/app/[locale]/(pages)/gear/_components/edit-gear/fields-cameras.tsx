"use client";

import { useTranslations, type TranslationValues } from "next-intl";
import { BatteryFullIcon, Grid3X3, ZapIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  BooleanInput,
  MultiTextInput,
  NumberInput,
} from "~/components/custom-inputs";
import IsoInput from "~/components/custom-inputs/iso-input";
import SensorFormatInput from "~/components/custom-inputs/sensor-format-input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MultiSelect } from "~/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { AF_AREA_MODES, ENUMS } from "~/lib/constants";
import {
  getSpecFieldLabel,
  translateGearDetailWithFallback,
} from "~/lib/i18n/gear-detail";
import { isSpecAlwaysShownInEditor } from "~/lib/specs/registry";
import { supportsViewfinderEyePoint } from "~/lib/specs/viewfinder";
import { formatCameraType, PRECAPTURE_SUPPORT_OPTIONS } from "~/lib/mapping";
import type { EnrichedCameraSpecs, GearItem } from "~/types/gear";
import CardSlotsManager, { type CardSlot } from "./card-slots-manager";
import { VideoModesManager } from "./video-modes-manager";
import { CompletedSpecLock } from "./completed-spec-lock";
import { BaseIsoInput } from "./base-iso-input";
import {
  computeHeadlineMaxFps,
  normalizeMaxFpsByShutterValue,
  normalizeShutterTypeKey,
  type ShutterFpsByType,
  type ShutterFpsEntry,
  type ShutterType,
} from "./camera-fps";
// Integrated lens UI moved to edit form level

interface CameraFieldsProps {
  gearItem: GearItem;
  currentSpecs: EnrichedCameraSpecs | null | undefined;
  initialSpecs?: EnrichedCameraSpecs | null | undefined;
  initialGearItem?: GearItem | null;
  showMissingOnly?: boolean;
  onChange: (field: string, value: any) => void;
  onChangeTopLevel?: (field: string, value: any) => void; // for cameraCardSlots
  sectionId?: string;
  disableCompletedSpecs?: boolean;
}

const shutterTypeLabels: Record<ShutterType, string> = {
  mechanical: "Mechanical shutter",
  efc: "Electronic first curtain",
  electronic: "Electronic shutter",
};

const cameraFieldSections: Record<string, string> = {
  resolutionMp: "camera-sensor-shutter",
  sensorFormatId: "camera-sensor-shutter",
  baseIso: "camera-sensor-shutter",
  sensorReadoutSpeedMs: "camera-sensor-shutter",
  maxRawBitDepth: "camera-sensor-shutter",
  hasIbis: "camera-sensor-shutter",
  hasElectronicVibrationReduction: "camera-sensor-shutter",
  cipaStabilizationRatingStops: "camera-sensor-shutter",
  hasPixelShiftShooting: "camera-sensor-shutter",
  hasAntiAliasingFilter: "camera-sensor-shutter",
  precaptureSupportLevel: "camera-sensor-shutter",
  shutterSpeedMax: "camera-sensor-shutter",
  shutterSpeedMin: "camera-sensor-shutter",
  flashSyncSpeed: "camera-sensor-shutter",
  hasSilentShootingAvailable: "camera-sensor-shutter",
  availableShutterTypes: "camera-sensor-shutter",
  processorName: "camera-hardware",
  hasWeatherSealing: "camera-hardware",
  internalStorageGb: "camera-hardware",
  rearDisplayType: "camera-hardware",
  rearDisplaySizeInches: "camera-hardware",
  rearDisplayResolutionMillionDots: "camera-hardware",
  viewfinderType: "camera-hardware",
  viewfinderMagnification: "camera-hardware",
  viewfinderEyePointMm: "camera-hardware",
  viewfinderResolutionMillionDots: "camera-hardware",
  hasTopDisplay: "camera-hardware",
  hasRearTouchscreen: "camera-hardware",
  hasAutofocus: "camera-focus",
  focusPoints: "camera-focus",
  afAreaModes: "camera-focus",
  afSubjectCategories: "camera-focus",
  hasFocusPeaking: "camera-focus",
  hasFocusBracketing: "camera-focus",
  cipaBatteryShotsPerCharge: "camera-battery",
  supportedBatteries: "camera-battery",
  usbCharging: "camera-battery",
  usbPowerDelivery: "camera-battery",
  hasVideo: "camera-video",
  hasLogColorProfile: "camera-video",
  has10BitVideo: "camera-video",
  has12BitVideo: "camera-video",
  hasOpenGateVideo: "camera-video",
  supportsExternalRecording: "camera-video",
  supportsRecordToDrive: "camera-video",
  hasIntervalometer: "camera-misc",
  hasSelfTimer: "camera-misc",
  hasBuiltInFlash: "camera-misc",
  hasHotShoe: "camera-misc",
  hasIlluminatedButtons: "camera-misc",
  hasUsbFileTransfer: "camera-misc",
};

export function FpsPerShutterInput({
  availableShutterTypes,
  value,
  onChange,
  onHeadlineChange,
  isVisible,
  getLabel,
  tf,
}: {
  availableShutterTypes: string[];
  value: unknown;
  onChange: (nextValue: ShutterFpsByType | null) => void;
  onHeadlineChange: (maxRaw: number | null, maxJpg: number | null) => void;
  isVisible: boolean;
  getLabel: (value: ShutterType) => string;
  tf: (key: string, fallback: string) => string;
}) {
  const normalizedAvailable = useMemo(
    () =>
      (availableShutterTypes ?? [])
        .map((shutterType) => normalizeShutterTypeKey(shutterType))
        .filter((shutterType): shutterType is ShutterType =>
          Boolean(shutterType),
        ),
    [availableShutterTypes],
  );

  const normalizedValue = useMemo(
    () => normalizeMaxFpsByShutterValue(value, normalizedAvailable),
    [value, normalizedAvailable],
  );

  const handleValueChange = useCallback(
    (
      shutterType: ShutterType,
      field: "raw" | "jpg",
      nextValue: number | null,
    ) => {
      const nextMap: ShutterFpsByType = { ...normalizedValue };
      const currentEntry: ShutterFpsEntry = { ...(nextMap[shutterType] ?? {}) };
      currentEntry[field] = nextValue;

      if (
        (currentEntry.raw === null || currentEntry.raw === undefined) &&
        (currentEntry.jpg === null || currentEntry.jpg === undefined)
      ) {
        delete nextMap[shutterType];
      } else {
        nextMap[shutterType] = currentEntry;
      }

      const canonicalMap = normalizeMaxFpsByShutterValue(
        nextMap,
        normalizedAvailable,
      );
      const headline = computeHeadlineMaxFps(canonicalMap);
      onChange(Object.keys(canonicalMap).length > 0 ? canonicalMap : null);
      onHeadlineChange(headline.maxRaw, headline.maxJpg);
    },
    [normalizedValue, onChange, onHeadlineChange],
  );

  if (!isVisible) return null;

  if (normalizedAvailable.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border p-3 text-sm">
        {tf(
          "editGear.fields.selectAvailableShutterTypesFirst",
          "Select available shutter types to enter max FPS values.",
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {normalizedAvailable.map((shutterType) => {
        const entry = normalizedValue[shutterType] ?? {};
        return (
          <div key={shutterType} className="space-y-3 rounded-md border p-3">
            <div className="font-semibold">{getLabel(shutterType)}</div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <NumberInput
                  id={`maxFpsByShutter-${shutterType}-raw`}
                  label={tf("editGear.fields.rawFps", "RAW FPS")}
                  value={
                    entry.raw === null || entry.raw === undefined
                      ? null
                      : entry.raw
                  }
                  onChange={(newValue) =>
                    handleValueChange(
                      shutterType,
                      "raw",
                      newValue === null ? null : Number(newValue),
                    )
                  }
                  placeholder={tf(
                    "editGear.fields.fpsPlaceholder",
                    "e.g., 20.0",
                  )}
                  min={0}
                  max={120}
                  step={0.1}
                  suffix="fps"
                />
              </div>
              <div className="flex-1">
                <NumberInput
                  id={`maxFpsByShutter-${shutterType}-jpg`}
                  label={tf("editGear.fields.jpgFps", "JPG FPS")}
                  value={
                    entry.jpg === null || entry.jpg === undefined
                      ? null
                      : entry.jpg
                  }
                  onChange={(newValue) =>
                    handleValueChange(
                      shutterType,
                      "jpg",
                      newValue === null ? null : Number(newValue),
                    )
                  }
                  placeholder={tf(
                    "editGear.fields.fpsPlaceholder",
                    "e.g., 20.0",
                  )}
                  min={0}
                  max={120}
                  step={0.1}
                  suffix="fps"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Using shared NumberInput from custom-inputs

function CameraFieldsComponent({
  gearItem,
  currentSpecs,
  initialSpecs,
  initialGearItem,
  showMissingOnly,
  onChange,
  onChangeTopLevel,
  sectionId,
  disableCompletedSpecs = false,
}: CameraFieldsProps) {
  // Debug logging
  // console.log("CameraFieldsComponent - currentSpecs:", currentSpecs);
  const t = useTranslations("gearDetail");
  const tf = useCallback(
    (key: string, fallback: string, values?: TranslationValues) =>
      translateGearDetailWithFallback(t, key, fallback, values),
    [t],
  );
  const completedSpecMessage = t("editGear.completedSpecEditorOnly");
  const sensorFormatLocked =
    disableCompletedSpecs && Boolean(initialSpecs?.sensorFormatId);
  const resolutionLocked =
    disableCompletedSpecs && initialSpecs?.resolutionMp != null;
  const baseIsoLocked =
    disableCompletedSpecs &&
    Array.isArray(initialSpecs?.baseIso) &&
    initialSpecs.baseIso.length > 0;
  const specLabel = useCallback(
    (fieldKey: string, fallback: string) => {
      const sectionId = cameraFieldSections[fieldKey];
      if (!sectionId) return fallback;
      return getSpecFieldLabel(t, sectionId, fieldKey, fallback);
    },
    [t],
  );
  const getShutterTypeLabel = useCallback(
    (value: ShutterType) =>
      tf(
        `editGear.options.cameraShutterTypes.${value}`,
        shutterTypeLabels[value] ?? value,
      ),
    [tf],
  );

  //if afarea modes is completely missing throw an error
  // if things are working we should get an empty array for no items
  if (!currentSpecs?.afAreaModes) {
    throw new Error("afAreaModes is completely missing");
  }

  const [usePerShutterFps, setUsePerShutterFps] = useState(() => {
    const available =
      currentSpecs?.availableShutterTypes ??
      initialSpecs?.availableShutterTypes ??
      [];
    const normalized = normalizeMaxFpsByShutterValue(
      currentSpecs?.maxFpsByShutter ?? initialSpecs?.maxFpsByShutter,
      available,
    );
    return Object.keys(normalized).length > 0;
  });

  // // Use sensor formats from constants
  // const sensorFormatOptions = useMemo(
  //   () =>
  //     SENSOR_FORMATS.map((format) => ({
  //       id: format.slug,
  //       name: format.name,
  //     })),
  //   [],
  // );

  const afAreaModeOptions = useMemo(() => {
    const list: unknown = AF_AREA_MODES;
    if (!Array.isArray(list)) return [] as { id: string; name: string }[];
    const typed = list.filter(
      (mode): mode is { id: string; name: string; brand_id: string | number } =>
        typeof mode === "object" &&
        mode !== null &&
        "id" in mode &&
        "name" in mode &&
        "brand_id" in mode,
    );
    return typed
      .filter((mode) => mode.brand_id === gearItem.brandId)
      .map((mode) => ({ id: mode.id, name: mode.name }));
  }, [gearItem.brandId]);

  const selectedAfAreaModeIds: string[] = useMemo(() => {
    const v: unknown = currentSpecs?.afAreaModes;
    if (!Array.isArray(v) || v.length === 0) return [];
    if (v.every((e): e is string => typeof e === "string")) return v;
    const ids = v
      .map((m): string | undefined => {
        if (typeof m === "object" && m !== null && "id" in m) {
          const id = (m as { id: unknown }).id;
          return typeof id === "string" ? id : undefined;
        }
        return undefined;
      })
      .filter((x): x is string => typeof x === "string");
    return ids;
  }, [currentSpecs?.afAreaModes]);

  // AF Subject Categories (enum-backed)
  const afSubjectCategoryOptions = useMemo(() => {
    const list = ENUMS.camera_af_subject_categories_enum;
    if (!Array.isArray(list)) return [] as { id: string; name: string }[];
    return list.map((v) => ({
      id: v,
      name: v.charAt(0).toUpperCase() + v.slice(1),
    }));
  }, []);

  const selectedAfSubjectCategories: string[] = useMemo(() => {
    const v: unknown = currentSpecs?.afSubjectCategories;
    if (!Array.isArray(v) || v.length === 0) return [];
    return v.filter((x): x is string => typeof x === "string");
  }, [currentSpecs?.afSubjectCategories]);

  // Safe, typed list of camera type enum values with a fallback
  const cameraTypeEnumList: readonly string[] = useMemo(() => {
    const maybe = (ENUMS as unknown as { camera_type_enum?: unknown })
      .camera_type_enum;
    if (Array.isArray(maybe) && maybe.every((x) => typeof x === "string")) {
      return maybe as readonly string[];
    }
    return ["dslr", "mirrorless", "slr", "action", "cinema"] as const;
  }, []);

  const handleFieldChange = useCallback(
    (fieldId: string, value: any) => {
      console.log("handleFieldChange called:", { fieldId, value });
      onChange(fieldId, value);
    },
    [onChange],
  );

  const numOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
      return Number(v);
    return null;
  };

  const isMissing = (v: unknown): boolean => {
    if (v == null) return true;
    if (typeof v === "string") return v.trim().length === 0;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  };
  const showWhenMissing = (v: unknown, fieldKey?: string): boolean =>
    !showMissingOnly ||
    isMissing(v) ||
    (fieldKey !== undefined &&
      isSpecAlwaysShownInEditor(cameraFieldSections[fieldKey], fieldKey));
  const initialVideoModes = Array.isArray(initialGearItem?.videoModes)
    ? initialGearItem?.videoModes
    : [];
  const shouldShowVideoModes =
    !showMissingOnly || initialVideoModes.length === 0;
  const canEditVideo = currentSpecs?.hasVideo === true;

  return (
    <Card
      id={sectionId}
      className="rounded-md border-0 bg-transparent px-0 py-0"
    >
      <CardHeader className="px-0">
        <CardTitle className="text-2xl">
          {tf(
            "editGear.sections.cameraSpecifications",
            "Camera Specifications",
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <div className="flex flex-col gap-3">
          {/* Sensor Format */}
          {showWhenMissing(initialSpecs?.sensorFormatId) && (
            <SensorFormatInput
              id="sensorFormatId"
              label={specLabel("sensorFormatId", "Sensor Format")}
              value={currentSpecs?.sensorFormatId}
              onChange={(value) => handleFieldChange("sensorFormatId", value)}
              disabled={sensorFormatLocked}
              labelAdornment={
                sensorFormatLocked ? (
                  <CompletedSpecLock message={completedSpecMessage} />
                ) : undefined
              }
            />
          )}

          {/* Resolution - Standard Number Input */}
          {showWhenMissing(initialSpecs?.resolutionMp) && (
            <NumberInput
              id="resolutionMp"
              label={specLabel("resolutionMp", "Resolution (megapixels)")}
              value={
                currentSpecs?.resolutionMp != null
                  ? parseFloat(currentSpecs.resolutionMp)
                  : null
              }
              onChange={(value) => handleFieldChange("resolutionMp", value)}
              placeholder={tf(
                "editGear.fields.megapixelsPlaceholder",
                "e.g., 45.0",
              )}
              icon={<Grid3X3 className="size-4" />}
              suffix="MP"
              step={0.1}
              min={0}
              disabled={resolutionLocked}
              labelAdornment={
                resolutionLocked ? (
                  <CompletedSpecLock message={completedSpecMessage} />
                ) : undefined
              }
            />
          )}

          {/* Sensor Stacking Type */}
          {showWhenMissing(initialSpecs?.sensorStackingType) && (
            <div className="space-y-2">
              <Label htmlFor="sensorStackingType">
                {tf(
                  "editGear.fields.sensorStackingType",
                  "Sensor Stacking Type",
                )}
              </Label>
              <Select
                value={currentSpecs?.sensorStackingType ?? ""}
                onValueChange={(value) =>
                  handleFieldChange("sensorStackingType", value)
                }
              >
                <SelectTrigger id="sensorStackingType" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.sensorStackingTypePlaceholder",
                      "Sensor Stacking Type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {ENUMS.sensor_stacking_types_enum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type
                        .replace("-", " ")
                        .split(" ")
                        .map(
                          (word) =>
                            word.charAt(0).toUpperCase() + word.slice(1),
                        )
                        .join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sensor Tech Type */}
          {showWhenMissing(initialSpecs?.sensorTechType) && (
            <div className="space-y-2">
              <Label htmlFor="sensorTechType">
                {tf("editGear.fields.sensorTechType", "Sensor Tech Type")}
              </Label>
              <Select
                value={currentSpecs?.sensorTechType ?? ""}
                onValueChange={(value) =>
                  handleFieldChange("sensorTechType", value)
                }
              >
                <SelectTrigger id="sensorTechType" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.sensorTechTypePlaceholder",
                      "Sensor Tech Type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {ENUMS.sensor_tech_types_enum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Camera Type */}
          {showWhenMissing(initialSpecs?.cameraType) && (
            <div className="space-y-2">
              <Label htmlFor="cameraType">
                {t("specRegistry.sections.core.fields.cameraType.label")}
              </Label>
              <Select
                value={currentSpecs?.cameraType ?? ""}
                onValueChange={(value) =>
                  handleFieldChange("cameraType", value)
                }
              >
                <SelectTrigger id="cameraType" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.cameraTypePlaceholder",
                      "Camera Type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {cameraTypeEnumList.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatCameraType(type) ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Is Back Side Illuminated */}

          {showWhenMissing(initialSpecs?.isBackSideIlluminated) && (
            <BooleanInput
              id="isBackSideIlluminated"
              label={tf(
                "editGear.fields.backSideIlluminated",
                "Back Side Illuminated",
              )}
              checked={currentSpecs?.isBackSideIlluminated ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("isBackSideIlluminated", value)
              }
            />
          )}

          {/* Sensor Readout Speed */}

          {showWhenMissing(initialSpecs?.sensorReadoutSpeedMs) && (
            <NumberInput
              id="sensorReadoutSpeedMs"
              label={specLabel(
                "sensorReadoutSpeedMs",
                "Sensor Readout Speed (ms)",
              )}
              value={
                currentSpecs?.sensorReadoutSpeedMs != null
                  ? parseFloat(currentSpecs.sensorReadoutSpeedMs)
                  : null
              }
              onChange={(value) =>
                handleFieldChange("sensorReadoutSpeedMs", value)
              }
              suffix="ms"
              placeholder={tf(
                "editGear.fields.millisecondsPlaceholder",
                "e.g., 10",
              )}
              min={0}
              step={0.1}
            />
          )}

          {/* Precapture Support */}
          {showWhenMissing(initialSpecs?.precaptureSupportLevel) && (
            <div className="space-y-2">
              <Label htmlFor="precaptureSupportLevel">
                {specLabel(
                  "precaptureSupportLevel",
                  "Precapture Buffer Support",
                )}
              </Label>
              <Select
                value={
                  currentSpecs?.precaptureSupportLevel != null
                    ? String(currentSpecs.precaptureSupportLevel)
                    : ""
                }
                onValueChange={(value) =>
                  handleFieldChange(
                    "precaptureSupportLevel",
                    value === "" ? null : Number(value),
                  )
                }
              >
                <SelectTrigger id="precaptureSupportLevel" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.selectSupportLevel",
                      "Select support level",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {PRECAPTURE_SUPPORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ISO Range anchor (always present for sidebar scrolling) */}
          <div id="isoRange" className="h-0" aria-hidden />
          {/* Expanded ISO Range anchor (always present for sidebar scrolling) */}
          <div id="isoExpandedRange" className="h-0" aria-hidden />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Native ISO Min */}
            {showWhenMissing(initialSpecs?.isoMin) && (
              <IsoInput
                id="isoMin"
                label={tf("editGear.fields.isoMinNative", "ISO Min (Native)")}
                value={currentSpecs?.isoMin}
                onChange={(value) => handleFieldChange("isoMin", value)}
              />
            )}

            {/* Native ISO Max */}
            {showWhenMissing(initialSpecs?.isoMax) && (
              <IsoInput
                id="isoMax"
                label={tf("editGear.fields.isoMaxNative", "ISO Max (Native)")}
                value={currentSpecs?.isoMax}
                onChange={(value) => handleFieldChange("isoMax", value)}
              />
            )}

            {/* Expanded ISO Min */}
            {showWhenMissing(initialSpecs?.isoMinExpanded) && (
              <IsoInput
                id="isoMinExpanded"
                label={tf(
                  "editGear.fields.isoMinExpanded",
                  "ISO Min (Expanded)",
                )}
                value={currentSpecs?.isoMinExpanded}
                onChange={(value) => handleFieldChange("isoMinExpanded", value)}
              />
            )}

            {/* Expanded ISO Max */}
            {showWhenMissing(initialSpecs?.isoMaxExpanded) && (
              <IsoInput
                id="isoMaxExpanded"
                label={tf(
                  "editGear.fields.isoMaxExpanded",
                  "ISO Max (Expanded)",
                )}
                value={currentSpecs?.isoMaxExpanded}
                onChange={(value) => handleFieldChange("isoMaxExpanded", value)}
              />
            )}
          </div>

          {showWhenMissing(initialSpecs?.baseIso, "baseIso") && (
            <BaseIsoInput
              value={currentSpecs?.baseIso}
              onChange={(value) => handleFieldChange("baseIso", value)}
              label={specLabel("baseIso", "Base ISO")}
              addLabel={tf("editGear.fields.addBaseIso", "Add base ISO")}
              removeLabel={tf(
                "editGear.fields.removeBaseIso",
                "Remove base ISO",
              )}
              helpText={tf(
                "editGear.fields.baseIsoHelp",
                "Add up to 3 native base ISO values.",
              )}
              invalidMessage={tf(
                "editGear.fields.baseIsoInvalid",
                "Enter a positive whole number.",
              )}
              disabled={baseIsoLocked}
              labelAdornment={
                baseIsoLocked ? (
                  <CompletedSpecLock message={completedSpecMessage} />
                ) : undefined
              }
            />
          )}

          {/* Rear Display Type */}
          {showWhenMissing(initialSpecs?.rearDisplayType) && (
            <div className="space-y-2">
              <Label htmlFor="rearDisplayType">
                {specLabel("rearDisplayType", "Rear Display Type")}
              </Label>
              <Select
                value={currentSpecs?.rearDisplayType ?? ""}
                onValueChange={(value) =>
                  handleFieldChange("rearDisplayType", value)
                }
              >
                <SelectTrigger id="rearDisplayType" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.selectDisplayType",
                      "Select display type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {tf("specRegistry.shared.none", "None")}
                  </SelectItem>
                  <SelectItem value="fixed">
                    {tf("specRegistry.shared.fixed", "Fixed")}
                  </SelectItem>
                  <SelectItem value="single_axis_tilt">
                    {tf(
                      "specRegistry.shared.singleAxisTilt",
                      "Single-axis tilt",
                    )}
                  </SelectItem>
                  <SelectItem value="dual_axis_tilt">
                    {tf("specRegistry.shared.dualAxisTilt", "Dual-axis tilt")}
                  </SelectItem>
                  <SelectItem value="fully_articulated">
                    {tf(
                      "specRegistry.shared.fullyArticulated",
                      "Fully articulated",
                    )}
                  </SelectItem>
                  <SelectItem value="four_axis_tilt_flip">
                    {tf(
                      "specRegistry.shared.fourAxisTiltFlip",
                      "4 Axis Tilt-Flip",
                    )}
                  </SelectItem>
                  <SelectItem value="other">
                    {tf("specRegistry.shared.other", "Other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rear Display Resolution (million dots) */}
          {showWhenMissing(initialSpecs?.rearDisplayResolutionMillionDots) && (
            <NumberInput
              id="rearDisplayResolutionMillionDots"
              label={specLabel(
                "rearDisplayResolutionMillionDots",
                "Rear Display Resolution",
              )}
              suffix="million dots"
              value={
                currentSpecs?.rearDisplayResolutionMillionDots != null
                  ? Number(currentSpecs.rearDisplayResolutionMillionDots)
                  : null
              }
              onChange={(value) =>
                handleFieldChange("rearDisplayResolutionMillionDots", value)
              }
              placeholder={tf(
                "editGear.fields.rearDisplayResolutionPlaceholder",
                "e.g., 1.62",
              )}
              step={0.01}
              min={0}
            />
          )}

          {/* Rear Display Size (inches) */}
          {showWhenMissing(initialSpecs?.rearDisplaySizeInches) && (
            <NumberInput
              id="rearDisplaySizeInches"
              label={specLabel("rearDisplaySizeInches", "Rear Display Size")}
              suffix="inches"
              value={
                currentSpecs?.rearDisplaySizeInches != null
                  ? Number(currentSpecs.rearDisplaySizeInches)
                  : null
              }
              onChange={(value) =>
                handleFieldChange("rearDisplaySizeInches", value)
              }
              placeholder={tf("editGear.fields.inchesPlaceholder", "e.g., 3.2")}
              step={0.01}
              min={0}
            />
          )}

          {/* Viewfinder Type */}
          {showWhenMissing(initialSpecs?.viewfinderType) && (
            <div className="space-y-2">
              <Label htmlFor="viewfinderType">
                {specLabel("viewfinderType", "Viewfinder Type")}
              </Label>
              <Select
                value={currentSpecs?.viewfinderType ?? ""}
                onValueChange={(value) => {
                  handleFieldChange("viewfinderType", value);
                  if (!supportsViewfinderEyePoint(value)) {
                    handleFieldChange("viewfinderEyePointMm", null);
                  }
                }}
              >
                <SelectTrigger id="viewfinderType" className="w-full">
                  <SelectValue
                    placeholder={tf(
                      "editGear.fields.selectViewfinderType",
                      "Select viewfinder type",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {tf("specRegistry.shared.none", "None")}
                  </SelectItem>
                  <SelectItem value="optical">
                    {tf(
                      "editGear.options.viewfinderType.optical",
                      "OVF (Optical)",
                    )}
                  </SelectItem>
                  <SelectItem value="electronic">
                    {tf(
                      "editGear.options.viewfinderType.electronic",
                      "EVF (Electronic)",
                    )}
                  </SelectItem>
                  <SelectItem value="hybrid">
                    {tf("editGear.options.viewfinderType.hybrid", "Hybrid")}
                  </SelectItem>
                  <SelectItem value="other">
                    {tf("specRegistry.shared.other", "Other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Viewfinder Magnification (x) */}
          {(currentSpecs?.viewfinderType ?? "") !== "none" &&
            showWhenMissing(initialSpecs?.viewfinderMagnification) && (
              <NumberInput
                id="viewfinderMagnification"
                label={specLabel(
                  "viewfinderMagnification",
                  "Viewfinder Magnification",
                )}
                suffix="x"
                value={
                  currentSpecs?.viewfinderMagnification != null
                    ? Number(currentSpecs.viewfinderMagnification)
                    : null
                }
                onChange={(value) =>
                  handleFieldChange("viewfinderMagnification", value)
                }
                placeholder={tf(
                  "editGear.fields.magnificationPlaceholder",
                  "e.g., 0.80",
                )}
                step={0.01}
                min={0}
              />
            )}

          {showWhenMissing(initialSpecs?.viewfinderEyePointMm) && (
            <NumberInput
              id="viewfinderEyePointMm"
              label={specLabel("viewfinderEyePointMm", "Viewfinder Eye Point")}
              suffix="mm"
              value={
                currentSpecs?.viewfinderEyePointMm != null
                  ? Number(currentSpecs.viewfinderEyePointMm)
                  : null
              }
              onChange={(value) =>
                handleFieldChange("viewfinderEyePointMm", value)
              }
              placeholder={tf(
                "editGear.fields.viewfinderEyePointPlaceholder",
                "e.g., 21.00",
              )}
              step={0.01}
              min={0}
              max={999.99}
              disabled={
                !supportsViewfinderEyePoint(currentSpecs?.viewfinderType)
              }
            />
          )}

          {/* Viewfinder Resolution (million dots) */}
          {(currentSpecs?.viewfinderType ?? "") === "electronic" &&
            showWhenMissing(initialSpecs?.viewfinderResolutionMillionDots) && (
              <NumberInput
                id="viewfinderResolutionMillionDots"
                label={specLabel(
                  "viewfinderResolutionMillionDots",
                  "Viewfinder Resolution",
                )}
                suffix="million dots"
                value={
                  currentSpecs?.viewfinderResolutionMillionDots != null
                    ? Number(currentSpecs.viewfinderResolutionMillionDots)
                    : null
                }
                onChange={(value) =>
                  handleFieldChange("viewfinderResolutionMillionDots", value)
                }
                placeholder={tf(
                  "editGear.fields.viewfinderResolutionPlaceholder",
                  "e.g., 5.76",
                )}
                step={0.01}
                min={0}
              />
            )}

          {/* Has Top Display */}
          {showWhenMissing(initialSpecs?.hasTopDisplay) && (
            <BooleanInput
              id="hasTopDisplay"
              label={specLabel("hasTopDisplay", "Has Top Display")}
              allowNull
              showStateText
              checked={currentSpecs?.hasTopDisplay ?? null}
              onChange={(value) => handleFieldChange("hasTopDisplay", value)}
            />
          )}

          {/* Has Rear Touchscreen */}
          {showWhenMissing(initialSpecs?.hasRearTouchscreen) && (
            <BooleanInput
              id="hasRearTouchscreen"
              label={specLabel("hasRearTouchscreen", "Has Rear Touchscreen")}
              allowNull
              showStateText
              checked={currentSpecs?.hasRearTouchscreen ?? null}
              onChange={(value) =>
                handleFieldChange("hasRearTouchscreen", value)
              }
            />
          )}

          {/* Max Raw Bit Depth */}
          {showWhenMissing(initialSpecs?.maxRawBitDepth) && (
            <div className="space-y-2">
              <Label htmlFor="maxRawBitDepth">
                {specLabel("maxRawBitDepth", "Max Raw Bit Depth")}
              </Label>
              <Select
                value={currentSpecs?.maxRawBitDepth ?? ""}
                onValueChange={(value) =>
                  handleFieldChange("maxRawBitDepth", value)
                }
              >
                <SelectTrigger id="maxRawBitDepth" className="w-full">
                  <SelectValue
                    placeholder={specLabel(
                      "maxRawBitDepth",
                      "Max Raw Bit Depth",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {ENUMS.raw_bit_depth_enum.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type} bit
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Has Ibis */}
          {currentSpecs?.cameraType !== "dslr" &&
            showWhenMissing(initialSpecs?.hasIbis, "hasIbis") && (
              <BooleanInput
                id="hasIbis"
                label={specLabel("hasIbis", "Has IBIS (Physical)")}
                checked={currentSpecs?.hasIbis ?? null}
                allowNull
                showStateText
                onChange={(value) => handleFieldChange("hasIbis", value)}
              />
            )}

          {/* Has Electronic Vibration Reduction */}
          {showWhenMissing(initialSpecs?.hasElectronicVibrationReduction) && (
            <BooleanInput
              id="hasElectronicVibrationReduction"
              label={specLabel(
                "hasElectronicVibrationReduction",
                "Has Electronic VR (Digital)",
              )}
              checked={currentSpecs?.hasElectronicVibrationReduction ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasElectronicVibrationReduction", value)
              }
            />
          )}

          {/* CIPA Stabilization Rating Stops */}
          {showWhenMissing(initialSpecs?.cipaStabilizationRatingStops) && (
            <NumberInput
              id="cipaStabilizationRatingStops"
              label={specLabel(
                "cipaStabilizationRatingStops",
                "CIPA Stabilization Rating Stops",
              )}
              value={numOrNull(currentSpecs?.cipaStabilizationRatingStops)}
              onChange={(value) =>
                handleFieldChange("cipaStabilizationRatingStops", value)
              }
              placeholder={tf("editGear.fields.stopsPlaceholder", "e.g., 3.0")}
              min={0}
              max={10}
              step={0.1}
              suffix="stops"
            />
          )}

          {/* Has Pixel Shift Shooting */}
          {showWhenMissing(initialSpecs?.hasPixelShiftShooting) && (
            <BooleanInput
              id="hasPixelShiftShooting"
              label={specLabel(
                "hasPixelShiftShooting",
                "Has Pixel Shift Shooting",
              )}
              checked={currentSpecs?.hasPixelShiftShooting ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasPixelShiftShooting", value)
              }
            />
          )}

          {/* Has Anti Aliasing Filter */}
          {showWhenMissing(initialSpecs?.hasAntiAliasingFilter) && (
            <BooleanInput
              id="hasAntiAliasingFilter"
              label={specLabel(
                "hasAntiAliasingFilter",
                "Has Anti Aliasing Filter",
              )}
              checked={currentSpecs?.hasAntiAliasingFilter ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasAntiAliasingFilter", value)
              }
            />
          )}

          {/* Card Slots Manager */}
          {(() => {
            const hadSlots = Array.isArray(initialGearItem?.cameraCardSlots)
              ? initialGearItem.cameraCardSlots.length > 0
              : false;
            if (showMissingOnly && hadSlots) return null;
            return (
              <CardSlotsManager
                value={gearItem.cameraCardSlots as CardSlot[] | undefined}
                onChange={(slots) =>
                  onChangeTopLevel?.("cameraCardSlots", slots)
                }
              />
            );
          })()}

          {/* Processor Name */}
          {showWhenMissing(initialSpecs?.processorName) && (
            <div className="space-y-2">
              <Label htmlFor="processorName">
                {specLabel("processorName", "Processor Name")}
              </Label>
              <Input
                id="processorName"
                value={currentSpecs?.processorName ?? ""}
                onChange={(e) =>
                  handleFieldChange("processorName", e.target.value)
                }
              />
            </div>
          )}

          {/* Has Weather Sealing */}
          {showWhenMissing(initialSpecs?.hasWeatherSealing) && (
            <BooleanInput
              id="hasWeatherSealing"
              label={specLabel("hasWeatherSealing", "Has Weather Sealing")}
              checked={currentSpecs?.hasWeatherSealing ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasWeatherSealing", value)
              }
            />
          )}

          {/* Has Autofocus */}
          {showWhenMissing(initialSpecs?.hasAutofocus, "hasAutofocus") && (
            <BooleanInput
              id="hasAutofocus"
              label={specLabel("hasAutofocus", "Has Autofocus")}
              checked={currentSpecs?.hasAutofocus ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasAutofocus", value)}
            />
          )}

          {/* Autofocus-dependent fields remain visible but disabled until
              autofocus is confirmed as available. */}
          {showWhenMissing(initialSpecs?.focusPoints) && (
            <NumberInput
              id="focusPoints"
              label={specLabel("focusPoints", "Focus Points")}
              value={currentSpecs?.focusPoints ?? null}
              onChange={(value) => handleFieldChange("focusPoints", value)}
              disabled={currentSpecs?.hasAutofocus !== true}
            />
          )}

          {/* AF Area Modes */}
          {/* TODO: add a way for creating new af area modes (review plan)*/}
          {showWhenMissing(initialSpecs?.afAreaModes) && (
            <div id="afAreaModes" className="space-y-2">
              <Label htmlFor="afAreaModes">
                {specLabel("afAreaModes", "AF Area Modes")}
              </Label>
              <MultiSelect
                options={afAreaModeOptions}
                value={selectedAfAreaModeIds}
                onChange={(value) => handleFieldChange("afAreaModes", value)}
                disabled={currentSpecs?.hasAutofocus !== true}
              />
            </div>
          )}

          {/* AF Subject Categories */}
          {showWhenMissing(initialSpecs?.afSubjectCategories) && (
            <div id="afSubjectCategories" className="space-y-2">
              <Label htmlFor="afSubjectCategories">
                {specLabel("afSubjectCategories", "AF Subject Categories")}
              </Label>
              <MultiSelect
                options={afSubjectCategoryOptions}
                value={selectedAfSubjectCategories}
                onChange={(ids) =>
                  handleFieldChange("afSubjectCategories", ids)
                }
                disabled={currentSpecs?.hasAutofocus !== true}
              />
            </div>
          )}

          {/* Has Focus Peaking */}
          {showWhenMissing(initialSpecs?.hasFocusPeaking) && (
            <BooleanInput
              id="hasFocusPeaking"
              label={specLabel("hasFocusPeaking", "Has Focus Peaking")}
              checked={currentSpecs?.hasFocusPeaking ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasFocusPeaking", value)}
            />
          )}

          {/* Has Focus Bracketing */}
          {showWhenMissing(initialSpecs?.hasFocusBracketing) && (
            <BooleanInput
              id="hasFocusBracketing"
              label={specLabel("hasFocusBracketing", "Has Focus Bracketing")}
              checked={currentSpecs?.hasFocusBracketing ?? null}
              allowNull
              showStateText
              disabled={currentSpecs?.hasAutofocus !== true}
              onChange={(value) =>
                handleFieldChange("hasFocusBracketing", value)
              }
            />
          )}

          {/* Shutter Speed Max */}
          {showWhenMissing(initialSpecs?.shutterSpeedMax) && (
            <NumberInput
              id="shutterSpeedMax"
              label={specLabel("shutterSpeedMax", "Longest Shutter Speed")}
              suffix="sec."
              value={currentSpecs?.shutterSpeedMax ?? null}
              onChange={(value) => handleFieldChange("shutterSpeedMax", value)}
            />
          )}

          {/* Shutter Speed Min */}
          {showWhenMissing(initialSpecs?.shutterSpeedMin) && (
            <NumberInput
              id="shutterSpeedMin"
              label={specLabel("shutterSpeedMin", "Shortest Shutter Speed")}
              prefix="1/"
              value={currentSpecs?.shutterSpeedMin ?? null}
              onChange={(value) => handleFieldChange("shutterSpeedMin", value)}
            />
          )}

          {/* Flash Sync Speed */}
          {showWhenMissing(initialSpecs?.flashSyncSpeed) && (
            <NumberInput
              id="flashSyncSpeed"
              label={specLabel("flashSyncSpeed", "Flash Sync Speed")}
              icon={<ZapIcon />}
              prefix="1/"
              value={currentSpecs?.flashSyncSpeed}
              onChange={(value) => handleFieldChange("flashSyncSpeed", value)}
            />
          )}

          {/* Has Silent Shooting Available */}
          {showWhenMissing(initialSpecs?.hasSilentShootingAvailable) && (
            <BooleanInput
              id="hasSilentShootingAvailable"
              label={specLabel(
                "hasSilentShootingAvailable",
                "Has Silent Shooting Available",
              )}
              checked={currentSpecs?.hasSilentShootingAvailable ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasSilentShootingAvailable", value)
              }
            />
          )}

          {/* Available Shutter Types */}
          {showWhenMissing(initialSpecs?.availableShutterTypes) && (
            <div id="availableShutterTypes" className="space-y-2">
              <Label htmlFor="availableShutterTypes">
                {specLabel("availableShutterTypes", "Available Shutter Types")}
              </Label>
              <MultiSelect
                inDialog
                options={ENUMS.shutter_types_enum.map((type) => ({
                  id: type,
                  name:
                    normalizeShutterTypeKey(type) != null
                      ? getShutterTypeLabel(normalizeShutterTypeKey(type)!)
                      : type,
                }))}
                value={currentSpecs?.availableShutterTypes ?? []}
                onChange={(value: string[]) =>
                  handleFieldChange("availableShutterTypes", value)
                }
              />
            </div>
          )}

          {/* Max Continuous FPS */}
          {(showWhenMissing(initialSpecs?.maxFpsRaw) ||
            showWhenMissing(initialSpecs?.maxFpsJpg)) && (
            <div id="maxFpsByShutter" className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>
                  {tf(
                    "editGear.fields.maxContinuousFpsPhoto",
                    "Max Continuous FPS (Photo)",
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Switch
                    id="usePerShutterFps"
                    checked={usePerShutterFps}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setUsePerShutterFps(enabled);
                      if (!enabled) {
                        handleFieldChange("maxFpsByShutter", null);
                      }
                    }}
                  />
                  <Label
                    htmlFor="usePerShutterFps"
                    className="text-muted-foreground cursor-pointer text-sm"
                  >
                    {tf(
                      "editGear.fields.usePerShutterInputs",
                      "Use per-shutter inputs",
                    )}
                  </Label>
                </div>
              </div>

              {!usePerShutterFps && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <NumberInput
                      id="maxFpsRaw"
                      label={tf("editGear.fields.maxFpsRaw", "Max FPS (RAW)")}
                      value={
                        currentSpecs?.maxFpsRaw != null
                          ? parseFloat(currentSpecs.maxFpsRaw)
                          : null
                      }
                      onChange={(value) =>
                        handleFieldChange("maxFpsRaw", value)
                      }
                      placeholder={tf(
                        "editGear.fields.fpsPlaceholder",
                        "e.g., 20.0",
                      )}
                      min={0}
                      max={120}
                      step={0.1}
                      suffix="fps"
                    />
                  </div>
                  <div className="flex-1">
                    <NumberInput
                      id="maxFpsJpg"
                      label={tf("editGear.fields.maxFpsJpg", "Max FPS (JPG)")}
                      value={
                        currentSpecs?.maxFpsJpg != null
                          ? parseFloat(currentSpecs.maxFpsJpg)
                          : null
                      }
                      onChange={(value) =>
                        handleFieldChange("maxFpsJpg", value)
                      }
                      placeholder={tf(
                        "editGear.fields.fpsPlaceholder",
                        "e.g., 20.0",
                      )}
                      min={0}
                      max={120}
                      step={0.1}
                      suffix="fps"
                    />
                  </div>
                </div>
              )}

              {usePerShutterFps && (
                <FpsPerShutterInput
                  availableShutterTypes={
                    currentSpecs?.availableShutterTypes ?? []
                  }
                  value={currentSpecs?.maxFpsByShutter}
                  onChange={(nextValue) =>
                    handleFieldChange("maxFpsByShutter", nextValue)
                  }
                  onHeadlineChange={(maxRaw, maxJpg) => {
                    if (maxRaw !== currentSpecs?.maxFpsRaw) {
                      handleFieldChange("maxFpsRaw", maxRaw);
                    }
                    if (maxJpg !== currentSpecs?.maxFpsJpg) {
                      handleFieldChange("maxFpsJpg", maxJpg);
                    }
                  }}
                  isVisible
                  getLabel={getShutterTypeLabel}
                  tf={tf}
                />
              )}
            </div>
          )}

          {/* CIPA Battery Shots Per Charge */}
          {showWhenMissing(initialSpecs?.internalStorageGb) && (
            <NumberInput
              id="internalStorageGb"
              label={specLabel("internalStorageGb", "Internal Storage")}
              suffix="GB"
              value={
                currentSpecs?.internalStorageGb != null
                  ? Number(currentSpecs.internalStorageGb)
                  : null
              }
              onChange={(value) =>
                handleFieldChange("internalStorageGb", value)
              }
              placeholder={tf(
                "editGear.fields.storagePlaceholder",
                "e.g., 512",
              )}
              min={0}
              step={0.1}
            />
          )}

          {showWhenMissing(initialSpecs?.cipaBatteryShotsPerCharge) && (
            <NumberInput
              id="cipaBatteryShotsPerCharge"
              label={specLabel(
                "cipaBatteryShotsPerCharge",
                "CIPA Battery Shots Per Charge",
              )}
              icon={<BatteryFullIcon />}
              value={currentSpecs?.cipaBatteryShotsPerCharge}
              onChange={(value) =>
                handleFieldChange("cipaBatteryShotsPerCharge", value)
              }
            />
          )}

          {/* Supported Batteries */}
          {showWhenMissing(initialSpecs?.supportedBatteries) && (
            <div
              id="supportedBatteries"
              data-force-ring-container
              className="space-y-2"
            >
              <MultiTextInput
                id="supportedBatteries"
                label={specLabel("supportedBatteries", "Supported Batteries")}
                values={
                  Array.isArray(currentSpecs?.supportedBatteries)
                    ? currentSpecs.supportedBatteries.filter(
                        (x): x is string => typeof x === "string",
                      )
                    : []
                }
                onChange={(value) =>
                  handleFieldChange("supportedBatteries", value)
                }
                placeholder={tf(
                  "editGear.fields.batteryPlaceholder",
                  "e.g., NP-FZ100",
                )}
              />
            </div>
          )}

          {/* USB Charging */}
          {showWhenMissing(initialSpecs?.usbCharging) && (
            <BooleanInput
              id="usbCharging"
              label={specLabel("usbCharging", "USB Charging")}
              checked={currentSpecs?.usbCharging ?? null}
              allowNull
              showStateText
              tooltip={tf(
                "editGear.fields.usbChargingTooltip",
                "Camera is able to charge its inserted batteries via USB",
              )}
              onChange={(value) => handleFieldChange("usbCharging", value)}
            />
          )}

          {/* USB Power Delivery */}
          {showWhenMissing(initialSpecs?.usbPowerDelivery) && (
            <BooleanInput
              id="usbPowerDelivery"
              label={specLabel("usbPowerDelivery", "USB Power Delivery")}
              checked={currentSpecs?.usbPowerDelivery ?? null}
              allowNull
              showStateText
              tooltip={tf(
                "editGear.fields.usbPowerDeliveryTooltip",
                "Camera is able to operate while plugged into USB and will draw less or no power from the battery",
              )}
              onChange={(value) => handleFieldChange("usbPowerDelivery", value)}
            />
          )}

          {/* Has Video */}
          {showWhenMissing(initialSpecs?.hasVideo, "hasVideo") && (
            <BooleanInput
              id="hasVideo"
              label={specLabel("hasVideo", "Has Video")}
              checked={currentSpecs?.hasVideo ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasVideo", value)}
            />
          )}

          {/* Video-dependent fields remain visible but disabled until video
              support is confirmed as available. */}
          {/* Has Log Color Profile */}
          {showWhenMissing(initialSpecs?.hasLogColorProfile) && (
            <BooleanInput
              id="hasLogColorProfile"
              label={specLabel("hasLogColorProfile", "Has Log Color Profile")}
              checked={currentSpecs?.hasLogColorProfile ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasLogColorProfile", value)
              }
            />
          )}

          {/* Has 10 Bit Video */}
          {showWhenMissing(initialSpecs?.has10BitVideo) && (
            <BooleanInput
              id="has10BitVideo"
              label={specLabel("has10BitVideo", "Has 10 Bit Video")}
              checked={currentSpecs?.has10BitVideo ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("has10BitVideo", value)}
            />
          )}

          {/* Has 12 Bit Video */}
          {showWhenMissing(initialSpecs?.has12BitVideo) && (
            <BooleanInput
              id="has12BitVideo"
              label={specLabel("has12BitVideo", "Has 12 Bit Video")}
              checked={currentSpecs?.has12BitVideo ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("has12BitVideo", value)}
            />
          )}

          {/* Has Open Gate Video */}
          {showWhenMissing(initialSpecs?.hasOpenGateVideo) && (
            <BooleanInput
              id="hasOpenGateVideo"
              label={specLabel("hasOpenGateVideo", "Has Open Gate Video")}
              checked={currentSpecs?.hasOpenGateVideo ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasOpenGateVideo", value)}
            />
          )}

          {/* Supports External Recording */}
          {showWhenMissing(initialSpecs?.supportsExternalRecording) && (
            <BooleanInput
              id="supportsExternalRecording"
              label={specLabel(
                "supportsExternalRecording",
                "Supports External Recording",
              )}
              checked={currentSpecs?.supportsExternalRecording ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("supportsExternalRecording", value)
              }
            />
          )}

          {/* Supports Recording to Drive */}
          {showWhenMissing(initialSpecs?.supportsRecordToDrive) && (
            <BooleanInput
              id="supportsRecordToDrive"
              label={specLabel(
                "supportsRecordToDrive",
                "Supports Recording to Drive",
              )}
              checked={currentSpecs?.supportsRecordToDrive ?? null}
              disabled={!canEditVideo}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("supportsRecordToDrive", value)
              }
            />
          )}

          {shouldShowVideoModes && (
            <VideoModesManager
              value={gearItem.videoModes ?? []}
              initialModes={initialGearItem?.videoModes ?? []}
              disabled={!canEditVideo}
              onChange={(modes) => onChangeTopLevel?.("videoModes", modes)}
            />
          )}

          {/* Has Intervalometer */}
          {showWhenMissing(initialSpecs?.hasIntervalometer) && (
            <BooleanInput
              id="hasIntervalometer"
              label={specLabel("hasIntervalometer", "Has Intervalometer")}
              checked={currentSpecs?.hasIntervalometer ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasIntervalometer", value)
              }
            />
          )}

          {/* Has Self Timer */}
          {showWhenMissing(initialSpecs?.hasSelfTimer) && (
            <BooleanInput
              id="hasSelfTimer"
              label={specLabel("hasSelfTimer", "Has Self Timer")}
              checked={currentSpecs?.hasSelfTimer ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasSelfTimer", value)}
            />
          )}

          {/* Has Built In Flash */}
          {showWhenMissing(initialSpecs?.hasBuiltInFlash) && (
            <BooleanInput
              id="hasBuiltInFlash"
              label={specLabel("hasBuiltInFlash", "Has Built In Flash")}
              checked={currentSpecs?.hasBuiltInFlash ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasBuiltInFlash", value)}
            />
          )}

          {/* Has Hot Shoe */}
          {showWhenMissing(initialSpecs?.hasHotShoe) && (
            <BooleanInput
              id="hasHotShoe"
              label={specLabel("hasHotShoe", "Has Hot Shoe")}
              checked={currentSpecs?.hasHotShoe ?? null}
              allowNull
              showStateText
              onChange={(value) => handleFieldChange("hasHotShoe", value)}
            />
          )}

          {/* Has Illuminated Buttons */}
          {showWhenMissing(initialSpecs?.hasIlluminatedButtons) && (
            <BooleanInput
              id="hasIlluminatedButtons"
              label={specLabel(
                "hasIlluminatedButtons",
                "Has Illuminated Buttons",
              )}
              checked={currentSpecs?.hasIlluminatedButtons ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasIlluminatedButtons", value)
              }
            />
          )}

          {/* Has USB File Transfer */}
          {showWhenMissing(initialSpecs?.hasUsbFileTransfer) && (
            <BooleanInput
              id="hasUsbFileTransfer"
              label={specLabel("hasUsbFileTransfer", "Has USB File Transfer")}
              checked={currentSpecs?.hasUsbFileTransfer ?? null}
              allowNull
              showStateText
              onChange={(value) =>
                handleFieldChange("hasUsbFileTransfer", value)
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(CameraFieldsComponent);
