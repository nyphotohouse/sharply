import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MOUNTS, SENSOR_FORMATS } from "~/lib/generated";
import {
  buildGearSpecsSections,
  buildEditSidebarSections,
  type SpecTranslator,
} from "~/lib/specs/registry";
import { createPriceView } from "~/lib/pricing/display-price";
import type { GearItem } from "~/types/gear";

function createTranslator(messages: Record<string, string>): SpecTranslator {
  const translator = ((key: string) => messages[key] ?? key) as SpecTranslator;
  translator.has = (key: string) => key in messages;
  return translator;
}

function createGearItem(overrides: Partial<GearItem>): GearItem {
  return {
    id: "gear-1",
    slug: "gear-1",
    name: "Gear 1",
    brandId: null,
    gearType: "CAMERA",
    mountId: null,
    mountIds: null,
    announcedDate: null,
    announceDatePrecision: null,
    releaseDate: null,
    releaseDatePrecision: null,
    discontinuedDate: null,
    discontinuedDatePrecision: null,
    regionalAliases: null,
    cameraSpecs: null,
    analogCameraSpecs: null,
    lensSpecs: null,
    fixedLensSpecs: null,
    cameraCardSlots: null,
    videoModes: null,
    rawSamples: null,
    ...overrides,
  } as GearItem;
}

describe("spec registry i18n", () => {
  it("localizes section titles, field labels, and shared registry values", () => {
    const translator = createTranslator({
      "specRegistry.sections.camera-sensor-shutter.title":
        "Sensor und Verschluss",
      "specRegistry.sections.camera-sensor-shutter.fields.hasIbis.label":
        "Hat IBIS",
      "specRegistry.shared.yes": "Ja",
    });

    const item = createGearItem({
      gearType: "CAMERA",
      cameraSpecs: {
        cameraType: "mirrorless",
        hasIbis: true,
      } as GearItem["cameraSpecs"],
    });

    const sections = buildGearSpecsSections(item, {
      locale: "de",
      t: translator,
    });
    const sensorSection = sections.find(
      (section) => section.id === "camera-sensor-shutter",
    );

    expect(sensorSection?.title).toBe("Sensor und Verschluss");
    const hasIbisRow = sensorSection?.data.find((row) => row.key === "hasIbis");

    expect(hasIbisRow).toMatchObject({
      key: "hasIbis",
      label: "Hat IBIS",
      value: "Ja",
      searchTerms: expect.arrayContaining(["Has IBIS"]),
    });
    expect(hasIbisRow?.label).not.toBe("Has IBIS");
  });

  it("shows the estimated used price before the legacy MPB fallback", () => {
    const translator = createTranslator({
      "specRegistry.sections.core.fields.estimatedUsedPrice.label":
        "Estimated Used Price",
      "specRegistry.sections.core.fields.mpbMaxPriceUsdCents.label":
        "MPB Max Price",
    });
    const item = createGearItem({
      mpbMaxPriceUsdCents: 219900,
      usedPriceProjection: {
        US: {
          low: 170000,
          typical: 178300,
          high: 185000,
          asOf: "2026-09-29T19:00:00.000Z",
          status: "stale",
          sourceCount: 1,
          observationCount: 1,
          methodVersion: 1,
        },
      },
    });

    const coreSection = buildGearSpecsSections(item, {
      locale: "en",
      t: translator,
    }).find((section) => section.id === "core");
    const row = coreSection?.data.find(
      (entry) => entry.key === "mpbMaxPriceUsdCents",
    );

    expect(row).toMatchObject({
      label: "Estimated Used Price",
      value: { props: { value: "~$1,783 USD" } },
    });

    const fallbackItem = createGearItem({ mpbMaxPriceUsdCents: 219900 });
    const fallbackCoreSection = buildGearSpecsSections(fallbackItem, {
      locale: "en",
      t: translator,
    }).find((section) => section.id === "core");
    const fallbackRow = fallbackCoreSection?.data.find(
      (entry) => entry.key === "mpbMaxPriceUsdCents",
    );

    expect(fallbackRow).toMatchObject({
      label: "MPB Max Price",
      value: "$2,199 USD",
    });

    const editorCoreSection = buildEditSidebarSections(item, {
      locale: "en",
      t: translator,
    }).find((section) => section.id === "core");
    expect(
      editorCoreSection?.fields.find(
        (field) => field.key === "mpbMaxPriceUsdCents",
      )?.label,
    ).toBe("MPB Max Price");
  });

  it("uses the active price market for the used-price spec row", () => {
    const item = createGearItem({
      mpbMaxPriceUsdCents: 219900,
      usedPriceProjection: {
        UK: {
          low: 170000,
          typical: 178300,
          high: 185000,
          asOf: "2026-09-29T19:00:00.000Z",
          status: "current",
          sourceCount: 1,
          observationCount: 1,
          methodVersion: 1,
        },
      },
    });

    const coreSection = buildGearSpecsSections(item, {
      locale: "en",
      priceView: createPriceView("UK"),
    }).find((section) => section.id === "core");
    const row = coreSection?.data.find(
      (entry) => entry.key === "mpbMaxPriceUsdCents",
    );

    expect(row?.label).toBe("Estimated Used Price");
    expect(row?.value).toMatchObject({
      props: { value: expect.stringContaining("£1,783") },
    });
  });

  it("falls back to inline English when translation keys are missing", () => {
    const item = createGearItem({
      gearType: "CAMERA",
      announcedDate: new Date("2020-01-02T00:00:00.000Z"),
      announceDatePrecision: "DAY",
      discontinuedDate: new Date("2024-06-01T00:00:00.000Z"),
      discontinuedDatePrecision: "MONTH",
    });

    const sections = buildGearSpecsSections(item, {
      locale: "fr",
      t: createTranslator({}),
    });
    const coreSection = sections.find((section) => section.id === "core");

    expect(coreSection?.title).toBe("Basic Information");
    expect(
      coreSection?.data.find((row) => row.key === "announcedDate")?.label,
    ).toBe("Announced Date");
    expect(
      coreSection?.data.find((row) => row.key === "discontinuedDate")?.label,
    ).toBe("Discontinued Date");
  });

  it("formats discontinued date with precision", () => {
    const item = createGearItem({
      discontinuedDate: new Date("2024-06-15T00:00:00.000Z"),
      discontinuedDatePrecision: "MONTH",
    });

    const sections = buildGearSpecsSections(item, {
      locale: "en",
      t: createTranslator({
        "specRegistry.sections.core.fields.discontinuedDate.label":
          "Discontinued Date",
      }),
    });
    const coreSection = sections.find((section) => section.id === "core");
    const discontinuedRow = coreSection?.data.find(
      (row) => row.key === "discontinuedDate",
    );

    expect(discontinuedRow?.label).toBe("Discontinued Date");
    expect(discontinuedRow?.value).toBe("June 2024");
  });

  it("formats translated full and partial expanded ISO ranges and hides empty values", () => {
    const translated = createTranslator({
      "specRegistry.sections.camera-sensor-shutter.fields.isoExpandedRange.label":
        "Erweiterter ISO-Bereich",
    });

    const fullSections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: {
          isoMinExpanded: 50,
          isoMaxExpanded: 204800,
        } as GearItem["cameraSpecs"],
      }),
      { locale: "de", t: translated },
    );
    const fullRow = fullSections
      .find((section) => section.id === "camera-sensor-shutter")
      ?.data.find((row) => row.key === "isoExpandedRange");

    expect(fullRow).toMatchObject({
      label: "Erweiterter ISO-Bereich",
      value: "ISO 50 - 204.800",
    });

    for (const [field, expected] of [
      ["isoMinExpanded", "ISO 50+"],
      ["isoMaxExpanded", "ISO ≤ 204,800"],
    ] as const) {
      const value = field === "isoMinExpanded" ? 50 : 204800;
      const partialSections = buildGearSpecsSections(
        createGearItem({
          cameraSpecs: { [field]: value } as unknown as GearItem["cameraSpecs"],
        }),
        { locale: "en" },
      );
      const partialRow = partialSections
        .find((section) => section.id === "camera-sensor-shutter")
        ?.data.find((row) => row.key === "isoExpandedRange");

      expect(partialRow?.value).toBe(expected);
    }

    const emptySections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: {
          isoMinExpanded: null,
          isoMaxExpanded: null,
        } as GearItem["cameraSpecs"],
      }),
    );

    expect(
      emptySections
        .flatMap((section) => section.data)
        .some((row) => row.key === "isoExpandedRange"),
    ).toBe(false);

    const fallbackSections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: { isoMinExpanded: 50 } as GearItem["cameraSpecs"],
      }),
      { locale: "fr", t: createTranslator({}) },
    );
    expect(
      fallbackSections
        .find((section) => section.id === "camera-sensor-shutter")
        ?.data.find((row) => row.key === "isoExpandedRange")?.label,
    ).toBe("Expanded ISO Range");
  });

  it("formats sorted base ISO values with localized separators and hides empty values", () => {
    const sections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: { baseIso: [12800, 800, 4000] } as GearItem["cameraSpecs"],
      }),
      {
        locale: "de",
        t: createTranslator({
          "specRegistry.sections.camera-sensor-shutter.fields.baseIso.label":
            "Basis-ISO",
        }),
      },
    );
    const row = sections
      .find((section) => section.id === "camera-sensor-shutter")
      ?.data.find((entry) => entry.key === "baseIso");

    expect(row).toMatchObject({
      label: "Basis-ISO",
      value: "800 / 4.000 / 12.800",
    });

    const empty = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: { baseIso: [] } as unknown as GearItem["cameraSpecs"],
      }),
    );
    expect(
      empty
        .flatMap((section) => section.data)
        .some((entry) => entry.key === "baseIso"),
    ).toBe(false);
  });

  it("uses the plural mount translation key when a lens has multiple mounts", () => {
    const [firstMount, secondMount] = MOUNTS;
    const translator = createTranslator({
      "specRegistry.sections.core.title": "Informations de base",
      "specRegistry.sections.core.fields.mounts.labelPlural": "Montures",
    });
    const item = createGearItem({
      gearType: "LENS",
      mountIds: [firstMount!.id, secondMount!.id],
    });

    const sections = buildGearSpecsSections(item, {
      locale: "fr",
      t: translator,
    });
    const coreSection = sections.find((section) => section.id === "core");
    const mountRow = coreSection?.data.find((row) => row.key === "mounts");

    expect(coreSection?.title).toBe("Informations de base");
    expect(mountRow?.label).toBe("Montures");
    expect(mountRow?.searchTerms).toEqual(
      expect.arrayContaining(["Mounts", "lens mount", "camera mount"]),
    );
  });

  it("localizes edit sidebar labels with the same fallback behavior", () => {
    const translator = createTranslator({
      "specRegistry.sections.core.title": "Grundinformationen",
      "specRegistry.sections.core.fields.announcedDate.label":
        "Ankündigungsdatum",
    });
    const item = createGearItem({
      announcedDate: new Date("2020-01-02T00:00:00.000Z"),
      announceDatePrecision: "DAY",
    });

    const sections = buildEditSidebarSections(item, {
      locale: "de",
      t: translator,
    });
    const coreSection = sections.find((section) => section.id === "core");

    expect(coreSection?.title).toBe("Grundinformationen");
    const announcedDateField = coreSection?.fields.find(
      (field) => field.key === "announcedDate",
    );

    expect(announcedDateField).toMatchObject({
      label: "Ankündigungsdatum",
      targetId: "announced-date",
    });
    expect(announcedDateField?.label).not.toBe("Announced Date");
  });

  it("omits fields managed outside the gear change form", () => {
    const sections = buildEditSidebarSections(
      createGearItem({
        regionalAliases: [
          {
            gearId: "gear-1",
            region: "US",
            name: "Regional Gear Name",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
      { locale: "en" },
    );

    expect(
      sections.flatMap((section) => section.fields).some(
        (field) => field.key === "regionalAliases",
      ),
    ).toBe(false);
  });

  it("renders yes-only booleans only when true", () => {
    const trueSections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          hasIlluminatedButtons: true,
        } as GearItem["cameraSpecs"],
      }),
      {
        locale: "en",
      },
    );
    const falseSections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          hasIlluminatedButtons: false,
        } as GearItem["cameraSpecs"],
      }),
      {
        locale: "en",
      },
    );
    const nullSections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          hasIlluminatedButtons: null,
        } as GearItem["cameraSpecs"],
      }),
      {
        locale: "en",
      },
    );

    const miscSection = trueSections.find(
      (section) => section.id === "camera-misc",
    );

    expect(miscSection?.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "hasIlluminatedButtons",
          label: "Has Illuminated Buttons",
          value: "Yes",
        }),
      ]),
    );
    expect(
      falseSections
        .flatMap((section) => section.data)
        .some((row) => row.key === "hasIlluminatedButtons"),
    ).toBe(false);
    expect(
      nullSections
        .flatMap((section) => section.data)
        .some((row) => row.key === "hasIlluminatedButtons"),
    ).toBe(false);
  });

  it("keeps an explicit no-viewfinder value in the specifications table", () => {
    const sections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          viewfinderType: "none",
        } as GearItem["cameraSpecs"],
      }),
    );

    expect(
      sections
        .flatMap((section) => section.data)
        .find((row) => row.key === "viewfinderType"),
    ).toMatchObject({
      label: "Viewfinder Type",
      value: "None",
    });
  });

  it("formats hybrid and other digital viewfinder types", () => {
    for (const [viewfinderType, expectedValue] of [
      ["hybrid", "Hybrid"],
      ["other", "Other"],
    ] as const) {
      const sections = buildGearSpecsSections(
        createGearItem({
          gearType: "CAMERA",
          cameraSpecs: {
            viewfinderType,
          } as GearItem["cameraSpecs"],
        }),
      );
      const cameraHardwareSection = sections.find(
        (section) => section.id === "camera-hardware",
      );

      expect(
        cameraHardwareSection?.data.find((row) => row.key === "viewfinderType"),
      ).toMatchObject({ value: expectedValue });
    }
  });

  it("formats digital and analog viewfinder eye point measurements", () => {
    const digitalSections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: {
          viewfinderType: "electronic",
          viewfinderEyePointMm: "21.1",
        } as GearItem["cameraSpecs"],
      }),
    );
    const analogSections = buildGearSpecsSections(
      createGearItem({
        gearType: "ANALOG_CAMERA",
        analogCameraSpecs: {
          viewfinderType: "pentaprism",
          viewfinderEyePointMm: "18",
        } as GearItem["analogCameraSpecs"],
      }),
    );

    expect(
      digitalSections
        .flatMap((section) => section.data)
        .find((row) => row.key === "viewfinderEyePointMm"),
    ).toMatchObject({ label: "Viewfinder Eye Point", value: "21.10 mm" });
    expect(
      analogSections
        .flatMap((section) => section.data)
        .find((row) => row.key === "viewfinderEyePointMm"),
    ).toMatchObject({ label: "Viewfinder Eye Point", value: "18.00 mm" });
  });

  it("formats viewfinder eye point measurements for the active locale", () => {
    const sections = buildGearSpecsSections(
      createGearItem({
        cameraSpecs: {
          viewfinderType: "electronic",
          viewfinderEyePointMm: "21.1",
        } as GearItem["cameraSpecs"],
      }),
      { locale: "de" },
    );

    expect(
      sections
        .flatMap((section) => section.data)
        .find((row) => row.key === "viewfinderEyePointMm")?.value,
    ).toBe("21,10 mm");
  });

  it("hides viewfinder eye point for unknown and no-viewfinder cameras", () => {
    for (const viewfinderType of [null, "none"] as const) {
      const sections = buildGearSpecsSections(
        createGearItem({
          cameraSpecs: {
            viewfinderType,
            viewfinderEyePointMm: "21",
          } as GearItem["cameraSpecs"],
        }),
      );
      expect(
        sections
          .flatMap((section) => section.data)
          .some((row) => row.key === "viewfinderEyePointMm"),
      ).toBe(false);
    }
  });

  it("keeps existing autofocus details visible while capability is unset", () => {
    const buildFocusRows = (hasAutofocus: boolean | null) =>
      buildGearSpecsSections(
        createGearItem({
          gearType: "CAMERA",
          cameraSpecs: {
            hasAutofocus,
            focusPoints: 693,
            afAreaModes: ["single_point"],
            afSubjectCategories: ["human"],
            hasFocusBracketing: true,
            hasFocusPeaking: true,
          } as unknown as GearItem["cameraSpecs"],
        }),
        { locale: "en" },
      )
        .find((section) => section.id === "camera-focus")
        ?.data.map((row) => row.key) ?? [];

    expect(buildFocusRows(null)).toEqual(
      expect.arrayContaining([
        "focusPoints",
        "afAreaModes",
        "afSubjectCategories",
        "hasFocusBracketing",
        "hasFocusPeaking",
      ]),
    );
    expect(buildFocusRows(true)).toEqual(
      expect.arrayContaining([
        "hasAutofocus",
        "focusPoints",
        "afAreaModes",
        "afSubjectCategories",
        "hasFocusBracketing",
      ]),
    );
    expect(buildFocusRows(false)).toEqual(
      expect.arrayContaining(["hasAutofocus", "hasFocusPeaking"]),
    );
    expect(buildFocusRows(false)).not.toEqual(
      expect.arrayContaining([
        "focusPoints",
        "afAreaModes",
        "afSubjectCategories",
        "hasFocusBracketing",
      ]),
    );

    const editFocusFields = buildEditSidebarSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: { hasAutofocus: false } as GearItem["cameraSpecs"],
      }),
      { locale: "en" },
    )
      .find((section) => section.id === "camera-focus")
      ?.fields.map((field) => field.key);

    expect(editFocusFields).toContain("hasAutofocus");
    expect(editFocusFields).not.toEqual(
      expect.arrayContaining([
        "focusPoints",
        "afAreaModes",
        "afSubjectCategories",
        "hasFocusBracketing",
      ]),
    );
  });

  it("uses hasVideo as an authoritative public visibility gate", () => {
    const buildVideoRows = (hasVideo: boolean | null) =>
      buildGearSpecsSections(
        createGearItem({
          gearType: "CAMERA",
          cameraSpecs: {
            hasVideo,
            hasLogColorProfile: true,
            has10BitVideo: true,
            has12BitVideo: true,
            hasOpenGateVideo: true,
            supportsExternalRecording: true,
            supportsRecordToDrive: true,
          } as GearItem["cameraSpecs"],
          videoModes: [
            {
              id: "video-mode-1",
              gearId: "gear-1",
              resolutionKey: "4k-uhd",
              resolutionLabel: "4K UHD",
              resolutionHorizontal: 3840,
              resolutionVertical: 2160,
              fps: 60,
              codecLabel: "H.265",
              bitDepth: 10,
              cropFactor: false,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
        { locale: "en" },
      )
        .find((section) => section.id === "camera-video")
        ?.data.map((row) => row.key) ?? [];

    expect(buildVideoRows(null)).toEqual(
      expect.arrayContaining([
        "videoSummary",
        "videoAvailableCodecs",
        "hasLogColorProfile",
        "has10BitVideo",
      ]),
    );
    expect(buildVideoRows(true)).toEqual(
      expect.arrayContaining(["hasVideo", "videoSummary", "has10BitVideo"]),
    );
    expect(buildVideoRows(false)).toEqual(["hasVideo"]);
  });

  it("hides internal storage when the stored value is zero", () => {
    const zeroSections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          internalStorageGb: "0",
        } as GearItem["cameraSpecs"],
      }),
      {
        locale: "en",
      },
    );
    const nonZeroSections = buildGearSpecsSections(
      createGearItem({
        gearType: "CAMERA",
        cameraSpecs: {
          internalStorageGb: "128",
        } as GearItem["cameraSpecs"],
      }),
      {
        locale: "en",
      },
    );

    expect(
      zeroSections
        .flatMap((section) => section.data)
        .some((row) => row.key === "internalStorageGb"),
    ).toBe(false);
    expect(
      nonZeroSections
        .flatMap((section) => section.data)
        .find((row) => row.key === "internalStorageGb"),
    ).toMatchObject({
      key: "internalStorageGb",
      label: "Internal Storage",
      value: "128 GB",
    });
  });

  it("formats weight grams with metric units", () => {
    const getWeightValue = (weightGrams: number | string | null | undefined) =>
      buildGearSpecsSections(
        createGearItem({
          weightGrams: weightGrams as unknown as GearItem["weightGrams"],
        }),
        {
          locale: "en",
        },
      )
        .find((section) => section.id === "core")
        ?.data.find((row) => row.key === "weightGrams")?.value;

    expect(getWeightValue(450)).toBe("450 g");
    expect(getWeightValue("999.5")).toBe("999.5 g");
    expect(getWeightValue(1000)).toBe("1 kg");
    expect(getWeightValue(12520)).toBe("12.52 kg");
    expect(getWeightValue("")).toBeUndefined();
    expect(getWeightValue(null)).toBeUndefined();
  });

  it("marks multi-mount lens weight and length as rounded approximations", () => {
    const [firstMount, secondMount] = MOUNTS;
    const item = createGearItem({
      gearType: "LENS",
      mountIds: [firstMount!.id, secondMount!.id],
      weightGrams: 450.6,
      depthMm: "84.5",
      widthMm: "72.4",
    });

    const coreSection = buildGearSpecsSections(item, { locale: "en" }).find(
      (section) => section.id === "core",
    );
    const weight = coreSection?.data.find((row) => row.key === "weightGrams");
    const dimensions = coreSection?.data.find(
      (row) => row.key === "dimensions",
    );

    expect(weight?.value).toBe("~451 g");
    expect(
      renderToStaticMarkup(dimensions?.value as React.ReactElement),
    ).toContain("~85");
    expect(
      renderToStaticMarkup(dimensions?.value as React.ReactElement),
    ).toContain(">72.4<");
  });

  it("keeps single-mount lens dimensions and weight precise", () => {
    const [mount] = MOUNTS;
    const item = createGearItem({
      gearType: "LENS",
      mountIds: [mount!.id],
      weightGrams: 450.6,
      depthMm: "84.5",
    });

    const coreSection = buildGearSpecsSections(item, { locale: "en" }).find(
      (section) => section.id === "core",
    );
    const weight = coreSection?.data.find((row) => row.key === "weightGrams");
    const dimensions = coreSection?.data.find(
      (row) => row.key === "dimensions",
    );

    expect(weight?.value).toBe("450.6 g");
    expect(
      renderToStaticMarkup(dimensions?.value as React.ReactElement),
    ).toContain("84.5");
  });

  it("renders analog max continuous fps without trailing .0 for whole numbers", () => {
    const sections = buildGearSpecsSections(
      createGearItem({
        gearType: "ANALOG_CAMERA",
        analogCameraSpecs: {
          hasContinuousDrive: true,
          maxContinuousFps: "3.0",
        } as GearItem["analogCameraSpecs"],
      }),
      {
        locale: "en",
      },
    );
    const analogSection = sections.find(
      (section) => section.id === "analog-camera",
    );

    expect(
      analogSection?.data.find((row) => row.key === "maxContinuousFps")?.value,
    ).toBe("3 FPS");
  });

  it("hides image circle as a separate integrated-lens row while preserving focal length equivalence", () => {
    const fixedLensMount = MOUNTS.find((mount) => mount.value === "fixed-lens");
    const apsC = SENSOR_FORMATS.find((format) => format.slug === "aps-c");
    const item = createGearItem({
      gearType: "CAMERA",
      mountIds: fixedLensMount ? [fixedLensMount.id] : null,
      cameraSpecs: {
        sensorFormatId: apsC?.id,
      } as GearItem["cameraSpecs"],
      fixedLensSpecs: {
        isPrime: true,
        focalLengthMinMm: 23,
        focalLengthMaxMm: 23,
        imageCircleSizeId: apsC?.id,
      } as GearItem["fixedLensSpecs"],
    });

    const sections = buildGearSpecsSections(item, {
      locale: "en",
    });
    const fixedLensSection = sections.find(
      (section) => section.id === "fixed-lens",
    );

    expect(
      fixedLensSection?.data.some((row) => row.key === "fixedImageCircleSize"),
    ).toBe(false);
    expect(
      fixedLensSection?.data.find((row) => row.key === "focalLength"),
    ).toEqual(
      expect.objectContaining({
        label: "Focal Length",
        value: expect.anything(),
      }),
    );
  });

  it("continues to show image circle for standalone lenses", () => {
    const apsC = SENSOR_FORMATS.find((format) => format.slug === "aps-c");
    const item = createGearItem({
      gearType: "LENS",
      lensSpecs: {
        isPrime: true,
        focalLengthMinMm: 35,
        focalLengthMaxMm: 35,
        imageCircleSizeId: apsC?.id,
      } as GearItem["lensSpecs"],
    });

    const sections = buildGearSpecsSections(item, {
      locale: "en",
    });
    const opticsSection = sections.find(
      (section) => section.id === "lens-optics",
    );

    expect(
      opticsSection?.data.find((row) => row.key === "imageCircleSize"),
    ).toEqual(
      expect.objectContaining({
        label: "Image Circle Size",
        value: "APS-C",
      }),
    );
  });
});
