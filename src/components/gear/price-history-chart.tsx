"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { ChartContainer } from "~/components/ui/chart";
import { useLocale, useTranslations } from "next-intl";
import {
  PRICE_HISTORY_CURVE,
  nearestHistoryTime,
  type preparePriceHistory,
} from "~/lib/pricing/price-history";

const CHART_MARGIN = { top: 12, right: 12, bottom: 8, left: 0 };
const Y_AXIS_WIDTH = 80;
const X_AXIS_HEIGHT = 30;

type Props = {
  data: ReturnType<typeof preparePriceHistory>;
  currency: string;
  onInspect: (time: number | null) => void;
};
/** Relay Recharts' pointer and keyboard selection without a floating tooltip. */
function HistoryInspector({
  active,
  payload,
  onInspect,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  onInspect: Props["onInspect"];
}) {
  const point = payload?.[0]?.payload as { time?: number } | undefined;
  const time = active && typeof point?.time === "number" ? point.time : null;
  useEffect(() => {
    onInspect(time);
  }, [time, onInspect]);
  return null;
}
export default function PriceHistoryChart({
  data,
  currency,
  onInspect,
}: Props) {
  const input = useRef<"pointer" | "keyboard">("pointer");
  const keyboardSelection = useRef<number | null>(null);
  // Recharts can activate a touch tooltip after touchend via its synthetic click.
  // Pointer selection is owned here; the tooltip only relays keyboard selection.
  const inspectKeyboard = useCallback(
    (time: number | null) => {
      keyboardSelection.current = time;
      if (input.current === "keyboard") onInspect(time);
    },
    [onInspect],
  );
  const inspectPointer = (event: PointerEvent<HTMLDivElement>) => {
    input.current = "pointer";
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - Y_AXIS_WIDTH - CHART_MARGIN.left;
    const width =
      bounds.width - Y_AXIS_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
    const y = event.clientY - bounds.top;
    const first = data.points[0],
      last = data.points.at(-1);
    if (
      !first ||
      !last ||
      width <= 0 ||
      x < 0 ||
      x > width ||
      y < CHART_MARGIN.top ||
      y > bounds.height - CHART_MARGIN.bottom - X_AXIS_HEIGHT
    ) {
      onInspect(null);
      return;
    }
    onInspect(
      nearestHistoryTime(
        data.points,
        first.time + (x / width) * (last.time - first.time),
      ),
    );
  };
  const locale = useLocale();
  const t = useTranslations("PriceHistory");
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  return (
    <div
      role="group"
      aria-label={t("chartDescription")}
      onPointerDownCapture={inspectPointer}
      onPointerMoveCapture={inspectPointer}
      onPointerUpCapture={(event) => {
        if (event.pointerType === "touch") onInspect(null);
      }}
      onPointerCancelCapture={() => onInspect(null)}
      onPointerLeave={() => {
        input.current = "pointer";
        onInspect(null);
      }}
      onKeyDownCapture={() => {
        input.current = "keyboard";
        onInspect(keyboardSelection.current);
      }}
      className="touch-pan-y"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          input.current = "pointer";
          onInspect(null);
        }
      }}
    >
      <ChartContainer
        config={{
          typical: { label: t("estimate"), color: "var(--foreground)" },
        }}
        className="h-[220px] w-full sm:h-[280px]"
      >
        <ComposedChart
          data={data.points}
          margin={CHART_MARGIN}
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeOpacity={0.5}
          />
          <XAxis
            height={X_AXIS_HEIGHT}
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(value) =>
              new Intl.DateTimeFormat(locale, {
                month: "short",
                year: "2-digit",
                timeZone: "UTC",
              }).format(value)
            }
            axisLine={false}
            tickLine={false}
            minTickGap={50}
          />
          <YAxis
            orientation="left"
            domain={data.domain}
            tick={({ y, payload }) => (
              <text
                x={0}
                y={y}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-muted-foreground text-xs"
              >
                {money(Number(payload.value))}
              </text>
            )}
            axisLine={false}
            tickLine={false}
            width={Y_AXIS_WIDTH}
            tickCount={4}
          />
          <Tooltip
            content={<HistoryInspector onInspect={inspectKeyboard} />}
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.35 }}
            isAnimationActive={false}
          />
          <Area
            type={PRICE_HISTORY_CURVE}
            dataKey="range"
            stroke="none"
            fill="var(--foreground)"
            fillOpacity={0.08}
            isAnimationActive={false}
            tooltipType="none"
          />
          <Line
            type={PRICE_HISTORY_CURVE}
            dataKey="typical"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
