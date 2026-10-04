import { ArrowRightIcon, BookOpenIcon, Library, Loader } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import DiscordBanner from "~/components/discord-banner";
import { ActivityList } from "~/components/home/activity-list";
import { ContributionCounter } from "~/components/home/contribution-counter";
import { GearCounter } from "~/components/home/gear-counter";
import { HeroTitle } from "~/components/home/hero-title";
import { HERO_TITLE_ROTATING_WORD_KEYS } from "~/components/home/hero-title-config";
import { NewsCard as HomeNewsCard } from "~/components/home/news-card";
import { RandomContributionBanner } from "~/components/home/random-contribution-banner";
import { ReviewCard, type ReviewPost } from "~/components/home/review-card";
import { GlobalSearchBar } from "~/components/search/global-search-bar";
import TrendingList from "~/components/trending-list";
import { LinkButton } from "~/components/ui/link-button";
import { Separator } from "~/components/ui/separator";
import { defaultLocale, isLocale } from "~/i18n/config";
import { localizePathname } from "~/i18n/routing";
import { formatDate } from "~/lib/format/date";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import type { Review } from "~/payload-types";
import { fetchHomeActivity } from "~/server/gear/service";
import { getHomeNewsPosts, getHomeReviews } from "~/server/payload/service";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedMetadata("/", {}, locale);
}

function stripHtml(html: string | null | undefined, maxLength = 160) {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

// const REVIEW_ITEMS: ReviewPost[] = [
//   {
//     id: 1,
//     title: "Nikon Z 24-70mm f/2.8 S: Long-term review",
//     href: "#",
//     author: { name: "Alex Johnson", avatar: "/image-temp.png" },
//     date: "2025-08-22",
//     ratingPercent: 86,
//   },
//   {
//     id: 2,
//     title: "Sony a7 IV: The hybrid king in 2025?",
//     href: "#",
//     author: { name: "Sam Rivera" },
//     date: "2025-08-21",
//     ratingPercent: 91,
//   },
//   {
//     id: 3,
//     title: "Fujifilm X100VI: Street shooter’s dream",
//     href: "#",
//     author: { name: "Jamie Lee" },
//     date: "2025-08-20",
//     ratingPercent: 88,
//   },
// ];

// Using reusable HomeNewsCard component from ~/components/home/news-card

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const t = await getTranslations({ locale, namespace: "home" });
  const [posts, payloadReviews, activityItems] = await Promise.all([
    getHomeNewsPosts(),
    getHomeReviews(),
    fetchHomeActivity(5),
  ]);

  const toHomePost = (p: (typeof posts)[number]) => {
    const thumbId =
      p.thumbnail && typeof p.thumbnail === "object"
        ? (p.thumbnail.url ?? undefined)
        : undefined;
    const image = thumbId ? (thumbId ?? undefined) : "/image-temp.png";
    const date = formatDate(p.createdAt, {
      locale,
      preset: "date-long",
    });
    return {
      id: p.id,
      title: p.title,
      excerpt: stripHtml(p.excerpt),
      href: `/news/${p.slug}`,
      image,
      date,
    };
  };

  const featuredPost = posts[0] ? toHomePost(posts[0]) : null;
  const otherPosts = posts.slice(1, 7).map(toHomePost);

  const calculateRatingPercent = (
    genreRatings: Review["genreRatings"] | undefined,
  ): number => {
    if (!genreRatings) return 0;
    // Treat "0" as N/A (ignore), map "1" → 0, "2" → 1, "3" → 2
    const transformed: number[] = Object.values(genreRatings)
      .map((v) => (v === null || v === undefined ? null : Number(v)))
      .filter(
        (v): v is number => typeof v === "number" && !Number.isNaN(v) && v >= 1,
      )
      .map((v) => v - 1);
    if (transformed.length === 0) return 0;
    const average =
      transformed.reduce((acc, n) => acc + n, 0) / transformed.length;
    return Math.round((average / 2) * 100);
  };

  const reviewItems: ReviewPost[] = payloadReviews.slice(0, 5).map((r) => ({
    id: r.id,
    title: r.title,
    href: `/reviews/${r.slug}`,
    author: { name: "Sharply Editorial" },
    date: formatDate(r.createdAt, {
      locale,
      preset: "date-long",
    }),
    ratingPercent: calculateRatingPercent(r.genreRatings),
  }));

  return (
    <div className="min-h-screen px-4 sm:px-6">
      {/* HERO */}
      <section className="w-full pt-20">
        <div className="mx-auto max-w-7xl px-2 py-8 sm:px-4 md:py-10">
          <div className="mx-auto space-y-4 text-center">
            <HeroTitle
              line1={t("heroTitleLine1")}
              line2LeadIn={t("heroTitleLine2LeadIn")}
              rotatingWords={HERO_TITLE_ROTATING_WORD_KEYS.map((key) =>
                t(`heroTitleRotatingWords.${key}`),
              )}
            />

            {/* Search box */}
            <div className="mx-auto w-full max-w-3xl">
              <div className="relative">
                <Suspense
                  fallback={
                    <div className="relative">
                      <div className="text-muted-foreground flex h-12 items-center rounded-lg border pr-14 pl-9 text-sm">
                        {t("loadingSearch")}
                        <Loader className="ml-auto h-5 w-5 animate-spin" />
                      </div>
                    </div>
                  }
                >
                  <GlobalSearchBar size="lg" showRotatingExamples />
                </Suspense>
              </div>
              <LinkButton
                href={localizePathname("/browse", locale)}
                className="mt-3 w-full md:hidden"
                icon={<Library className="h-4 w-4" />}
              >
                {t("browseAllGear")}
              </LinkButton>

              {/* <ScopeChips /> */}
            </div>
            <p className="text-muted-foreground mx-auto mt-2 hidden max-w-2xl text-balance md:block">
              {t("heroSubtitle")}
            </p>
            {/* 
            <Link
              href="/about/how-we-test"
              className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline"
            >
              Learn more
            </Link> */}
          </div>
        </div>
      </section>

      {/* FEATURED */}
      <section className="mx-auto mt-6 w-full max-w-7xl">
        <div className="mx-auto grid max-w-[96rem] grid-cols-1 gap-4 md:grid-cols-5 xl:grid-cols-6">
          {/* Center column featured post */}
          <div className="col-span-full md:col-span-3 xl:col-span-4">
            {featuredPost ? (
              <HomeNewsCard
                badge={t("featuredBadge")}
                post={featuredPost}
                imagePriority
              />
            ) : null}

            {/* News feed continuing below the featured article */}
            <div className="mt-4 flex flex-col gap-4">
              {otherPosts.map((item) => (
                <HomeNewsCard key={item.id} post={item} size="md" />
              ))}
            </div>
          </div>
          {/* Right column smaller links/posts */}
          <div className="col-span-full md:col-span-2 xl:col-span-2">
            <div className="flex h-full flex-col gap-2">
              {/* About + actions */}
              <div className="space-y-2 px-2">
                <h2 className="text-3xl font-bold">{t("aboutTitle")}</h2>
                <p className="text-muted-foreground">{t("aboutDescription")}</p>
                <div className="flex flex-col items-start gap-3 py-2">
                  <GearCounter locale={locale} />
                  <ContributionCounter locale={locale} />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <LinkButton
                    href={localizePathname("/browse", locale)}
                    icon={<Library className="h-4 w-4" />}
                  >
                    {t("viewAllGear")}
                  </LinkButton>
                  <LinkButton
                    href={localizePathname("/about", locale)}
                    variant="link"
                    icon={<ArrowRightIcon className="h-4 w-4" />}
                    iconPosition="right"
                    className="-ml-4"
                  >
                    {t("learnMore")}
                  </LinkButton>
                </div>
              </div>
              {/* Stats */}
              <div className="flex flex-col gap-2 px-4"></div>
              <Separator className="my-2" />
              <Suspense
                fallback={<TrendingList locale={locale} loading rows={10} />}
              >
                <TrendingList
                  locale={locale}
                  timeframe="7d"
                  limit={10}
                  liveRefresh
                />
              </Suspense>
              <Separator className="my-2" />
              {/* Banner link: New to Photography? */}
              <div className="border-border flex flex-col gap-4 rounded-md border p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold">
                    {t("newToPhotographyTitle")}
                  </h3>
                  <p className="text-muted-foreground max-w-lg text-sm">
                    {t("newToPhotographyDescription")}
                  </p>
                </div>
                <LinkButton
                  href={localizePathname("/learn/basics", locale)}
                  className="w-full cursor-pointer"
                  icon={<BookOpenIcon className="h-4 w-4" />}
                >
                  {t("getStarted")}
                </LinkButton>
              </div>
              <RandomContributionBanner locale={locale} />
              <DiscordBanner vertical />
              <Separator className="my-2" />
              <ActivityList items={activityItems} locale={locale} />
              {activityItems.length ? <Separator className="my-2" /> : null}
              {/* Latest Reviews */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold">{t("latestReviewsTitle")}</h2>
                {reviewItems?.map((post) => (
                  <ReviewCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BRANDS STRIP */}
      {/* <BrandsStrip /> */}

      {/* LATEST NEWS */}
      {/* <LatestContent /> */}
    </div>
  );
}
