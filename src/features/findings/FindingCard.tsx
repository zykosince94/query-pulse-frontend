import { Link } from "@tanstack/react-router";
import { BarChart3, Database, FileSearch, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCanWrite } from "@/features/auth/queries";
import { CopyButton } from "@/features/sources/components";
import { dateTime, timeAgo } from "@/lib/format";
import { count, duration } from "@/lib/numbers";
import {
  type Evidence,
  type Fact,
  type Finding,
  type FindingStatus,
  useUpdateFinding,
} from "./queries";

const CONFIDENCE: Record<Finding["confidence"], "destructive" | "warning" | "default"> = {
  high: "destructive",
  medium: "warning",
  low: "default",
};

const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  dismissed: "Dismissed",
  resolved: "Resolved",
};

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** A fact's value, formatted by what its key says it is. */
export function formatFact({ key, value }: Fact): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (key.includes("share") || key === "selectivity") return percent.format(value);
  if (key.endsWith("_bytes")) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (key.endsWith("_ms")) return duration(value);
  // Whole numbers read as counts ("1,428", "200K"); fractions keep up to two decimals.
  return Number.isInteger(value) ? count(value) : decimal.format(value);
}

function EvidenceLink({ item }: { item: Evidence }) {
  const icon =
    item.kind === "plan" ? (
      <FileSearch aria-hidden className="size-4 shrink-0" />
    ) : item.kind === "operation" ? (
      <BarChart3 aria-hidden className="size-4 shrink-0" />
    ) : (
      <Database aria-hidden className="size-4 shrink-0" />
    );
  const body = (
    <>
      {icon}
      <span>{item.label}</span>
    </>
  );
  if (!item.available) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        {body}
        <span className="text-xs">(no longer stored)</span>
      </span>
    );
  }
  if (item.kind === "plan" && item.fingerprint_id && item.plan_id) {
    return (
      <Link
        to="/operations/$operationId"
        params={{ operationId: item.fingerprint_id }}
        search={{ plan: item.plan_id, node: item.node_path ?? undefined }}
        hash="plan"
        className="flex items-center gap-2 text-primary hover:underline"
      >
        {body}
      </Link>
    );
  }
  if (item.kind === "operation" && item.fingerprint_id) {
    return (
      <Link
        to="/operations/$operationId"
        params={{ operationId: item.fingerprint_id }}
        search={{ from: item.start ?? undefined, to: item.end ?? undefined }}
        className="flex items-center gap-2 text-primary hover:underline"
      >
        {body}
      </Link>
    );
  }
  // Table and index samples have no page of their own; their numbers are in the facts.
  return <span className="flex items-center gap-2">{body}</span>;
}

function StatusActions({ finding }: { finding: Finding }) {
  const canWrite = useCanWrite();
  const update = useUpdateFinding();
  if (!canWrite) return null;
  const actions: { status: FindingStatus; label: string }[] =
    finding.status === "open"
      ? [
          { status: "resolved", label: "Mark resolved" },
          { status: "dismissed", label: "Dismiss" },
        ]
      : [{ status: "open", label: "Reopen" }];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.status}
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: finding.id, status: action.status })}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {update.error && (
        <Alert variant="destructive">Couldn't update the finding: {update.error.message}</Alert>
      )}
    </div>
  );
}

/** One finding: what's wrong, how sure we are, the evidence, and what to do by hand. */
export function FindingCard({
  finding,
  showTarget = true,
}: {
  finding: Finding;
  showTarget?: boolean;
}) {
  const strong = finding.evidence_strength === "plan";
  return (
    <Card className="flex flex-col gap-4 p-4" aria-labelledby={`finding-${finding.id}`}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {finding.rule_id}
          </Badge>
          <Badge variant={CONFIDENCE[finding.confidence]}>{finding.confidence} confidence</Badge>
          <Badge
            variant={strong ? "success" : "outline"}
            title={
              strong
                ? "Read from a captured query plan: what PostgreSQL actually does"
                : "Inferred from counters alone; check before acting"
            }
          >
            {strong ? "Plan evidence" : "Statistics heuristic"}
          </Badge>
          {finding.status !== "open" && (
            <Badge variant="default">
              {STATUS_LABEL[finding.status]}
              {finding.status_changed_by === "rules" ? " automatically" : ""}
            </Badge>
          )}
        </div>
        <h3 id={`finding-${finding.id}`} className="text-base font-semibold">
          {finding.title}
        </h3>
        {showTarget && (
          <div className="text-sm text-muted-foreground">
            {finding.target_kind === "operation" && finding.fingerprint_id ? (
              <Link
                to="/operations/$operationId"
                params={{ operationId: finding.fingerprint_id }}
                className="line-clamp-2 font-mono text-xs break-all text-primary hover:underline"
              >
                {finding.query}
              </Link>
            ) : (
              <span className="font-mono text-xs">{finding.relation}</span>
            )}
            <span className="block text-xs">{finding.source_name}</span>
          </div>
        )}
        <p className="text-sm">{finding.summary}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {finding.facts.map((fact) => (
          <div key={fact.key} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="font-medium tabular-nums break-words">{formatFact(fact)}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested next step
        </h4>
        <p className="text-sm">{finding.suggested_action}</p>
        {finding.action_sql && (
          <div className="flex items-start gap-2 rounded-md bg-muted p-2">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">
              {finding.action_sql}
            </code>
            <CopyButton text={finding.action_sql} label="Copy SQL" />
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert aria-hidden className="size-3.5" />
          Review before running. Query Pulse never runs it for you.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence
        </h4>
        <ul aria-label="Evidence" className="flex flex-col gap-1.5 text-sm">
          {finding.evidence.map((item, i) => (
            // Evidence items have no id of their own; their order is fixed per finding.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
            <li key={i}>
              <EvidenceLink item={item} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          First seen {dateTime(finding.first_seen_at)} · last seen {timeAgo(finding.last_seen_at)}
        </p>
        <StatusActions finding={finding} />
      </div>
    </Card>
  );
}
