"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useDeferredValue, useId, useState } from "react";
import { Input } from "~/components/ui/input";
import type { ExchangeRates, PriceMarket } from "~/lib/pricing/display-price";
import { buildGearSpecsSections } from "~/lib/specs/registry";
import { filterSpecsSections } from "~/lib/specs/filter";
import { usePriceView } from "~/lib/pricing/use-price-view";
import type { GearRegion } from "~/lib/gear/region";
import type { GearItem, GearType } from "~/types/gear";
import type { SpecsTableSection } from "./specs-table";
import SpecsTable from "./specs-table";
import { SuggestEditButton } from "./suggest-edit-button";

interface SpecsSectionProps {
  item: GearItem;
  slug: string;
  gearType: GearType;
  initialMarket: PriceMarket;
  initialExchangeRates?: ExchangeRates | null;
  viewerRegion?: GearRegion | null;
}

export function SpecsSection({
  item,
  slug,
  gearType,
  initialMarket,
  initialExchangeRates,
  viewerRegion,
}: SpecsSectionProps) {
  const t = useTranslations("gearDetail");
  const locale = useLocale();
  const priceView = usePriceView(initialMarket, initialExchangeRates);
  const [query, setQuery] = useState("");
  const inputId = useId();
  const deferredQuery = useDeferredValue(query);
  const sections: SpecsTableSection[] = buildGearSpecsSections(item, {
    locale,
    t,
    viewerRegion,
    priceView,
  });
  const filteredSections = filterSpecsSections(sections, deferredQuery);
  const normalizedQuery = deferredQuery.trim();
  const emptyMessage = normalizedQuery
    ? t("noSpecificationsMatch", { query: normalizedQuery })
    : undefined;

  return (
    <section className="scroll-mt-24" id="specs">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{t("specifications")}</h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            id={inputId}
            type="search"
            aria-label={t("filterSpecifications")}
            placeholder={t("filterSpecs")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 rounded text-sm sm:w-[260px]"
          />
          <SuggestEditButton slug={slug} gearType={gearType} />
        </div>
      </div>
      <SpecsTable
        sections={filteredSections}
        item={item}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}
