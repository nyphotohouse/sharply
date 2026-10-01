import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GearCard } from "~/components/gear/gear-card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { getItemDisplayPrice } from "~/lib/mapping";
import { getPriceMarketForLocale } from "~/lib/pricing/display-price";
import { buildLocalizedMetadata } from "~/lib/seo/metadata";
import { fetchPublicSharedListByParam } from "~/server/user-lists/service";
import { getExchangeRates } from "~/server/pricing/exchange-rates";

export const dynamic = "force-dynamic";

type SharedListPageProps = {
  params: Promise<{ locale: string; shared: string }>;
};

export async function generateMetadata({
  params,
}: SharedListPageProps): Promise<Metadata> {
  const { locale, shared } = await params;
  const t = await getTranslations({ locale, namespace: "sharedList" });
  const payload = await fetchPublicSharedListByParam(shared).catch(() => null);

  if (!payload) {
    return {
      title: t("listNotFound"),
      robots: { index: false, follow: false },
    };
  }

  const ownerName =
    payload.owner.name || payload.owner.handle || t("sharplyMember");
  const title = t("listByOwner", {
    list: payload.list.name,
    owner: ownerName,
  });
  const description =
    payload.status === "published"
      ? t("sharedGearListFromOwner", { owner: ownerName })
      : t("currentlyUnpublished");

  return buildLocalizedMetadata(
    payload.canonicalPath,
    {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    },
    locale,
  );
}

export default async function SharedListPage({ params }: SharedListPageProps) {
  const { locale, shared } = await params;
  const t = await getTranslations({ locale, namespace: "sharedList" });
  const payload = await fetchPublicSharedListByParam(shared).catch(() => null);
  if (!payload) return notFound();

  if (payload.shouldRedirect) {
    redirect(payload.canonicalPath);
  }

  const ownerName =
    payload.owner.name || payload.owner.handle || t("sharplyMember");
  const profilePath = `/u/${payload.owner.handle}`;
  const trendingSet = new Set(payload.trendingSlugs);
  const market = getPriceMarketForLocale(locale);
  const exchangeRates = await getExchangeRates();

  if (payload.status === "unpublished") {
    return (
      <main className="mx-auto mt-24 max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-4xl font-bold">{payload.list.name}</h1>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage
              src={payload.owner.image ?? undefined}
              alt={ownerName}
            />
            <AvatarFallback>{ownerName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <Link
            href={profilePath}
            className="text-muted-foreground hover:underline"
          >
            {ownerName}
          </Link>
        </div>
        <div className="text-muted-foreground rounded-lg border border-dashed p-6">
          {t("unpublishedByOwner")}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto mt-24 max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-4">
        <h1 className="text-4xl font-bold sm:text-5xl">{payload.list.name}</h1>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage
              src={payload.owner.image ?? undefined}
              alt={ownerName}
            />
            <AvatarFallback>{ownerName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <Link
            href={profilePath}
            className="text-muted-foreground hover:underline"
          >
            {ownerName}
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
        {payload.items.map((item) => (
          <GearCard
            key={item.id}
            href={`/gear/${item.gear.slug}`}
            slug={item.gear.slug}
            name={item.gear.name}
            regionalAliases={item.gear.regionalAliases}
            brandName={item.gear.brandName}
            thumbnailUrl={item.gear.thumbnailUrl ?? undefined}
            gearType={item.gear.gearType}
            isTrending={trendingSet.has(item.gear.slug)}
            releaseDate={item.gear.releaseDate}
            releaseDatePrecision={item.gear.releaseDatePrecision}
            announcedDate={item.gear.announcedDate}
            announceDatePrecision={item.gear.announceDatePrecision}
            priceText={getItemDisplayPrice(item.gear, {
              style: "short",
              padWholeAmounts: true,
              market,
              locale:
                market === "US" ? "en-US" : market === "UK" ? "en-GB" : "de-DE",
              exchangeRates,
            })}
          />
        ))}
      </section>
    </main>
  );
}
