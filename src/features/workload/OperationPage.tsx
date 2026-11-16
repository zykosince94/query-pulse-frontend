import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FindingCard } from "@/features/findings/FindingCard";
import { findingsQuery } from "@/features/findings/queries";
import { EngineBadge } from "@/features/sources/components";
import { dateTime } from "@/lib/format";
import { count, duration } from "@/lib/numbers";
import { PlanViewer } from "./PlanViewer";
import { operationQuery } from "./queries";
import { DEFAULT_RANGE, describeWindow, RANGES, type RangeKey, windowParams } from "./search";

const route = getRouteApi("/app/operations/$operationId");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** One operation: its statement, metrics over the time range, history and generic plan. */
export function OperationPage() {
  const { operationId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const detail = useQuery(operationQuery(operationId, windowParams(search)));
  const findings = useQuery(findingsQuery({ operation_id: operationId }));

  const back = (
    <Link
      to="/"
      search={{ range: search.range, from: search.from, to: search.to }}
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Workload
    </Link>
  );

  if (detail.isPending) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {back}
        <p className="text-sm text-muted-foreground" role="status">
          Loading the operation…
        </p>
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {back}
        <Alert variant="destructive">
          {"status" in detail.error && detail.error.status === 404
            ? "This operation doesn't exist (its source may have been deleted, or its data aged out)."
            : `Couldn't load the operation: ${detail.error.message}`}
        </Alert>
      </div>
    );
  }

  const { operation: op, source, history } = detail.data;
  const bucket = detail.data.bucket_seconds >= 3600 ? "hour" : "minute";
  const per = bucket === "hour" ? "hour" : "minute";
  const blocks = op.shared_blks_hit + op.shared_blks_read;
  const window = describeWindow(search);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {back}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Operation</h1>
          <EngineBadge engine={source.engine} />
          <Link
            to="/sources/$sourceId"
            params={{ sourceId: source.id }}
            className="text-sm text-primary hover:underline"
          >
            {source.name}
          </Link>
        </div>
        <pre className="overflow-x-auto rounded-md border bg-card p-3 font-mono text-sm whitespace-pre-wrap break-words">
          {op.query}
        </pre>
        <p className="text-xs text-muted-foreground">
          First seen {dateTime(op.first_seen_at)} · last seen {dateTime(op.last_seen_at)}
          {!detail.data.toplevel && " · runs nested inside a function or procedure"}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
          <CardTitle className="text-base">{window}</CardTitle>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="operation-range" className="sr-only">
              Time range
            </Label>
            <Select
              id="operation-range"
              className="w-auto"
              value={search.from ? "custom" : (search.range ?? DEFAULT_RANGE)}
              onChange={(e) =>
                void navigate({
                  search: { range: e.target.value as RangeKey, from: undefined, to: undefined },
                  replace: true,
                })
              }
            >
              {search.from && <option value="custom">{window}</option>}
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Total time"
              value={duration(op.total_exec_time_ms)}
              hint={`${Math.round(op.share_of_total_time * 100)}% of the source's total`}
            />
            <Stat label="Calls" value={count(op.calls)} />
            <Stat label="Mean time" value={duration(op.mean_exec_time_ms)} />
            <Stat
              label="Rows"
              value={count(op.rows)}
              hint={op.calls ? `${count(op.rows / op.calls)} per call` : undefined}
            />
            <Stat
              label="Cache hit ratio"
              value={blocks ? `${((op.shared_blks_hit / blocks) * 100).toFixed(1)}%` : "–"}
              hint={blocks ? `${count(op.shared_blks_read)} blocks read from disk` : undefined}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Execution time per {per}</h3>
              <TrendChart
                bucket={bucket}
                data={history.map((p) => ({ start: p.start, value: p.total_exec_time_ms }))}
                unit="ms"
                format={duration}
                label={`Execution time per ${per}, ${window.toLowerCase()}: ${duration(op.total_exec_time_ms)} in total`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Calls per {per}</h3>
              <TrendChart
                bucket={bucket}
                data={history.map((p) => ({ start: p.start, value: p.calls }))}
                unit="calls"
                format={count}
                label={`Calls per ${per}, ${window.toLowerCase()}: ${count(op.calls)} in total`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {findings.data && findings.data.findings.length > 0 && (
        <section aria-labelledby="operation-findings" className="flex flex-col gap-3">
          <h2 id="operation-findings" className="text-lg font-semibold">
            Findings
          </h2>
          {findings.data.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} showTarget={false} />
          ))}
        </section>
      )}

      <PlanViewer operationId={operationId} citedPlanId={search.plan} highlightPath={search.node} />
    </div>
  );
}
