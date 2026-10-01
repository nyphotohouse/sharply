import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { formatPriceSourceLabel } from "~/lib/pricing/source-label";

export type UpcomingPriceFetchRow = {
  mappingId: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  sourceKey: string;
  marketKey: string;
  lastFetchStatus: "NEVER" | "SUCCESS" | "NO_DATA" | "ERROR";
  lastFetchedAt: string | null;
  nextFetchAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Due now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UpcomingPriceFetches({
  rows,
}: {
  rows: UpcomingPriceFetchRow[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Upcoming fetches</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Active mappings due now or within the next 24 hours.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          No active mappings are due soon.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Gear</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Last result</th>
                <th className="px-4 py-3 text-right font-medium">Next check</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.mappingId}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium hover:underline"
                      href={"/gear/" + row.gearSlug}
                    >
                      {row.gearName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {formatPriceSourceLabel(row.sourceKey)}
                  </td>
                  <td className="px-4 py-3">{row.marketKey}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        row.lastFetchStatus === "ERROR"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {row.lastFetchStatus.toLowerCase().replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right">
                    {formatDate(row.nextFetchAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
