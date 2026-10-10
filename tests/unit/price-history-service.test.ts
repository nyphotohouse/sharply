import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gear: vi.fn(), history: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("~/server/gear/service", () => ({ fetchGearBySlug: mocks.gear }));
vi.mock("~/server/pricing/data", () => ({
  listPriceHistoryData: mocks.history,
}));
vi.mock("~/server/auth", () => ({ getSessionOrThrow: vi.fn() }));
vi.mock("~/lib/auth/auth-helpers", () => ({ requireRole: vi.fn() }));
vi.mock("~/server/pricing/adapters", () => ({ getPriceAdapter: vi.fn() }));
vi.mock("~/server/pricing/projection", () => ({
  rebuildGearPriceProjection: vi.fn(),
}));
import { getPublicPriceHistoryService } from "~/server/pricing/service";
import { GET } from "~/app/api/gear/[slug]/price-history/route";
import { NextRequest } from "next/server";
const row = {
  createdAt: new Date("2026-01-01"),
  asOf: new Date("2025-01-01"),
  currency: "USD",
  lowMinor: 10000,
  typicalMinor: 12000,
  highMinor: 13000,
  calculationInputs: [{ secret: "internal" }],
  inputObservationIds: ["private"],
};
describe("public price history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gear.mockResolvedValue({ id: "g" });
    mocks.history.mockResolvedValue([row]);
  });
  it("returns calculation timestamps and only public chart fields", async () => {
    const result = await getPublicPriceHistoryService("camera", "US");
    expect(result.points).toEqual([
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        lowMinor: 10000,
        typicalMinor: 12000,
        highMinor: 13000,
      },
    ]);
    expect(mocks.history).toHaveBeenCalledWith("g", "US");
    expect(result.currency).toBe("USD");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("omits mismatched currencies and invalid snapshots", async () => {
    mocks.history.mockResolvedValue([
      row,
      { ...row, currency: "EUR" },
      { ...row, lowMinor: 14000 },
      { ...row, typicalMinor: -1 },
    ]);
    expect(
      (await getPublicPriceHistoryService("camera", "US")).points,
    ).toHaveLength(1);
  });
  it("returns 400 before gear lookup for invalid markets", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/gear/camera/price-history?market=XX",
      ),
      { params: Promise.resolve({ slug: "camera" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.gear).not.toHaveBeenCalled();
  });
  it("returns 404 for missing or nonpublic gear", async () => {
    mocks.gear.mockRejectedValue(
      Object.assign(new Error("Gear not found"), { status: 404 }),
    );
    const response = await GET(
      new NextRequest(
        "http://localhost/api/gear/camera/price-history?market=US",
      ),
      { params: Promise.resolve({ slug: "camera" }) },
    );
    expect(response.status).toBe(404);
  });
  it("does not expose failure details", async () => {
    mocks.history.mockRejectedValue(new Error("secret connection"));
    const response = await GET(
      new NextRequest(
        "http://localhost/api/gear/camera/price-history?market=US",
      ),
      { params: Promise.resolve({ slug: "camera" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Price history unavailable",
    });
  });
});
