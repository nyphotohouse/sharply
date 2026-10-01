/**
 * Simple price formatting utilities for converting cents to readable currency
 */

import type { GearItem } from "~/types/gear";
import {
  getDisplayPrice,
  MARKET_CURRENCY,
  type DisplayPrice,
  type DisplayPriceInput,
  type ExchangeRates,
  type PriceMarket,
} from "~/lib/pricing/display-price";

export const PRICE_FALLBACK_TEXT = "$ ---";

type FormatPriceOptions = {
  /**
   * Long style adds the USD suffix (used on detail pages) while the short style
   * keeps the value compact for cards and badges.
   */
  style?: "long" | "short";
  /**
   * Forces two decimal places even for whole-dollar amounts. Helpful for tables
   * and cards so prices stay aligned with ".00".
   */
  padWholeAmounts?: boolean;
};

export type DisplayPriceFormatOptions = FormatPriceOptions & {
  locale?: string;
  exchangeRates?: ExchangeRates | null;
};

type PriceableGear = Partial<
  Pick<
    GearItem,
    | "usedPriceProjection"
    | "mpbMaxPriceUsdCents"
    | "msrpNowUsdCents"
    | "msrpAtLaunchUsdCents"
  >
>;

export function normalizePriceCents(priceCents: unknown): number | null {
  if (
    typeof priceCents === "number" &&
    Number.isFinite(priceCents) &&
    Number.isInteger(priceCents)
  ) {
    return priceCents;
  }
  if (typeof priceCents === "string" && priceCents.trim() !== "") {
    const parsed = Number(priceCents);
    return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Format price from cents to readable currency string
 * @param priceCents - Price in cents (e.g., 324900 for $3,249.00)
 * @returns Formatted price string (e.g., "$3,249.00")
 */
export function formatPrice(
  priceCents: number | string | null | undefined,
  { style = "long", padWholeAmounts = false }: FormatPriceOptions = {},
): string {
  const normalizedPriceCents = normalizePriceCents(priceCents);
  if (normalizedPriceCents === null) return PRICE_FALLBACK_TEXT;

  const dollars = normalizedPriceCents / 100;
  const formatted = dollars.toLocaleString("en-US", {
    minimumFractionDigits: padWholeAmounts ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return style === "short" ? `$${formatted}` : `$${formatted} USD`;
}

function formatDisplayPriceValue(
  amountMinor: number,
  currency: string,
  options: DisplayPriceFormatOptions,
): string {
  if (
    currency === MARKET_CURRENCY.US &&
    (options.locale ?? "en-US") === "en-US"
  ) {
    return formatPrice(amountMinor, options);
  }

  return new Intl.NumberFormat(options.locale ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: options.padWholeAmounts ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/**
 * Format a resolved price without changing the resolver's source or shape.
 * This is intentionally separate from getDisplayPrice so selection remains a
 * pure, testable policy and callers can choose their own locale presentation.
 */
export function formatDisplayPrice(
  price: DisplayPrice | null | undefined,
  {
    style = "long",
    padWholeAmounts = false,
    locale = "en-US",
  }: DisplayPriceFormatOptions = {},
): string {
  if (
    !price ||
    price.status === "unavailable" ||
    !price.value ||
    !price.currency
  ) {
    return PRICE_FALLBACK_TEXT;
  }

  const prefix =
    price.isConverted ||
    (price.source === "USED_ESTIMATE" && price.value.kind === "POINT")
      ? "~"
      : "";

  const currency = price.currency;
  const shouldPadWholeAmounts = price.isConverted ? false : padWholeAmounts;
  const formatValue = (amountMinor: number) =>
    formatDisplayPriceValue(amountMinor, currency, {
      style: "short",
      padWholeAmounts: shouldPadWholeAmounts,
      locale,
    });

  if (price.value.kind === "RANGE") {
    const range = `${formatValue(price.value.lowMinor)} – ${formatValue(
      price.value.highMinor,
    )}`;
    return `${prefix}${style === "short" ? range : `${range} ${currency}`}`;
  }

  const formatted = formatDisplayPriceValue(price.value.amountMinor, currency, {
    style,
    padWholeAmounts: shouldPadWholeAmounts,
    locale,
  });
  if (style === "long" && currency !== MARKET_CURRENCY.US) {
    return `${formatted} ${currency}`;
  }
  return `${prefix}${formatted}`;
}

/**
 * Backwards-compatible string adapter around the shared display-price
 * resolver. New callers that need source, condition, freshness, or range
 * metadata should call getDisplayPrice directly.
 */
export function getItemDisplayPrice(
  item: PriceableGear | null | undefined,
  {
    style = "long",
    padWholeAmounts = false,
    market = "US",
    range = false,
    locale = "en-US",
    exchangeRates = null,
  }: DisplayPriceFormatOptions & {
    market?: PriceMarket;
    range?: boolean;
  } = {},
): string {
  const price = getDisplayPrice(item as DisplayPriceInput, {
    market,
    range,
    exchangeRates,
  });
  return formatDisplayPrice(price, {
    style,
    padWholeAmounts,
    locale,
  });
}
