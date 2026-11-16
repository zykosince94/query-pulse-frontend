import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverMetricsQuery } from "@/features/workload/queries";
import { dateTime, timeAgo } from "@/lib/format";
import { count } from "@/lib/numbers";

const OPERATIONS = ["query", "insert", "update", "delete", "getmore", "command"] as const;
const rate = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function megabytes(bytes: number): string {
  return `${count(Math.round(bytes / (1024 * 1024)))} MB`;
}

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** A MongoDB server's latest serverStatus sample: operation rates, connections, cache. */
export function ServerPanel({ sourceId }: { sourceId: number }) {
  const metrics = useQuery(serverMetricsQuery(sourceId));
  const data = metrics.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Server</CardTitle>
        <CardDescription>
          {data
            ? `From serverStatus, sampled ${timeAgo(data.captured_at)} (${dateTime(data.captured_at)}).`
            : "From serverStatus, sampled every collection cycle."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {metrics.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading server metrics…
          </p>
        ) : metrics.error ? (
          <p className="text-sm text-destructive">
            Couldn't load server metrics: {metrics.error.message}
          </p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            No sample yet. The collector reads serverStatus on its next cycle (it needs the
            clusterMonitor role; see the capability checklist).
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Uptime</dt>
                <dd className="font-medium">{uptime(data.uptime_seconds)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className="font-medium">{data.repl_state ?? "Standalone"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Connections</dt>
                <dd className="font-medium tabular-nums">
                  {data.connections_current === null || data.connections_current === undefined
                    ? "–"
                    : count(data.connections_current)}
                  {data.connections_available ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      ({count(data.connections_available)} available)
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">WiredTiger cache</dt>
                <dd className="font-medium tabular-nums">
                  {data.cache_bytes === null || data.cache_bytes === undefined
                    ? "–"
                    : megabytes(data.cache_bytes)}
                  {data.cache_max_bytes ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      of {megabytes(data.cache_max_bytes)}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Operations per second, by type</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 pr-3 text-left font-semibold">
                      Operation
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-semibold">
                      Per second
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Since start
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {OPERATIONS.map((name) => (
                    <tr key={name} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs">{name}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {data.rates_per_second
                          ? rate.format(data.rates_per_second[name] ?? 0)
                          : "–"}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {count(data.opcounters[name] ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.rates_per_second && (
              <p className="text-xs text-muted-foreground">
                Rates need two samples in a row from the same server run; they appear after the next
                cycle.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
