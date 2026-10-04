"use client";

import { Flame } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import useSWR from "swr";
import { GearDisplayName } from "~/components/gear/gear-display-name";
import { Spinner } from "~/components/ui/spinner";
import type { TrendingListRowItem } from "~/lib/popularity/trending-display";
import { cn } from "~/lib/utils";

export type { TrendingListRowItem } from "~/lib/popularity/trending-display";

type HomeTrendingResponse = { items: TrendingListRowItem[] };

async function fetchHomeTrending(url: string): Promise<HomeTrendingResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to refresh trending gear");
  }
  return response.json() as Promise<HomeTrendingResponse>;
}

function TrendingRowPendingState({
  children,
}: {
  children: (pending: boolean) => React.ReactNode;
}) {
  const { pending } = useLinkStatus();

  return children(pending);
}

export function TrendingListClient({
  items,
  liveRefresh = false,
}: {
  items: TrendingListRowItem[];
  liveRefresh?: boolean;
}) {
  const { data } = useSWR<HomeTrendingResponse>(
    liveRefresh ? "/api/trending/home" : null,
    fetchHomeTrending,
    liveRefresh
      ? {
          fallbackData: { items },
          keepPreviousData: true,
          refreshInterval: 120_000,
        }
      : undefined,
  );
  // Keep the server-rendered list visible if the first live request fails.
  const displayItems = liveRefresh ? (data?.items ?? items) : items;

  return (
    <ol className="divide-border divide-y rounded-md border">
      {displayItems.map((item, idx) => {
        return (
          <li key={item.gearId} className="p-0">
            <Link
              href={`/gear/${item.slug}`}
              className="group block"
              data-trending-row-link="true"
            >
              <TrendingRowPendingState>
                {(pending) => (
                  <div
                    className={cn(
                      "flex items-center gap-3 p-2",
                      pending && "pointer-events-none",
                    )}
                    data-trending-row-pending={pending ? "true" : "false"}
                  >
                    <div className="text-muted-foreground tabular w-6 text-right text-sm">
                      {idx + 1}
                    </div>
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center transition-opacity duration-150",
                        pending && "opacity-50",
                      )}
                      data-trending-row-content-pending={
                        pending ? "true" : "false"
                      }
                    >
                      <span className="truncate text-sm font-medium group-hover:underline">
                        <GearDisplayName
                          name={item.name}
                          regionalAliases={item.regionalAliases}
                        />
                      </span>
                    </div>
                    <div className="ml-auto flex min-w-[3.5rem] items-center justify-end gap-2">
                      {pending ? (
                        <div
                          className="flex items-center justify-end"
                          data-trending-row-pending-overlay="true"
                        >
                          <Spinner className="text-foreground size-4" />
                        </div>
                      ) : (
                        [0, 1, 2].map((n) => (
                          <Flame
                            key={n}
                            className={
                              n < item.filled
                                ? "h-4 w-4 text-orange-500"
                                : "text-muted-foreground/40 h-4 w-4"
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </TrendingRowPendingState>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
