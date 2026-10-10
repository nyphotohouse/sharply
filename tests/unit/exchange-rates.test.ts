import { afterEach, describe, expect, it, vi } from "vitest";
import { getExchangeRates } from "~/server/pricing/exchange-rates";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchange rate service", () => {
  it("normalizes the cached provider response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { base: "EUR", quote: "USD", date: "2026-09-29", rate: 1.1 },
          { base: "EUR", quote: "GBP", date: "2026-09-29", rate: 0.86 },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeRates()).resolves.toEqual({
      base: "EUR",
      date: "2026-09-29",
      rates: { USD: 1.1, GBP: 0.86 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,GBP",
      { next: { revalidate: 60 * 60 * 12 }, signal: expect.any(AbortSignal) },
    );
  });

  it("returns null when the provider response is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ quote: "USD", rate: 1.1 }]), {
          status: 200,
        }),
      ),
    );

    await expect(getExchangeRates()).resolves.toBeNull();
  });
});

it("returns null when the exchange-rate request times out", async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(controller.signal);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("timed out")),
            { once: true },
          );
        }),
    ),
  );
  try {
    const result = getExchangeRates();
    controller.abort();
    await expect(result).resolves.toBeNull();
    expect(timeout).toHaveBeenCalledWith(10000);
  } finally {
    timeout.mockRestore();
  }
});
