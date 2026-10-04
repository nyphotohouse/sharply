import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GearCardHorizontal } from "~/components/gear/gear-card-horizontal";
import { JsonLd } from "~/components/json-ld";
import { RichText } from "~/components/rich-text";
import { TableOfContents } from "~/components/rich-text/table-of-contents";
import { ScrollProgress } from "~/components/ui/skiper-ui/scroll-progress";
import { getGearDisplayImageUrl } from "~/lib/gear/display-image";
import { GetGearDisplayName } from "~/lib/gear/naming";
import { getBrandNameById } from "~/lib/mapping/brand-map";
import { buildDefaultOgImageUrl } from "~/lib/seo/default-og-image";
import { buildEditorialReviewJsonLd } from "~/lib/seo/json-ld-helpers";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import { fetchGearBySlug } from "~/server/gear/service";
import { getReviewBySlug } from "~/server/payload/service";
import { GenreRatings } from "../_components/genre-ratings";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "reviewPage" });

  try {
    const review = await getReviewBySlug(slug);

    if (!review) {
      return {
        title: t("reviewNotFoundTitle"),
        description: t("reviewNotFoundDescription"),
        robots: { index: false, follow: false },
      };
    }

    const gearItem = await fetchGearBySlug(review.review_gear_item);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "Tried to generate metadata without NEXT_PUBLIC_BASE_URL being set",
      );
    }

    const title = t("reviewTitle", { name: gearItem.name });
    const description = review.review_summary || review.title;
    const defaultOgImageUrl = buildDefaultOgImageUrl(baseUrl);
    const displayImageUrl = getGearDisplayImageUrl(gearItem);
    const ogImage = displayImageUrl
      ? {
          url: displayImageUrl,
          width: 1200,
          height: 630,
          alt: `${gearItem.name} Review`,
        }
      : {
          url: defaultOgImageUrl,
          width: 1200,
          height: 630,
          alt: t("reviewsOgAlt"),
        };

    return buildLocalizedMetadata(
      `/reviews/${slug}`,
      {
        title,
        description,
        openGraph: {
          type: "article",
          title,
          description,
          images: [ogImage],
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [ogImage.url],
        },
      },
      locale,
    );
  } catch (err: any) {
    if (err?.status === 404) {
      return {
        title: t("reviewNotFoundTitle"),
        description: t("reviewNotFoundDescription"),
        robots: { index: false, follow: false },
      };
    }
    throw err;
  }
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "reviewPage" });
  const review = await getReviewBySlug(slug);

  if (!review) {
    return notFound();
  }

  const gearItem = await fetchGearBySlug(review.review_gear_item);
  const brandName = getBrandNameById(gearItem.brandId ?? "");
  const displayImageUrl = getGearDisplayImageUrl(gearItem);

  return (
    <div className="mx-auto my-24 flex min-h-screen flex-col items-center gap-12 px-4 pt-8 sm:px-8">
      <JsonLd
        data={[
          buildEditorialReviewJsonLd({
            path: `/reviews/${slug}`,
            headline: review.title,
            productName: gearItem.name,
            gearSlug: review.review_gear_item,
            description: review.review_summary ?? null,
            imageUrl: displayImageUrl,
            datePublished: review.createdAt,
            dateModified: review.updatedAt,
            pros: (review.goodPoints ?? [])
              .map((point) => point.goodNote)
              .filter((note): note is string => Boolean(note)),
            cons: (review.badPoints ?? [])
              .map((point) => point.badNote)
              .filter((note): note is string => Boolean(note)),
          }),
        ]}
      />
      <ScrollProgress bottomOffset={300} />
      <aside className="fixed top-24 right-6 z-20 hidden w-10 lg:block">
        <TableOfContents contentSelector="#review-content" />
      </aside>
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-center text-4xl font-bold sm:text-6xl">
          {t("reviewTitle", { name: gearItem.name })}
        </h1>
        <p className="text-muted-foreground max-w-3xl text-base sm:text-lg">
          {review.title}
        </p>
      </div>

      <div className="w-full max-w-5xl space-y-6">
        {displayImageUrl ? (
          <div className="bg-muted dark:bg-card min-h-[300px] overflow-hidden rounded-md p-6 sm:p-12">
            <Image
              src={displayImageUrl}
              alt={gearItem.name}
              className="mx-auto h-full max-h-[300px] w-full max-w-[600px] object-contain sm:max-h-[420px]"
              width={720}
              height={480}
              priority
            />
          </div>
        ) : (
          <div className="bg-muted dark:bg-card flex aspect-video items-center justify-center rounded-md">
            <div className="text-muted-foreground text-lg">
              {t("noImageAvailable")}
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl space-y-8 lg:space-y-10">
          <section id="review-content" className="space-y-6 lg:space-y-8">
              {/* Summary */}
              <div className="space-y-2">
                <h2 className="scroll-mt-24 text-lg font-semibold">
                  {t("summary")}
                </h2>
                <p className="text-muted-foreground">{review.review_summary}</p>
              </div>

              {/* Pros & Cons */}
              <div className="space-y-4">
                <h2 className="scroll-mt-24 text-lg font-semibold">
                  {t("prosAndCons")}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded border border-green-400/50 bg-green-400/5 p-3">
                    <h3 className="text-lg font-semibold">{t("theGood")}</h3>
                    <ul className="my-4 list-disc space-y-3 pl-5 text-sm text-green-600 dark:text-green-400">
                      {review.goodPoints.map((point) => (
                        <li key={point.id}>{point.goodNote}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded border border-red-400/50 bg-red-400/5 p-3">
                    <h3 className="scroll-mt-24 text-lg font-semibold">
                      {t("theBad")}
                    </h3>
                    <ul className="my-4 list-disc space-y-3 pl-5 text-sm text-red-600 dark:text-red-400">
                      {review.badPoints.map((point) => (
                        <li key={point.id}>{point.badNote}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Gear Specs */}
              <div className="space-y-3">
                <h3 className="scroll-mt-24 text-lg font-semibold">
                  {t("viewSpecs", { name: GetGearDisplayName(gearItem) })}
                </h3>
                <GearCardHorizontal
                  slug={gearItem.slug}
                  name={gearItem.name}
                  regionalAliases={gearItem.regionalAliases}
                  thumbnailUrl={displayImageUrl}
                  brandName={brandName ?? ""}
                  gearType={gearItem.gearType}
                  href={`/gear/${gearItem.slug}`}
                />
              </div>

              {/* Review Content */}
              <div className="space-y-4">
                <h2 className="scroll-mt-24 text-lg font-semibold">
                  {t("myExperience")}
                </h2>
                <RichText
                  data={review.reviewContent}
                  className="w-full max-w-none"
                />
              </div>

              {/* Genre Ratings */}
              <GenreRatings
                genreRatings={review.genreRatings ?? {}}
                gearName={GetGearDisplayName(gearItem)}
              />
          </section>
        </div>
      </div>
    </div>
  );
}
