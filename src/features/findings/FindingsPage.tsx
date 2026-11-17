import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { CheckCircle2, SearchX } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Select } from "@/components/ui/select";
import { sourcesQuery } from "@/features/sources/queries";
import { cn } from "@/lib/utils";
import { FindingCard } from "./FindingCard";
import { type FindingStatus, findingsQuery, rulesQuery } from "./queries";

const route = getRouteApi("/app/findings");

export type FindingsSearch = {
  /** Default: open. */
  status?: FindingStatus | undefined;
  source?: number | undefined;
  rule?: string | undefined;
};

const STATUSES: { value: FindingStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

/** Every key returned (undefined for defaults and invalid values), like the explorer's. */
export function validateFindingsSearch(search: Record<string, unknown>): FindingsSearch {
  const status = STATUSES.some((s) => s.value === search.status)
    ? (search.status as FindingStatus)
    : undefined;
  const source = Number(search.source);
  const rule =
    typeof search.rule === "string" && /^[A-Z0-9-]{1,64}$/.test(search.rule)
      ? search.rule
      : undefined;
  return {
    status: status === "open" ? undefined : status,
    source: Number.isInteger(source) && source > 0 ? source : undefined,
    rule,
  };
}

/** Grey placeholder cards, so the page keeps its shape while the first load finishes. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[0, 1].map((i) => (
        <Card key={i} className="flex flex-col gap-5 p-8 motion-safe:animate-pulse">
          <div className="h-5 w-48 rounded-full bg-muted" />
          <div className="h-6 w-3/4 rounded bg-muted" />
          <div className="h-4 w-full max-w-prose rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Findings from the rules, filtered by status, source and rule (all kept in the URL). */
export function FindingsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const status = search.status ?? "open";
  const findings = useQuery(
    findingsQuery({
      status,
      ...(search.source ? { source_id: search.source } : {}),
      ...(search.rule ? { rule_id: search.rule } : {}),
    }),
  );
  const sources = useQuery(sourcesQuery);
  const rules = useQuery(rulesQuery);
  const update = (changes: Partial<FindingsSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...changes }), replace: true });
  const counts = findings.data?.counts;
  const filtered = Boolean(search.source || search.rule);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Findings</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Problems the rules found in the collected evidence. Each one cites its evidence and
          suggests a fix to review; nothing is ever applied automatically.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div
          role="tablist"
          aria-label="Status"
          className="flex w-full gap-1 rounded-full bg-muted p-1 sm:inline-flex sm:w-fit"
        >
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={status === s.value}
              onClick={() => update({ status: s.value === "open" ? undefined : s.value })}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:gap-2 sm:px-4",
                status === s.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {counts && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                    status === s.value ? "bg-secondary text-secondary-foreground" : "",
                  )}
                >
                  {counts[s.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
            <Label htmlFor="findings-source">Source</Label>
            <Select
              id="findings-source"
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
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1.5 sm:w-72">
            <Label htmlFor="findings-rule">Rule</Label>
            <Select
              id="findings-rule"
              value={search.rule ?? ""}
              onChange={(e) => update({ rule: e.target.value || undefined })}
            >
              <option value="">All rules</option>
              {rules.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}: {r.title}
                </option>
              ))}
            </Select>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ source: undefined, rule: undefined })}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {findings.isPending ? (
        <>
          <p className="sr-only" role="status">
            Loading findings…
          </p>
          <Skeleton />
        </>
      ) : findings.error ? (
        <Alert variant="destructive">Couldn't load findings: {findings.error.message}</Alert>
      ) : findings.data.findings.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          {filtered ? (
            <SearchX aria-hidden className="size-8 text-muted-foreground" />
          ) : (
            <CheckCircle2 aria-hidden className="size-8 text-success" />
          )}
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {status === "open"
              ? filtered
                ? "No open findings match these filters."
                : "No open findings. The rules run after each collection; problems they find appear here with their evidence."
              : `No ${status} findings${filtered ? " match these filters" : ""}.`}
          </p>
        </Card>
      ) : (
        <div className="relative flex flex-col gap-8">
          {/* Only while the filters or the tab changed: the 30-second refresh stays silent. */}
          {findings.isPlaceholderData && (
            <LoadingOverlay label="Updating findings…" className="justify-start pt-32" />
          )}
          {findings.data.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}
