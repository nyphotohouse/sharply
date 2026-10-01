"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getGearDisplayImageUrl } from "~/lib/gear/display-image";
import { useGearDisplayName } from "~/lib/hooks/useGearDisplayName";
import { getItemDisplayPrice } from "~/lib/mapping";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import { usePriceView } from "~/lib/pricing/use-price-view";
import { getBrandNameById } from "~/lib/mapping/brand-map";
import type { GearItem } from "~/types/gear";
import { WishlistRemoveButton } from "./wishlist-remove-button";
import { ApproximatePriceText } from "~/components/gear/approximate-price-text";

interface WishlistGearCardProps {
  item: GearItem;
  showRemoveButton: boolean;
  market: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
}

// Client-side wishlist card so we can optimistically hide on removal
export function WishlistGearCard({
  item,
  showRemoveButton,
  market,
  initialExchangeRates,
}: WishlistGearCardProps) {
  const [isRemoved, setIsRemoved] = useState(false);

  const brandName = getBrandNameById(item.brandId);
  const displayName = useGearDisplayName({
    name: item.name,
    regionalAliases: item.regionalAliases,
  });
  const trimmedName = getDisplayName(displayName, brandName);
  const priceView = usePriceView(market, initialExchangeRates);
  const priceDisplay = getItemDisplayPrice(item, {
    style: "short",
    padWholeAmounts: true,
    priceView,
  });
  const displayImageUrl = getGearDisplayImageUrl(item);
  const brandLabel = brandName || "Unknown brand";

  if (isRemoved) {
    return null;
  }

  return (
    <Link
      href={`/gear/${item.slug}`}
      className="group border-border/80 hover:border-foreground/50 relative block overflow-hidden rounded-xl border transition-colors"
    >
      {showRemoveButton ? (
        <div className="absolute top-2 right-2 z-10">
          <WishlistRemoveButton
            slug={item.slug}
            gearName={displayName}
            onRemoved={() => setIsRemoved(true)}
            onUndo={() => setIsRemoved(false)}
          />
        </div>
      ) : null}
      <div className="flex gap-3 p-2">
        {displayImageUrl ? (
          <div className="bg-muted relative aspect-4/3 w-28 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={displayImageUrl}
              alt={displayName}
              fill
              sizes="(min-width: 1024px) 180px, 30vw"
              className="object-contain p-2"
            />
          </div>
        ) : (
          <div className="bg-muted text-muted-foreground relative aspect-4/3 w-28 shrink-0 overflow-hidden rounded-lg">
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs font-medium">
              {trimmedName}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-col gap-1">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {brandLabel}
            </span>
            <h3 className="line-clamp-2 pr-4 text-sm leading-tight font-semibold sm:text-lg">
              {trimmedName}
            </h3>
            <span className="text-muted-foreground mt-auto text-sm font-medium">
              <ApproximatePriceText value={priceDisplay} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function getDisplayName(name: string, brandName?: string | null) {
  const trimmed = stripBrandFromName(name, brandName);
  return trimmed || name;
}

function stripBrandFromName(name: string, brandName?: string | null) {
  const normalizedName = name?.trim();
  if (!normalizedName) return normalizedName;

  if (!brandName) return normalizedName;

  const normalizedBrand = brandName.trim();
  if (!normalizedBrand) return normalizedName;

  const pattern = new RegExp(
    `^${escapeRegExp(normalizedBrand)}(?:\\s+|[-–—:]\\s*)`,
    "i",
  );

  const stripped = normalizedName.replace(pattern, "").trim();
  return stripped || normalizedName;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
