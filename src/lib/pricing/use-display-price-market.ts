"use client";

import { useEffect, useState } from "react";
import { useCountry } from "~/lib/hooks/useCountry";
import {
  getPriceMarketForLocaleId,
  type PriceMarket,
} from "~/lib/pricing/display-price";

/**
 * Keeps the server's route-derived market for the first render, then follows
 * the user's persisted country/market selection once local storage is ready.
 */
export function useDisplayPriceMarket(initialMarket: PriceMarket): PriceMarket {
  const { isLocaleReady, localeId } = useCountry();
  const [market, setMarket] = useState(initialMarket);

  useEffect(() => {
    if (!isLocaleReady) return;
    setMarket(getPriceMarketForLocaleId(localeId));
  }, [isLocaleReady, localeId]);

  return market;
}
