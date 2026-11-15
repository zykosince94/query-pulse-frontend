import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import type { EChartsCoreOption } from "echarts/core";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

// Register only what we use, so the bundle carries line charts, not all of ECharts.
echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

type Props = {
  option: EChartsCoreOption;
  height: number;
  /** Accessible summary of what the chart shows (the chart itself is aria-hidden). */
  label: string;
};

/**
 * A thin React wrapper around ECharts: create on mount, update on option change, resize with
 * the container, dispose on unmount. Tests replace this module, because jsdom can't lay out
 * charts; the data stays testable through the table view in TrendChart.
 */
export function EChart({ option, height, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: "svg" });
    chart.current = instance;
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
