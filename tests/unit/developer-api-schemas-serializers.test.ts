import { describe, expect, it } from "vitest";
import { DeveloperApiError } from "~/server/developer-api/errors";
import {
  serializeDeveloperCatalogData,
  serializeDeveloperApiSpecs,
  serializeGear,
  serializeSearchResponse,
  serializeSuggestions,
} from "~/server/developer-api/serializers";
import {
  parseSearchParams,
  parseSpecSelectors,
  parseSuggestionParams,
} from "~/server/developer-api/schemas";

describe("developer API request schemas", () => {
  it("uses bounded defaults for search", () => {
    expect(parseSearchParams(new URLSearchParams("q=Nikon+Z6"))).toEqual({
      query: "Nikon Z6",
      page: 1,
      limit: 20,
    });
  });

  it("rejects invalid public query values", () => {
    expect(() =>
      parseSearchParams(new URLSearchParams("q=x&limit=26")),
    ).toThrow(DeveloperApiError);
    expect(() =>
      parseSuggestionParams(new URLSearchParams("q=Z6&region=CA")),
    ).toThrow(DeveloperApiError);
    expect(() => parseSpecSelectors(new URLSearchParams())).toThrow(
      DeveloperApiError,
    );
  });

  it("accepts the US suggestion region", () => {
    expect(
      parseSuggestionParams(new URLSearchParams("q=Rokinon&region=US")),
    ).toEqual({ query: "Rokinon", limit: 8, region: "US" });
  });

  it("parses bounded spec field and category selectors", () => {
    expect(
      parseSpecSelectors(
        new URLSearchParams("fields=camera.sensor,camera.sensor.isoRange"),
      ),
    ).toEqual(["camera.sensor", "camera.sensor.isoRange"]);
  });
});

describe("developer API serializers", () => {
  it("serializes only the lightweight catalog allowlist in slug order", () => {
    const catalog = serializeDeveloperCatalogData([
      {
        name: "Alpha",
        slug: "alpha",
        brandName: "Acme",
        gearType: "CAMERA",
        thumbnailUrl: "https://example.test/alpha.jpg",
        releaseDate: new Date("2024-06-24T00:00:00.000Z"),
        releaseDatePrecision: "DAY",
        announcedDate: null,
        announceDatePrecision: null,
        discontinuedDate: null,
        discontinuedDatePrecision: null,
        id: "internal-id",
        createdAt: new Date(),
      },
      {
        name: "Zulu",
        slug: "zulu",
        brandName: "Acme",
        gearType: "LENS",
        thumbnailUrl: null,
        releaseDate: null,
        releaseDatePrecision: null,
        announcedDate: new Date("2024-06-17T00:00:00.000Z"),
        announceDatePrecision: "DAY",
        discontinuedDate: new Date("2025-01-01T00:00:00.000Z"),
        discontinuedDatePrecision: "MONTH",
      },
    ] as never);

    expect(catalog).toEqual([
      {
        name: "Alpha",
        slug: "alpha",
        brandName: "Acme",
        gearType: "CAMERA",
        thumbnailUrl: "https://example.test/alpha.jpg",
        releaseDate: "2024-06-24T00:00:00.000Z",
        releaseDatePrecision: "DAY",
        announcedDate: null,
        announceDatePrecision: null,
        discontinuedDate: null,
        discontinuedDatePrecision: null,
      },
      {
        name: "Zulu",
        slug: "zulu",
        brandName: "Acme",
        gearType: "LENS",
        thumbnailUrl: null,
        releaseDate: null,
        releaseDatePrecision: null,
        announcedDate: "2024-06-17T00:00:00.000Z",
        announceDatePrecision: "DAY",
        discontinuedDate: "2025-01-01T00:00:00.000Z",
        discontinuedDatePrecision: "MONTH",
      },
    ]);
  });

  it("removes website-only smart actions from suggestions", () => {
    const response = serializeSuggestions([
      {
        id: "gear:1",
        kind: "camera",
        type: "gear",
        href: "/gear/nikon-z6-iii",
        title: "Nikon Z6 III",
        label: "Nikon Z6 III",
        gearId: "1",
        brandName: "Nikon",
        canonicalName: "Nikon Z6 III",
        localizedName: "Nikon Z6 III",
        matchedName: "Nikon Z6 III",
        matchSource: "canonical",
        isBestMatch: true,
        gearType: "CAMERA",
      },
      {
        id: "compare:1",
        kind: "smart-action",
        type: "smart-action",
        href: "/compare",
        title: "Compare",
        label: "Compare",
        action: "compare",
        compareSlugs: ["a", "b"],
        compareTitles: ["A", "B"],
      },
    ]);

    expect(response.data).toEqual([
      expect.objectContaining({
        kind: "gear",
        slug: "nikon-z6-iii",
        isBestMatch: true,
      }),
    ]);
  });

  it("serializes an exact allowlisted full-gear payload", () => {
    const response = serializeGear({
      id: "internal-id",
      internalOnly: "future database column",
      brandId: "brand-id",
      mountId: "legacy-mount",
      searchName: "nikon z6",
      slug: "nikon-z6",
      name: "Nikon Z6",
      modelNumber: "Z6",
      gearType: "CAMERA",
      publicationState: "PUBLISHED",
      notes: ["Internal editor note"],
      announcedDate: new Date("2023-10-01T00:00:00.000Z"),
      announceDatePrecision: "DAY",
      releaseDate: new Date("2024-01-01T00:00:00.000Z"),
      releaseDatePrecision: "DAY",
      discontinuedDate: new Date("2026-03-01T00:00:00.000Z"),
      discontinuedDatePrecision: "MONTH",
      thumbnailUrl: "https://example.test/front.jpg",
      topViewUrl: "https://example.test/top.jpg",
      rearViewUrl: "https://example.test/rear.jpg",
      leftViewUrl: "https://example.test/left.jpg",
      rightViewUrl: "https://example.test/right.jpg",
      widthMm: "134",
      mounts: [
        { value: "Nikon Z", shortName: "Z" },
        { value: "Leica L", shortName: "L" },
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      brands: {
        id: "brand-id",
        internalOnly: "future brand field",
        name: "Nikon",
        slug: "nikon",
        sortOrder: 1,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
      regionalAliases: [
        {
          gearId: "internal-id",
          region: "JP",
          name: "Nikon Z6 JP",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
      cameraSpecs: {
        gearId: "internal-id",
        internalOnly: "future camera spec field",
        sensorFormatId: "sensor-format-id",
        sensorFormat: {
          id: "sensor-format-id",
          slug: "full-frame",
          name: "Full Frame",
          cropFactor: "1.00",
        },
        resolutionMp: "24.5",
        isoMinExpanded: 50,
        isoMaxExpanded: 204800,
        baseIso: [800, 4000],
        hasAutofocus: true,
        hasVideo: true,
        maxFpsByShutter: { mechanical: { raw: 14, jpg: 14 } },
        extra: { internalOnly: true },
        afAreaModes: [
          {
            id: "af-mode-id",
            brandId: "brand-id",
            searchName: "single point",
            name: "Single-point AF",
            description: "Public description",
            aliases: ["single point", 42],
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
            updatedAt: new Date("2024-01-02T00:00:00.000Z"),
          },
        ],
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
      analogCameraSpecs: {
        gearId: "internal-id",
        cameraType: "slr",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
      lensSpecs: {
        gearId: "internal-id",
        imageCircleSizeId: "sensor-format-id",
        imageCircle: {
          id: "sensor-format-id",
          slug: "full-frame",
          name: "Full Frame",
          cropFactor: "1.00",
        },
        focalLengthMinMm: 24,
        extra: { internalOnly: true },
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
      fixedLensSpecs: {
        gearId: "internal-id",
        imageCircleSizeId: "sensor-format-id",
        imageCircle: null,
        focalLengthMinMm: 35,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
      cameraCardSlots: [
        {
          id: "card-slot-id",
          internalOnly: "future card-slot field",
          gearId: "internal-id",
          slotIndex: 1,
          supportedFormFactors: ["sd"],
          supportedBuses: ["uhs_ii"],
          supportedSpeedClasses: ["v90"],
          notes: "Internal slot note",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
      videoModes: [
        {
          id: "video-mode-1",
          gearId: "internal-id",
          resolutionLabel: "4K",
          fps: 60,
        },
      ],
      rawSamples: [
        {
          id: "sample-1",
          internalOnly: "future sample field",
          fileUrl: "https://example.test/sample.nef",
          originalFilename: "sample.nef",
          contentType: "image/x-nikon-nef",
          sizeBytes: 123,
          uploadedByUserId: "user-1",
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
      colorways: [
        {
          id: "colorway-id",
          internalOnly: "future colorway field",
          gearId: "internal-id",
          name: "Black",
          slug: "black",
          swatchColorA: "#000000",
          swatchColorB: "#111111",
          sortOrder: 1,
          frontImageUrl: "https://example.test/black-front.jpg",
          topViewUrl: null,
          rearViewUrl: null,
          leftViewUrl: "https://example.test/black-left.jpg",
          rightViewUrl: null,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      ],
    } as never);

    expect(response.data).toEqual({
      slug: "nikon-z6",
      name: "Nikon Z6",
      modelNumber: "Z6",
      gearType: "CAMERA",
      announcedDate: "2023-10-01T00:00:00.000Z",
      announceDatePrecision: "DAY",
      releaseDate: "2024-01-01T00:00:00.000Z",
      releaseDatePrecision: "DAY",
      discontinuedDate: "2026-03-01T00:00:00.000Z",
      discontinuedDatePrecision: "MONTH",
      thumbnailUrl: "https://example.test/front.jpg",
      topViewUrl: "https://example.test/top.jpg",
      rearViewUrl: "https://example.test/rear.jpg",
      leftViewUrl: "https://example.test/left.jpg",
      rightViewUrl: "https://example.test/right.jpg",
      widthMm: "134",
      estimatedUsedPrice: null,
      brands: { name: "Nikon", slug: "nikon" },
      mounts: [
        { value: "Nikon Z", shortName: "Z" },
        { value: "Leica L", shortName: "L" },
      ],
      regionalAliases: [{ region: "JP", name: "Nikon Z6 JP" }],
      cameraSpecs: {
        sensorFormat: {
          slug: "full-frame",
          name: "Full Frame",
          cropFactor: "1.00",
        },
        resolutionMp: "24.5",
        isoMinExpanded: 50,
        isoMaxExpanded: 204800,
        baseIso: [800, 4000],
        hasAutofocus: true,
        hasVideo: true,
        maxFpsByShutter: { mechanical: { raw: 14, jpg: 14 } },
        afAreaModes: [
          {
            name: "Single-point AF",
            description: "Public description",
            aliases: ["single point"],
          },
        ],
      },
      analogCameraSpecs: { cameraType: "slr" },
      lensSpecs: {
        imageCircle: {
          slug: "full-frame",
          name: "Full Frame",
          cropFactor: "1.00",
        },
        focalLengthMinMm: 24,
      },
      fixedLensSpecs: { imageCircle: null, focalLengthMinMm: 35 },
      cameraCardSlots: [
        {
          slotIndex: 1,
          supportedFormFactors: ["sd"],
          supportedBuses: ["uhs_ii"],
          supportedSpeedClasses: ["v90"],
        },
      ],
      colorways: [
        {
          name: "Black",
          slug: "black",
          swatchColorA: "#000000",
          swatchColorB: "#111111",
          sortOrder: 1,
          frontImageUrl: "https://example.test/black-front.jpg",
          topViewUrl: null,
          rearViewUrl: null,
          leftViewUrl: "https://example.test/black-left.jpg",
          rightViewUrl: null,
        },
      ],
    });
    expect(response.data).not.toHaveProperty("id");
    expect(response.data).not.toHaveProperty("internalOnly");
    expect(response.data).not.toHaveProperty("createdAt");
    expect(response.data).not.toHaveProperty("updatedAt");
    expect(response.data).not.toHaveProperty("searchName");
    expect(response.data).not.toHaveProperty("publicationState");
    expect(response.data).not.toHaveProperty("notes");
    expect(response.data).not.toHaveProperty("genres");
    expect(response.data).not.toHaveProperty("mountIds");
    expect(response.data).not.toHaveProperty("mounts.0.id");
    expect(response.data).not.toHaveProperty("videoModes");
    expect(response.data).not.toHaveProperty("brands.id");
    expect(response.data).not.toHaveProperty("brands.internalOnly");
    expect(response.data).not.toHaveProperty("brands.createdAt");
    expect(response.data).not.toHaveProperty("regionalAliases.0.gearId");
    expect(response.data).not.toHaveProperty("cameraSpecs.createdAt");
    expect(response.data).not.toHaveProperty("cameraSpecs.sensorFormatId");
    expect(response.data).not.toHaveProperty("cameraSpecs.sensorFormat.id");
    expect(response.data).not.toHaveProperty("cameraSpecs.extra");
    expect(response.data).not.toHaveProperty("cameraSpecs.internalOnly");
    expect(response.data).not.toHaveProperty("cameraSpecs.afAreaModes.0.id");
    expect(response.data).not.toHaveProperty("lensSpecs.imageCircle.id");
    expect(response.data).not.toHaveProperty("cameraCardSlots.0.id");
    expect(response.data).not.toHaveProperty("cameraCardSlots.0.updatedAt");
    expect(response.data).not.toHaveProperty("cameraCardSlots.0.notes");
    expect(response.data).not.toHaveProperty("cameraCardSlots.0.internalOnly");
    expect(response.data).not.toHaveProperty("rawSamples");
    expect(response.data).not.toHaveProperty("colorways.0.gearId");
    expect(response.data).not.toHaveProperty("colorways.0.internalOnly");
  });

  it("uses stable empty or null values for absent full-gear relations", () => {
    const response = serializeGear({
      slug: "nikon-z6",
      name: "Nikon Z6",
      gearType: "CAMERA",
      mounts: [],
    } as never);

    expect(response.data).toMatchObject({
      slug: "nikon-z6",
      name: "Nikon Z6",
      gearType: "CAMERA",
      brands: null,
      regionalAliases: [],
      cameraSpecs: null,
      analogCameraSpecs: null,
      lensSpecs: null,
      fixedLensSpecs: null,
      cameraCardSlots: [],
      colorways: [],
    });
  });

  it("exposes estimated used price while retaining the legacy MPB field", () => {
    const response = serializeGear({
      slug: "nikon-z6",
      name: "Nikon Z6",
      gearType: "CAMERA",
      mpbMaxPriceUsdCents: 219900,
      usedPriceProjection: {
        US: {
          low: 178300,
          typical: 178300,
          high: 178300,
          asOf: "2026-09-29T19:05:00.000Z",
          status: "current",
          sourceCount: 1,
          observationCount: 1,
          methodVersion: 1,
        },
      },
      mounts: [],
    } as never);

    expect(response.data).toMatchObject({
      estimatedUsedPrice: {
        US: {
          typical: 178300,
          methodVersion: 1,
        },
      },
      mpbMaxPriceUsdCents: 219900,
    });
  });

  it("allowlists regional aliases in search responses", () => {
    const response = serializeSearchResponse({
      results: [
        {
          id: "internal-id",
          slug: "nikon-z6",
          name: "Nikon Z6",
          brandName: "Nikon",
          mountValue: null,
          gearType: "CAMERA",
          isUnderConstruction: false,
          thumbnailUrl: null,
          regionalAliases: [
            {
              gearId: "internal-id",
              region: "JP",
              name: "Nikon Z6 JP",
              createdAt: new Date("2024-01-01T00:00:00.000Z"),
              updatedAt: new Date("2024-01-02T00:00:00.000Z"),
            },
          ],
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    expect(response.data[0]?.regionalAliases).toEqual([
      { region: "JP", name: "Nikon Z6 JP" },
    ]);
    expect(response.data[0]).not.toHaveProperty("regionalAliases.0.gearId");
    expect(response.data[0]).not.toHaveProperty("regionalAliases.0.createdAt");
  });

  it("includes estimated used price in search results", () => {
    const response = serializeSearchResponse({
      results: [
        {
          id: "internal-id",
          slug: "nikon-z6",
          name: "Nikon Z6",
          brandName: "Nikon",
          mountValue: null,
          gearType: "CAMERA",
          isUnderConstruction: false,
          thumbnailUrl: null,
          mpbMaxPriceUsdCents: 219900,
          usedPriceProjection: {
            US: {
              low: 178300,
              typical: 178300,
              high: 178300,
              asOf: "2026-09-29T19:05:00.000Z",
              status: "current",
              sourceCount: 1,
              observationCount: 1,
              methodVersion: 1,
            },
          },
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    expect(response.data[0]).toMatchObject({
      estimatedUsedPrice: {
        US: { typical: 178300 },
      },
      mpbMaxPriceUsdCents: 219900,
    });
  });

  it("serializes selected specs with structured raw values", () => {
    expect(
      serializeDeveloperApiSpecs([
        {
          id: "camera.sensor.isoRange",
          raw: { min: 100, max: 51200 },
          display: "ISO 100 - 51,200",
        },
      ]),
    ).toEqual({
      data: [
        {
          id: "camera.sensor.isoRange",
          raw: { min: 100, max: 51200 },
          display: "ISO 100 - 51,200",
        },
      ],
    });
  });
});
