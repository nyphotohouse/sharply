import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
  getPriceAdapter: vi.fn(),
  setCampricerEnabledData: vi.fn(),
  normalizePriceRangesData: vi.fn(),
  listPriceHistoryData: vi.fn(),
  requireRole: vi.fn().mockReturnValue(true),
  addPriceObservationData: vi.fn(),
  addPublicPriceObservationData: vi.fn(),
  archiveOrDeletePriceMappingData: vi.fn(),
  completePriceFetchRunData: vi.fn(),
  createPriceMappingData: vi.fn(),
  createPriceFetchRunData: vi.fn(),
  getPriceManagementData: vi.fn(),
  getPriceMappingData: vi.fn(),
  listDuePriceMappingsData: vi.fn(),
  listRecentPriceFetchRunsData: vi.fn(),
  listRecentPriceObservationsData: vi.fn(),
  listPriceOverviewData: vi.fn(),
  listUpcomingPriceMappingsData: vi.fn(),
  recordPriceFetchRunItemData: vi.fn(),
  restorePriceMappingData: vi.fn(),
  reviewPriceObservationData: vi.fn(),
  updatePriceMappingLinkData: vi.fn(),
  updatePriceMappingFetchData: vi.fn(),
  rebuildGearPriceProjection: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/gear/service", () => ({ fetchGearBySlug: vi.fn() }));
vi.mock("~/server/auth", () => ({
  getSessionOrThrow: mocks.getSessionOrThrow,
}));
vi.mock("~/lib/auth/auth-helpers", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("~/server/pricing/data", () => ({
  addPriceObservationData: mocks.addPriceObservationData,
  setCampricerEnabledData: mocks.setCampricerEnabledData,
  normalizePriceRangesData: mocks.normalizePriceRangesData,
  listPriceHistoryData: mocks.listPriceHistoryData,
  addPublicPriceObservationData: mocks.addPublicPriceObservationData,
  archiveOrDeletePriceMappingData: mocks.archiveOrDeletePriceMappingData,
  completePriceFetchRunData: mocks.completePriceFetchRunData,
  createPriceMappingData: mocks.createPriceMappingData,
  createPriceFetchRunData: mocks.createPriceFetchRunData,
  getPriceManagementData: mocks.getPriceManagementData,
  getPriceMappingData: mocks.getPriceMappingData,
  listDuePriceMappingsData: mocks.listDuePriceMappingsData,
  listRecentPriceFetchRunsData: mocks.listRecentPriceFetchRunsData,
  listRecentPriceObservationsData: mocks.listRecentPriceObservationsData,
  listPriceOverviewData: mocks.listPriceOverviewData,
  listUpcomingPriceMappingsData: mocks.listUpcomingPriceMappingsData,
  recordPriceFetchRunItemData: mocks.recordPriceFetchRunItemData,
  restorePriceMappingData: mocks.restorePriceMappingData,
  reviewPriceObservationData: mocks.reviewPriceObservationData,
  updatePriceMappingLinkData: mocks.updatePriceMappingLinkData,
  updatePriceMappingFetchData: mocks.updatePriceMappingFetchData,
}));
vi.mock("~/server/pricing/projection", () => ({
  rebuildGearPriceProjection: mocks.rebuildGearPriceProjection,
}));
vi.mock("~/server/pricing/adapters", () => ({
  getPriceAdapter: mocks.getPriceAdapter,
}));

import {
  addPublicPriceObservationService,
  addManualPriceObservationForGearService,
  createPriceMappingService,
  reviewPriceObservationService,
  setCampricerEnabledService,
  updatePriceMappingLinkService,
  archiveOrDeletePriceMappingService,
  refreshPriceMappingService,
  refreshDuePriceMappingsService,
} from "~/server/pricing/service";

describe("pricing service manual observations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionOrThrow.mockResolvedValue({
      user: { id: "editor-1", role: "EDITOR" },
    });
    mocks.getPriceManagementData.mockResolvedValue({
      gear: { slug: "nikon-zf" },
      mappings: [],
      estimates: [],
    });
    mocks.createPriceMappingData.mockResolvedValue({
      id: "manual-mapping-1",
      gearId: "gear-1",
      marketKey: "UK",
      sourceKey: "manual",
    });
  });

  it("does not allow direct manual mapping creation", async () => {
    await expect(
      createPriceMappingService({
        gearId: "gear-1",
        sourceKey: "manual",
        marketKey: "US",
      }),
    ).rejects.toMatchObject({
      message: "Manual mappings are created when adding an observation.",
      status: 400,
    });

    expect(mocks.createPriceMappingData).not.toHaveBeenCalled();
  });

  it("creates or reuses the manual mapping while adding a point observation", async () => {
    await addManualPriceObservationForGearService({
      gearId: "gear-1",
      marketKey: "UK",
      valueKind: "POINT",
      amountMinor: 123456,
      observedAt: new Date("2026-09-29T12:00:00.000Z"),
      evidenceUrl: "https://example.com/price",
      note: "excellent condition",
    });

    expect(mocks.createPriceMappingData).toHaveBeenCalledWith({
      gearId: "gear-1",
      sourceKey: "manual",
      marketKey: "UK",
      priceKind: "used_retail",
      createdById: "editor-1",
    });
    expect(mocks.addPriceObservationData).toHaveBeenCalledWith({
      mappingId: "manual-mapping-1",
      createdById: "editor-1",
      currency: "GBP",
      valueKind: "POINT",
      amountMinor: 123456,
      lowMinor: null,
      highMinor: null,
      condition: "unknown",
      availability: "available",
      observedAt: new Date("2026-09-29T12:00:00.000Z"),
      evidenceUrl: "https://example.com/price",
      note: "excellent condition",
    });
    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1", {
      preserveExisting: true,
    });
  });

  it("rejects new range observations", async () => {
    await expect(
      addManualPriceObservationForGearService({
        gearId: "gear-1",
        marketKey: "US",
        valueKind: "RANGE",
        lowMinor: 15000,
        highMinor: 20000,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.addPriceObservationData).not.toHaveBeenCalled();
  });

  it("validates the observation before creating its backing mapping", async () => {
    await expect(
      addManualPriceObservationForGearService({
        gearId: "gear-1",
        marketKey: "US",
        valueKind: "RANGE",
        lowMinor: 9000,
        highMinor: 8000,
      }),
    ).rejects.toMatchObject({
      message: "A point price must be a positive integer.",
      status: 400,
    });

    expect(mocks.createPriceMappingData).not.toHaveBeenCalled();
    expect(mocks.addPriceObservationData).not.toHaveBeenCalled();
  });

  it("allows a regular authenticated user to seed a missing item for review", async () => {
    mocks.getSessionOrThrow.mockResolvedValueOnce({
      user: { id: "user-1", role: "USER" },
    });
    mocks.addPublicPriceObservationData.mockResolvedValueOnce({
      created: true,
      gearId: "gear-1",
      gearSlug: "nikon-zf",
      observation: { id: "observation-1" },
    });

    await addPublicPriceObservationService({
      gearId: "gear-1",
      marketKey: "EU",
      valueKind: "POINT",
      amountMinor: 15000,
    });

    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.addPublicPriceObservationData).toHaveBeenCalledWith({
      gearId: "gear-1",
      marketKey: "EU",
      createdById: "user-1",
      currency: "EUR",
      valueKind: "POINT",
      amountMinor: 15000,
      lowMinor: null,
      highMinor: null,
      observedAt: expect.any(Date),
      evidenceUrl: null,
      note: null,
    });
    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1", {
      preserveExisting: true,
    });
  });

  it("rejects a public seed when another valid observation already exists", async () => {
    mocks.addPublicPriceObservationData.mockResolvedValueOnce({
      created: false,
      gearId: "gear-1",
      gearSlug: "nikon-zf",
    });

    await expect(
      addPublicPriceObservationService({
        gearId: "gear-1",
        marketKey: "US",
        valueKind: "POINT",
        amountMinor: 17500,
      }),
    ).rejects.toMatchObject({
      message: "PRICE_ALREADY_EXISTS",
      status: 409,
      code: "PRICE_ALREADY_EXISTS",
    });

    expect(mocks.rebuildGearPriceProjection).not.toHaveBeenCalled();
  });

  it("clears the review flag when an editor approves a contribution", async () => {
    mocks.reviewPriceObservationData.mockResolvedValueOnce({
      gearId: "gear-1",
      gearSlug: "nikon-zf",
      observation: { id: "observation-1" },
    });

    await reviewPriceObservationService({
      observationId: "observation-1",
      decision: "APPROVE",
    });

    expect(mocks.reviewPriceObservationData).toHaveBeenCalledWith({
      observationId: "observation-1",
      decision: "APPROVE",
    });
    expect(mocks.rebuildGearPriceProjection).not.toHaveBeenCalled();
  });

  it("rebuilds the projection when an editor rejects a contribution", async () => {
    mocks.reviewPriceObservationData.mockResolvedValueOnce({
      gearId: "gear-1",
      gearSlug: "nikon-zf",
      observation: { id: "observation-1" },
    });

    await reviewPriceObservationService({
      observationId: "observation-1",
      decision: "REJECT",
    });

    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1");
  });
});

describe("CamPricer management restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockReturnValue(true);
    mocks.getSessionOrThrow.mockResolvedValue({
      user: { id: "editor", role: "EDITOR" },
    });
    mocks.getPriceMappingData.mockResolvedValue({
      id: "m",
      sourceKey: "campricer",
      gearId: "gear-1",
    });
  });
  it("rejects manual creation, URL edits, refresh and deletion", async () => {
    await expect(
      createPriceMappingService({
        gearId: "g",
        marketKey: "EU",
        sourceKey: "campricer",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updatePriceMappingLinkService({
        mappingId: "m",
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(refreshPriceMappingService("m")).rejects.toMatchObject({
      status: 400,
    });
    await expect(archiveOrDeletePriceMappingService("m")).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it("allows reversible disable and recomputes the projection", async () => {
    mocks.setCampricerEnabledData.mockResolvedValue({ gearId: "gear-1" });
    await setCampricerEnabledService("m", false);
    expect(mocks.setCampricerEnabledData).toHaveBeenCalledWith("m", false);
    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1", {
      preserveExisting: false,
    });
  });
  it("requires editorial access for disable", async () => {
    mocks.requireRole.mockReturnValue(false);
    await expect(setCampricerEnabledService("m", false)).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.setCampricerEnabledData).not.toHaveBeenCalled();
  });
});

describe("retailer batch deadline", () => {
  it("defers remaining mappings after the time budget and records actual work", async () => {
    vi.clearAllMocks();
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    mocks.createPriceFetchRunData.mockResolvedValue({ id: "run" });
    mocks.normalizePriceRangesData.mockResolvedValue([]);
    mocks.listDuePriceMappingsData.mockResolvedValue([
      {
        id: "one",
        gearId: "g",
        gearName: "Gear",
        gearSlug: "gear",
        sourceKey: "mpb",
        marketKey: "US",
      },
      {
        id: "two",
        gearId: "g2",
        gearName: "Other",
        gearSlug: "other",
        sourceKey: "mpb",
        marketKey: "US",
      },
    ]);
    mocks.getPriceMappingData.mockResolvedValue({
      id: "one",
      gearId: "g",
      status: "ACTIVE",
      sourceKey: "mpb",
      marketKey: "US",
      lastFetchedAt: null,
    });
    const fetch = vi.fn(async (_mapping: unknown, _options: unknown) => {
      clock.mockReturnValue(start + 90001);
      return { status: "NO_DATA", observations: [] };
    });
    mocks.getPriceAdapter.mockReturnValue({ fetch });
    try {
      const result = await refreshDuePriceMappingsService(20);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]).toMatchObject({
        signal: expect.any(AbortSignal),
      });
      expect(result).toMatchObject({ scanned: 1, deferredCount: 1 });
      expect(mocks.completePriceFetchRunData).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "PARTIAL",
          scannedCount: 1,
          error:
            "Retailer batch time budget exhausted; remaining mappings deferred",
        }),
      );
    } finally {
      clock.mockRestore();
    }
  });
});
