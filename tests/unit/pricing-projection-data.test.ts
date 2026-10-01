import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  insertPayload: null as unknown,
  failInsert: false,
}));

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(async (payload: unknown) => {
          state.calls.push("insert");
          state.insertPayload = payload;
          if (state.failInsert) throw new Error("insert failed");
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => {
              state.calls.push("update");
              return [{ id: "gear-1" }];
            }),
          })),
        })),
      })),
    };

    return callback(tx);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: dbMocks }));
vi.mock("~/server/db/schema", () => ({
  gear: { id: "gear.id" },
  gearPriceEstimates: "gear_price_estimates",
  gearPriceFetchRunItems: {},
  gearPriceFetchRuns: {},
  gearPriceMappings: {},
  gearPriceObservations: {},
  users: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  lte: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
}));
vi.mock("~/lib/pricing/upcoming-fetch-window", () => ({
  getUpcomingFetchCutoff: vi.fn(),
}));

import { persistGearPriceProjectionData } from "~/server/pricing/data";

const estimate = {
  marketKey: "US",
  priceKind: "used_retail",
  lowMinor: 100000,
  typicalMinor: 110000,
  highMinor: 120000,
  currency: "USD",
  asOf: new Date("2026-09-29T19:00:00.000Z"),
  methodVersion: 1,
  sourceCount: 1,
  observationCount: 1,
  inputObservationIds: ["observation-1"],
};

describe("persistGearPriceProjectionData", () => {
  beforeEach(() => {
    state.calls = [];
    state.insertPayload = null;
    state.failInsert = false;
    vi.clearAllMocks();
  });

  it("writes estimates and the projection through one transaction", async () => {
    await persistGearPriceProjectionData({
      gearId: "gear-1",
      projection: {},
      estimates: [estimate],
    });

    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(state.calls).toEqual(["insert", "update"]);
    expect(state.insertPayload).toEqual([{ ...estimate, gearId: "gear-1" }]);
  });

  it("does not attempt the projection update after an estimate insert fails", async () => {
    state.failInsert = true;

    await expect(
      persistGearPriceProjectionData({
        gearId: "gear-1",
        projection: {},
        estimates: [estimate],
      }),
    ).rejects.toThrow("insert failed");

    expect(state.calls).toEqual(["insert"]);
  });
});
