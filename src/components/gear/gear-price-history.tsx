"use client";

import dynamic from "next/dynamic";
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useDisplayPriceMarket } from "~/lib/pricing/use-display-price-market";
import type { PriceMarket } from "~/lib/pricing/display-price";
import {
  historyPriceChange,
  parsePriceHistory,
  preparePriceHistory,
  type HistoryPeriod,
} from "~/lib/pricing/price-history";

const Chart = dynamic(() => import("./price-history-chart"), {
  ssr: false,
  loading: () => (
    <Skeleton className="h-[220px] w-full motion-reduce:animate-none sm:h-[280px]" />
  ),
});
async function fetchHistory(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Price history unavailable");
  return parsePriceHistory(await response.json());
}
function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-48 motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-8 w-52 motion-reduce:animate-none" />
      </div>
      <Skeleton className="h-[220px] w-full motion-reduce:animate-none sm:h-[280px]" />
    </div>
  );
}
export function GearPriceHistory({
  slug,
  initialMarket,
}: {
  slug: string;
  initialMarket: PriceMarket;
}) {
  const t = useTranslations("PriceHistory");
  const locale = useLocale();
  const market = useDisplayPriceMarket(initialMarket);
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [period, setPeriod] = useState<HistoryPeriod>("1y");
  const inspectionKey = `${slug}:${market}:${period}`;
  const [inspection, setInspection] = useState<{
    key: string;
    time: number | null;
  } | null>(null);
  const onInspect = useCallback(
    (time: number | null) => {
      setInspection((previous) =>
        previous?.key === inspectionKey && previous.time === time
          ? previous
          : { key: inspectionKey, time },
      );
    },
    [inspectionKey],
  );
  useEffect(() => {
    if (!ref.current) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const { data, error, isLoading, mutate } = useSWR(
    visible
      ? `/api/gear/${encodeURIComponent(slug)}/price-history?market=${market}`
      : null,
    fetchHistory,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  if (data && data.points.length < 2) return null;
  const prepared = data ? preparePriceHistory(data, period) : null;
  const inspected =
    inspection?.key === inspectionKey
      ? prepared?.points.find((point) => point.time === inspection.time)
      : null;
  const displayed = inspected ?? prepared?.latest;
  const change = historyPriceChange(
    displayed?.typicalMinor,
    prepared?.baseline,
  );
  const formatMoney = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: data?.currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  const Direction =
    change == null || change === 0 ? Minus : change > 0 ? ArrowUp : ArrowDown;
  return (
    <section
      ref={ref}
      id="price-history"
      className="scroll-mt-24"
      aria-labelledby="price-history-heading"
    >
      <h2 id="price-history-heading" className="mb-6 text-2xl font-bold">
        {t("title")}
      </h2>
      <div className="rounded-md border p-4 sm:p-6" aria-busy={!data && !error}>
        {error ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm" role="alert">
              {t("error")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              {t("retry")}
            </Button>
          </div>
        ) : !data || isLoading || !prepared ? (
          <HistorySkeleton />
        ) : (
          <>
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-3 tabular-nums">
                  <span
                    className="text-2xl font-semibold"
                    data-testid="price-history-value"
                    aria-label={formatMoney(displayed?.typicalMinor ?? 0)}
                  >
                    <span className="sr-only">
                      {formatMoney(displayed?.typicalMinor ?? 0)}
                    </span>
                    <NumberFlow
                      aria-hidden="true"
                      value={(displayed?.typicalMinor ?? 0) / 100}
                      locales={locale}
                      format={{
                        style: "currency",
                        currency: data.currency,
                        maximumFractionDigits: 0,
                      }}
                      transformTiming={{ duration: 200, easing: "ease-out" }}
                      spinTiming={{ duration: 200, easing: "ease-out" }}
                      opacityTiming={{ duration: 150, easing: "ease-out" }}
                      respectMotionPreference
                    />
                  </span>
                  {change != null && (
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-medium ${change > 0 ? "text-red-600 dark:text-red-400" : change < 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                      aria-label={t("changeDescription", {
                        change: new Intl.NumberFormat(locale, {
                          style: "percent",
                          maximumFractionDigits: 1,
                          signDisplay: "exceptZero",
                        }).format(change / 100),
                        period: t(period),
                      })}
                    >
                      <Direction className="size-4" aria-hidden="true" />
                      {new Intl.NumberFormat(locale, {
                        style: "percent",
                        maximumFractionDigits: 1,
                        signDisplay: "exceptZero",
                      }).format(change / 100)}
                    </span>
                  )}
                </div>
                {displayed && (
                  <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs tabular-nums">
                    <time dateTime={displayed.timestamp}>
                      {new Intl.DateTimeFormat(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(displayed.timestamp))}
                    </time>
                    <span>
                      {formatMoney(displayed.lowMinor)} –{" "}
                      {formatMoney(displayed.highMinor)}
                    </span>
                  </p>
                )}
              </div>
              <div
                className="flex w-fit gap-1 rounded-md border p-1"
                role="group"
                aria-label={t("period")}
              >
                {(["30d", "1y", "all"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={period === value ? "secondary" : "ghost"}
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                  >
                    {t(value)}
                  </Button>
                ))}
              </div>
            </div>
            <Chart
              key={inspectionKey}
              data={prepared}
              currency={data.currency}
              onInspect={onInspect}
            />
          </>
        )}
      </div>
    </section>
  );
}
