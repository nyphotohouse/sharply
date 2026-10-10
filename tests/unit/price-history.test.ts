import { describe, expect, it } from "vitest";
import {
  historyPriceChange,
  parsePriceHistory,
  preparePriceHistory,
  type HistoryPoint,
  type PriceHistory,
} from "~/lib/pricing/price-history";
const point = (
  timestamp: string,
  typicalMinor: number,
  lowMinor = typicalMinor,
  highMinor = typicalMinor,
): HistoryPoint => ({ timestamp, typicalMinor, lowMinor, highMinor });
const history = (points: HistoryPoint[]): PriceHistory => ({
  market: "US",
  currency: "USD",
  now: "2026-10-10T00:00:00.000Z",
  points,
});
describe("price history chart data", () => {
  it("uses a shared period baseline for inspected and current prices", () => {
    expect(historyPriceChange(12000, 10000)).toBe(20);
    expect(historyPriceChange(9000, 10000)).toBe(-10);
    expect(historyPriceChange(10000, 10000)).toBe(0);
    expect(historyPriceChange(10000, 0)).toBeNull();
    expect(historyPriceChange(undefined, 10000)).toBeNull();
  });

  it("carries the effective price into a period and extends the last price to now", () => {
    const result = preparePriceHistory(
      history([point("2026-01-01", 10000), point("2026-10-01", 12000)]),
      "30d",
    );
    expect(result.points.map((p) => [p.timestamp, p.typical])).toEqual([
      ["2026-09-10T00:00:00.000Z", 100],
      ["2026-10-01", 120],
      ["2026-10-10T00:00:00.000Z", 120],
    ]);
    expect(result.change).toBe(20);
  });
  it("uses the snapshot exactly at the boundary", () => {
    const result = preparePriceHistory(
      history([
        point("2026-01-01", 10000),
        point("2026-09-10", 12000),
        point("2026-10-01", 15000),
      ]),
      "30d",
    );
    expect(result.change).toBe(25);
    expect(result.points[0]?.typical).toBe(120);
  });
  it("does not fabricate prices before available history", () => {
    const result = preparePriceHistory(
      history([point("2026-10-01", 10000), point("2026-10-05", 9000)]),
      "1y",
    );
    expect(result.points[0]?.timestamp).toBe("2026-10-01");
    expect(result.change).toBe(-10);
  });
  it("renders a flat period without updates", () => {
    const result = preparePriceHistory(
      history([point("2025-01-01", 10000), point("2025-02-01", 9000)]),
      "30d",
    );
    expect(result.change).toBe(0);
    expect(result.points).toHaveLength(2);
    expect(result.points.every((p) => p.typical === 90)).toBe(true);
    expect(result.domain).toEqual([88.2, 91.8]);
  });
  it("uses calendar year and all-time boundaries", () => {
    const input = history([
      point("2024-01-01", 10000),
      point("2025-10-01", 12000),
      point("2026-10-01", 12500),
    ]);
    expect(preparePriceHistory(input, "1y").points[0]?.timestamp).toBe(
      "2025-10-10T00:00:00.000Z",
    );
    expect(preparePriceHistory(input, "all").change).toBe(25);
    expect(preparePriceHistory(input, "1y").change).toBe(4.2);
  });
  it("omits percent for zero baseline and clamps padding at zero", () => {
    const result = preparePriceHistory(
      history([point("2026-01-01", 0), point("2026-10-01", 50)]),
      "all",
    );
    expect(result.change).toBeNull();
    expect(result.domain[0]).toBe(0);
    expect(result.domain[1]).toBe(1.5);
  });
  it("pads using the source extrema", () => {
    const result = preparePriceHistory(
      history([
        point("2026-01-01", 10000, 5000, 20000),
        point("2026-10-01", 12000, 6000, 18000),
      ]),
      "all",
    );
    expect(result.domain).toEqual([35, 215]);
  });
  it("validates currency and data and sorts chronological responses", () => {
    expect(
      parsePriceHistory(
        history([point("2026-10-01", 100), point("2026-01-01", 100)]),
      ).points[0]?.timestamp,
    ).toBe("2026-01-01");
    for (const invalid of [
      { ...history([]), currency: "EUR" },
      history([point("bad", 100)]),
      { ...history([]), points: [{ ...point("2026-01-01", 100), timestamp: 1 }] },
      history([point("2026-01-01", 100, 200, 300)]),
      history([point("2026-01-01", NaN)]),
      null,
    ])
      expect(() => parsePriceHistory(invalid)).toThrow();
  });
});
