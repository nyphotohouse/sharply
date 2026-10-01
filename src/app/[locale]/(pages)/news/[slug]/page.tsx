import { Calendar, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DiscordBanner from "~/components/discord-banner";
import { GearCardHorizontal } from "~/components/gear/gear-card-horizontal";
import { JsonLd } from "~/components/json-ld";
import { RichText } from "~/components/rich-text";
import { TableOfContents } from "~/components/rich-text/table-of-contents";
import { Badge } from "~/components/ui/badge";
import { ScrollProgress } from "~/components/ui/skiper-ui/scroll-progress";
import type { Locale } from "~/i18n/config";
import { getGearDisplayImageUrl } from "~/lib/gear/display-image";
import { formatDate } from "~/lib/format/date";
import { getItemDisplayPrice } from "~/lib/mapping";
import { getBrandNameById } from "~/lib/mapping/brand-map";
import { getPriceMarketForLocale } from "~/lib/pricing/display-price";
import { buildDefaultOgImageUrl } from "~/lib/seo/default-og-image";
import { buildArticleJsonLd } from "~/lib/seo/json-ld-helpers";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import { fetchGearBySlug } from "~/server/gear/service";
import { getNewsPostBySlug, getNewsPosts } from "~/server/payload/service";
import { getExchangeRates } from "~/server/pricing/exchange-rates";

export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await getNewsPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "newsPage" });
  const page = await getNewsPostBySlug(slug);
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.sharplyphoto.com";
  const imageSrc =
    page.thumbnail && typeof page.thumbnail === "object"
      ? (page.thumbnail.url ?? undefined)
      : undefined;
  const defaultOgImageUrl = buildDefaultOgImageUrl(baseUrl);
  const ogImage = imageSrc
    ? {
        url: imageSrc,
        width: 1200,
        height: 630,
        alt: page.title,
      }
    : {
        url: defaultOgImageUrl,
        width: 1200,
        height: 630,
        alt: t("newsOgAlt"),
      };
  return buildLocalizedMetadata(
    `/news/${slug}`,
    {
      title: `${page.title}`,
      description: page.excerpt ?? "",
      openGraph: {
        type: "article",
        title: `${page.title}`,
        description: page.excerpt ?? "",
        images: [ogImage],
      },
      twitter: {
        card: "summary_large_image",
        title: `${page.title}`,
        description: page.excerpt ?? "",
        images: [ogImage.url],
      },
    },
    locale,
  );
}

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "newsPage" });
  const page = await getNewsPostBySlug(slug);
  if (!page) return notFound();
  const market = getPriceMarketForLocale(locale);
  const exchangeRates = await getExchangeRates();

  const category = t("category");
  // Add a timestamp to the image src to ensure it's revalidated when page is rebuilt
  const imageSrc =
    page.thumbnail && typeof page.thumbnail === "object"
      ? (page.thumbnail.url ?? undefined)
      : undefined;
  // console.log(page);

  // Fetch related gear (array of slugs stored in JSON field)
  const relatedGearItems = Array.isArray(page.related_gear_items)
    ? (
        await Promise.all(
          page.related_gear_items
            .filter((v): v is string => typeof v === "string")
            .map(async (gearSlug) => {
              try {
                return await fetchGearBySlug(gearSlug);
              } catch {
                return null;
              }
            }),
        )
      ).filter(Boolean)
    : [];
  const sourceLinks =
    Array.isArray(page.sourceLinks) && page.sourceLinks.length > 0
      ? page.sourceLinks
          .map((source) => {
            const name =
              source && typeof source === "object" && "name" in source
                ? source.name
                : null;
            const link =
              source && typeof source === "object" && "link" in source
                ? source.link
                : null;
            return {
              id:
                source && typeof source === "object" && "id" in source
                  ? source.id
                  : null,
              name: typeof name === "string" ? name : null,
              link: typeof link === "string" ? link : null,
            };
          })
          .filter(
            (
              source,
            ): source is { id: string | null; name: string; link: string } =>
              Boolean(source.name) && Boolean(source.link),
          )
      : [];

  return (
    <div className="mx-auto my-24 flex min-h-screen flex-col items-center gap-12 px-4 sm:px-8">
      <JsonLd
        data={[
          buildArticleJsonLd({
            type: "NewsArticle",
            path: `/news/${slug}`,
            locale,
            headline: page.title,
            description: page.excerpt ?? null,
            imageUrl: imageSrc ?? null,
            datePublished: page.override_date ?? page.createdAt,
            dateModified: page.updatedAt,
          }),
        ]}
      />
      <ScrollProgress bottomOffset={300} />
      <aside className="fixed top-24 right-6 z-20 hidden w-10 lg:block">
        <TableOfContents contentSelector="#news-content" />
      </aside>
      <div className="flex flex-col items-center gap-4">
        <Badge className="bg-accent text-accent-foreground">{category}</Badge>
        <h1 className="max-w-3xl text-center text-3xl font-semibold sm:max-w-5xl sm:text-6xl">
          {page.title}
        </h1>
        <div className="text-muted-foreground -mt-1 flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4" />
          <span className="pt-1">
            {formatDate(page.override_date || page.createdAt, {
              locale,
              preset: "date-long",
            })}
          </span>
        </div>
      </div>

      {page.thumbnail && (
        <Image
          src={imageSrc ?? ""}
          alt={page.title}
          width={1280}
          height={720}
          className="aspect-video w-full max-w-5xl rounded-lg object-cover"
        />
      )}
      <div className="mx-auto w-full max-w-5xl">
        <div id="news-content" className="mx-auto w-full max-w-3xl">
          <RichText
            data={page.content}
            demoteHeadingsBy={1}
            className="w-full max-w-none"
          />

          {relatedGearItems.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-3 py-8 text-2xl font-semibold opacity-90 sm:text-4xl">
                {t("gearInThisArticle")}
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {relatedGearItems.map((item: any) => (
                  <GearCardHorizontal
                    key={item.id}
                    slug={item.slug}
                    name={item.name}
                    regionalAliases={item.regionalAliases}
                    thumbnailUrl={getGearDisplayImageUrl(item)}
                    brandName={getBrandNameById(item.brandId ?? "") ?? ""}
                    gearType={item.gearType}
                    releaseDate={item.releaseDate}
                    releaseDatePrecision={
                      (item.releaseDatePrecision as
                        | "DAY"
                        | "MONTH"
                        | "YEAR"
                        | null) ?? null
                    }
                    announcedDate={item.announcedDate}
                    announceDatePrecision={
                      (item.announceDatePrecision as
                        | "DAY"
                        | "MONTH"
                        | "YEAR"
                        | null) ?? null
                    }
                    priceText={getItemDisplayPrice(
                      {
                        usedPriceProjection: item.usedPriceProjection,
                        msrpNowUsdCents: item.msrpNowUsdCents,
                        msrpAtLaunchUsdCents: item.msrpAtLaunchUsdCents,
                        mpbMaxPriceUsdCents: item.mpbMaxPriceUsdCents,
                      },
                      {
                        style: "short",
                        padWholeAmounts: true,
                        market,
                        locale:
                          market === "US"
                            ? "en-US"
                            : market === "UK"
                              ? "en-GB"
                              : "de-DE",
                        exchangeRates,
                      },
                    )}
                    href={`/gear/${item.slug}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {sourceLinks.length > 0 ? (
          <div className="mx-auto mt-12 w-full max-w-3xl space-y-3">
            <div className="text-muted-foreground text-sm font-semibold">
              {t("links")}
            </div>
            <div className="flex w-full flex-col gap-2 text-sm">
              {sourceLinks.map((source) => (
                <Link
                  key={source.id ?? source.link}
                  href={source.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary flex w-full items-start gap-2 rounded border px-3 py-2 hover:underline"
                >
                  <ExternalLink className="text-muted-foreground mt-0.5 h-4 w-4" />
                  <span>{source.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <DiscordBanner label={t("joinDiscussion")} className="w-full max-w-3xl" />
    </div>
  );
}
