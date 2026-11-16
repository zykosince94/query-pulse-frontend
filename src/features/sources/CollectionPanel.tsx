import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sourceTrendQuery } from "@/features/workload/queries";
import { dateTime, timeAgo } from "@/lib/format";
import { count, duration } from "@/lib/numbers";
import type { SourceDetail } from "./queries";

const MINUTES = 60;

/** Collection status and the last hour's activity for one source. */
export function CollectionPanel({ source }: { source: SourceDetail }) {
  const collects = source.enabled;
  const mongo = source.engine === "mongodb";
  const trend = useQuery({ ...sourceTrendQuery(source.id, MINUTES), enabled: collects });

  if (!collects) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection</CardTitle>
          <CardDescription>
            This source is disabled, so the collector skips it. Enable it to collect again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const points = trend.data?.points ?? [];
  const totalCalls = points.reduce((sum, p) => sum + p.calls, 0);
  const totalTime = points.reduce((sum, p) => sum + p.total_exec_time_ms, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Collection</CardTitle>
        <CardDescription>
          {source.last_collected_at
            ? `Last collected ${timeAgo(source.last_collected_at)} (${dateTime(source.last_collected_at)}).`
            : mongo
              ? "Waiting for the first collection. The collector starts reading the profiler from the first cycle, and records operations from the next one."
              : "Waiting for the first collection. The collector takes a baseline first, then records activity from the next cycle."}
          {mongo &&
            " MongoDB activity comes from the profiler, so it counts only the operations the profiler records (those slower than its slowms threshold)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {source.warnings.map((warning) => (
          <div
            key={warning}
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{warning}</span>
          </div>
        ))}

        {trend.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading activity…
          </p>
        ) : trend.error ? (
          <p className="text-sm text-destructive">Couldn't load activity: {trend.error.message}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">
                {mongo ? "Profiled operations per minute" : "Calls per minute"}
              </h3>
              <p className="text-xs text-muted-foreground">{count(totalCalls)} in the last hour</p>
              <TrendChart
                data={points.map((p) => ({ start: p.start, value: p.calls }))}
                unit="calls"
                format={count}
                label={`Calls per minute over the last hour, ${count(totalCalls)} in total`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Execution time per minute</h3>
              <p className="text-xs text-muted-foreground">
                {duration(totalTime)} in the last hour
              </p>
              <TrendChart
                data={points.map((p) => ({ start: p.start, value: p.total_exec_time_ms }))}
                unit="ms"
                format={duration}
                label={`Execution time per minute over the last hour, ${duration(totalTime)} in total`}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
