import {
  listPriceFetchRunsService,
  listPriceOverviewService,
  listRecentPriceObservationsService,
  listUpcomingPriceMappingsService,
} from "~/server/pricing/service";
import {
  PriceFetchRunLog,
  type PriceFetchRunLogRow,
} from "./price-fetch-run-log";
import {
  UpcomingPriceFetches,
  type UpcomingPriceFetchRow,
} from "./upcoming-price-fetches";
import {
  RecentPriceObservations,
  type RecentPriceObservationRow,
} from "./recent-price-observations";

export const dynamic = "force-dynamic";

export default async function AdminPricesPage() {
  const [rows, runs, upcoming, observations] = await Promise.all([
    listPriceOverviewService(),
    listPriceFetchRunsService(),
    listUpcomingPriceMappingsService(),
    listRecentPriceObservationsService(),
  ]);
  const serializedRuns: PriceFetchRunLogRow[] = runs.map((run) => ({
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    items: run.items.map((item) => ({
      ...item,
      startedAt: item.startedAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
      nextFetchAt: item.nextFetchAt?.toISOString() ?? null,
    })),
  }));
  const serializedUpcoming: UpcomingPriceFetchRow[] = upcoming.map((row) => ({
    ...row,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    nextFetchAt: row.nextFetchAt?.toISOString() ?? null,
  }));
  const serializedObservations: RecentPriceObservationRow[] = observations.map(
    (row) => ({
      ...row,
      observedAt: row.observedAt.toISOString(),
      fetchedAt: row.fetchedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }),
  );
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const errorCount = rows.filter(
    (row) => row.lastFetchStatus === "ERROR",
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Pricing</h2>
        <p className="text-muted-foreground mt-2">
          A small overview of used-price mappings. Open a gear item to edit its
          sources and observations.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Mappings</p>
          <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Active</p>
          <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Fetch errors</p>
          <p className="mt-1 text-2xl font-semibold">{errorCount}</p>
        </div>
      </div>
      <UpcomingPriceFetches rows={serializedUpcoming} />
      <PriceFetchRunLog runs={serializedRuns} />
      <RecentPriceObservations rows={serializedObservations} />
    </div>
  );
}
