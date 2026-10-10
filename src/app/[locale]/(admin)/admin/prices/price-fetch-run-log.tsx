"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { formatPriceSourceLabel } from "~/lib/pricing/source-label";

import type { PriceImportSummary } from "~/server/db/schema";

type RunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "ERROR";
type ItemStatus = "SUCCESS" | "NO_DATA" | "ERROR";

export type PriceFetchRunLogItem = {
  id: string;
  mappingId: string | null;
  gearName: string;
  gearSlug: string;
  sourceKey: string;
  marketKey: string;
  status: ItemStatus;
  insertedObservationCount: number;
  startedAt: string;
  completedAt: string | null;
  nextFetchAt: string | null;
  error: string | null;
};

export type PriceFetchRunLogRow = {
  id: string;
  trigger: "CRON";
  runKind: string;
  sourceKey: string | null;
  summary: PriceImportSummary | null;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  scannedCount: number;
  successCount: number;
  noDataCount: number;
  errorCount: number;
  error: string | null;
  items: PriceFetchRunLogItem[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!completedAt) return "In progress";
  const durationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (durationMs < 1000) return "<1s";
  return (durationMs / 1000).toFixed(1) + "s";
}

function statusLabel(status: RunStatus | ItemStatus) {
  if (status === "NO_DATA") return "No data";
  return status[0] + status.slice(1).toLowerCase();
}

function statusVariant(status: RunStatus | ItemStatus) {
  if (status === "ERROR") return "destructive" as const;
  if (status === "PARTIAL" || status === "NO_DATA") return "outline" as const;
  return "secondary" as const;
}

export function PriceFetchRunLog({ runs }: { runs: PriceFetchRunLogRow[] }) {
  const [selectedRun, setSelectedRun] = useState<PriceFetchRunLogRow | null>(
    null,
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Scheduled runs</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Daily batches are recorded here so failures and no-data responses are
          easy to inspect.
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          No scheduled runs have been recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[720px]">
            <div className="bg-muted/40 text-muted-foreground grid grid-cols-[minmax(15rem,1fr)_7rem_7rem_7rem_6rem] gap-4 px-4 py-3 text-left text-xs font-medium tracking-wide uppercase">
              <span>Started</span>
              <span>Status</span>
              <span>Checked</span>
              <span>Results</span>
              <span className="text-right">Duration</span>
            </div>
            <div className="divide-y">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="hover:bg-muted/30 focus-visible:bg-muted/30 grid w-full grid-cols-[minmax(15rem,1fr)_7rem_7rem_7rem_6rem] gap-4 px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none"
                  onClick={() => setSelectedRun(run)}
                >
                  <span className="font-medium">
                    {formatDate(run.startedAt)}
                    <span className="text-muted-foreground block text-xs">
                      {run.runKind === "SOURCE_IMPORT"
                        ? `${formatPriceSourceLabel(run.sourceKey ?? "")} import`
                        : "Mapping refresh"}
                    </span>
                  </span>
                  <span>
                    <Badge variant={statusVariant(run.status)}>
                      {statusLabel(run.status)}
                    </Badge>
                  </span>
                  <span>{run.scannedCount}</span>
                  <span className="text-muted-foreground">
                    {run.successCount} ok · {run.noDataCount} empty ·{" "}
                    {run.errorCount} error{run.errorCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-muted-foreground text-right">
                    {formatDuration(run.startedAt, run.completedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(selectedRun)}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          {selectedRun ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedRun.runKind === "SOURCE_IMPORT"
                    ? "CamPricer source import"
                    : "Scheduled pricing run"}
                </DialogTitle>
                <DialogDescription>
                  {formatDate(selectedRun.startedAt)} ·{" "}
                  {formatDuration(
                    selectedRun.startedAt,
                    selectedRun.completedAt,
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge
                    className="mt-2"
                    variant={statusVariant(selectedRun.status)}
                  >
                    {statusLabel(selectedRun.status)}
                  </Badge>
                </div>
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-muted-foreground text-xs">Checked</p>
                  <p className="mt-2 text-lg font-semibold">
                    {selectedRun.scannedCount}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-muted-foreground text-xs">Observations</p>
                  <p className="mt-2 text-lg font-semibold">
                    {selectedRun.items.reduce(
                      (total, item) => total + item.insertedObservationCount,
                      0,
                    )}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-md p-3">
                  <p className="text-muted-foreground text-xs">Completed</p>
                  <p className="mt-2 text-sm font-medium">
                    {formatDate(selectedRun.completedAt)}
                  </p>
                </div>
              </div>

              {selectedRun.summary ? (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>
                    {selectedRun.summary.requests} requests · page{" "}
                    {selectedRun.summary.cursorBefore} →{" "}
                    {selectedRun.summary.cursorAfter}
                  </p>
                  <p>
                    Imported {selectedRun.summary.counts.imported} · unchanged{" "}
                    {selectedRun.summary.counts.unchanged} · thin/no data{" "}
                    {selectedRun.summary.counts.thin} · disabled{" "}
                    {selectedRun.summary.counts.disabled} · unmatched{" "}
                    {selectedRun.summary.counts.unmatched} · invalid{" "}
                    {selectedRun.summary.counts.invalid}
                  </p>
                  {selectedRun.summary.nextEligibleAt ? (
                    <p>
                      Next eligible:{" "}
                      {formatDate(selectedRun.summary.nextEligibleAt)}
                    </p>
                  ) : null}
                  {selectedRun.summary.skippedReason ? (
                    <p>{selectedRun.summary.skippedReason}</p>
                  ) : null}
                  {selectedRun.summary.pages.map((page) => (
                    <p key={page.page}>
                      Page {page.page}: HTTP {page.httpStatus ?? "unavailable"}{" "}
                      · {page.itemCount} items · {page.counts.imported} imported
                      · {page.counts.unchanged} unchanged · {page.counts.thin}{" "}
                      thin/no data · {page.durationMs}ms
                      {page.error ? ` · ${page.error}` : ""}
                    </p>
                  ))}
                </div>
              ) : null}

              {selectedRun.error ? (
                <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                  {selectedRun.error}
                </div>
              ) : null}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Mapping results</h4>
                {selectedRun.items.length === 0 ? (
                  <p className="text-muted-foreground rounded-md border p-4 text-sm">
                    No mappings were due when this run started.
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {selectedRun.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <Link
                            className="font-medium hover:underline"
                            href={"/gear/" + item.gearSlug}
                            onClick={() => setSelectedRun(null)}
                          >
                            {item.gearName}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {formatPriceSourceLabel(item.sourceKey)} ·{" "}
                            {item.marketKey}
                            {item.insertedObservationCount > 0
                              ? " · " +
                                item.insertedObservationCount +
                                " observation" +
                                (item.insertedObservationCount === 1 ? "" : "s")
                              : ""}
                          </p>
                          {item.error ? (
                            <p className="text-destructive mt-1 text-xs">
                              {item.error}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          className="w-fit shrink-0"
                          variant={statusVariant(item.status)}
                        >
                          {statusLabel(item.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
