"use client";

import Link from "next/link";
import { ManagePriceModal } from "~/components/gear/manage-price-modal";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { formatPriceSourceLabel } from "~/lib/pricing/source-label";

export type PriceOverviewTableRow = {
  mappingId: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  sourceKey: string;
  marketKey: string;
  priceKind: string;
  status: "ACTIVE" | "DISABLED";
  lastFetchStatus: "NEVER" | "SUCCESS" | "NO_DATA" | "ERROR";
  lastFetchedAt: string | null;
  nextFetchAt: string | null;
  observationCount: number;
};

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function PriceOverviewTable({
  rows,
}: {
  rows: PriceOverviewTableRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
        No price mappings exist yet. Open a gear item and use the staff dock to
        add one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Gear</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Market</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Last checked</th>
            <th className="px-4 py-3 font-medium">Observations</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.mappingId}>
              <td className="px-4 py-3">
                <Link
                  className="font-medium hover:underline"
                  href={`/gear/${row.gearSlug}`}
                >
                  {row.gearName}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {row.priceKind}
                </span>
              </td>
              <td className="px-4 py-3">
                {formatPriceSourceLabel(row.sourceKey)}
              </td>
              <td className="px-4 py-3">{row.marketKey}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={row.status === "ACTIVE" ? "secondary" : "outline"}
                >
                  {row.status.toLowerCase()}
                </Badge>
                <span className="text-muted-foreground ml-2 text-xs">
                  {row.lastFetchStatus.toLowerCase()}
                </span>
              </td>
              <td className="text-muted-foreground px-4 py-3">
                {formatDate(row.lastFetchedAt)}
              </td>
              <td className="px-4 py-3">{row.observationCount}</td>
              <td className="px-4 py-3 text-right">
                <ManagePriceModal
                  gearId={row.gearId}
                  slug={row.gearSlug}
                  trigger={
                    <Button variant="outline" size="sm">
                      Manage
                    </Button>
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
