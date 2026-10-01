import { describe, expect, it } from "vitest";
import {
  getComparablePrice,
  getDisplayPrice,
  getPriceMarketForLocale,
  type DisplayPriceInput,
} from "~/lib/pricing/display-price";
import { formatDisplayPrice } from "~/lib/mapping/price-map";

const projection = {
  US: {
    low: 160000,
    typical: 178300,
    high: 195000,
    asOf: "2026-09-29T12:00:00.000Z",
    status: "current" as const,
    sourceCount: 2,
    observationCount: 5,
    methodVersion: 1,
  },
};

describe("display price resolution", () => {
  const exchangeRates = {
    base: "EUR",
    date: "2026-09-29",
    rates: { USD: 1.1, GBP: 0.86 },
  };

  it("uses an exact current estimate and supports its real range", () => {
    const input: DisplayPriceInput = { usedPriceProjection: projection };

    expect(getDisplayPrice(input, { market: "US" })).toMatchObject({
      source: "USED_ESTIMATE",
      status: "current",
      currency: "USD",
      condition: "USED",
      value: { kind: "POINT", amountMinor: 178300 },
    });
    expect(getDisplayPrice(input, { market: "US", range: true })).toMatchObject(
      {
        value: {
          kind: "RANGE",
          lowMinor: 160000,
          typicalMinor: 178300,
          highMinor: 195000,
        },
      },
    );
    expect(formatDisplayPrice(getDisplayPrice(input, { market: "US" }))).toBe(
      "~$1,783 USD",
    );
    expect(
      formatDisplayPrice(
        getDisplayPrice(input, { market: "US", range: true }),
        {
          style: "short",
        },
      ),
    ).toBe("$1,600 – $1,950");
  });

  it.each([
    ["US", "USD"],
    ["UK", "GBP"],
    ["EU", "EUR"],
  ] as const)(
    "infers %s currency from its exact market",
    (market, currency) => {
      expect(
        getDisplayPrice(
          {
            usedPriceProjection: {
              [market]: projection.US,
            },
          },
          { market },
        ),
      ).toMatchObject({
        market,
        currency,
        marketMatch: "exact",
        source: "USED_ESTIMATE",
      });
    },
  );

  it("keeps a stale estimate ahead of the legacy fallbacks", () => {
    expect(
      getDisplayPrice(
        {
          usedPriceProjection: {
            US: { ...projection.US, status: "stale" },
          },
          mpbMaxPriceUsdCents: 120000,
          msrpNowUsdCents: 210000,
        },
        { market: "US" },
      ),
    ).toMatchObject({
      source: "USED_ESTIMATE",
      status: "stale",
      value: { kind: "POINT", amountMinor: 178300 },
    });
  });

  it("uses another market as a converted display fallback", () => {
    const input: DisplayPriceInput = {
      usedPriceProjection: { EU: projection.US },
    };

    const price = getDisplayPrice(input, {
      market: "UK",
      exchangeRates,
    });

    expect(price).toMatchObject({
      market: "EU",
      marketMatch: "fallback",
      currency: "GBP",
      isConverted: true,
      value: { kind: "POINT", amountMinor: 153300 },
    });
    expect(
      formatDisplayPrice(price, {
        style: "short",
        locale: "en-GB",
        padWholeAmounts: true,
      }),
    ).toBe("~£1,533");
  });

  it("keeps the original source currency when rates are unavailable", () => {
    const price = getDisplayPrice(
      { usedPriceProjection: { EU: projection.US } },
      { market: "UK" },
    );

    expect(price).toMatchObject({
      currency: "EUR",
      isConverted: false,
      value: { kind: "POINT", amountMinor: 178300 },
    });
  });

  it("converts legacy USD fallbacks when rates are provided", () => {
    expect(
      getComparablePrice(
        { mpbMaxPriceUsdCents: 120000 },
        { market: "EU", exchangeRates },
      ),
    ).toMatchObject({
      currency: "EUR",
      valueMinor: 109100,
      comparable: true,
    });
  });

  it.each([
    ["en", "US"],
    ["en-gb", "UK"],
    ["de", "EU"],
    ["fr", "EU"],
  ] as const)("maps %s to the %s price market", (locale, market) => {
    expect(getPriceMarketForLocale(locale)).toBe(market);
  });

  it("falls back through MPB, current MSRP, and launch MSRP", () => {
    expect(
      getDisplayPrice(
        { mpbMaxPriceUsdCents: 120000, msrpNowUsdCents: 210000 },
        { market: "US" },
      ).source,
    ).toBe("LEGACY_MPB");
    expect(
      getDisplayPrice({ msrpNowUsdCents: 210000 }, { market: "US" }).source,
    ).toBe("MSRP_NOW");
    expect(
      getDisplayPrice({ msrpAtLaunchUsdCents: 240000 }, { market: "US" })
        .source,
    ).toBe("MSRP_LAUNCH");
  });

  it("does not turn point fallbacks into fake ranges", () => {
    expect(
      getDisplayPrice(
        { mpbMaxPriceUsdCents: 120000 },
        { market: "US", range: true },
      ),
    ).toMatchObject({
      value: { kind: "POINT", amountMinor: 120000 },
    });
  });

  it("ignores unavailable and malformed projection values", () => {
    expect(
      getDisplayPrice(
        {
          usedPriceProjection: {
            US: { ...projection.US, status: "unavailable" },
          },
          mpbMaxPriceUsdCents: 0,
          msrpNowUsdCents: -1,
          msrpAtLaunchUsdCents: "not-a-price",
        },
        { market: "US" },
      ),
    ).toMatchObject({
      source: null,
      status: "unavailable",
      value: null,
    });
  });

  it("does not compare a USD fallback as a UK numeric price", () => {
    expect(
      getComparablePrice({ mpbMaxPriceUsdCents: 120000 }, { market: "UK" }),
    ).toMatchObject({
      currency: "USD",
      valueMinor: null,
      comparable: false,
    });
    expect(
      getComparablePrice({ mpbMaxPriceUsdCents: 120000 }, { market: "US" }),
    ).toMatchObject({
      currency: "USD",
      valueMinor: 120000,
      comparable: true,
    });
  });
});
