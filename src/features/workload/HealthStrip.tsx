import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EngineBadge, StatusBadge } from "@/features/sources/components";
import { timeAgo } from "@/lib/format";
import { count, duration } from "@/lib/numbers";
import { collectorStatusQuery, type SourceHealth, workloadHealthQuery } from "./queries";

const MINUTES = 60;

function SourceCard({ health }: { health: SourceHealth }) {
  const { source } = health;
  const collects = source.enabled;
  const mongo = source.engine === "mongodb";
  const profilerOff =
    mongo && (source.capability_gaps ?? []).some((gap) => gap.feature === "profiler");
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to="/sources/$sourceId"
            params={{ sourceId: source.id }}
            className="truncate font-medium text-primary hover:underline"
          >
            {source.name}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            <EngineBadge engine={source.engine} />
            <StatusBadge status={source.status} />
            {source.warnings.length > 0 && (
              <Badge variant="warning" title={source.warnings.join(" ")}>
                <TriangleAlert aria-hidden className="size-3" />
                Incomplete
              </Badge>
            )}
          </div>
        </div>
      </div>

      {collects ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-muted-foreground">
                {mongo ? "Profiled operations, last hour" : "Calls, last hour"}
              </div>
              <div className="text-lg font-semibold tabular-nums">{count(health.calls)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Execution time</div>
              <div className="text-lg font-semibold tabular-nums">
                {duration(health.total_exec_time_ms)}
              </div>
            </div>
          </div>
          <TrendChart
            compact
            withTable={false}
            data={health.points.map((p) => ({ start: p.start, value: p.calls }))}
            unit="calls"
            format={count}
            label={`${source.name}: calls per minute over the last hour, ${count(health.calls)} in total`}
          />
          <p className="text-xs text-muted-foreground">
            {profilerOff
              ? "Profiling is off, so no operations are collected. See the source for the fix."
              : source.last_collected_at
                ? `Collected ${timeAgo(source.last_collected_at)}`
                : "Waiting for the first collection"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Collection is off for this source (disabled).
        </p>
      )}
    </Card>
  );
}

/** One card per source: status, the last hour's totals and a calls-per-minute sparkline. */
export function HealthStrip() {
  const health = useQuery(workloadHealthQuery(MINUTES));
  const collector = useQuery(collectorStatusQuery);

  return (
    <section aria-labelledby="health-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="health-heading" className="text-lg font-semibold">
          Source health
        </h2>
        {collector.data && (
          <span className="text-xs text-muted-foreground">
            Collector:{" "}
            <span className={collector.data.status === "running" ? "text-success" : "text-warning"}>
              {collector.data.status === "running" ? "running" : "not running"}
            </span>
          </span>
        )}
      </div>

      {collector.data?.status === "not_running" && (
        <Alert>{collector.data.message} Charts won't update until it's running.</Alert>
      )}

      {health.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading source health…
        </p>
      ) : health.error ? (
        <Alert variant="destructive">Couldn't load source health: {health.error.message}</Alert>
      ) : health.data.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No data sources yet.{" "}
          <Link to="/sources" className="text-primary hover:underline">
            Add one
          </Link>{" "}
          to start collecting workload statistics.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {health.data.map((h) => (
            <SourceCard key={h.source.id} health={h} />
          ))}
        </div>
      )}
    </section>
  );
}
