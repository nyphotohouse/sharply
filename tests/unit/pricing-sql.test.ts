import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildUsComparablePriceSql,
  buildUsHasComparablePriceSql,
} from "~/server/pricing/sql";

const dialect = new PgDialect();

describe("canonical price SQL", () => {
  it("uses a guarded US projection followed by the shared legacy fallback order", () => {
    const query = dialect.sqlToQuery(buildUsComparablePriceSql());

    expect(query.sql).toContain("'US'");
    expect(query.sql).toContain("'current', 'stale'");
    expect(query.sql).toContain("'typical'");
    expect(query.sql).toContain("COALESCE");
    expect(query.sql).toMatch(
      /mpb_max_price_usd_cents.*msrp_now_usd_cents.*msrp_at_launch_usd_cents/s,
    );
  });

  it("exposes presence as a null-safe predicate", () => {
    const query = dialect.sqlToQuery(buildUsHasComparablePriceSql());

    expect(query.sql).toContain("IS NOT NULL");
    expect(query.sql).toContain("COALESCE");
  });
});
