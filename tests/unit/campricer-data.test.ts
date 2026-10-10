import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  mapping: { id: "m", status: "ACTIVE" },
  existing: false,
  inserts: [] as Array<{ table: unknown; value: unknown }>,
  updates: [] as Array<{ table: unknown; value: unknown }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("~/server/db/schema", () => ({
  gear: { id: "gear.id" },
  gearPriceMappings: {
    id: "mapping.id",
    gearId: "gearId",
    sourceKey: "sourceKey",
    marketKey: "marketKey",
    priceKind: "kind",
  },
  gearPriceObservations: {
    id: "obs.id",
    mappingId: "mappingId",
    observedAt: "observedAt",
    valueKind: "valueKind",
    lowMinor: "lowMinor",
    highMinor: "highMinor",
  },
  gearPriceEstimates: {},
  gearPriceFetchRunItems: {},
  gearPriceFetchRuns: {},
  users: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => args),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn((...args) => args),
  inArray: vi.fn(),
  isNull: vi.fn(),
  lte: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("~/server/db", () => {
  const tx = {
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        state.inserts.push({ table, value });
        return {
          onConflictDoNothing: vi.fn(async () => {}),
          then: (resolve: (x: unknown) => unknown) =>
            Promise.resolve(resolve([])),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => [state.mapping],
          limit: async () => (state.existing ? [{ id: "obs" }] : []),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => {
        state.updates.push({ table, value });
        return {
          where: () => ({
            returning: async () => [{ id: "obs" }],
            then: (resolve: (x: unknown) => unknown) =>
              Promise.resolve(resolve([])),
          }),
        };
      },
    }),
  };
  return {
    db: {
      ...tx,
      transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    },
  };
});
import {
  importCampricerPriceData,
  normalizePriceRangesData,
} from "~/server/pricing/data";
const input = {
  gearId: "g",
  slug: "canon-a-1",
  url: "https://campricer.psavela.com/model/canon-a-1",
  amountMinor: 34900,
  observedAt: new Date("2026-10-10"),
};
describe("CamPricer database persistence", () => {
  beforeEach(() => {
    state.mapping = { id: "m", status: "ACTIVE" };
    state.existing = false;
    state.inserts = [];
    state.updates = [];
  });
  it("creates a pooled connection and stores point evidence", async () => {
    expect((await importCampricerPriceData(input)).outcome).toBe("imported");
    expect(state.inserts[0]?.value).toMatchObject({
      sourceKey: "campricer",
      marketKey: "EU",
      externalProductId: "canon-a-1",
    });
    expect(state.inserts[1]?.value).toMatchObject({
      valueKind: "POINT",
      amountMinor: 34900,
      currency: "EUR",
    });
  });
  it("replays a snapshot without another observation", async () => {
    state.existing = true;
    expect((await importCampricerPriceData(input)).outcome).toBe("unchanged");
    expect(state.inserts).toHaveLength(1);
  });
  it("preserves disabled connections without inserting evidence or reactivating", async () => {
    state.mapping.status = "DISABLED";
    expect((await importCampricerPriceData(input)).outcome).toBe("disabled");
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]?.value).not.toHaveProperty("status");
    expect(state.updates).toEqual([]);
  });
  it("connects thin/no-data models without observations", async () => {
    expect(
      (
        await importCampricerPriceData({
          ...input,
          amountMinor: null,
          observedAt: null,
        })
      ).outcome,
    ).toBe("thin");
    expect(state.inserts).toHaveLength(1);
    expect(state.updates[0]?.value).toMatchObject({
      lastFetchStatus: "NO_DATA",
    });
  });
  it("normalizes ranges without modifying estimates or projections", async () => {
    await normalizePriceRangesData();
    expect(state.inserts).toEqual([]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]?.value).toMatchObject({
      valueKind: "POINT",
      lowMinor: null,
      highMinor: null,
    });
  });
});
