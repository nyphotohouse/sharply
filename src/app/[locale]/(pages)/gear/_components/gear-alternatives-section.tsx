import { useTranslations } from "next-intl";
import { GearCardHorizontal } from "~/components/gear/gear-card-horizontal";
import { getItemDisplayPrice } from "~/lib/mapping";
import type { GearAlternativeRow } from "~/server/gear/service";

interface GearAlternativesSectionProps {
  alternatives: GearAlternativeRow[];
  trendingSlugs?: Set<string>;
}

export function GearAlternativesSection({
  alternatives,
  trendingSlugs = new Set(),
}: GearAlternativesSectionProps) {
  const t = useTranslations("gearDetail");
  if (alternatives.length === 0) {
    return null;
  }

  // Sort competitors first, then by name
  const sorted = [...alternatives].sort((a, b) => {
    if (a.isCompetitor !== b.isCompetitor) {
      return a.isCompetitor ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <section id="alternatives" className="scroll-mt-24">
      <h2 className="mb-2 text-lg font-semibold">{t("alternatives")}</h2>
      <div className="grid grid-cols-1 gap-3">
        {sorted.map((alt) => (
          <GearCardHorizontal
            key={alt.gearId}
            href={`/gear/${alt.slug}`}
            slug={alt.slug}
            name={alt.name}
            regionalAliases={alt.regionalAliases}
            brandName={alt.brandName}
            thumbnailUrl={alt.thumbnailUrl}
            gearType={alt.gearType}
            releaseDate={alt.releaseDate}
            releaseDatePrecision={
              alt.releaseDatePrecision as "DAY" | "MONTH" | "YEAR" | null
            }
            announcedDate={alt.announcedDate}
            announceDatePrecision={
              alt.announceDatePrecision as "DAY" | "MONTH" | "YEAR" | null
            }
            priceText={getItemDisplayPrice(
              {
                usedPriceProjection: alt.usedPriceProjection,
                msrpNowUsdCents: alt.msrpNowUsdCents,
                msrpAtLaunchUsdCents: alt.msrpAtLaunchUsdCents,
                mpbMaxPriceUsdCents: alt.mpbMaxPriceUsdCents,
              },
              { style: "short", padWholeAmounts: true },
            )}
            isTrending={trendingSlugs.has(alt.slug)}
          />
        ))}
      </div>
    </section>
  );
}
