import { MARKET_CURRENCY, type PriceMarket } from "./display-price";

export type HistoryPoint = {
  timestamp: string;
  lowMinor: number;
  typicalMinor: number;
  highMinor: number;
};
export type PriceHistory = {
  market: PriceMarket;
  currency: string;
  now: string;
  points: HistoryPoint[];
};
// Bump curves use the same convex blend for every series at a given X.
// Sharing this curve keeps low <= typical <= high between saved snapshots.
export const PRICE_HISTORY_CURVE = "bumpX" as const;

export function nearestHistoryTime(
  points: readonly { time: number }[],
  time: number,
): number | null {
  if (!points.length || !Number.isFinite(time)) return null;
  let left = 0,
    right = points.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle]!.time < time) left = middle + 1;
    else right = middle;
  }
  const after = points[left];
  const before = points[left - 1];
  if (!before) return after?.time ?? null;
  if (!after) return before.time;
  return time - before.time <= after.time - time ? before.time : after.time;
}

export type HistoryPeriod = "30d" | "1y" | "all";
export function validHistoryPoint(point: HistoryPoint) {
  return (
    Number.isFinite(Date.parse(point.timestamp)) &&
    [point.lowMinor, point.typicalMinor, point.highMinor].every(
      (value) => Number.isInteger(value) && value >= 0,
    ) &&
    point.lowMinor <= point.typicalMinor &&
    point.typicalMinor <= point.highMinor
  );
}
export function parsePriceHistory(value: unknown): PriceHistory {
  const history = value as PriceHistory;
  if (
    !history ||
    !["US", "UK", "EU"].includes(history.market) ||
    history.currency !== MARKET_CURRENCY[history.market] ||
    !Number.isFinite(Date.parse(history.now)) ||
    !Array.isArray(history.points) ||
    history.points.some((point) => !point || !validHistoryPoint(point))
  )
    throw new Error("Invalid price history");
  return {
    ...history,
    points: [...history.points].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    ),
  };
}
/** Percentage relative to the effective price at the selected period boundary. */
export function historyPriceChange(
  value: number | undefined,
  baseline: number | undefined,
) {
  return value !== undefined && baseline !== undefined && baseline > 0
    ? Math.round(((value - baseline) / baseline) * 1000) / 10
    : null;
}
export function preparePriceHistory(
  history: PriceHistory,
  period: HistoryPeriod,
) {
  const now = Date.parse(history.now);
  const points = history.points.filter(
    (point) => validHistoryPoint(point) && Date.parse(point.timestamp) <= now,
  );
  const start = new Date(now);
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30);
  if (period === "1y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  const boundary =
    period === "all"
      ? Date.parse(points[0]?.timestamp ?? history.now)
      : start.getTime();
  const prior = points
    .filter((point) => Date.parse(point.timestamp) <= boundary)
    .at(-1);
  const visible = points.filter(
    (point) => Date.parse(point.timestamp) > boundary,
  );
  if (prior)
    visible.unshift({ ...prior, timestamp: new Date(boundary).toISOString() });
  const latest = points.at(-1);
  if (latest && visible.at(-1)?.timestamp !== history.now)
    visible.push({ ...latest, timestamp: history.now });
  const baseline = visible[0]?.typicalMinor;
  const change = historyPriceChange(latest?.typicalMinor, baseline);
  const min = Math.min(...visible.map((point) => point.lowMinor));
  const max = Math.max(...visible.map((point) => point.highMinor));
  const padding = Math.max(
    (max - min) * 0.1,
    100,
    (latest?.typicalMinor ?? 0) * 0.02,
  );
  return {
    points: visible.map((point) => ({
      ...point,
      time: Date.parse(point.timestamp),
      range: [point.lowMinor / 100, point.highMinor / 100] as [number, number],
      typical: point.typicalMinor / 100,
    })),
    latest,
    baseline,
    change,
    domain: visible.length
      ? ([Math.max(0, (min - padding) / 100), (max + padding) / 100] as [
          number,
          number,
        ])
      : ([0, 1] as [number, number]),
  };
}
