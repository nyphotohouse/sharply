"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { SuggestEditButton } from "~/app/[locale]/(pages)/gear/_components/suggest-edit-button";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { buildCompareSections } from "~/components/compare/compare-specs-table.helpers";
import { useSession } from "~/lib/auth/auth-client";
import { useGearDisplayName } from "~/lib/hooks/useGearDisplayName";
import { getPriceMarketForLocale } from "~/lib/pricing/display-price";
import { usePriceView } from "~/lib/pricing/use-price-view";
import { buildGearSpecsSections } from "~/lib/specs/registry";
import { cn, getConstructionState } from "~/lib/utils";
import type { GearItem } from "~/types/gear";

function countMissingSpecs(
  sections: ReturnType<typeof buildGearSpecsSections>,
) {
  let missing = 0;
  for (const s of sections) {
    for (const d of s.data) {
      if (d?.value == null) missing++;
    }
  }
  return missing;
}

export function CompareSpecsTable({
  a,
  b,
  className,
}: {
  a: GearItem;
  b: GearItem;
  className?: string;
}) {
  const { data } = useSession();

  const session = data?.session;
  const locale = useLocale();
  const t = useTranslations("gearDetail");
  const priceView = usePriceView(getPriceMarketForLocale(locale));
  const aName = useGearDisplayName({
    name: a.name,
    regionalAliases: a.regionalAliases,
  });
  const bName = useGearDisplayName({
    name: b.name,
    regionalAliases: b.regionalAliases,
  });

  const aSections = buildGearSpecsSections(a, {
    forceLeftAlign: true,
    locale,
    t,
    priceView,
  });
  const bSections = buildGearSpecsSections(b, {
    forceLeftAlign: true,
    locale,
    t,
    priceView,
  });
  const missingA = countMissingSpecs(aSections);
  const missingB = countMissingSpecs(bSections);
  const aConstruction = getConstructionState(a);
  const bConstruction = getConstructionState(b);
  const [showMissing, setShowMissing] = useState(false);

  const sections = buildCompareSections(aSections, bSections);

  const totalRowsAny = sections.reduce(
    (acc, section) => acc + section.rows.length,
    0,
  );
  const totalRowsWithBoth = sections.reduce(
    (acc, section) => acc + section.rowsWithBoth.length,
    0,
  );
  const hiddenRowCount = totalRowsAny - totalRowsWithBoth;

  if (
    totalRowsAny === 0 ||
    aConstruction.underConstruction ||
    bConstruction.underConstruction
  ) {
    return (
      <div className={cn("rounded-md border p-6 text-center", className)}>
        <p className="text-muted-foreground text-sm">
          We don't have enough information on these gear items to show a
          comparison yet.
        </p>
        {!session ? (
          <div className="bg-muted/40 mt-4 rounded-md border p-4 text-left">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="font-medium">Log in to contribute</div>
                <div className="text-muted-foreground text-sm">
                  Help us fill in the missing specs to enable rich comparisons.
                </div>
              </div>
              <Button asChild>
                <Link href={`/auth/signin`}>Log in to contribute</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3 text-left">
              <CompareGearNameLink
                slug={a.slug}
                name={aName}
                className="font-medium"
              />
              <div className="text-muted-foreground text-sm">
                {missingA} specs missing
              </div>
              {aConstruction.underConstruction &&
              aConstruction.missing?.length ? (
                <ul className="text-muted-foreground mt-1 list-inside list-disc text-xs">
                  {aConstruction.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2">
                <SuggestEditButton slug={a.slug} gearType={a.gearType} />
              </div>
            </div>
            <div className="rounded-md border p-3 text-left">
              <CompareGearNameLink
                slug={b.slug}
                name={bName}
                className="font-medium"
              />
              <div className="text-muted-foreground text-sm">
                {missingB} specs missing
              </div>
              {bConstruction.underConstruction &&
              bConstruction.missing?.length ? (
                <ul className="text-muted-foreground mt-1 list-inside list-disc text-xs">
                  {bConstruction.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2">
                <SuggestEditButton slug={b.slug} gearType={b.gearType} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const hasRenderableRows = showMissing
    ? totalRowsAny > 0
    : totalRowsWithBoth > 0;

  return (
    <div
      className={cn(
        "bg-background overflow-hidden rounded-md shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          {showMissing
            ? "Showing all available specs, including rows with missing info."
            : hiddenRowCount > 0
              ? `Hiding ${hiddenRowCount} row${
                  hiddenRowCount === 1 ? "" : "s"
                } until both sides have data.`
              : "All visible rows have complete data."}
        </p>
        <label
          htmlFor="compare-show-missing"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Checkbox
            id="compare-show-missing"
            checked={showMissing}
            onCheckedChange={(checked) => setShowMissing(checked === true)}
          />
          Show rows with missing info
        </label>
      </div>
      {hasRenderableRows ? (
        <div className="space-y-6">
          {sections.map(({ id, title, rows, rowsWithBoth }) => {
            const rowsToRender = showMissing ? rows : rowsWithBoth;
            if (rowsToRender.length === 0) return null;
            return (
              <div key={id} className="overflow-hidden rounded-md border">
                <div className="text-muted-foreground px-4 py-3 text-2xl font-semibold">
                  {title}
                </div>
                <Table>
                  <colgroup>
                    <col className="w-1/3" />
                    <col className="w-1/3" />
                    <col className="w-1/3" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-muted-foreground px-4 py-3 text-xs tracking-wide uppercase">
                        Spec
                      </TableHead>
                      <TableHead className="text-muted-foreground px-4 py-3 text-xs tracking-wide uppercase">
                        <CompareGearNameLink slug={a.slug} name={aName} />
                      </TableHead>
                      <TableHead className="text-muted-foreground px-4 py-3 text-xs tracking-wide uppercase">
                        <CompareGearNameLink slug={b.slug} name={bName} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsToRender.map((r) => (
                      <TableRow key={`${id}-${r.key}`} className="text-sm">
                        <TableCell className="text-muted-foreground px-4 py-3 align-top">
                          {r.label}
                        </TableCell>
                        <TableCell className="px-4 py-3 align-top">
                          {r.a ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3 align-top">
                          {r.b ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted-foreground px-4 py-6 text-center text-sm">
          No overlapping specs yet. Enable “Show rows with missing info” to see
          what we have so far.
        </div>
      )}
    </div>
  );
}

function CompareGearNameLink({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/gear/${slug}`}
      className={cn(
        "hover:text-foreground transition-colors hover:underline",
        className,
      )}
    >
      {name}
    </Link>
  );
}
