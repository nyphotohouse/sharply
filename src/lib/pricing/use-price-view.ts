"use client";

import {
  createPriceView,
  type ExchangeRates,
  type PriceMarket,
  type PriceView,
} from "~/lib/pricing/display-price";
import { useDisplayPriceMarket } from "~/lib/pricing/use-display-price-market";
import { useExchangeRates } from "~/lib/pricing/use-exchange-rates";

export function usePriceView(
  initialMarket: PriceMarket,
  initialExchangeRates?: ExchangeRates | null,
): PriceView {
  const market = useDisplayPriceMarket(initialMarket);
  const exchangeRates = useExchangeRates(initialExchangeRates);

  return createPriceView(market, exchangeRates);
}
