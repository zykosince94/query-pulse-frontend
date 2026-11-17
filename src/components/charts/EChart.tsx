import { LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import type { EChartsCoreOption } from "echarts/core";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

// Register only what we use, so the bundle carries line charts, not all of ECharts.
echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  SVGRenderer,
]);

type Props = {
  option: EChartsCoreOption;
  height: number;
  /** Accessible summary of what the chart shows (the chart itself is aria-hidden). */
  label: string;
  /** Called with a clicked data item (the object you put in the series), e.g. to open it. */
  onItemClick?: (data: unknown) => void;
};

/**
 * A thin React wrapper around ECharts: create on mount, update on option change, resize with
 * the container, dispose on unmount. Tests replace this module, because jsdom can't lay out
 * charts; the data stays testable through the table view in TrendChart.
 */
export function EChart({ option, height, label, onItemClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  // The newest callback, without re-creating the chart whenever the parent re-renders.
  const onClick = useRef(onItemClick);
  onClick.current = onItemClick;

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.current = instance;
    instance.on("click", (params) => onClick.current?.(params.data));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <figure className="m-0" aria-label={label}>
      <div ref={ref} style={{ height }} aria-hidden />
    </figure>
  );
}
