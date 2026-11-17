import type { EChartsCoreOption } from "echarts/core";
import { lazy, Suspense, useMemo } from "react";
import { useTheme } from "@/features/theme/theme";
import { token } from "./tokens";

// ECharts is large; load it only when a chart is first shown, not with the initial page.
const EChart = lazy(() => import("./EChart").then((m) => ({ default: m.EChart })));

export type TrendDatum = { start: string; value: number };

type Props = {
  data: TrendDatum[];
  /** What one value is, for the tooltip and table: "calls", "ms". */
  unit: string;
  /** How to print a value (counts, durations). */
  format: (value: number) => string;
  /** Accessible summary, e.g. "Calls per minute, last 60 minutes: 1,196 in total". */
  label: string;
  /** A sparkline: no axes, short. */
  compact?: boolean;
  /** Show the "Show data" table toggle (off for sparklines inside a card with totals). */
  withTable?: boolean;
  /** What one point covers. Hour buckets show the date too (they can span days). */
  bucket?: "minute" | "hour";
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Tooltip built from DOM nodes with textContent (never an HTML string): value first, then time. */
function tooltipNode(value: string, unit: string, time: string): HTMLElement {
  const root = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = value;
  root.append(strong, document.createTextNode(` ${unit}`), document.createElement("br"));
  const muted = document.createElement("span");
  muted.style.opacity = "0.7";
  muted.textContent = time;
  root.append(muted);
  return root;
}

/**
 * One series over time: a 2px line with a ~10% area wash, recessive hairline grid, and a
 * crosshair tooltip. One series means no legend (the label names it) and one y-axis.
 */
export function TrendChart({
  data,
  unit,
  format,
  label,
  compact = false,
  withTable = true,
  bucket = "minute",
}: Props) {
  const times = bucket === "hour" ? dayTimeFormat : timeFormat;
  // The colours are read from the CSS tokens, so a new mode or theme must rebuild the option.
  const { mode, palette } = useTheme();
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode and palette change the tokens read inside
  const option = useMemo<EChartsCoreOption>(() => {
    const color = token("--chart-1", "#1d4ed8");
    const grid = token("--chart-grid", "#e7edf5");
    const axis = token("--chart-axis", "#8a9bb2");
    const surface = token("--card", "#ffffff");
    const ink = token("--card-foreground", "#172033");
    return {
      animation: false,
      grid: compact
        ? { left: 2, right: 2, top: 4, bottom: 2 }
        : { left: 8, right: 16, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: axis, width: 1 } },
        backgroundColor: surface,
        borderColor: grid,
        textStyle: { color: ink, fontSize: 12 },
        formatter: (params: unknown) => {
          const [point] = params as { value: [string, number] }[];
          if (!point) return "";
          const [start, value] = point.value;
          return tooltipNode(format(value), unit, times.format(new Date(start)));
        },
      },
      xAxis: {
        type: "time",
        show: !compact,
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        axisLabel: { color: axis, fontSize: 11, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        show: !compact,
        min: 0,
        splitNumber: 3,
        axisLabel: { color: axis, fontSize: 11, formatter: (v: number) => format(v) },
        splitLine: { lineStyle: { color: grid, width: 1 } },
      },
      series: [
        {
          type: "line",
          data: data.map((d) => [d.start, d.value]),
          showSymbol: false,
          symbolSize: 8,
          lineStyle: { width: 2, color, cap: "round", join: "round" },
          itemStyle: { color, borderColor: surface, borderWidth: 2 },
          areaStyle: { color, opacity: 0.1 },
          emphasis: { focus: "none" },
        },
      ],
    };
  }, [data, unit, format, compact, times, mode, palette]);

  return (
    <div className="flex flex-col gap-2">
      <Suspense fallback={<div style={{ height: compact ? 48 : 180 }} aria-hidden />}>
        <EChart option={option} height={compact ? 48 : 180} label={label} />
      </Suspense>
      {withTable && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Show data</summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
            <table className="w-full">
              <caption className="sr-only">{label}</caption>
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="px-3 py-1 text-left font-semibold">
                    {bucket === "hour" ? "Hour" : "Minute"}
                  </th>
                  <th scope="col" className="px-3 py-1 text-right font-semibold">
                    {unit}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.start} className="border-t">
                    <td className="px-3 py-1">{times.format(new Date(d.start))}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-foreground">
                      {format(d.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
