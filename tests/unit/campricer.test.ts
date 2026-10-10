import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  createPriceFetchRunData: vi.fn(),
  listActiveCampricerGearData: vi.fn(),
  completePriceFetchRunData: vi.fn(),
  importCampricerPriceData: vi.fn(),
  listGearForPriceImportData: vi.fn(),
  recordPriceFetchRunItemData: vi.fn(),
}));
const rebuild = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("~/server/pricing/data", () => db);
vi.mock("~/server/pricing/projection", () => ({
  rebuildGearPriceProjection: rebuild,
}));
import {
  campricerNamespace,
  parseRetryAfter,
  syncCampricerService,
} from "~/server/pricing/campricer";

const time = Date.parse("2026-10-10T10:00:00Z");
const model = {
  sharply_slug: "canon-a-1",
  url: "https://campricer.psavela.com/model/canon-a-1",
  updated_at: "2026-10-10T07:00:00Z",
  estimate: { cents: 34900, thin: false },
};
function page(n = 1, pages = 1, models: unknown[] = [model]) {
  return new Response(
    JSON.stringify({
      currency: "EUR",
      page: n,
      pages,
      total: pages * 1000,
      per_page: 1000,
      models,
    }),
    { headers: { ETag: `page-${n}` } },
  );
}
function storage() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(async (key: string) => structuredClone(values.get(key) ?? null)),
    set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && values.has(key)) return null;
      values.set(key, structuredClone(value));
      return "OK";
    }),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      if (script.includes("INCR")) {
        if (values.get(keys[0]!) !== args[0]) return -1;
        const used = Number(values.get(keys[1]!) ?? 0);
        if (used >= 2) return 0;
        values.set(keys[1]!, used + 1);
        return 1;
      }
      if (values.get(keys[0]!) === args[0]) values.delete(keys[0]!);
      return 1;
    }),
  };
}
function dependencies(redis = storage()) {
  return {
    redis: redis as never,
    apiKey: "test-secret",
    now: () => time,
    sleep: vi.fn(async () => {}),
    fetch: vi.fn<typeof fetch>().mockResolvedValue(page()),
  };
}
describe("CamPricer bulk sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.createPriceFetchRunData.mockResolvedValue({ id: "run" });
    db.listActiveCampricerGearData.mockResolvedValue([
      { id: "g", slug: "canon-a-1" },
    ]);
    db.listGearForPriceImportData.mockResolvedValue([
      { id: "g", slug: "canon-a-1", name: "Canon A-1" },
    ]);
    db.importCampricerPriceData.mockResolvedValue({
      mapping: { id: "m" },
      outcome: "imported",
    });
  });
  it("imports by slug, saves ETags, logs results, and avoids repeating a completed cycle", async () => {
    const deps = dependencies();
    const result = await syncCampricerService(deps);
    expect(result.summary.counts.imported).toBe(1);
    expect(result.gearSlugs).toEqual(["canon-a-1"]);
    expect(db.importCampricerPriceData).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 34900, slug: "canon-a-1" }),
    );
    expect(db.recordPriceFetchRunItemData).toHaveBeenCalled();
    await syncCampricerService(deps);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it("accepts evidence URLs after a provider domain change", async () => {
    const deps = dependencies();
    const url = "https://kamarvo.com/model/canon-a-1";
    deps.fetch.mockResolvedValue(page(1, 1, [{ ...model, url }]));
    const result = await syncCampricerService(deps);
    expect(result.summary.counts).toMatchObject({ imported: 1, invalid: 0 });
    expect(db.importCampricerPriceData).toHaveBeenCalledWith(
      expect.objectContaining({ url }),
    );
  });
  it("continues after two pages and honors the daily budget on another invocation", async () => {
    const redis = storage(),
      deps = dependencies(redis);
    deps.fetch
      .mockReset()
      .mockResolvedValueOnce(page(1, 3))
      .mockResolvedValueOnce(page(2, 3));
    const result = await syncCampricerService(deps);
    expect(result.summary.cursorAfter).toBe(3);
    expect(deps.sleep).toHaveBeenCalledWith(2000);
    await syncCampricerService(deps);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    const tomorrow = {
      ...deps,
      now: () => time + 86400000,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(page(3, 3)),
    };
    expect((await syncCampricerService(tomorrow)).summary.cursorAfter).toBe(1);
    expect(tomorrow.fetch.mock.calls[0]?.[0]).toContain("page=3");
  });
  it("advances 304 pages using known pagination", async () => {
    const redis = storage();
    redis.values.set(`${campricerNamespace()}:state`, {
      nextPage: 1,
      pages: 2,
      etags: { "1": "abc" },
      nextEligibleAt: 0,
    });
    const deps = dependencies(redis);
    deps.fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(page(2, 2));
    await syncCampricerService(deps);
    expect(deps.fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      "If-None-Match": "abc",
    });
    expect(deps.fetch.mock.calls[1]?.[0]).toContain("page=2");
  });
  it.each([404, 200])(
    "recovers a catalog shrink on HTTP %s within the request cap",
    async (status) => {
      const redis = storage();
      redis.values.set(`${campricerNamespace()}:state`, {
        nextPage: 3,
        pages: 3,
        etags: { "3": "old" },
        nextEligibleAt: 0,
      });
      const deps = dependencies(redis);
      deps.fetch
        .mockReset()
        .mockResolvedValueOnce(
          status === 404 ? new Response(null, { status: 404 }) : page(3, 2, []),
        )
        .mockResolvedValueOnce(page(1, 1));
      const result = await syncCampricerService(deps);
      expect(result.ok).toBe(true);
      expect(deps.fetch).toHaveBeenCalledTimes(2);
      expect(deps.fetch.mock.calls[1]?.[0]).toContain("page=1");
      expect(deps.fetch.mock.calls[1]?.[1]?.headers).not.toHaveProperty(
        "If-None-Match",
      );
      expect(result.summary.cursorAfter).toBe(1);
    },
  );
  it("recalculates stored evidence on 304 without importing observations", async () => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(new Response(null, { status: 304 }));
    await syncCampricerService(deps);
    expect(db.importCampricerPriceData).not.toHaveBeenCalled();
    expect(rebuild).toHaveBeenCalledWith("g", { preserveExisting: true });
  });
  it("recalculates when the provider is unavailable without making extra requests", async () => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    const result = await syncCampricerService(deps);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledWith("g", { preserveExisting: true });
    expect(result.gearSlugs).toEqual(["canon-a-1"]);
  });
  it("skips thin, null, invalid and unmatched evidence", async () => {
    db.listActiveCampricerGearData.mockResolvedValue([]);
    const deps = dependencies();
    deps.fetch.mockResolvedValue(
      page(1, 1, [
        { ...model, estimate: { cents: 100, thin: true } },
        { ...model, estimate: null },
        { ...model, estimate: { cents: -1, thin: false } },
        { ...model, sharply_slug: "unknown" },
      ]),
    );
    db.importCampricerPriceData.mockResolvedValue({
      mapping: { id: "m" },
      outcome: "thin",
    });
    const { summary } = await syncCampricerService(deps);
    expect(summary.counts).toMatchObject({ thin: 2, invalid: 1, unmatched: 1 });
    expect(rebuild).not.toHaveBeenCalled();
  });
  it("records disabled and repeated snapshots without new observations", async () => {
    db.listActiveCampricerGearData.mockResolvedValue([]);
    const deps = dependencies();
    db.importCampricerPriceData.mockResolvedValue({
      mapping: { id: "m" },
      outcome: "disabled",
    });
    expect((await syncCampricerService(deps)).summary.counts.disabled).toBe(1);
    expect(rebuild).not.toHaveBeenCalled();
    db.listActiveCampricerGearData.mockResolvedValue([
      { id: "g", slug: "canon-a-1" },
    ]);
    db.importCampricerPriceData.mockResolvedValue({
      mapping: { id: "m" },
      outcome: "unchanged",
    });
    expect(
      (await syncCampricerService(dependencies())).summary.counts.unchanged,
    ).toBe(1);
    expect(rebuild).toHaveBeenCalled();
  });
  it("retains cursor and ETag after processing failure, with sanitized errors", async () => {
    const redis = storage(),
      deps = dependencies(redis);
    db.importCampricerPriceData.mockRejectedValueOnce(new Error("test-secret"));
    const result = await syncCampricerService(deps);
    expect(result.summary.cursorAfter).toBe(1);
    expect(redis.values.has(`${campricerNamespace()}:state`)).toBe(false);
    expect(
      JSON.stringify(db.completePriceFetchRunData.mock.calls),
    ).not.toContain("test-secret");
  });
  it("honors Retry-After and does not retry a 429 immediately", async () => {
    const redis = storage(),
      deps = dependencies(redis);
    deps.fetch.mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "3600" } }),
    );
    await syncCampricerService(deps);
    await syncCampricerService(deps);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(redis.values.get(`${campricerNamespace()}:state`)).toMatchObject({
      nextPage: 1,
      nextEligibleAt: time + 3600000,
    });
  });
  it("does not fetch when locked or Redis is unavailable", async () => {
    const redis = storage(),
      deps = dependencies(redis);
    redis.values.set(`${campricerNamespace()}:lock`, "another-run");
    await syncCampricerService(deps);
    expect(deps.fetch).not.toHaveBeenCalled();
    redis.set.mockRejectedValueOnce(new Error("secret"));
    await syncCampricerService(deps);
    expect(db.completePriceFetchRunData).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ERROR" }),
    );
  });
  it("restarts safely after losing cursor state", async () => {
    const deps = dependencies();
    await syncCampricerService(deps);
    expect(deps.fetch.mock.calls[0]?.[0]).toContain("page=1");
  });
  it("parses both forms of Retry-After and isolates environments", () => {
    expect(parseRetryAfter("60", time)).toBe(time + 60000);
    expect(parseRetryAfter("Sat, 10 Oct 2026 11:00:00 GMT", time)).toBe(
      time + 3600000,
    );
    expect(parseRetryAfter("bad", time)).toBe(time + 86400000);
    expect(campricerNamespace({ VERCEL_ENV: "production" })).not.toBe(
      campricerNamespace({ VERCEL_ENV: "preview" }),
    );
  });
});
