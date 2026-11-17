import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Check, Link2, Lock } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EngineBadge } from "@/features/sources/components";
import { sourcesQuery } from "@/features/sources/queries";
import { count, duration } from "@/lib/numbers";
import { MIN_POINTS, OperationsScatter } from "./OperationsScatter";
import { ProfilerGaps, profilerGaps } from "./ProfilerGaps";
import { type OperationSummary, operationsQuery } from "./queries";
import {
  DEFAULT_RANGE,
  describeWindow,
  type ExplorerSearch,
  lockWindow,
  RANGES,
  type RangeKey,
  SORTS,
  type SortKey,
  windowOnly,
  windowParams,
} from "./search";

const route = getRouteApi("/app/");
const LIMIT = 50;

/**
 * The operation on one line: a PostgreSQL statement (pg_stat_statements keeps newlines) or a
 * MongoDB query shape (compact JSON, values shown as "?").
 */
export function oneLine(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function ShareBar({ share }: { share: number }) {
  const percent = Math.round(share * 100);
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">{percent}%</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
    </div>
  );
}

function OperationRow({
  op,
  rank,
  search,
}: {
  op: OperationSummary;
  rank: number;
  search: ExplorerSearch;
}) {
  return (
    <tr className="border-t align-top hover:bg-muted/50">
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{rank}</td>
      <td className="max-w-[28rem] px-3 py-2">
        <Link
          to="/operations/$operationId"
          params={{ operationId: op.id }}
          search={windowOnly(search)}
          className="line-clamp-2 font-mono text-xs break-all text-primary hover:underline"
          title={op.query}
        >
          {oneLine(op.query)}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <EngineBadge engine={op.engine} />
          <span>{op.source_name}</span>
          {op.namespace && <span className="font-mono">{op.namespace}</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {duration(op.total_exec_time_ms)}
      </td>
      <td className="px-3 py-2">
        <ShareBar share={op.share_of_total_time} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{count(op.calls)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{duration(op.mean_exec_time_ms)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{count(op.rows)}</td>
    </tr>
  );
}

/** Copy the page's URL: it holds every filter, so the link reopens this exact view. */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true));
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

/**
 * The workload explorer: operations ranked by total time, mean time or calls. Every control
 * writes to the URL and the list reads from it, so there is no other state to lose.
 */
export function Explorer() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const sources = useQuery(sourcesQuery);
  const sort: SortKey = search.sort ?? "total_time";
  const params = {
    ...windowParams(search),
    sort,
    ...(search.source ? { source_id: search.source } : {}),
    ...(search.q ? { q: search.q } : {}),
    limit: LIMIT,
  };
  const operations = useQuery(operationsQuery(params));

  // The text box is local while typing and goes to the URL on submit (Enter or the button).
  const [text, setText] = useState(search.q ?? "");
  useEffect(() => setText(search.q ?? ""), [search.q]);

  const update = (changes: Partial<ExplorerSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true });

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    update({ q: text.trim() || undefined });
  };

  const rangeValue = search.from ? "custom" : (search.range ?? DEFAULT_RANGE);
  const data = operations.data;

  return (
    <section aria-labelledby="explorer-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="explorer-heading" className="text-lg font-semibold">
          Operations
        </h2>
        <div className="flex flex-wrap gap-2">
          {!search.from && (
            <Button
              variant="outline"
              size="sm"
              title="Turn the relative range into fixed times, so a shared link shows the same data later"
              onClick={() => update(lockWindow(search))}
            >
              <Lock aria-hidden />
              Lock range
            </Button>
          )}
          <CopyLink />
        </div>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explorer-range">Time range</Label>
          <Select
            id="explorer-range"
            value={rangeValue}
            onChange={(e) =>
              update({ range: e.target.value as RangeKey, from: undefined, to: undefined })
            }
          >
            {search.from && <option value="custom">{describeWindow(search)}</option>}
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explorer-sort">Rank by</Label>
          <Select
            id="explorer-sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value as SortKey })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="explorer-source">Source</Label>
          <Select
            id="explorer-source"
            value={search.source ?? ""}
            onChange={(e) =>
              update({ source: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">All sources</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {search.source && !sources.data?.some((s) => s.id === search.source) && (
              <option value={search.source}>Source #{search.source}</option>
            )}
          </Select>
        </div>
        <form className="flex flex-col gap-1.5" onSubmit={onSearch}>
          <Label htmlFor="explorer-q">Statement or shape contains</Label>
          <div className="flex gap-2">
            <Input
              id="explorer-q"
              value={text}
              maxLength={200}
              placeholder="e.g. orders"
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </div>
        </form>
      </Card>

      <ProfilerGaps sources={sources.data} sourceId={search.source} />

      {operations.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading operations…
        </p>
      ) : operations.error ? (
        <Alert variant="destructive">Couldn't load operations: {operations.error.message}</Alert>
      ) : data && data.operations.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {search.source && !search.q && profilerGaps(sources.data, search.source).length > 0
            ? "Nothing to rank from this source until its profiler is on (see above)."
            : search.q || search.source
              ? "No operations match these filters in this time range."
              : "No operations were collected in this time range. Once a source is added, the collector records PostgreSQL statement statistics and MongoDB profiled operations every minute (15 s in the demo)."}
        </Card>
      ) : data ? (
        <>
          {data.operations.length >= MIN_POINTS && (
            <OperationsScatter operations={data.operations} search={search} />
          )}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">
                  Operations ranked by {SORTS.find((s) => s.value === sort)?.label.toLowerCase()},{" "}
                  {describeWindow(search).toLowerCase()}
                </caption>
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">
                      Operation
                    </th>
                    {(
                      [
                        ["total_time", "Total time"],
                        [null, "Share"],
                        ["calls", "Calls"],
                        ["mean_time", "Mean"],
                        [null, "Rows"],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-3 py-2 text-right font-semibold"
                        aria-sort={key && key === sort ? "descending" : undefined}
                      >
                        {key && key === sort ? (
                          <span className="text-foreground">{label} ↓</span>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.operations.map((op, i) => (
                    <OperationRow key={op.id} op={op} rank={i + 1} search={search} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {data.total_count > data.operations.length
                ? `Top ${data.operations.length} of ${count(data.total_count)} operations`
                : `${count(data.total_count)} operation${data.total_count === 1 ? "" : "s"}`}{" "}
              · {duration(data.total_exec_time_ms)} total execution time · {describeWindow(search)}
            </p>
          </Card>
        </>
      ) : null}
    </section>
  );
}
