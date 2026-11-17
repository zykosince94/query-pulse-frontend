import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BarChart3,
  Database,
  FileSearch,
  Lightbulb,
  ShieldCheck,
  Table2,
} from "lucide-react";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/features/ai/AIPanel";
import { useCanWrite } from "@/features/auth/queries";
import { CopyButton, EngineBadge } from "@/features/sources/components";
import { dateTime, timeAgo } from "@/lib/format";
import { count, duration } from "@/lib/numbers";
import { cn } from "@/lib/utils";
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

const chip = "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors";

function EvidenceLink({ item }: { item: Evidence }) {
  const Icon =
    item.kind === "plan"
      ? FileSearch
      : item.kind === "operation"
        ? BarChart3
        : item.kind === "relation_stat"
          ? Table2
          : Database;
  const body = (
    <>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{item.label}</span>
    </>
  );
  if (!item.available) {
    return (
      <span className={cn(chip, "border-dashed text-muted-foreground")}>
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
        className={cn(chip, "text-primary hover:bg-accent")}
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
        className={cn(chip, "text-primary hover:bg-accent")}
      >
        {body}
      </Link>
    );
  }
  // Table and index samples have no page of their own; their numbers are in the facts.
  return <span className={cn(chip, "bg-muted/50 text-muted-foreground")}>{body}</span>;
}

const titleLink =
  "group inline-flex items-start gap-1.5 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The finding's title. For a finding about an operation it opens that operation: on the plan the
 * finding cites when there is one, otherwise over the time window it was raised on. Findings
 * about an index or a table have no page of their own, so their title stays plain text.
 */
function FindingTitle({ finding }: { finding: Finding }) {
  const arrow = (
    <ArrowUpRight
      aria-hidden
      className="mt-1 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    />
  );
  const id = finding.fingerprint_id;
  if (!id) return <>{finding.title}</>;
  const plan = finding.evidence.find(
    (e) => e.kind === "plan" && e.available && e.fingerprint_id === id && e.plan_id,
  );
  if (plan?.plan_id) {
    return (
      <Link
        to="/operations/$operationId"
        params={{ operationId: id }}
        search={{ plan: plan.plan_id, node: plan.node_path ?? undefined }}
        hash="plan"
        className={titleLink}
      >
        {finding.title}
        {arrow}
      </Link>
    );
  }
  const window = finding.evidence.find((e) => e.kind === "operation" && e.available);
  return (
    <Link
      to="/operations/$operationId"
      params={{ operationId: id }}
      search={{ from: window?.start ?? undefined, to: window?.end ?? undefined }}
      className={titleLink}
    >
      {finding.title}
      {arrow}
    </Link>
  );
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
    <div className="flex flex-col items-end gap-2">
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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-4">
        {icon}
        {title}
      </h4>
      {children}
    </section>
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
  const mongo = finding.engine === "mongodb";
  return (
    <Card className="flex flex-col gap-7 p-6 sm:p-8" aria-labelledby={`finding-${finding.id}`}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {finding.rule_id}
          </Badge>
          <Badge variant={CONFIDENCE[finding.confidence]}>{finding.confidence} confidence</Badge>
          <Badge
            variant={strong ? "success" : "outline"}
            title={
              strong
                ? `Read from a captured query plan: what ${mongo ? "MongoDB" : "PostgreSQL"} will do`
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
        <div className="flex flex-col gap-2">
          <h3 id={`finding-${finding.id}`} className="text-xl font-semibold leading-snug">
            <FindingTitle finding={finding} />
          </h3>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {finding.summary}
          </p>
        </div>
        {showTarget && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/60 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <EngineBadge engine={finding.engine} />
              {finding.source_name}
            </span>
            {finding.target_kind === "operation" && finding.fingerprint_id ? (
              <Link
                to="/operations/$operationId"
                params={{ operationId: finding.fingerprint_id }}
                className="line-clamp-2 font-mono text-xs leading-relaxed break-all text-primary hover:underline"
              >
                {finding.query}
              </Link>
            ) : (
              <span className="font-mono text-xs">{finding.relation}</span>
            )}
          </div>
        )}
      </header>

      {finding.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {finding.facts.map((fact) => (
            <div
              key={fact.key}
              className="flex flex-col gap-1 rounded-lg border bg-background/60 p-3"
            >
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-lg font-semibold tabular-nums break-words">{formatFact(fact)}</dd>
            </div>
          ))}
        </dl>
      )}

      <Section title="Suggested next step" icon={<Lightbulb aria-hidden />}>
        <p className="max-w-prose text-sm leading-relaxed">{finding.suggested_action}</p>
        {finding.action_sql && (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/60 p-3">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {finding.action_sql}
            </code>
            <CopyButton
              text={finding.action_sql}
              label={mongo ? "Copy the mongosh command" : "Copy SQL"}
            />
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden className="size-3.5" />
          Review before running. Query Pulse never runs it for you.
        </p>
      </Section>

      <Section title="Evidence" icon={<FileSearch aria-hidden />}>
        <ul aria-label="Evidence" className="flex flex-wrap gap-2">
          {finding.evidence.map((item, i) => (
            // Evidence items have no id of their own; their order is fixed per finding.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
            <li key={i}>
              <EvidenceLink item={item} />
            </li>
          ))}
        </ul>
      </Section>

      <AIPanel findingId={finding.id} />

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <p className="text-xs text-muted-foreground">
          First seen {dateTime(finding.first_seen_at)} · last seen {timeAgo(finding.last_seen_at)}
        </p>
        <StatusActions finding={finding} />
      </footer>
    </Card>
  );
}
