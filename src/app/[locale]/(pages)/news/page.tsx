import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Separator } from "~/components/ui/separator";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import type { News } from "~/payload-types";
import { getNewsPosts } from "~/server/payload/service";
import NewsListItem from "./_components/news-list-item";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsPage" });

  return buildLocalizedMetadata(
    "/news",
    {
      title: t("metaTitle"),
      description: t("metaDescription"),
      openGraph: {
        title: t("metaTitle"),
        description: t("metaDescription"),
      },
    },
    locale,
  );
}

export default async function NewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsPage" });
  const posts: News[] = await getNewsPosts();

  return (
    <div className="mx-auto min-h-screen max-w-5xl p-6 pt-36">
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">
        {t("pageTitle")}
      </h1>
      <Separator className="mb-2" />
      <div>
        {posts.map((post, idx) => {
          return (
            <div key={post.id}>
              <NewsListItem post={post} locale={locale} />
              {idx < posts.length - 1 && <Separator />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
