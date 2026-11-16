import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Findings</h1>
        <p className="text-sm text-muted-foreground">
          Problems the rules found in the collected evidence. Each one cites its evidence and
          suggests a fix to review; nothing is ever applied automatically.
        </p>
      </div>

      <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1 border-b">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={status === s.value}
            onClick={() => update({ status: s.value === "open" ? undefined : s.value })}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              status === s.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
            {counts && (
              <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[s.value]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
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
        <div className="flex flex-col gap-1.5">
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
      </div>

      {findings.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading findings…
        </p>
      ) : findings.error ? (
        <Alert variant="destructive">Couldn't load findings: {findings.error.message}</Alert>
      ) : findings.data.findings.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {status === "open"
            ? search.source || search.rule
              ? "No open findings match these filters."
              : "No open findings. The rules run after each collection; problems they find appear here with their evidence."
            : `No ${status} findings${search.source || search.rule ? " match these filters" : ""}.`}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {findings.data.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}
