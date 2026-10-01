"use client";

import { useLocale } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BRANDS } from "~/lib/constants";
import { useGearDisplayName } from "~/lib/hooks/useGearDisplayName";
import { PRICE_FALLBACK_TEXT } from "~/lib/mapping";
import { ApproximatePriceText } from "./approximate-price-text";
import { cn } from "~/lib/utils";
import { isInHallOfFame } from "~/lib/utils/is-in-hall-of-fame";
import { isNewRelease } from "~/lib/utils/is-new";
import { HallOfFameBadge } from "../gear-badges/hall-of-fame-badge";
import { LiveTrendingBadge } from "../gear-badges/live-trending-badge";
import { NewBadge } from "../gear-badges/new-badge";
import {
  formatGearCardDate,
  GearCardLinkPendingState,
  type GearCardProps,
} from "./gear-card";
import { GearCardMoreMenu } from "./gear-card-more-menu";
import { Spinner } from "../ui/spinner";

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

const BASE_BRAND_NAMES = uniqueCaseInsensitive(
  BRANDS.flatMap((brand) => splitBrandNameVariants(brand.name)),
).sort((a, b) => b.length - a.length);

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

export type GearCardHorizontalProps = GearCardProps;

export function GearCardHorizontal(props: GearCardHorizontalProps) {
  const {
    href,
    slug,
    name,
    regionalAliases,
    brandName,
    thumbnailUrl,
    gearType,
    releaseDate,
    isTrending,
    trendingQuery,
    trendingStatusSource,
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
      <Link href={href} className="block" data-gear-card-link="true">
        <GearCardLinkPendingState>
          {(pending) => (
            <div
              className={cn(
                "border-input bg-card/50 hover:border-foreground/40 relative rounded-lg border transition-all",
                "shadow-sm hover:shadow-md",
                pending && "pointer-events-none",
              )}
              data-gear-card-pending={pending ? "true" : "false"}
            >
              <div className="bg-background relative rounded-lg p-2">
                <div
                  className={cn(
                    "transition-opacity duration-150",
                    pending && "opacity-50",
                  )}
                  data-gear-card-content-pending={pending ? "true" : "false"}
                >
                  <div className="flex gap-3">
                    {/* Image / left side */}
                    <div className="bg-muted dark:bg-card relative w-48 shrink-0 overflow-hidden rounded">
                      <div className="relative aspect-video">
                        <div className="h-full w-full p-4">
                          <div className="relative h-full w-full">
                            {thumbnailUrl ? (
                              <Image
                                src={thumbnailUrl}
                                alt={displayName}
                                fill
                                sizes="(max-width: 768px) 192px, 192px"
                                className="pointer-events-none object-contain"
                              />
                            ) : (
                              <div className="text-muted-foreground/50 flex h-full w-full items-center justify-center text-center text-sm font-bold">
                                {trimmedName}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right content */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between px-1.5 py-1">
                      <div>
                        <div className="relative pr-10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1" />
                            {metaRight ? (
                              <span className="bg-secondary shrink-0 rounded-full px-2 py-1 text-xs">
                                {metaRight}
                              </span>
                            ) : null}
                          </div>

                          <div
                            className={cn(
                              "pointer-events-none absolute top-0 right-0 transition-opacity",
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

                        <div className="text-foreground line-clamp-2 font-semibold">
                          {brandName ? (
                            <span className="text-muted-foreground mr-1.5 font-medium">
                              {brandName}
                            </span>
                          ) : null}
                          <span>{trimmedName}</span>
                        </div>
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="text-muted-foreground text-xs">
                            {dateLabel}
                          </div>
                          {priceText && dateLabel !== "---" ? (
                            <>
                              <span className="text-muted-foreground text-xs">
                                ·
                              </span>
                              <span
                                className={cn(
                                  "text-xs font-semibold",
                                  priceText === PRICE_FALLBACK_TEXT
                                    ? "text-muted-foreground"
                                    : "text-foreground",
                                )}
                              >
                                <ApproximatePriceText value={priceText} />
                              </span>
                            </>
                          ) : null}
                        </div>

                        {badgeNodes.length > 0 ? (
                          <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1 md:flex">
                            {badgeNodes}
                          </div>
                        ) : null}
                      </div>
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
