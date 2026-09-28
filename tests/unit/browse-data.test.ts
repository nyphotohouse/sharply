import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  orderByClauses: [] as unknown[][],
}));

function createSelectBuilder() {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn((...clauses: unknown[]) => {
      state.orderByClauses.push(clauses);
      return builder;
    }),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => builder),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve([]).then(resolve, reject),
  };

  return builder;
}

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(() => createSelectBuilder()),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: dbMocks }));

import {
  getReleaseOrderedGearPage,
  searchGear,
} from "~/server/gear/browse/data";

const dialect = new PgDialect();

function getOrderBySqls() {
  return state.orderByClauses[0]?.map((clause) =>
    dialect.sqlToQuery(clause as never),
  );
}

describe("browse newest ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.orderByClauses = [];
  });

  it("uses declared release precision, announcement date, creation time, and stable fields", async () => {
    await searchGear({
      filters: {
        sort: "newest",
        page: 1,
        perPage: 24,
      },
    });

    const orderBy = getOrderBySqls();
    expect(orderBy).toHaveLength(5);
    expect(orderBy?.[0]?.sql).toContain('"release_date_precision"');
    expect(orderBy?.[0]?.sql).toContain("date_trunc('year'");
    expect(orderBy?.[0]?.sql).toContain("date_trunc('month'");
    expect(orderBy?.[0]?.sql).toContain("DESC NULLS LAST");
    expect(orderBy?.[1]?.sql).toContain('"announce_date_precision"');
    expect(orderBy?.[1]?.sql).toContain("DESC NULLS LAST");
    expect(orderBy?.[2]?.sql).toContain('"created_at" desc');
    expect(orderBy?.[3]?.sql).toContain('"name" asc');
    expect(orderBy?.[4]?.sql).toContain('"id" asc');
  });

  it("uses the same tie-breaker ordering for the latest release feed", async () => {
    await getReleaseOrderedGearPage({ limit: 12 });

    const orderBy = getOrderBySqls();
    expect(orderBy).toHaveLength(5);
    expect(orderBy?.[0]?.sql).toContain('"release_date_precision"');
    expect(orderBy?.[0]?.sql).toContain('"announced_date"');
    expect(orderBy?.[1]?.sql).toContain('"announce_date_precision"');
    expect(orderBy?.[2]?.sql).toContain('"created_at" desc');
  });
});
