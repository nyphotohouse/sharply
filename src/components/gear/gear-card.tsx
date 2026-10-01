"use client";

import { useLocale } from "next-intl";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import type React from "react";
import { useState } from "react";
import { BRANDS } from "~/lib/constants";
import { formatDateWithPrecision, type DatePrecision } from "~/lib/format/date";
import { useGearDisplayName } from "~/lib/hooks/useGearDisplayName";
import { PRICE_FALLBACK_TEXT } from "~/lib/mapping";
import { ApproximatePriceText } from "./approximate-price-text";
import { cn } from "~/lib/utils";
import { isInHallOfFame } from "~/lib/utils/is-in-hall-of-fame";
import { isNewRelease } from "~/lib/utils/is-new";
import type { GearAlias } from "~/types/gear";
import {
  LiveTrendingBadge,
  type TrendingBadgeQuery,
} from "../gear-badges/live-trending-badge";
import { HallOfFameBadge } from "../gear-badges/hall-of-fame-badge";
import { NewBadge } from "../gear-badges/new-badge";
import { Spinner } from "../ui/spinner";
import { GearCardMoreMenu } from "./gear-card-more-menu";

const BASE_BRAND_NAMES = uniqueCaseInsensitive(
  BRANDS.flatMap((brand) => splitBrandNameVariants(brand.name)),
).sort((a, b) => b.length - a.length);

function splitBrandNameVariants(brandName: string) {
  const normalized = brandName?.trim();
  if (!normalized) return [] as string[];

  const parts = normalized
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return uniqueCaseInsensitive([normalized, ...parts]);
}

function uniqueCaseInsensitive(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripBrandFromName(name: string, brandName?: string | null) {
  const normalizedName = name.trim();
  if (!normalizedName) return normalizedName;

  const candidateBrands = uniqueCaseInsensitive([
    ...(brandName ? splitBrandNameVariants(brandName) : []),
    ...BASE_BRAND_NAMES,
  ]).sort((a, b) => b.length - a.length);

  for (const candidate of candidateBrands) {
    const pattern = new RegExp(
      `^${escapeRegExp(candidate)}(?:\\s+|[-–—:]\\s*)`,
      "i",
    );

    if (pattern.test(normalizedName)) {
      const stripped = normalizedName.replace(pattern, "").trim();
      if (stripped) {
        return stripped;
      }
    }
  }

  return normalizedName;
}

export type GearCardProps = {
  href: string;
  slug: string;
  name: string;
  regionalAliases?: GearAlias[] | null;
  brandName?: string | null;
  thumbnailUrl?: string | null;
  gearType?: string | null;
  isTrending?: boolean;
  trendingQuery?: TrendingBadgeQuery;
  trendingStatusSource?: "baseline" | "live";
  releaseDate?: string | Date | null;
  releaseDatePrecision?: DatePrecision | null;
  announcedDate?: string | Date | null;
  announceDatePrecision?: DatePrecision | null;
  priceText?: string | null;
  metaRight?: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
};

export function GearCardLinkPendingState({
  children,
}: {
  children: (pending: boolean) => React.ReactNode;
}) {
  const { pending } = useLinkStatus();

  return children(pending);
}

export function formatGearCardDate(
  dateValue?: string | Date | null,
  precision?: DatePrecision | null,
  locale?: string,
) {
  if (!dateValue) return "---";
  if (!locale) return "-";

  return formatDateWithPrecision(dateValue, {
    locale,
    precision: precision ?? "MONTH",
    variant: "month-year",
    monthStyle: "short",
    fallback: "-",
  });
}

// TODO: Need to work on what information is showed on these cards, might vary based on where they are used
// should so badges, trending, etc. in some places.
export function GearCard(props: GearCardProps) {
  const {
    href,
    slug,
    name,
    regionalAliases,
    brandName,
    thumbnailUrl,
    gearType,
    isTrending,
    trendingQuery,
    trendingStatusSource,
    releaseDate,
    releaseDatePrecision,
    announcedDate,
    announceDatePrecision,
    priceText,
    metaRight,
    badges,
    className,
  } = props;

  const locale = useLocale();
  const displayName = useGearDisplayName({ name, regionalAliases });
  const trimmedName = stripBrandFromName(displayName, brandName);
  const dateLabel = formatGearCardDate(
    releaseDate ?? announcedDate,
    releaseDatePrecision ?? announceDatePrecision,
    locale,
  );
  const isNew = isNewRelease(
    releaseDate ?? announcedDate,
    releaseDatePrecision ?? announceDatePrecision,
  );
  const isHallOfFameItem = isInHallOfFame(slug);
  const badgeNodes: React.ReactNode[] = [];
  if (isHallOfFameItem) badgeNodes.push(<HallOfFameBadge key="hall-of-fame" />);
  if (isTrending !== undefined) {
    badgeNodes.push(
      <LiveTrendingBadge
        key="trending"
        slug={slug}
        initialIsTrending={isTrending}
        query={trendingQuery}
        source={trendingStatusSource}
      />,
    );
  }
  if (isNew) badgeNodes.push(<NewBadge key="new" />);
  if (badges) badgeNodes.push(badges);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  return (
    <div className={cn("group relative", className)}>
      {/* Outer card with hover-thicker border */}
      <Link href={href} className="block" data-gear-card-link="true">
        <GearCardLinkPendingState>
          {(pending) => (
            <div
              className={cn(
                "border-input bg-card/50 hover:border-foreground/40 relative rounded-2xl border transition-all",
                "shadow-sm hover:shadow-md",
                pending && "pointer-events-none",
              )}
              data-gear-card-pending={pending ? "true" : "false"}
            >
              {/* Inset surface (border removed) */}
              <div className="bg-background relative rounded-2xl p-2">
                <div
                  className={cn(
                    "transition-opacity duration-150",
                    pending && "opacity-50",
                  )}
                  data-gear-card-content-pending={pending ? "true" : "false"}
                >
                  {/* Image area */}
                  <div className="bg-muted dark:bg-card relative aspect-video overflow-hidden rounded-xl">
                    {badgeNodes.length ? (
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {badgeNodes}
                      </div>
                    ) : null}
                    <div className="h-full w-full p-8">
                      <div className="relative h-full w-full">
                        {thumbnailUrl ? (
                          // Transparent gear on gray background expected
                          <Image
                            src={thumbnailUrl}
                            alt={displayName}
                            fill
                            sizes="(max-width: 640px) 85vw, 560px"
                            className="pointer-events-none object-contain transition-opacity group-hover:opacity-50"
                          />
                        ) : (
                          <div className="text-muted-foreground/50 flex h-full w-full items-center justify-center text-xl font-bold">
                            {trimmedName}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hover actions overlay */}
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 flex items-start justify-end p-2 transition-opacity",
                        pending
                          ? "opacity-0"
                          : moreMenuOpen
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <div
                        className={cn(
                          "pointer-events-auto",
                          pending && "pointer-events-none",
                        )}
                      >
                        <GearCardMoreMenu
                          slug={slug}
                          displayName={displayName}
                          gearType={gearType}
                          onOpenChange={setMoreMenuOpen}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Content below image */}
                  <div className="mt-3 space-y-2 px-1.5 pb-1 transition-opacity group-hover:opacity-50">
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        {brandName ? <span>{brandName}</span> : null}
                      </div>
                      {metaRight ? (
                        <span className="bg-secondary rounded-full px-2 py-1 text-xs">
                          {metaRight}
                        </span>
                      ) : null}
                    </div>

                    <div className="text-foreground truncate text-lg font-semibold">
                      {trimmedName}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground text-xs">
                        {dateLabel}
                      </div>
                      {priceText ? (
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            priceText === PRICE_FALLBACK_TEXT
                              ? "text-muted-foreground"
                              : "text-foreground",
                          )}
                        >
                          <ApproximatePriceText value={priceText} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {pending ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                    data-gear-card-pending-overlay="true"
                  >
                    <Spinner className="text-foreground size-6" />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </GearCardLinkPendingState>
      </Link>
    </div>
  );
}

export function GearCardSkeleton() {
  return (
    <div className="group relative">
      <div
        className={cn(
          "border-input bg-card/50 hover:border-foreground/40 block rounded-2xl border transition-all",
          "shadow-sm hover:shadow-md",
        )}
      >
        {/* Inset surface (border removed) */}
        <div className="bg-background rounded-2xl p-2">
          {/* Image area */}
          <div className="bg-muted dark:bg-card relative flex aspect-video items-center justify-center overflow-hidden rounded-xl">
            <Spinner className="text-muted-foreground/50 size-6" />
          </div>
          <div className="mt-3 space-y-5 px-1.5 pb-1 transition-opacity group-hover:opacity-50">
            <div className="bg-muted/60 h-3 w-16 rounded" />
            <div className="bg-muted h-4 w-16 rounded" />
            <div className="flex items-center justify-between">
              <div className="bg-muted/60 h-3 w-24 rounded"></div>
              <div className="bg-muted/60 h-4 w-12 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
