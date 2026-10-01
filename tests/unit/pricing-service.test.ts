import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionOrThrow: vi.fn(),
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
vi.mock("~/server/auth", () => ({
  getSessionOrThrow: mocks.getSessionOrThrow,
}));
vi.mock("~/lib/auth/auth-helpers", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("~/server/pricing/data", () => ({
  addPriceObservationData: mocks.addPriceObservationData,
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
  getPriceAdapter: vi.fn(),
}));

import {
  addPublicPriceObservationService,
  addManualPriceObservationForGearService,
  createPriceMappingService,
  reviewPriceObservationService,
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
    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1");
  });

  it("persists both bounds for a range observation", async () => {
    await addManualPriceObservationForGearService({
      gearId: "gear-1",
      marketKey: "US",
      valueKind: "RANGE",
      lowMinor: 15000,
      highMinor: 20000,
      observedAt: new Date("2026-10-01T12:00:00.000Z"),
    });

    expect(mocks.addPriceObservationData).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: "manual-mapping-1",
        valueKind: "RANGE",
        amountMinor: null,
        lowMinor: 15000,
        highMinor: 20000,
      }),
    );
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
      message: "A price range must contain valid bounds.",
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
      valueKind: "RANGE",
      lowMinor: 12500,
      highMinor: 17500,
    });

    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.addPublicPriceObservationData).toHaveBeenCalledWith({
      gearId: "gear-1",
      marketKey: "EU",
      createdById: "user-1",
      currency: "EUR",
      valueKind: "RANGE",
      amountMinor: null,
      lowMinor: 12500,
      highMinor: 17500,
      observedAt: expect.any(Date),
      evidenceUrl: null,
      note: null,
    });
    expect(mocks.rebuildGearPriceProjection).toHaveBeenCalledWith("gear-1");
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
