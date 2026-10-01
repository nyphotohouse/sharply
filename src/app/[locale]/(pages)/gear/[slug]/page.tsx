import { FileDown } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConstructionFullPage } from "~/app/[locale]/(pages)/gear/_components/construction-full";
import { RumoredFullPage } from "~/app/[locale]/(pages)/gear/_components/rumored-full";
import { isRumoredGear } from "~/lib/gear/publication-state";
import { GearActionButtons } from "~/app/[locale]/(pages)/gear/_components/gear-action-buttons";
import { GearContributors } from "~/app/[locale]/(pages)/gear/_components/gear-contributors";
import { GearImageCarousel } from "~/app/[locale]/(pages)/gear/_components/gear-image-carousel";
import { GearLinks } from "~/app/[locale]/(pages)/gear/_components/gear-links";
import { GearReviews } from "~/app/[locale]/(pages)/gear/_components/gear-reviews";
import { GearVisitTracker } from "~/app/[locale]/(pages)/gear/_components/gear-visit-tracker";
import DiscordBanner from "~/components/discord-banner";
import { HallOfFameBadge } from "~/components/gear-badges/hall-of-fame-badge";
import { LiveTrendingBadge } from "~/components/gear-badges/live-trending-badge";
import { NewBadge } from "~/components/gear-badges/new-badge";
import { GearDisplayName } from "~/components/gear/gear-display-name";
import { GearPriceDisplay } from "~/components/gear/gear-price-display";
import { GearItemDock } from "~/components/gear/gear-tools-dock/gear-item-dock";
import { RenameGearButton } from "~/components/gear/rename-gear-button";
import { TagCloud } from "~/components/gear/tag-cloud";
import { NewsCard } from "~/components/home/news-card";
import { JsonLd } from "~/components/json-ld";
import { Breadcrumbs, type CrumbItem } from "~/components/layout/breadcrumbs";
import { getGearDisplayImageUrl } from "~/lib/gear/display-image";
import { buildGearMetaDescription } from "~/lib/seo/build-gear-meta-description";
import {
  buildBreadcrumbJsonLd,
  buildGearProductJsonLd,
} from "~/lib/seo/json-ld-helpers";
import { RelativeTime } from "~/components/relative-time";
import { Button } from "~/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "~/components/ui/item";
import { formatDate } from "~/lib/format/date";
import { GetGearDisplayName } from "~/lib/gear/naming";
import { resolveRegionFromCountryCode } from "~/lib/gear/region";
import {
  getPriceViewForLocale,
  type ExchangeRates,
  type PriceMarket,
} from "~/lib/pricing/display-price";
import { getBrandById } from "~/lib/mapping/brand-map";
import { shouldPrebuildHeavyRouteLocale } from "~/lib/static-generation";
import { getConstructionState } from "~/lib/utils";
import { isInHallOfFame } from "~/lib/utils/is-in-hall-of-fame";
import { isNewRelease } from "~/lib/utils/is-new";
import type { GearItem } from "~/types/gear";
import { fetchPublicGearCreatorVideosByGearId } from "~/server/creator-videos/service";
import {
  fetchGearAlternativesByGearId,
  fetchGearBySlug,
  fetchNewestGearSlugs,
  fetchPendingEditCountForGear,
  fetchStaffVerdictByGearId,
} from "~/server/gear/service";
import {
  getNewsByRelatedGearSlug,
  getReviewByGearSlug,
} from "~/server/payload/service";
import {
  fetchHighTrafficGearSlugs,
  fetchTrendingSlugs,
  getTrendingStatusForSlugs,
} from "~/server/popularity/service";
import { getExchangeRates } from "~/server/pricing/exchange-rates";
import { AiReviewBanner } from "../_components/ai-review-banner";
import { CreatorVideosSection } from "../_components/creator-videos-section";
import { EditAlreadyPendingToast } from "../_components/edit-already-pending-toast";
import { GearAlternativesSection } from "../_components/gear-alternatives-section";
import { buildGearBreadcrumbItems } from "../_components/gear-breadcrumb-items";
import { GearBreadcrumbNameHydrator } from "../_components/gear-breadcrumb-name-hydrator";
import { buildGearSectionNavItems } from "../_components/gear-section-nav";
import GearStatsCard from "../_components/gear-stats-card";
import { InstructionManualSection } from "../_components/instruction-manual-section";
import { SignInToEditSpecsCta } from "../_components/sign-in-to-edit-cta";
import { SpecsSection } from "../_components/specs-section";
import { StaffVerdictSection } from "../_components/staff-verdict-section";
import { UserPendingEditBanner } from "../_components/user-pending-edit-banner";
import { generateGearPageMetadata } from "./metadata";

export const revalidate = 86400;
export const dynamicParams = true;

const GEAR_PREBUILD_TRENDING_LIMIT = 100;
const GEAR_PREBUILD_NEWEST_LIMIT = 100;
const GEAR_PREBUILD_HIGH_TRAFFIC_LIMIT = 175;

interface GearPageProps {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: GearPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  return await generateGearPageMetadata({ locale, slug });
}

export default async function GearPage({ params }: GearPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "gearDetail" });
  // console.log("[gear/[slug]] Generating static page (build/ISR)", { slug });
  const viewerRegion = resolveRegionFromCountryCode(null);

  // Fetch core gear data
  const item = await fetchGearBySlug(slug, { includeRumored: true }).catch(
    (err: any) => {
      if (err?.status === 404) return null;
      throw err;
    },
  );

  if (!item) return notFound();

  const exchangeRates = await getExchangeRates();
  const { market } = getPriceViewForLocale(locale, exchangeRates);
  const hasMpbPrice = item.mpbMaxPriceUsdCents != null;
  const regionalDisplayName = GetGearDisplayName(
    {
      name: item.name,
      regionalAliases: item.regionalAliases ?? [],
    },
    { region: viewerRegion },
  );

  const isAuthenticated = false;
  const hasImageRequest: boolean | null = null;

  if (isRumoredGear(item)) {
    return (
      <main className="mx-auto max-w-5xl space-y-8 px-4 pt-20 sm:px-6">
        <GearItemDock
          slug={slug}
          gearId={item.id}
          gearType={item.gearType}
          currentThumbnailUrl={item.thumbnailUrl ?? null}
          currentTopViewUrl={item.topViewUrl ?? null}
          currentRearViewUrl={item.rearViewUrl ?? null}
          currentLeftViewUrl={item.leftViewUrl ?? null}
          currentRightViewUrl={item.rightViewUrl ?? null}
          currentInstructionManualUrl={item.linkInstructionManual ?? null}
          publicationState={item.publicationState}
          rawSamples={item.rawSamples ?? []}
          colorways={item.colorways ?? []}
        />
        <RumoredFullPage gearName={regionalDisplayName} slug={item.slug} />
      </main>
    );
  }

  // Under construction state
  const construction = getConstructionState(item);

  if (construction.underConstruction) {
    return (
      <main className="mx-auto mt-24 min-h-screen max-w-4xl p-6">
        <ConstructionFullPage
          gearName={regionalDisplayName}
          missing={construction.missing}
          slug={item.slug}
          gearType={item.gearType}
        />
      </main>
    );
  }

  const [verdict, trendingSlugs] = await Promise.all([
    fetchStaffVerdictByGearId(item.id),
    getTrendingStatusForSlugs([item.slug], {
      timeframe: "30d",
      limit: 20,
    }),
  ]);
  const isNew = isNewRelease(
    item.releaseDate ?? item.announcedDate,
    item.releaseDatePrecision ?? item.announceDatePrecision,
  );
  const isTrending = trendingSlugs.has(item.slug);
  const isHallOfFameItem = isInHallOfFame(item.slug);

  const brand = getBrandById(item.brandId ?? "");

  // console.log("[GearPage] item", item);

  const breadCrumbItems = [
    ...buildGearBreadcrumbItems({
      brandId: brand?.id ?? item.brandId ?? null,
      brandName: brand?.name ?? null,
      brandSlug: brand?.slug ?? null,
      gearType: item.gearType,
      mountId: item.mountId,
      mountIds: item.mountIds,
      labels: {
        gear: t("gear"),
        cameras: t("cameras"),
        lenses: t("lenses"),
      },
    }),
    {
      label: (
        <span data-gear-breadcrumb-label data-gear-breadcrumb-slug={item.slug}>
          {regionalDisplayName}
        </span>
      ),
    },
  ].filter(Boolean) as CrumbItem[];
  const sectionNavItems = buildGearSectionNavItems({
    hasEditorialReview: false,
    hasInstructionManual: Boolean(item.linkInstructionManual?.trim()),
    hasCreatorVideos: false,
    hasRawSamples: Boolean(
      item.gearType === "CAMERA" &&
      item.rawSamples &&
      item.rawSamples.length > 0,
    ),
    hasAlternatives: false,
    hasRelatedArticles: false,
    verdict,
    labels: {
      staffVerdict: t("staffVerdict"),
      specs: t("specs"),
      instructionManual: t("instructionManual.navLabel"),
      review: t("review"),
      reviews: t("reviews"),
      rawSamples: t("rawSamples"),
      alternatives: t("alternatives"),
      creatorVideos: t("creatorVideos"),
      articles: t("articles"),
    },
  });

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 pt-20 sm:px-6">
      <Suspense fallback={null}>
        <EditAlreadyPendingToast />
      </Suspense>
      <GearItemDock
        slug={item.slug}
        gearId={item.id}
        gearType={item.gearType}
        currentThumbnailUrl={item.thumbnailUrl ?? null}
        currentTopViewUrl={item.topViewUrl ?? null}
        currentRearViewUrl={item.rearViewUrl ?? null}
        currentLeftViewUrl={item.leftViewUrl ?? null}
        currentRightViewUrl={item.rightViewUrl ?? null}
        currentInstructionManualUrl={item.linkInstructionManual ?? null}
        publicationState={item.publicationState}
        rawSamples={item.rawSamples ?? []}
        colorways={item.colorways ?? []}
      />
      {/* Track page visit for popularity */}
      <GearVisitTracker slug={slug} />
      <section className="space-y-4">
        <div className="hidden sm:block">
          <Breadcrumbs items={breadCrumbItems} />
          <GearBreadcrumbNameHydrator
            slug={item.slug}
            name={item.name}
            regionalAliases={item.regionalAliases ?? []}
          />
        </div>
        {/* Item Name */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold sm:text-5xl">
              <GearDisplayName
                name={item.name}
                regionalAliases={item.regionalAliases}
              />
            </h1>
            <RenameGearButton
              gearId={item.id}
              currentName={item.name}
              currentSlug={item.slug}
              regionalAliases={item.regionalAliases ?? undefined}
            />
          </div>
          <GearPriceDisplay
            gearId={item.id}
            slug={item.slug}
            priceInput={{
              usedPriceProjection: item.usedPriceProjection,
              mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents,
              msrpNowUsdCents: item.msrpNowUsdCents,
              msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents,
            }}
            initialMarket={market}
            initialExchangeRates={exchangeRates}
            hasMpbPrice={hasMpbPrice}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isHallOfFameItem ? <HallOfFameBadge /> : null}
            <LiveTrendingBadge
              slug={item.slug}
              initialIsTrending={isTrending}
            />
            {isNew ? <NewBadge /> : null}
          </div>
        </div>
        {/* Photo Placeholder */}
        <div>
          <GearImageCarousel
            name={item.name}
            gearType={item.gearType}
            regionalAliases={item.regionalAliases}
            thumbnailUrl={item.thumbnailUrl}
            topViewUrl={item.topViewUrl}
            rearViewUrl={item.rearViewUrl}
            leftViewUrl={item.leftViewUrl}
            rightViewUrl={item.rightViewUrl}
            slug={slug}
            hasImageRequest={hasImageRequest}
            colorways={item.colorways}
          />
        </div>
      </section>

      {/* Intra-page nav bar */}
      {sectionNavItems.length > 0 && (
        <section className="bg-background sticky top-16 z-20 hidden border-b py-2 md:block">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {sectionNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-primary text-sm transition-all hover:underline"
              >
                {item.label}
              </Link>
            ))}
            <Suspense fallback={null}>
              <EditorialReviewNavItem label={t("review")} slug={item.slug} />
            </Suspense>
            <Suspense fallback={null}>
              <AlternativesNavItem gearId={item.id} label={t("alternatives")} />
            </Suspense>
            <Suspense fallback={null}>
              <CreatorVideosNavItem
                gearId={item.id}
                label={t("creatorVideos")}
              />
            </Suspense>
            <Suspense fallback={null}>
              <RelatedArticlesNavItem label={t("articles")} slug={item.slug} />
            </Suspense>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-10">
        <div className="col-span-1 space-y-4 md:col-span-7">
          {/* Pending submission banner (client, only for this user when pending) */}
          <UserPendingEditBanner slug={slug} />
          {/* Staff Verdict */}
          <StaffVerdictSection slug={slug} verdict={verdict} />

          {/* Specifications */}
          <SpecsSection
            item={item}
            slug={item.slug}
            gearType={item.gearType}
            initialMarket={market}
            initialExchangeRates={exchangeRates}
            viewerRegion={viewerRegion}
          />
          <InstructionManualSection
            linkInstructionManual={item.linkInstructionManual ?? null}
          />
          {/* Sign-in CTA banner for editing specs (client, only when signed out) */}
          <SignInToEditSpecsCta slug={item.slug} gearType={item.gearType} />
          <Suspense fallback={null}>
            <EditorialReviewSection slug={item.slug} />
          </Suspense>
          {/* Raw Samples (only for cameras) */}
          {item.gearType === "CAMERA" &&
            item.rawSamples &&
            item.rawSamples.length > 0 && (
              <section id="raw-samples" className="scroll-mt-24 space-y-3">
                <h3 className="text-lg font-semibold">{t("rawSamples")}</h3>
                <div className="space-y-2">
                  {item.rawSamples.map((sample) => (
                    <Item key={sample.id} variant="outline" size="sm">
                      <ItemContent>
                        <ItemTitle className="max-w-[70%] truncate text-sm font-medium">
                          {sample.originalFilename ?? sample.fileUrl}
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <Button
                          size="sm"
                          className="h-8 w-auto px-3 text-xs"
                          icon={<FileDown className="h-4 w-4" />}
                          asChild
                        >
                          <a
                            href={sample.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            {t("download")}
                          </a>
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              </section>
            )}
          {/* Alternatives */}
          <Suspense fallback={null}>
            <GearAlternativesAndVideos
              gearId={item.id}
              slug={item.slug}
              market={market}
              exchangeRates={exchangeRates}
            />
          </Suspense>
        </div>
        {/* Right column */}
        <div className="static top-28 col-span-1 -mt-4 w-full space-y-8 self-start sm:sticky md:col-span-3">
          {/* Action Buttons */}
          <div className="w-full">
            <GearActionButtons
              slug={slug}
              name={item.name}
              regionalAliases={item.regionalAliases}
              gearType={item.gearType}
              initialIsAuthenticated={isAuthenticated}
            />
          </div>
          {/* Links */}
          <div className="mb-8">
            <GearLinks
              slug={item.slug}
              gearType={item.gearType}
              mountIds={item.mountIds ?? null}
              lensImageCircleSizeId={item.lensSpecs?.imageCircleSizeId ?? null}
              brandName={item.brands?.name ?? brand?.name ?? null}
              linkManufacturer={item.linkManufacturer ?? null}
              linkMpb={item.linkMpb ?? null}
              linkBh={item.linkBh ?? null}
              linkAmazon={item.linkAmazon ?? null}
              mpbMaxPriceUsdCents={item.mpbMaxPriceUsdCents ?? null}
              msrpNowUsdCents={item.msrpNowUsdCents ?? null}
            />
          </div>

          {/* Contributors */}
          <Suspense fallback={null}>
            <GearContributors gearId={item.id} />
          </Suspense>
          <GearStatsCard slug={slug} />
          {item.tags?.length ? (
            <section className="border-t pt-6">
              <div className="mb-2 text-lg font-semibold">{t("tags")}</div>
              <TagCloud tags={item.tags} />
            </section>
          ) : null}
          <Suspense fallback={null}>
            <GearPageMetadata item={item} locale={locale} />
          </Suspense>
        </div>
      </div>

      {/* Reviews */}
      <section id="reviews" className="scroll-mt-24">
        <GearReviews
          slug={item.slug}
          bannerSlot={
            <Suspense fallback={null}>
              <AiReviewBanner gearId={item.id} />
            </Suspense>
          }
        />
      </section>

      <DiscordBanner />

      <Suspense fallback={null}>
        <RelatedArticlesSection locale={locale} slug={item.slug} />
      </Suspense>

      <JsonLd
        data={[
          buildGearProductJsonLd({
            item,
            displayName: regionalDisplayName,
            description: buildGearMetaDescription({
              gear: item,
              displayName: regionalDisplayName,
              staffVerdictContent: verdict?.content ?? null,
            }),
            imageUrl: item.ogImageUrl ?? getGearDisplayImageUrl(item),
          }),
          buildBreadcrumbJsonLd([
            ...breadCrumbItems
              .filter((crumb) => typeof crumb.label === "string")
              .map((crumb) => ({
                name: crumb.label as string,
                path: crumb.href,
              })),
            { name: regionalDisplayName },
          ]),
        ]}
      />
    </main>
  );
}

function GearSectionNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-primary text-sm transition-colors hover:underline"
    >
      {label}
    </Link>
  );
}

async function EditorialReviewNavItem({
  label,
  slug,
}: {
  label: string;
  slug: string;
}) {
  const review = await getReviewByGearSlug(slug);
  return review ? (
    <GearSectionNavLink href="#editorial-review" label={label} />
  ) : null;
}

async function AlternativesNavItem({
  gearId,
  label,
}: {
  gearId: string;
  label: string;
}) {
  const alternatives = await fetchGearAlternativesByGearId(gearId);
  return alternatives.length > 0 ? (
    <GearSectionNavLink href="#alternatives" label={label} />
  ) : null;
}

async function CreatorVideosNavItem({
  gearId,
  label,
}: {
  gearId: string;
  label: string;
}) {
  const videos = await fetchPublicGearCreatorVideosByGearId(gearId);
  return videos.length > 0 ? (
    <GearSectionNavLink href="#creator-videos" label={label} />
  ) : null;
}

async function RelatedArticlesNavItem({
  label,
  slug,
}: {
  label: string;
  slug: string;
}) {
  const relatedNews = await getNewsByRelatedGearSlug(slug, 1);
  return relatedNews.length > 0 ? (
    <GearSectionNavLink href="#related-articles" label={label} />
  ) : null;
}

async function EditorialReviewSection({ slug }: { slug: string }) {
  const [review, t] = await Promise.all([
    getReviewByGearSlug(slug),
    getTranslations("gearDetail"),
  ]);
  if (!review) return null;

  return (
    <section id="editorial-review" className="scroll-mt-24">
      <Link href={`/reviews/${review.slug}`}>
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <span className="text-lg font-bold">{review.title}</span>
          <p className="text-muted-foreground text-sm">
            {review.review_summary}
          </p>
          <div className="mt-2">
            <Button variant="outline" className="hover:cursor-pointer">
              {t("readFullReview")}
            </Button>
          </div>
        </div>
      </Link>
    </section>
  );
}

async function GearAlternativesAndVideos({
  gearId,
  slug,
  market,
  exchangeRates,
}: {
  gearId: string;
  slug: string;
  market: PriceMarket;
  exchangeRates: ExchangeRates | null;
}) {
  const [alternatives, creatorVideos] = await Promise.all([
    fetchGearAlternativesByGearId(gearId),
    fetchPublicGearCreatorVideosByGearId(gearId),
  ]);
  const trendingSlugs = await getTrendingStatusForSlugs(
    [slug, ...alternatives.map((alternative) => alternative.slug)],
    { timeframe: "30d", limit: 20 },
  );

  return (
    <>
      <GearAlternativesSection
        alternatives={alternatives}
        trendingSlugs={trendingSlugs}
        market={market}
        exchangeRates={exchangeRates}
      />
      <CreatorVideosSection videos={creatorVideos} />
    </>
  );
}

async function GearPageMetadata({
  item,
  locale,
}: {
  item: GearItem;
  locale: string;
}) {
  const [pendingChangeRequests, t] = await Promise.all([
    fetchPendingEditCountForGear(item.id),
    getTranslations({ locale, namespace: "gearDetail" }),
  ]);

  return (
    <div className="mt-8 border-t pt-6">
      <div className="text-muted-foreground space-y-2 text-sm">
        <div className="flex justify-between">
          {t("openChangeRequests")}
          <span>{pendingChangeRequests}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("itemCreated")}</span>
          <span>
            {formatDate(item.createdAt, { locale, preset: "date-long" })}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{t("lastUpdated")}</span>
          <RelativeTime
            isoDate={item.updatedAt.toISOString()}
            locale={locale}
            capitalize
          />
        </div>
      </div>
    </div>
  );
}

async function RelatedArticlesSection({
  locale,
  slug,
}: {
  locale: string;
  slug: string;
}) {
  const [relatedNews, t] = await Promise.all([
    getNewsByRelatedGearSlug(slug, 9),
    getTranslations({ locale, namespace: "gearDetail" }),
  ]);
  if (relatedNews.length === 0) return null;

  return (
    <section id="related-articles" className="scroll-mt-24">
      <h2 className="mb-2 text-lg font-semibold">{t("articlesAboutItem")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {relatedNews.map((post) => {
          const image =
            post.thumbnail && typeof post.thumbnail === "object"
              ? (post.thumbnail.url ?? "/image-temp.png")
              : "/image-temp.png";
          return (
            <NewsCard
              key={post.id}
              post={{
                id: post.id,
                title: post.title,
                excerpt: (post.excerpt as any) ?? undefined,
                href: `/news/${post.slug}`,
                image,
                date: formatDate(post.override_date || post.createdAt, {
                  locale,
                  preset: "date-medium",
                }),
              }}
              size="sm"
            />
          );
        })}
      </div>
    </section>
  );
}

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  if (!shouldPrebuildHeavyRouteLocale(params.locale)) {
    return [];
  }

  const [trendingSlugs, newestSlugs, highTrafficSlugs] = await Promise.all([
    fetchTrendingSlugs({
      timeframe: "30d",
      limit: GEAR_PREBUILD_TRENDING_LIMIT,
    }),
    fetchNewestGearSlugs(GEAR_PREBUILD_NEWEST_LIMIT),
    fetchHighTrafficGearSlugs(GEAR_PREBUILD_HIGH_TRAFFIC_LIMIT),
  ]);

  const slugs = Array.from(
    new Set([...trendingSlugs, ...newestSlugs, ...highTrafficSlugs]),
  );

  return slugs.map((slug) => ({ slug }));
}
