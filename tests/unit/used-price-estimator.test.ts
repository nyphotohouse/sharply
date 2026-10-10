import { describe, expect, it, vi } from "vitest";
import {
  createJsonLdPriceAdapter,
  getLocalizedPriceFetchUrl,
} from "~/server/pricing/adapters/json-ld";
import { estimatePrice } from "~/server/pricing/estimator";
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  PRICE_MARKETS,
  getManualRefreshRetryAt,
  getPriceFetchRunStatus,
  hasRequiredPriceSourceLink,
} from "~/server/pricing/types";

describe("used price estimator", () => {
  it("exposes only coarse markets for new price mappings", () => {
    expect(PRICE_MARKETS).toEqual(["US", "UK", "EU"]);
  });

  const point = (
    sourceKey: string,
    amountMinor: number,
    date = "2026-01-01",
    id = sourceKey,
  ) => ({
    sourceKey,
    amountMinor,
    valueKind: "POINT" as const,
    observedAt: new Date(date),
    id,
  });
  it("weights sources and uses their extrema", () => {
    expect(
      estimatePrice([
        point("campricer", 100000),
        point("mpb", 120000),
        point("kamerastore", 130000),
      ]),
    ).toMatchObject({
      typicalMinor: 110000,
      lowMinor: 100000,
      highMinor: 130000,
      observationCount: 3,
    });
  });
  it("normalizes missing sources and includes manual evidence", () => {
    expect(
      estimatePrice([point("campricer", 100000), point("manual", 120000)]),
    ).toMatchObject({ typicalMinor: 105000, observationCount: 2 });
  });
  it("uses one latest point per source regardless of fetch frequency", () => {
    expect(
      estimatePrice([
        point("mpb", 200000, "2026-01-01", "old"),
        point("mpb", 120000, "2026-02-01", "new"),
        point("campricer", 100000),
      ]),
    ).toMatchObject({
      typicalMinor: 105000,
      inputObservationIds: ["campricer", "new"],
      asOf: new Date("2026-01-01"),
    });
  });
  it("uses creation time then ID for timestamp ties", () => {
    const a = {
      ...point("mpb", 10000, "2026-01-01", "a"),
      createdAt: new Date("2026-02-01"),
    };
    const b = {
      ...point("mpb", 20000, "2026-01-01", "b"),
      createdAt: new Date("2026-02-01"),
    };
    expect(estimatePrice([a, b])?.typicalMinor).toBe(20000);
    expect(
      estimatePrice([{ ...a, createdAt: new Date("2026-03-01") }, b])
        ?.typicalMinor,
    ).toBe(10000);
  });
  it("collapses legacy ranges and rounds whole currency units", () => {
    expect(
      estimatePrice([
        {
          sourceKey: "manual",
          valueKind: "RANGE",
          lowMinor: 10000,
          highMinor: 20100,
        },
      ]),
    ).toMatchObject({ typicalMinor: 15100, lowMinor: 15100, highMinor: 15100 });
  });

  it("returns null when observations have no usable price", () => {
    expect(
      estimatePrice([
        {
          valueKind: "POINT",
          amountMinor: null,
          observedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]),
    ).toBeNull();
  });

  it("keeps editor refreshes inside the cooldown window", () => {
    const lastFetchedAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date(
      lastFetchedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS - 1,
    );

    expect(getManualRefreshRetryAt(lastFetchedAt, now)).toEqual(
      new Date(lastFetchedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS),
    );
    expect(
      getManualRefreshRetryAt(
        lastFetchedAt,
        new Date(lastFetchedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS),
      ),
    ).toBeNull();
  });

  it("requires a link for automatic sources but not manual sources", () => {
    expect(hasRequiredPriceSourceLink("mpb", null, null)).toBe(false);
    expect(
      hasRequiredPriceSourceLink("kamerastore", "https://example.com", null),
    ).toBe(true);
    expect(hasRequiredPriceSourceLink("manual", null, null)).toBe(true);
  });

  it("summarizes scheduled runs by their mapping outcomes", () => {
    expect(getPriceFetchRunStatus(3, 0, 0)).toBe("SUCCESS");
    expect(getPriceFetchRunStatus(2, 1, 1)).toBe("PARTIAL");
    expect(getPriceFetchRunStatus(0, 0, 2)).toBe("ERROR");
    expect(getPriceFetchRunStatus(0, 0, 0)).toBe("SUCCESS");
  });

  it("collapses retailer aggregate bounds to a point and prefers explicit prices", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const mapping = {
      id: "m",
      sourceKey: "mpb",
      marketKey: "US",
      canonicalUrl: "https://example.com/product",
      fetchUrl: null,
      externalProductId: null,
    };
    try {
      fetchMock.mockResolvedValueOnce(
        new Response(
          '<script type="application/ld+json">{"offers":{"lowPrice":100,"highPrice":200,"priceCurrency":"USD"}}</script>',
        ),
      );
      expect(
        (await createJsonLdPriceAdapter("mpb").fetch(mapping)).observations[0],
      ).toMatchObject({ valueKind: "POINT", amountMinor: 15000 });
      fetchMock.mockResolvedValueOnce(
        new Response(
          '<script type="application/ld+json">{"offers":{"price":180,"lowPrice":100,"highPrice":200,"priceCurrency":"USD"}}</script>',
        ),
      );
      expect(
        (await createJsonLdPriceAdapter("mpb").fetch(mapping)).observations[0],
      ).toMatchObject({ valueKind: "POINT", amountMinor: 18000 });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("aborts a stalled retailer request when its batch deadline expires", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    try {
      const result = createJsonLdPriceAdapter("mpb").fetch(
        {
          id: "m",
          sourceKey: "mpb",
          marketKey: "US",
          canonicalUrl: "https://example.com/product",
          fetchUrl: null,
          externalProductId: null,
        },
        { signal: controller.signal },
      );
      controller.abort();
      await expect(result).resolves.toMatchObject({
        status: "ERROR",
        observations: [],
      });
      expect(timeout).toHaveBeenCalledWith(20000);
    } finally {
      fetch.mockRestore();
      timeout.mockRestore();
    }
  });

  it("keeps UK KameraStore fetches on the GBP storefront", () => {
    expect(
      getLocalizedPriceFetchUrl({
        sourceKey: "kamerastore",
        marketKey: "UK",
        fetchUrl:
          "https://kamerastore.com/en-gb/products/nikon-z-f-nikon-z-t154529",
      }),
    ).toBe(
      "https://kamerastore.com/en-gb/products/nikon-z-f-nikon-z-t154529?country=GB",
    );
  });

  it("keeps EU KameraStore fetches on the EUR storefront", () => {
    expect(
      getLocalizedPriceFetchUrl({
        sourceKey: "kamerastore",
        marketKey: "EU",
        fetchUrl:
          "https://kamerastore.com/en-eu/products/nikon-z-f-nikon-z-t154529",
      }),
    ).toBe(
      "https://kamerastore.com/en-eu/products/nikon-z-f-nikon-z-t154529?country=DE",
    );
  });
});
