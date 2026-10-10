import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  listValidPriceObservationsForGearData: vi.fn(),
  persistGearPriceProjectionData: vi.fn(),
  getStoredPriceProjectionData: vi.fn(),
  getExchangeRates: vi.fn(),
}));
vi.mock("~/server/pricing/data", () => mocks);
vi.mock("~/server/pricing/exchange-rates", () => ({
  getExchangeRates: mocks.getExchangeRates,
}));
import { rebuildGearPriceProjection } from "~/server/pricing/projection";
const point = (
  sourceKey: string,
  amountMinor: number,
  marketKey = "EU",
  id = sourceKey,
) => ({
  id,
  sourceKey,
  mappingId: sourceKey,
  marketKey,
  priceKind: "used_retail",
  currency: marketKey === "US" ? "USD" : "EUR",
  valueKind: "POINT",
  amountMinor,
  observedAt: new Date("2026-10-01"),
  createdAt: new Date("2026-10-01"),
});
describe("pricing projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoredPriceProjectionData.mockResolvedValue({});
    mocks.getExchangeRates.mockResolvedValue({
      base: "EUR",
      date: "2026-10-09",
      rates: { USD: 1.2, GBP: 0.8 },
    });
  });
  it("converts pooled EUR once per target and saves immutable provenance", async () => {
    mocks.listValidPriceObservationsForGearData.mockResolvedValue([
      point("campricer", 100000),
      point("mpb", 140000, "US"),
    ]);
    const result = await rebuildGearPriceProjection("g");
    expect(result.US).toMatchObject({
      typical: 125000,
      low: 120000,
      high: 140000,
      sourceCount: 2,
    });
    expect(result.UK?.typical).toBe(80000);
    const estimates =
      mocks.persistGearPriceProjectionData.mock.calls[0]?.[0].estimates;
    expect(
      estimates.find((e: { marketKey: string }) => e.marketKey === "US")
        .calculationInputs[0],
    ).toMatchObject({
      sourceKey: "campricer",
      originalAmountMinor: 100000,
      originalCurrency: "EUR",
      conversionRate: 1.2,
      ratesDate: "2026-10-09",
      pooled: true,
    });
  });
  it("uses native evidence without conversions when exchange rates fail", async () => {
    mocks.getExchangeRates.mockResolvedValue(null);
    mocks.listValidPriceObservationsForGearData.mockResolvedValue([
      point("campricer", 100000),
      point("manual", 150000, "US"),
    ]);
    const result = await rebuildGearPriceProjection("g");
    expect(result.US?.typical).toBe(150000);
    expect(result.EU?.typical).toBe(100000);
    expect(result.UK).toBeUndefined();
  });
  it("preserves stored projections during rate outages and recovers conversions", async () => {
    mocks.listValidPriceObservationsForGearData.mockResolvedValue([
      point("campricer", 100000),
      point("mpb", 140000, "US"),
    ]);
    const previousUS = { typical: 130000, low: 125000, high: 135000 };
    mocks.getStoredPriceProjectionData.mockResolvedValue({ US: previousUS });
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-10-15"));
    try {
      mocks.getExchangeRates.mockResolvedValueOnce(null);
      expect(
        (await rebuildGearPriceProjection("g", { preserveExisting: true })).US
      ).toEqual(previousUS);
      expect(
        mocks.persistGearPriceProjectionData.mock.calls[0]?.[0].estimates.some(
          (estimate: { marketKey: string }) => estimate.marketKey === "US",
        ),
      ).toBe(false);
      const recovered = await rebuildGearPriceProjection("g", {
        preserveExisting: true,
      });
      expect(recovered.US).toMatchObject({
        typical: 125000,
        status: "current",
      });
      clock.mockReturnValue(Date.parse("2026-11-05"));
      expect(
        (await rebuildGearPriceProjection("g", { preserveExisting: true })).US,
      ).toMatchObject({ typical: 125000, status: "stale" });
    } finally {
      clock.mockRestore();
    }
  });
  it("preserves displayed prices on rollout/recalculation without evidence", async () => {
    const previous = { US: { typical: 100000 } };
    mocks.getStoredPriceProjectionData.mockResolvedValue(previous);
    mocks.listValidPriceObservationsForGearData.mockResolvedValue([]);
    expect(
      await rebuildGearPriceProjection("g", { preserveExisting: true }),
    ).toEqual(previous);
  });
  it("explicit removal clears projections rather than leaving a disabled source visible", async () => {
    mocks.listValidPriceObservationsForGearData.mockResolvedValue([]);
    expect(await rebuildGearPriceProjection("g")).toEqual({});
  });
});
