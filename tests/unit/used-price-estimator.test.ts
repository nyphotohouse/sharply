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

  it("uses a range midpoint and quartiles for a deterministic estimate", () => {
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
      lowMinor: 90000,
      typicalMinor: 100000,
      highMinor: 120000,
      asOf: new Date("2026-01-03T00:00:00Z"),
      observationCount: 3,
      inputObservationIds: ["one", "two", "three"],
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
