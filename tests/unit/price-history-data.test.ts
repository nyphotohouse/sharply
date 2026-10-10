import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const query = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: { select: query.select } }));
import { listPriceHistoryData } from "~/server/pricing/data";
import { gearPriceEstimates } from "~/server/db/schema";
describe("history chart database read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue({ from: query.from });
    query.from.mockReturnValue({ where: query.where });
    query.where.mockReturnValue({ orderBy: query.orderBy });
    query.orderBy.mockResolvedValue([]);
  });
  it("fetches chart fields only, scoped by gear/market/kind and ordered deterministically", async () => {
    await listPriceHistoryData("camera", "UK");
    expect(query.select).toHaveBeenCalledWith({
      createdAt: gearPriceEstimates.createdAt,
      currency: gearPriceEstimates.currency,
      lowMinor: gearPriceEstimates.lowMinor,
      typicalMinor: gearPriceEstimates.typicalMinor,
      highMinor: gearPriceEstimates.highMinor,
    });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(query.where.mock.calls[0]![0]).params).toEqual([
      "camera",
      "UK",
      "used_retail",
    ]);
    expect(query.orderBy).toHaveBeenCalledTimes(1);
    const order = query.orderBy.mock.calls[0]!;
    expect(dialect.sqlToQuery(order[0]).sql).toContain('"created_at" asc');
    expect(dialect.sqlToQuery(order[1]).sql).toContain('"id" asc');
  });
});
