"use client";

import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actionReviewPriceObservation } from "~/server/pricing/actions";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export type RecentPriceObservationRow = {
  id: string;
  gearId: string;
  gearName: string;
  gearSlug: string;
  mappingId: string;
  sourceKey: string;
  marketKey: string;
  priceKind: string;
  valueKind: "POINT" | "RANGE";
  amountMinor: number | null;
  lowMinor: number | null;
  highMinor: number | null;
  currency: string;
  observedAt: string;
  fetchedAt: string | null;
  evidenceUrl: string | null;
  note: string | null;
  status: "VALID" | "INVALID";
  needsReview: boolean;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(row: RecentPriceObservationRow) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: row.currency,
    maximumFractionDigits: 0,
  });
  if (
    row.valueKind === "RANGE" &&
    row.lowMinor !== null &&
    row.highMinor !== null
  ) {
    return `${formatter.format(row.lowMinor / 100)} – ${formatter.format(row.highMinor / 100)}`;
  }
  return row.amountMinor === null
    ? "—"
    : formatter.format(row.amountMinor / 100);
}

function contributorLabel(row: RecentPriceObservationRow) {
  return row.createdByName || row.createdByEmail || "Unknown contributor";
}

export function RecentPriceObservations({
  rows: initialRows,
}: {
  rows: RecentPriceObservationRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function review(
    row: RecentPriceObservationRow,
    decision: "APPROVE" | "REJECT",
  ) {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        await actionReviewPriceObservation({
          observationId: row.id,
          decision,
        });
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  needsReview: false,
                  status: decision === "REJECT" ? "INVALID" : "VALID",
                }
              : item,
          ),
        );
        toast.success(
          decision === "APPROVE"
            ? "Observation approved"
            : "Observation rejected",
        );
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Review failed");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Recent observations</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Public prices are live immediately. Warnings identify observations
          that still need editorial review.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          No price observations have been recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Gear</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Market / source</th>
                <th className="px-4 py-3 font-medium">Observed</th>
                <th className="px-4 py-3 font-medium">Contributor</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.needsReview ? "bg-amber-500/5" : undefined}
                >
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
                  <td className="px-4 py-3 font-medium">{formatPrice(row)}</td>
                  <td className="px-4 py-3">
                    <span>
                      {row.marketKey} · {row.currency}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {row.sourceKey}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {formatDate(row.observedAt)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {contributorLabel(row)}
                  </td>
                  <td className="px-4 py-3">
                    {row.needsReview ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle data-icon="inline-start" />
                        Needs review
                      </Badge>
                    ) : (
                      <Badge
                        variant={
                          row.status === "VALID" ? "secondary" : "destructive"
                        }
                      >
                        {row.status === "VALID" ? "Approved" : "Rejected"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {row.evidenceUrl ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          title="Open evidence"
                        >
                          <a
                            href={row.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink />
                            <span className="sr-only">Open evidence</span>
                          </a>
                        </Button>
                      ) : null}
                      {row.needsReview ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            loading={isPending && pendingId === row.id}
                            disabled={isPending}
                            onClick={() => review(row, "APPROVE")}
                          >
                            <Check data-icon="inline-start" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            loading={isPending && pendingId === row.id}
                            disabled={isPending}
                            onClick={() => review(row, "REJECT")}
                          >
                            <X data-icon="inline-start" />
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </div>
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
