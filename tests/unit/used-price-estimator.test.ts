import { describe, expect, it } from "vitest";
import { getLocalizedPriceFetchUrl } from "~/server/pricing/adapters/json-ld";
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

  it("uses range bounds and midpoint for a deterministic estimate", () => {
    const result = estimatePrice([
      {
        id: "one",
        valueKind: "POINT",
        amountMinor: 80000,
        observedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "two",
        valueKind: "RANGE",
        lowMinor: 90000,
        highMinor: 110000,
        observedAt: new Date("2026-01-02T00:00:00Z"),
      },
      {
        id: "three",
        valueKind: "POINT",
        amountMinor: 140000,
        observedAt: new Date("2026-01-03T00:00:00Z"),
      },
    ]);

    expect(result).toEqual({
      lowMinor: 85000,
      typicalMinor: 100000,
      highMinor: 125000,
      asOf: new Date("2026-01-03T00:00:00Z"),
      observationCount: 3,
      inputObservationIds: ["one", "two", "three"],
    });
  });

  it("includes multiple same-day range observations", () => {
    const result = estimatePrice([
      {
        id: "one",
        valueKind: "RANGE",
        lowMinor: 10000,
        highMinor: 20000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
      },
      {
        id: "two",
        valueKind: "RANGE",
        lowMinor: 20000,
        highMinor: 30000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
      },
    ]);

    expect(result).toMatchObject({
      lowMinor: 12500,
      typicalMinor: 20000,
      highMinor: 27500,
      observationCount: 2,
      inputObservationIds: ["one", "two"],
    });
  });

  it("keeps a single range as a range", () => {
    const result = estimatePrice([
      {
        valueKind: "RANGE",
        lowMinor: 10000,
        highMinor: 20000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
      },
    ]);

    expect(result).toMatchObject({
      lowMinor: 10000,
      typicalMinor: 15000,
      highMinor: 20000,
      observationCount: 1,
    });
  });

  it("uses the five most recent observations and excludes older values", () => {
    const result = estimatePrice([
      {
        id: "old",
        valueKind: "POINT",
        amountMinor: 100000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
      {
        id: "one",
        valueKind: "POINT",
        amountMinor: 10000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-02-01T12:00:00Z"),
      },
      {
        id: "two",
        valueKind: "POINT",
        amountMinor: 11000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-03-01T12:00:00Z"),
      },
      {
        id: "three",
        valueKind: "POINT",
        amountMinor: 12000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-04-01T12:00:00Z"),
      },
      {
        id: "four",
        valueKind: "POINT",
        amountMinor: 13000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-05-01T12:00:00Z"),
      },
      {
        id: "five",
        valueKind: "POINT",
        amountMinor: 14000,
        observedAt: new Date("2026-10-01T12:00:00Z"),
        createdAt: new Date("2026-06-01T12:00:00Z"),
      },
    ]);

    expect(result).toMatchObject({
      lowMinor: 11000,
      typicalMinor: 12000,
      highMinor: 13000,
      observationCount: 5,
      inputObservationIds: ["one", "two", "three", "four", "five"],
    });
  });

  it("rounds calculated values to the nearest dollar", () => {
    const result = estimatePrice([
      {
        id: "one",
        valueKind: "POINT",
        amountMinor: 10049,
        observedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "two",
        valueKind: "POINT",
        amountMinor: 20051,
        observedAt: new Date("2026-01-02T00:00:00Z"),
      },
      {
        id: "three",
        valueKind: "POINT",
        amountMinor: 30049,
        observedAt: new Date("2026-01-03T00:00:00Z"),
      },
      {
        id: "four",
        valueKind: "POINT",
        amountMinor: 40051,
        observedAt: new Date("2026-01-04T00:00:00Z"),
      },
    ]);

    expect(result).toMatchObject({
      lowMinor: 17600,
      typicalMinor: 25100,
      highMinor: 32600,
    });
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
