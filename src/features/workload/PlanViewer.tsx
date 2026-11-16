import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanWrite } from "@/features/auth/queries";
import { dateTime, timeAgo } from "@/lib/format";
import { count } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { type OperationPlan, operationPlanQuery, type PlanNode, useCapturePlan } from "./queries";

const cost = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Scans that read a whole table are what Phase 5's rules look at first; make them stand out. */
function isFullScan(node: PlanNode): boolean {
  return node.node_type.includes("Seq Scan");
}

function Condition({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <code className="font-mono break-all">{value}</code>
    </div>
  );
}

function NodeView({ node, rootCost }: { node: PlanNode; rootCost: number }) {
  const fullScan = isFullScan(node);
  const share = rootCost > 0 ? Math.min(1, node.total_cost / rootCost) : 0;
  const target = node.relation_name
    ? `${node.schema_name ? `${node.schema_name}.` : ""}${node.relation_name}`
    : null;
  return (
    <li className="flex flex-col gap-2">
      <div
        data-node-type={node.node_type}
        className={cn(
          "flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2",
          fullScan && "border-warning/60 bg-warning-soft",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{node.node_type}</span>
          {node.join_type && <span className="text-sm">({node.join_type})</span>}
          {target && (
            <span className="text-sm">
              on <span className="font-mono font-medium">{target}</span>
              {node.alias && node.alias !== node.relation_name && (
                <span className="text-muted-foreground"> as {node.alias}</span>
              )}
            </span>
          )}
          {node.index_name && (
            <span className="text-sm">
              using <span className="font-mono font-medium">{node.index_name}</span>
            </span>
          )}
          {fullScan && (
            <Badge variant="warning">
              <TriangleAlert aria-hidden className="size-3" />
              Reads the whole table
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Cost{" "}
            <span className="font-mono text-foreground">
              {cost.format(node.startup_cost)}..{cost.format(node.total_cost)}
            </span>
          </span>
          <span>
            Rows <span className="font-mono text-foreground">{count(node.plan_rows)}</span>
          </span>
          <span>
            Width <span className="font-mono text-foreground">{node.plan_width}</span>
          </span>
          <span
            className="flex items-center gap-1.5"
            title="Share of the whole plan's estimated cost"
          >
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, share * 100)}%` }}
              />
            </span>
            {Math.round(share * 100)}% of plan cost
          </span>
        </div>
        <Condition label="Filter" value={node.filter} />
        <Condition label="Index condition" value={node.index_cond} />
        <Condition label="Recheck condition" value={node.recheck_cond} />
        <Condition label="Join condition" value={node.join_cond} />
        <Condition label="Sort key" value={node.sort_key?.join(", ")} />
        {node.strategy && <Condition label="Strategy" value={node.strategy} />}
      </div>
      {node.children && node.children.length > 0 && (
        <ul className="ml-3 flex flex-col gap-2 border-l pl-3 sm:ml-5 sm:pl-4">
          {node.children.map((child) => (
            <NodeView key={child.path} node={child} rootCost={rootCost} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CaptureButton({ operationId, label }: { operationId: number; label: string }) {
  const canWrite = useCanWrite();
  const capture = useCapturePlan(operationId);
  if (!canWrite) return null;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => capture.mutate()}
          disabled={capture.isPending}
        >
          <RefreshCw aria-hidden className={cn(capture.isPending && "animate-spin")} />
          {capture.isPending ? "Planning…" : label}
        </Button>
      </div>
      {capture.error && (
        <Alert variant="destructive">Couldn't plan the statement: {capture.error.message}</Alert>
      )}
    </div>
  );
}

function PlanBody({ plan, operationId }: { plan: OperationPlan; operationId: number }) {
  if (plan.status === "unavailable") {
    return (
      <Alert>
        <p className="font-medium">Plans aren't available for this source.</p>
        {plan.reason && <p className="mt-1">{plan.reason}</p>}
        {plan.fix && (
          <p className="mt-2">
            To fix: <code className="font-mono break-all">{plan.fix}</code>
          </p>
        )}
      </Alert>
    );
  }
  if (plan.status === "not_captured") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{plan.reason}</p>
        <CaptureButton operationId={operationId} label="Capture plan now" />
      </div>
    );
  }
  if (plan.status === "failed" || !plan.root) {
    return (
      <div className="flex flex-col gap-3">
        <Alert>
          <p className="font-medium">PostgreSQL couldn't plan this statement.</p>
          {plan.reason && <p className="mt-1">{plan.reason}</p>}
        </Alert>
        <CaptureButton operationId={operationId} label="Try again" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Plan nodes" className="flex flex-col gap-2">
        <NodeView node={plan.root} rootCost={plan.root.total_cost} />
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Captured {dateTime(plan.captured_at)} · last checked {timeAgo(plan.checked_at)}
        </p>
        <CaptureButton operationId={operationId} label="Re-capture" />
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">
          Raw plan (EXPLAIN JSON)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted p-3 font-mono">
          {JSON.stringify(plan.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** The PostgreSQL plan viewer: the generic plan's node tree with estimated cost and rows. */
export function PlanViewer({ operationId }: { operationId: number }) {
  const plan = useQuery(operationPlanQuery(operationId));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Query plan</CardTitle>
        <CardDescription>
          The generic plan from EXPLAIN (GENERIC_PLAN): the planner's estimates for any parameter
          values. The statement is never executed to get it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plan.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading the plan…
          </p>
        ) : plan.error ? (
          <Alert variant="destructive">Couldn't load the plan: {plan.error.message}</Alert>
        ) : (
          <PlanBody plan={plan.data} operationId={operationId} />
        )}
      </CardContent>
    </Card>
  );
}
