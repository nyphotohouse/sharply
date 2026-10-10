import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  PRICE_HISTORY_CURVE,
  nearestHistoryTime,
} from "~/lib/pricing/price-history";
const require = createRequire(import.meta.url);
const { getPath } =
  require("recharts/lib/shape/Curve") as typeof import("recharts/types/shape/Curve");
function segments(values: number[], times: number[]) {
  const path = getPath({
    type: PRICE_HISTORY_CURVE,
    points: values.map((y, index) => ({ x: times[index]!, y })),
  })!;
  return [...path.matchAll(/C([^CMZ]+)/g)].map((match) =>
    match[1]!.split(",").map(Number),
  );
}
function yAt(start: number, controls: number[], t: number) {
  return (
    (1 - t) ** 3 * start +
    3 * (1 - t) ** 2 * t * controls[1]! +
    3 * (1 - t) * t * t * controls[3]! +
    t ** 3 * controls[5]!
  );
}
describe("bounded smooth price curves", () => {
  it.each([
    {
      low: [100, 200, 200],
      typical: [100, 200, 300],
      high: [100, 200, 400],
      times: [0, 100, 200],
    },
    {
      low: [100, 200, 50, 120],
      typical: [100, 250, 100, 120],
      high: [100, 300, 200, 120],
      times: [0, 10, 200, 220],
    },
    {
      low: [100, 100, 100],
      typical: [100, 100, 100],
      high: [100, 100, 100],
      times: [0, 100, 200],
    },
  ])(
    "preserves ordered bounds and stays inside endpoint prices: %j",
    ({ low, typical, high, times }) => {
      const curves = [low, typical, high].map((series) =>
        segments(series, times),
      );
      for (let segment = 0; segment < times.length - 1; segment++) {
        for (let sample = 0; sample <= 100; sample++) {
          const t = sample / 100;
          const [minimum, estimate, maximum] = [low, typical, high].map(
            (series, index) =>
              yAt(series[segment]!, curves[index]![segment]!, t),
          );
          expect(minimum!).toBeLessThanOrEqual(estimate! + 0.001);
          expect(estimate!).toBeLessThanOrEqual(maximum! + 0.001);
          expect(minimum!).toBeGreaterThanOrEqual(
            Math.min(low[segment]!, low[segment + 1]!) - 0.001,
          );
          expect(maximum!).toBeLessThanOrEqual(
            Math.max(high[segment]!, high[segment + 1]!) + 0.001,
          );
        }
      }
    },
  );
  it("chooses the nearest saved point including repeat selections and edges", () => {
    const points = [{ time: 100 }, { time: 200 }, { time: 400 }];
    expect(nearestHistoryTime(points, 0)).toBe(100);
    expect(nearestHistoryTime(points, 250)).toBe(200);
    expect(nearestHistoryTime(points, 250)).toBe(200);
    expect(nearestHistoryTime(points, 350)).toBe(400);
    expect(nearestHistoryTime(points, 500)).toBe(400);
    expect(nearestHistoryTime([], 100)).toBeNull();
    expect(nearestHistoryTime(points, NaN)).toBeNull();
  });
});
