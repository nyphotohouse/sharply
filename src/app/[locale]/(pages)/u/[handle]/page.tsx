import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SocialLinksDisplay } from "~/app/[locale]/(pages)/u/_components/social-links-display";
import { UserBadges } from "~/app/[locale]/(pages)/u/_components/user-badges";
import { UserReviewsList } from "~/app/[locale]/(pages)/u/_components/user-reviews-list";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "~/components/ui/empty";
import { getItemDisplayPrice } from "~/lib/mapping";
import { ApproximatePriceText } from "~/components/gear/approximate-price-text";
import { fetchUserListsForProfile } from "~/server/user-lists/service";
import type { SocialLink } from "~/server/users/service";
import {
  fetchUserByHandle,
  fetchUserOwnedItems,
  fetchUserWishlistItems,
  triggerHandleSetupNotification,
} from "~/server/users/service";
// Note: page is a Server Component and reads from the service layer only.
import { LibraryIcon, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { HandleSetupBanner } from "~/app/[locale]/(pages)/u/_components/HandleSetupBanner";
import { ShowUserCardButton } from "~/app/[locale]/(pages)/u/_components/ShowUserCardButton";
import { CollectionContainer } from "~/app/[locale]/(pages)/u/_components/collection/collection-container";
import {
  CollectionTableModal,
  type CollectionTableColumnKey,
} from "~/app/[locale]/(pages)/u/_components/collection/collection-table-modal";
import { sortCollectionItems } from "~/app/[locale]/(pages)/u/_components/collection/sort-collection-items";
import { UserListsSectionDeferred } from "~/app/[locale]/(pages)/u/_components/lists/user-lists-section-deferred";
import { WishlistGearCard } from "~/app/[locale]/(pages)/u/_components/wishlist-gear-card";
import { auth } from "~/auth";
import { Button } from "~/components/ui/button";
import { UserAvatar } from "~/components/ui/user-avatar";
import { GetGearDisplayName } from "~/lib/gear/naming";
import { getGearDisplayImageUrl } from "~/lib/gear/display-image";
import { getBrandNameById } from "~/lib/mapping/brand-map";
import {
  getPriceMarketForLocale,
  type PriceMarket,
} from "~/lib/pricing/display-price";
import { getExchangeRates } from "~/server/pricing/exchange-rates";
import type { ExchangeRates } from "~/lib/pricing/display-price";
import type { GearItem } from "~/types/gear";

interface UserProfilePageProps {
  params: Promise<{
    locale: string;
    handle: string;
  }>;
}

export async function generateMetadata({
  params,
}: UserProfilePageProps): Promise<Metadata> {
  const { locale, handle } = await params;
  const t = await getTranslations({ locale, namespace: "userProfile" });
  const user = await fetchUserByHandle(handle);
  const displayName = user?.name ?? t("anonymousUser");
  return {
    title: t("profileMetaTitle", { name: displayName }),
    openGraph: {
      title: t("profileMetaTitle", { name: displayName }),
    },
  };
}

export default async function UserProfilePage({
  params,
}: UserProfilePageProps) {
  const { locale, handle } = await params;
  const market = getPriceMarketForLocale(locale);
  const [t, exchangeRates, session] = await Promise.all([
    getTranslations({ locale, namespace: "userProfile" }),
    getExchangeRates(),
    auth.api.getSession({ headers: await headers() }),
  ]);

  const user = session?.user;

  // Load user profile
  const profile = await fetchUserByHandle(handle);
  if (!profile) notFound();

  // Wishlist and owned items via service layer
  const [wishlistItems, ownedItems, userLists] = await Promise.all([
    fetchUserWishlistItems(profile.id),
    fetchUserOwnedItems(profile.id),
    fetchUserListsForProfile({
      profileUserId: profile.id,
      viewerUserId: user?.id,
    }),
  ]);

  const sortedOwnedItems = sortCollectionItems(ownedItems);
  const myProfile = profile.id === user?.id;

  if (myProfile && !profile.handle) {
    void triggerHandleSetupNotification(profile.id);
  }

  // Parse social links from JSONB
  const socialLinks: SocialLink[] = Array.isArray(profile.socialLinks)
    ? (profile.socialLinks as SocialLink[])
    : [];

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6 pt-32">
      {/* User Header */}
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <UserAvatar
            src={profile.image}
            name={profile.name ?? t("anonymousUser")}
            alt={profile.name || t("userAlt")}
            className="h-16 w-16"
          />
          <div>
            <h1 className="text-3xl font-bold">
              {profile.name || t("anonymousUser")}
            </h1>
            <p className="text-muted-foreground">
              {t("gearCollectionWishlist")}
            </p>
          </div>
        </div>
        {myProfile && (
          <div className="flex items-center gap-2">
            <Button asChild icon={<UserPen />} className="self-end">
              <Link href="/profile/settings">{t("editProfile")}</Link>
            </Button>
            <ShowUserCardButton user={profile} />
          </div>
        )}
      </div>
      {myProfile && !profile.handle && <HandleSetupBanner />}
      {/* Social Links */}
      {socialLinks.length > 0 && (
        <div className="mb-8">
          <SocialLinksDisplay links={socialLinks} />
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Badges */}
        <div className="space-y-4 lg:col-span-2">
          <UserBadges userId={profile.id} />
        </div>

        {/* Collection */}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">{t("collection")}</h2>
              <span className="bg-secondary rounded px-3 py-1 text-sm font-medium">
                {t("itemsCount", { count: sortedOwnedItems.length })}
              </span>
            </div>
            {myProfile ? (
              <div className="flex items-center gap-2">
                <CollectionTableModal
                  items={sortedOwnedItems}
                  columnKeys={
                    [
                      "name",
                      "displayPrice",
                      "frontFilterThreadSizeMm",
                      "weightGrams",
                    ] satisfies CollectionTableColumnKey[]
                  }
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sortedOwnedItems.length === 0}
                    >
                      {t("manageCollection")}
                    </Button>
                  }
                />
              </div>
            ) : null}
          </div>

          {ownedItems.length > 0 ? (
            <>
              <div className="md:hidden">
                {sortedOwnedItems.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1">
                    {sortedOwnedItems.map((item) => (
                      <GearCard
                        key={item.id}
                        item={item}
                        market={market}
                        exchangeRates={exchangeRates}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border-border rounded-lg border-2 border-dashed p-8 text-center">
                    <p className="text-muted-foreground">
                      {t("collectionEmptyMobileTitle")}
                    </p>
                    <Link
                      href="/gear"
                      className="text-primary mt-2 inline-block"
                    >
                      {t("collectionEmptyMobileBrowse")}
                    </Link>
                  </div>
                )}
              </div>

              <CollectionContainer
                className="hidden md:block"
                items={sortedOwnedItems}
                user={profile}
              />
            </>
          ) : myProfile ? (
            <Empty className="border-border rounded-lg border-2 border-dashed p-8">
              <EmptyTitle>{t("collectionEmptyOwnTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("collectionEmptyOwnDescription")}
              </EmptyDescription>
              <EmptyContent>
                <div className="flex flex-col items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    icon={<LibraryIcon className="size-4" />}
                  >
                    <Link href="/gear">Browse gear</Link>
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="border-border text-muted-foreground rounded-lg border-2 border-dashed p-8 text-center">
              {t("collectionEmptyOtherNamed", { name: profile.name })}
            </div>
          )}
        </div>

        {/* Wishlist */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">{t("wishlist")}</h2>
            <span className="bg-secondary rounded-full px-3 py-1 text-sm font-medium">
              {t("itemsCount", { count: wishlistItems.length })}
            </span>
          </div>

          {wishlistItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              {wishlistItems.map((item) => (
                <WishlistGearCard
                  key={item.id}
                  item={item}
                  showRemoveButton={myProfile}
                  market={market}
                  initialExchangeRates={exchangeRates}
                />
              ))}
            </div>
          ) : myProfile ? (
            <Empty className="border-border rounded-lg border-2 border-dashed p-8">
              <EmptyTitle>{t("wishlistEmptyOwnTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("wishlistEmptyOwnDescription")}
              </EmptyDescription>
              <EmptyContent>
                <div className="flex flex-col items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    icon={<LibraryIcon className="size-4" />}
                  >
                    <Link href="/gear">{t("browseGear")}</Link>
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="border-border rounded-lg border-2 border-dashed p-8">
              <EmptyTitle>
                {profile.name
                  ? t("wishlistEmptyOtherNamed", { name: profile.name })
                  : t("wishlistEmptyOtherTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {t("wishlistEmptyOtherDescription")}
              </EmptyDescription>
            </Empty>
          )}
        </div>

        {/* Lists */}
        <div className="space-y-4">
          <UserListsSectionDeferred
            initialData={{
              lists: userLists.lists,
              myProfile: userLists.isOwner,
            }}
            profileUserId={profile.id}
            myProfile={myProfile}
            profileName={profile.name}
          />
        </div>

        {/* Reviews */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">{t("reviews")}</h2>
          </div>
          <UserReviewsList
            userId={profile.id}
            isCurrentUser={myProfile}
            profileName={profile.name}
          />
        </div>
      </div>
    </main>
  );
}

// Gear card component for displaying individual items
function GearCard({
  item,
  market,
  exchangeRates,
}: {
  item: GearItem;
  market: PriceMarket;
  exchangeRates: ExchangeRates | null;
}) {
  const brandName = getBrandNameById(item.brandId);
  const displayName = GetGearDisplayName({
    name: item.name,
    regionalAliases: item.regionalAliases ?? [],
  });
  const trimmedName = getDisplayName(displayName, brandName);
  const priceDisplay = getItemDisplayPrice(item, {
    style: "short",
    padWholeAmounts: true,
    market,
    locale: market === "US" ? "en-US" : market === "UK" ? "en-GB" : "de-DE",
    exchangeRates,
  });
  const displayImageUrl = getGearDisplayImageUrl(item);
  const brandLabel = brandName || "Unknown brand";

  return (
    <Link
      href={`/gear/${item.slug}`}
      className="group border-border/80 hover:border-foreground/50 block overflow-hidden rounded-xl border transition-colors"
    >
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
