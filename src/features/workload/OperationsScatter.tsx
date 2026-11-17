import { Link, useNavigate } from "@tanstack/react-router";
import type { EChartsCoreOption } from "echarts/core";
import { lazy, Suspense, useMemo, useState } from "react";
import { token } from "@/components/charts/tokens";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/features/theme/theme";
import { count, duration } from "@/lib/numbers";
import type { OperationSummary } from "./queries";
import { type ExplorerSearch, windowOnly } from "./search";

// ECharts is large; load it only when a chart is first shown.
const EChart = lazy(() =>
  import("@/components/charts/EChart").then((m) => ({ default: m.EChart })),
);

/** Below this, medians and "top right" mean nothing, and the table already says it all. */
export const MIN_POINTS = 3;
const HEIGHT = 320;
const LABELLED = 3;

type Dot = {
  /** [calls, mean time in ms, total time in ms]: position on both axes, and the dot's size. */
  value: [number, number, number];
  id: number;
  query: string;
  share: number;
  label?: object;
};

/**
 * A time for this chart's log axis, where 0.01 ms and 0.05 ms are different places: the shared
 * duration() rounds sub-millisecond values to one decimal, which would print both as "0.0 ms".
 */
export const ms = (value: number): string =>
  value < 1 ? `${Number(value.toPrecision(2))} ms` : duration(value);

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const short = (text: string, max: number) => {
  const line = flat(text);
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 ? high : (low + high) / 2;
}

/** Tooltip built from DOM nodes with textContent, never an HTML string (queries are data). */
function tooltipNode(dot: Dot): HTMLElement {
  const root = document.createElement("div");
  root.style.maxWidth = "320px";
  root.style.whiteSpace = "normal";
  const title = document.createElement("strong");
  title.style.fontFamily = "var(--font-code)";
  title.style.fontSize = "11px";
  title.style.wordBreak = "break-all";
  title.textContent = short(dot.query, 90);
  const [calls, mean, total] = dot.value;
  const facts = document.createElement("div");
  facts.style.opacity = "0.8";
  facts.style.marginTop = "4px";
  facts.textContent = `${count(calls)} calls · mean ${ms(mean)} · ${duration(total)} in total (${Math.round(dot.share * 100)}% of time)`;
  const hint = document.createElement("div");
  hint.style.opacity = "0.6";
  hint.style.marginTop = "2px";
  hint.textContent = "Click to open";
  root.append(title, facts, hint);
  return root;
}

/** The dots, the medians and the plain-words summary, all from the operations already loaded. */
export function analyse(operations: OperationSummary[]) {
  const totals = operations.map((op) => op.total_exec_time_ms);
  const maxTotal = Math.max(...totals, 1);
  // Both axes are logarithmic (calls and times span orders of magnitude), so keep them positive.
  const dots: Dot[] = operations.map((op) => ({
    value: [Math.max(op.calls, 1), Math.max(op.mean_exec_time_ms, 0.01), op.total_exec_time_ms],
    id: op.id,
    query: op.query,
    share: op.share_of_total_time,
  }));
  const medianCalls = median(dots.map((d) => d.value[0]));
  const medianMean = median(dots.map((d) => d.value[1]));
  const hot = dots.filter((d) => d.value[0] >= medianCalls && d.value[1] >= medianMean);
  // Not the sum of the shares: each share is within its own source, so across a PostgreSQL and
  // a MongoDB source they would add up to more than 100%. Time is time, so use the times.
  const allTime = dots.reduce((sum, d) => sum + d.value[2], 0);
  const hotShare = allTime > 0 ? hot.reduce((sum, d) => sum + d.value[2], 0) / allTime : 0;
  const top = new Set(
    [...dots]
      .sort((a, b) => b.value[2] - a.value[2])
      .slice(0, LABELLED)
      .map((d) => d.id),
  );
  return { dots, maxTotal, medianCalls, medianMean, hot, hotShare, top };
}

/**
 * Every operation as a dot: how often it runs (x) against how long one run takes (y), sized by
 * the total time it costs. Top right is frequent and slow: the best things to fix. The dashed
 * lines are the medians, so the picture says "above average" without any threshold to guess.
 * Click a dot to open the operation; "Show data" lists the same numbers as a table.
 */
export function OperationsScatter({
  operations,
  search,
}: {
  operations: OperationSummary[];
  search: ExplorerSearch;
}) {
  const navigate = useNavigate();
  const { mode, palette } = useTheme();
  const [tableOpen, setTableOpen] = useState(false);
  const stats = useMemo(() => analyse(operations), [operations]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mode and palette change the tokens read inside
  const option = useMemo<EChartsCoreOption>(() => {
    const color = token("--chart-1", "#1d4ed8");
    const grid = token("--chart-grid", "#e7edf5");
    const axis = token("--chart-axis", "#8a9bb2");
    const surface = token("--card", "#ffffff");
    const ink = token("--card-foreground", "#172033");
    const axisBase = {
      type: "log" as const,
      nameTextStyle: { color: axis, fontSize: 11 },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
      axisLabel: { color: axis, fontSize: 11 },
      splitLine: { lineStyle: { color: grid, width: 1 } },
    };
    const lineLabel = (text: string) => ({
      color: axis,
      fontSize: 10,
      formatter: () => text,
    });
    return {
      animation: false,
      grid: { left: 8, right: 52, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: surface,
        borderColor: grid,
        textStyle: { color: ink, fontSize: 12 },
        extraCssText: "max-width: 340px;",
        formatter: (params: unknown) => tooltipNode((params as { data: Dot }).data),
      },
      xAxis: {
        ...axisBase,
        name: "Calls",
        axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => count(v) },
      },
      yAxis: {
        ...axisBase,
        name: "Mean time",
        axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => ms(v) },
      },
      series: [
        {
          type: "scatter",
          data: stats.dots.map((dot) => ({
            ...dot,
            label: stats.top.has(dot.id)
              ? {
                  show: true,
                  position: "right",
                  color: ink,
                  fontSize: 11,
                  formatter: short(dot.query, 26),
                }
              : undefined,
          })),
          symbolSize: (value: number[]) => 10 + 30 * Math.sqrt((value[2] ?? 0) / stats.maxTotal),
          itemStyle: { color, opacity: 0.5, borderColor: color, borderWidth: 1.5 },
          emphasis: { itemStyle: { opacity: 0.85 }, label: { show: true } },
          labelLayout: { hideOverlap: true },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            lineStyle: { type: "dashed", color: axis, width: 1 },
            data: [
              {
                xAxis: stats.medianCalls,
                label: {
                  ...lineLabel(`median ${count(stats.medianCalls)} calls`),
                  position: "end",
                },
              },
              {
                yAxis: stats.medianMean,
                label: { ...lineLabel(`median ${ms(stats.medianMean)}`), position: "insideEndTop" },
              },
            ],
          },
        },
      ],
    };
  }, [stats, mode, palette]);

  const label = `Calls against mean time for ${operations.length} operations; bigger dots cost more total time.`;
  const byTotal = useMemo(
    () => [...operations].sort((a, b) => b.total_exec_time_ms - a.total_exec_time_ms),
    [operations],
  );

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Calls vs mean time</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Each dot is an operation; a bigger dot costs more total time. The top right is frequent
          and slow: fix those first. Dashed lines are the medians.
        </p>
        {stats.hot.length > 0 && (
          <p className="text-sm">
            Of the {operations.length} shown, <strong>{stats.hot.length}</strong>{" "}
            {stats.hot.length === 1 ? "is" : "are"} both frequent and slow, and together{" "}
            {stats.hot.length === 1 ? "it takes" : "they take"}{" "}
            <strong>{Math.round(stats.hotShare * 100)}% of the time shown</strong>.
          </p>
        )}
      </div>

      <Suspense fallback={<div style={{ height: HEIGHT }} aria-hidden />}>
        <EChart
          option={option}
          height={HEIGHT}
          label={label}
          onItemClick={(data) => {
            const id = (data as Partial<Dot> | undefined)?.id;
            if (typeof id === "number") {
              void navigate({
                to: "/operations/$operationId",
                params: { operationId: id },
                search: windowOnly(search),
              });
            }
          }}
        />
      </Suspense>

      <details
        className="text-xs text-muted-foreground"
        onToggle={(event) => setTableOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer select-none">Show data</summary>
        {/* Only built while open: the list is the same operations the table below shows. */}
        {tableOpen && (
          <div className="mt-2 max-h-72 overflow-auto rounded-md border">
            <table className="w-full min-w-[34rem]">
              <caption className="sr-only">{label}</caption>
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                    Operation
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                    Calls
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                    Mean
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                    Total time
                  </th>
                </tr>
              </thead>
              <tbody>
                {byTotal.map((op) => (
                  <tr key={op.id} className="border-t">
                    <td className="max-w-[24rem] px-3 py-1.5">
                      <Link
                        to="/operations/$operationId"
                        params={{ operationId: op.id }}
                        search={windowOnly(search)}
                        className="line-clamp-1 font-mono break-all text-primary hover:underline"
                        title={flat(op.query)}
                      >
                        {short(op.query, 80)}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {count(op.calls)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {duration(op.mean_exec_time_ms)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {duration(op.total_exec_time_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </Card>
  );
}
