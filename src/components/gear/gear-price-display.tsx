"use client";

import { getItemDisplayPrice, PRICE_FALLBACK_TEXT } from "~/lib/mapping";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import { useDisplayPriceMarket } from "~/lib/pricing/use-display-price-market";
import { useExchangeRates } from "~/lib/pricing/use-exchange-rates";
import type { GearItem } from "~/types/gear";
import { ApproximatePriceText } from "./approximate-price-text";
import { AddMissingPriceModal } from "./add-missing-price-modal";

type GearPriceInput = Pick<
  GearItem,
  | "usedPriceProjection"
  | "mpbMaxPriceUsdCents"
  | "msrpNowUsdCents"
  | "msrpAtLaunchUsdCents"
>;

type GearPriceDisplayProps = {
  priceInput: GearPriceInput;
  gearId: string;
  slug: string;
  initialMarket: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
  hasMpbPrice: boolean;
};

export function GearPriceDisplay({
  priceInput,
  gearId,
  slug,
  initialMarket,
  initialExchangeRates,
  hasMpbPrice,
}: GearPriceDisplayProps) {
  const market = useDisplayPriceMarket(initialMarket);
  const exchangeRates = useExchangeRates(initialExchangeRates);
  const locale =
    market === "US" ? "en-US" : market === "UK" ? "en-GB" : "de-DE";
  const priceDisplay = getItemDisplayPrice(priceInput, {
    style: "short",
    market,
    locale,
    exchangeRates,
  });
  const msrpNowDisplay =
    hasMpbPrice && priceInput.msrpNowUsdCents != null
      ? getItemDisplayPrice(
          { msrpNowUsdCents: priceInput.msrpNowUsdCents },
          { style: "short", market, locale, exchangeRates },
        )
      : null;

  return (
    <div className="mt-2 text-lg font-semibold sm:text-2xl">
      {priceDisplay === PRICE_FALLBACK_TEXT ? (
        <AddMissingPriceModal gearId={gearId} slug={slug} market={market} />
      ) : (
        <>
          <ApproximatePriceText value={priceDisplay} />
          {msrpNowDisplay ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal sm:text-lg">
              / <ApproximatePriceText value={msrpNowDisplay} />
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
