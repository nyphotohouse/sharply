"use client";

import useSWR from "swr";
import type { ExchangeRates } from "~/lib/pricing/display-price";

export const EXCHANGE_RATES_ENDPOINT = "/api/pricing/exchange-rates";

const fetcher = async (url: string): Promise<ExchangeRates> => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Request failed with status ${response.status}`);
  return (await response.json()) as ExchangeRates;
};

export function useExchangeRates(
  initialRates?: ExchangeRates | null,
): ExchangeRates | null {
  const { data } = useSWR<ExchangeRates>(EXCHANGE_RATES_ENDPOINT, fetcher, {
    fallbackData: initialRates ?? undefined,
    dedupingInterval: 12 * 60 * 60 * 1000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: !initialRates,
  });

  return data ?? initialRates ?? null;
}
