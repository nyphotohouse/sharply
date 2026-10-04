import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "~/components/json-ld";
import { RichText } from "~/components/rich-text";
import type { Locale } from "~/i18n/config";
import { buildArticleJsonLd } from "~/lib/seo/json-ld-helpers";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import type { LearnPage } from "~/payload-types";
import {
  getAllPublishedLearnPages,
  getLearnPageBySlug,
} from "~/server/payload/service";

export const revalidate = 60 * 60;

function ReadNextCard({
  article,
  label,
}: {
  article: LearnPage;
  label: string;
}) {
  const thumbnail =
    article.thumbnail && typeof article.thumbnail === "object"
      ? article.thumbnail
      : null;
  const thumbnailUrl =
    thumbnail && typeof thumbnail.url === "string" ? thumbnail.url : null;

  return (
    <aside className="not-prose mt-16 border-t pt-8" aria-label={label}>
      <p className="text-muted-foreground mb-3 text-sm font-semibold">
        {label}
      </p>
      <Link
        href={`/learn/${article.slug}`}
        className="group border-input bg-card/50 hover:border-foreground/40 flex overflow-hidden rounded-lg border p-2 transition-colors"
      >
        {thumbnailUrl ? (
          <div className="bg-muted relative hidden aspect-video w-48 shrink-0 overflow-hidden rounded sm:block">
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              sizes="192px"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h2 className="text-lg leading-tight font-semibold sm:text-xl">
              {article.title}
            </h2>
            {article.excerpt ? (
              <p className="text-muted-foreground mt-2 line-clamp-2 text-sm leading-relaxed">
                {article.excerpt}
              </p>
            ) : null}
          </div>
          <ArrowRight
            className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
      </Link>
    </aside>
  );
}

export async function generateStaticParams() {
  const pages = await getAllPublishedLearnPages();
  return pages
    .filter((p) => p.slug)
    .map((p) => ({
      slug: p.slug!,
    }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getLearnPageBySlug(slug);
  if (!page) {
    return {
      title: "Learn Article",
      robots: {
        index: false,
        follow: false,
      },
    };
  }
  const imageSrc =
    page.thumbnail && typeof page.thumbnail === "object"
      ? ((page.thumbnail as any).url ?? undefined)
      : undefined;
  return buildLocalizedMetadata(
    `/learn/${slug}`,
    {
      title: page.title,
      description: page.excerpt ?? "",
      openGraph: {
        title: page.title,
        description: page.excerpt ?? "",
        ...(imageSrc ? { images: [imageSrc] } : {}),
      },
    },
    locale,
  );
}

export default async function LearnArticlePage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [page, t] = await Promise.all([
    getLearnPageBySlug(slug),
    getTranslations({ locale, namespace: "learnArticlePage" }),
  ]);
  if (!page) {
    notFound();
  }

  const thumb =
    typeof page.thumbnail === "object" && page.thumbnail
      ? page.thumbnail
      : null;
  const thumbUrl =
    thumb && typeof (thumb as any).url === "string" ? (thumb as any).url : null;
  const thumbAlt =
    thumb && typeof (thumb as any).alt === "string"
      ? ((thumb as any).alt as string)
      : page.title;
  const readNext =
    page.read_next &&
    typeof page.read_next === "object" &&
    page.read_next._status === "published" &&
    page.read_next.slug
      ? page.read_next
      : null;

  return (
    <>
      <JsonLd
        data={[
          buildArticleJsonLd({
            type: "Article",
            path: `/learn/${slug}`,
            locale,
            headline: page.title,
            description: page.excerpt ?? null,
            imageUrl: thumbUrl,
            datePublished: page.createdAt,
            dateModified: page.updatedAt,
          }),
        ]}
      />
      <h1 className="mt-2 text-2xl font-bold sm:text-4xl">{page.title}</h1>
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          alt={thumbAlt}
          className="aspect-[5/2] w-full rounded-lg object-cover"
          width={1280}
          height={720}
          priority
        />
      ) : null}
      {(page.thumbnail_credit || page.thumbnail_credit_link) && (
        <div className="not-prose text-muted-foreground -mt-4 text-sm">
          {page.thumbnail_credit ? (
            <>
              Photo by{" "}
              {page.thumbnail_credit_link ? (
                <Link
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  href={page.thumbnail_credit_link}
                >
                  {page.thumbnail_credit}
                </Link>
              ) : (
                <span className="underline">{page.thumbnail_credit}</span>
              )}
            </>
          ) : null}
        </div>
      )}
      <RichText data={page.content as any} className="mt-6 w-full max-w-none" />
      {readNext ? (
        <ReadNextCard article={readNext} label={t("readNext")} />
      ) : null}
    </>
  );
}
