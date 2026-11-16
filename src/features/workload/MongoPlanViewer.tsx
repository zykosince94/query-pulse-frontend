import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MongoPlanStage, OperationPlan } from "./queries";

/** What makes a stage worth a second look, in the words the rules use. */
function warnings(stage: MongoPlanStage): string[] {
  const found: string[] = [];
  if (stage.stage === "COLLSCAN") found.push("Reads the whole collection");
  if (stage.stage === "SORT") found.push("Sorts in memory");
  if (stage.stage === "IXSCAN" && stage.full_index_scan) found.push("Scans the whole index");
  return found;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono break-all">{children}</code>;
}

function StageView({ stage, highlightPath }: { stage: MongoPlanStage; highlightPath?: string }) {
  const flagged = warnings(stage);
  const cited = highlightPath === stage.path;
  const bounds = Object.entries(stage.index_bounds ?? {});
  return (
    <li className="flex flex-col gap-2">
      <div
        data-stage={stage.stage}
        className={cn(
          "flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2",
          flagged.length > 0 && "border-warning/60 bg-warning-soft",
          cited && "ring-2 ring-primary",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono font-semibold">{stage.stage}</span>
          {stage.index_name && (
            <span className="text-sm">
              using <span className="font-mono font-medium">{stage.index_name}</span>
            </span>
          )}
          {stage.direction && stage.direction !== "forward" && (
            <span className="text-xs text-muted-foreground">({stage.direction})</span>
          )}
          {cited && <Badge variant="default">Cited by the finding</Badge>}
          {flagged.map((text) => (
            <Badge key={text} variant="warning">
              <TriangleAlert aria-hidden className="size-3" />
              {text}
            </Badge>
          ))}
        </div>
        {stage.key_pattern && (
          <Row label="Index keys">
            <Code>{stage.key_pattern}</Code>
          </Row>
        )}
        {stage.filter && (
          <Row label="Filter">
            <Code>{stage.filter}</Code>
          </Row>
        )}
        {bounds.length > 0 && (
          <Row label="Index bounds">
            {bounds.map(([field, ranges]) => (
              <Code key={field}>
                {field}: {ranges.join(", ")}{" "}
              </Code>
            ))}
          </Row>
        )}
        {stage.sort_pattern && (
          <Row label="Sort by">
            <Code>{stage.sort_pattern}</Code>
          </Row>
        )}
      </div>
      {stage.children && stage.children.length > 0 && (
        <ul className="ml-3 flex flex-col gap-2 border-l pl-3 sm:ml-5 sm:pl-4">
          {stage.children.map((child) => (
            <StageView key={child.path} stage={child} highlightPath={highlightPath} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A MongoDB winning plan (explain at queryPlanner verbosity): stages from the root (what
 * returns documents) down to the scan that reads them. Query values are shown as "?":
 * Query Pulse redacts them before storing a plan.
 */
export function MongoPlanBody({
  plan,
  highlightPath,
}: {
  plan: OperationPlan;
  highlightPath?: string | undefined;
}) {
  if (!plan.stage_root) return null;
  const rejected = plan.rejected_plans ?? 0;
  const pipeline = plan.pipeline_stages ?? [];
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Plan stages" className="flex flex-col gap-2">
        <StageView stage={plan.stage_root} highlightPath={highlightPath} />
      </ul>
      {pipeline.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Then, in the aggregation pipeline: <Code>{pipeline.join(" → ")}</Code>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {rejected === 0
          ? "MongoDB considered no other plan."
          : `MongoDB considered ${rejected} other plan${rejected === 1 ? "" : "s"} and chose this one.`}{" "}
        Values from the query show as ?: Query Pulse doesn't store them.
      </p>
      <p className="text-xs text-muted-foreground">
        Captured {dateTime(plan.captured_at)} · last checked {timeAgo(plan.checked_at)}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">
          Stored plan (redacted explain JSON)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted p-3 font-mono">
          {JSON.stringify(plan.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}
