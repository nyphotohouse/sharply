// Next.js enforces this module boundary in production while the dynamic form
// keeps the pure normalization logic directly unit-testable in Vitest.
void import("server-only").catch(() => undefined);

import type { ExchangeRates } from "~/lib/pricing/display-price";

const EXCHANGE_RATES_URL =
  "https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,GBP";
const EXCHANGE_RATES_REVALIDATE_SECONDS = 60 * 60 * 12;

type FrankfurterRate = {
  base?: unknown;
  quote?: unknown;
  date?: unknown;
  rate?: unknown;
};

export async function getExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const response = await fetch(EXCHANGE_RATES_URL, {
      next: { revalidate: EXCHANGE_RATES_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return null;

    const rates: Record<string, number> = {};
    let date: string | null = null;
    for (const row of rows as FrankfurterRate[]) {
      if (
        typeof row.quote !== "string" ||
        typeof row.rate !== "number" ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      ) {
        continue;
      }
      rates[row.quote] = row.rate;
      if (date === null && typeof row.date === "string") date = row.date;
    }

    if (!rates.USD || !rates.GBP) return null;
    return { base: "EUR", date, rates };
  } catch {
    return null;
  }
}
