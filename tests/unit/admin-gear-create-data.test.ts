import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_BASE_URL ??= "https://www.sharplyphoto.com";

const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertValues: [] as Array<{ table: unknown; payload: unknown }>,
}));

function createSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(() => {
    const result = dbState.selectResults.shift() ?? [];
    return createSelectBuilder(result);
  }),
  transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
    const tx = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((payload: unknown) => {
          dbState.insertValues.push({ table, payload });
          return {
            returning: vi.fn(() =>
              Promise.resolve([{ id: "gear-1", slug: "nikon-z-60mm-f-2-8" }]),
            ),
          };
        }),
      })),
    };
    return callback(tx);
  }),
}));

const webhookMocks = vi.hoisted(() => ({
  enqueueGearCreatedWebhookEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: dbMocks,
}));
vi.mock("~/server/developer-api/webhooks/data", () => webhookMocks);
vi.mock("~/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://www.sharplyphoto.com" },
}));

import { createGearData } from "~/server/admin/gear/data";

describe("createGearData bulk import initial values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.selectResults = [];
    dbState.insertValues = [];
    webhookMocks.enqueueGearCreatedWebhookEvent.mockResolvedValue("event-1");
  });

  it("writes multiple mounts and initial lens specs in the creation transaction", async () => {
    dbState.selectResults = [
      [{ id: "brand-nikon", name: "Nikon" }],
      [{ id: "mount-z" }, { id: "mount-e" }],
      [],
    ];

    const result = await createGearData({
      name: "Nikon Nikkor Z 60mm f/2.8",
      brandId: "brand-nikon",
      gearType: "LENS",
      mountIds: ["mount-z", "mount-e"],
      initialCore: {
        releaseDate: "2024-01-02",
        msrpNowUsdCents: 99995,
        weightGrams: 630,
        notes: ["Imported from CSV"],
      },
      initialLensSpecs: {
        isPrime: true,
        focalLengthMinMm: 60,
        focalLengthMaxMm: 60,
        maxApertureWide: 2.8,
        hasAutofocus: true,
      },
    });

    expect(result).toEqual({ id: "gear-1", slug: "nikon-z-60mm-f-2-8" });
    expect(dbState.insertValues[0]?.payload).toMatchObject({
      name: "Nikon Nikkor Z 60mm f/2.8",
      brandId: "brand-nikon",
      mountId: "mount-z",
      msrpNowUsdCents: 99995,
      weightGrams: 630,
      notes: ["Imported from CSV"],
    });
    expect(dbState.insertValues[1]?.payload).toEqual([
      { gearId: "gear-1", mountId: "mount-z" },
      { gearId: "gear-1", mountId: "mount-e" },
    ]);
    expect(dbState.insertValues[2]?.payload).toMatchObject({
      gearId: "gear-1",
      isPrime: true,
      focalLengthMinMm: 60,
      focalLengthMaxMm: 60,
      maxApertureWide: "2.8",
      hasAutofocus: true,
    });
    expect(webhookMocks.enqueueGearCreatedWebhookEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        gearId: "gear-1",
        name: "Nikon Nikkor Z 60mm f/2.8",
        slug: "nikon-z-60mm-f-2-8",
        gearType: "LENS",
      }),
    );
  });

  it("writes digital camera completeness fields during creation", async () => {
    dbState.selectResults = [
      [{ id: "brand-sony", name: "Sony" }],
      [{ id: "mount-e" }],
      [],
    ];

    await createGearData({
      name: "Alpha 7R V",
      brandId: "brand-sony",
      gearType: "CAMERA",
      mountIds: ["mount-e"],
      initialCameraSpecs: {
        sensorFormatId: "sensor-full-frame",
        resolutionMp: 61,
      },
    });

    expect(dbState.insertValues[0]?.payload).toMatchObject({
      name: "Sony Alpha 7R V",
      mountId: "mount-e",
    });
    expect(dbState.insertValues[2]?.payload).toEqual({
      gearId: "gear-1",
      sensorFormatId: "sensor-full-frame",
      resolutionMp: "61",
    });
  });

  it("writes analog completeness and integrated-lens fields together", async () => {
    dbState.selectResults = [
      [{ id: "brand-fujifilm", name: "Fujifilm" }],
      [{ id: "mount-fixed" }],
      [],
    ];

    await createGearData({
      name: "Fujifilm Klasse W 28mm f/2.8",
      brandId: "brand-fujifilm",
      gearType: "ANALOG_CAMERA",
      mountIds: ["mount-fixed"],
      initialAnalogCameraSpecs: {
        cameraType: "point-and-shoot",
        captureMedium: "35mm",
      },
      initialFixedLensSpecs: {
        isPrime: true,
        focalLengthMinMm: 28,
        focalLengthMaxMm: 28,
        maxApertureWide: 2.8,
      },
    });

    expect(dbState.insertValues[2]?.payload).toEqual({
      gearId: "gear-1",
      cameraType: "point-and-shoot",
      captureMedium: "35mm",
    });
    expect(dbState.insertValues[3]?.payload).toMatchObject({
      gearId: "gear-1",
      isPrime: true,
      focalLengthMinMm: 28,
      focalLengthMaxMm: 28,
      maxApertureWide: "2.8",
    });
  });
});
