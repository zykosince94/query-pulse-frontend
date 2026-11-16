import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { CopyButton } from "@/features/sources/components";
import type { Source } from "@/features/sources/queries";

/** MongoDB sources whose profiler isn't available: their operations can't be collected. */
export function profilerGaps(sources: Source[] | undefined, sourceId?: number) {
  return (sources ?? [])
    .filter((s) => s.engine === "mongodb" && s.enabled && (!sourceId || s.id === sourceId))
    .flatMap((s) => {
      const gap = s.capability_gaps?.find((c) => c.feature === "profiler");
      return gap ? [{ source: s, gap }] : [];
    });
}

/**
 * Says why a MongoDB source contributes nothing to the explorer, and how to fix it, instead
 * of letting its absence look like an idle database (QP-AC-24).
 */
export function ProfilerGaps({ sources, sourceId }: { sources?: Source[]; sourceId?: number }) {
  const gaps = profilerGaps(sources, sourceId);
  if (gaps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {gaps.map(({ source, gap }) => (
        <div
          key={source.id}
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm"
        >
          <p className="flex items-start gap-2 text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Operations from{" "}
              <Link
                to="/sources/$sourceId"
                params={{ sourceId: source.id }}
                className="font-medium underline"
              >
                {source.name}
              </Link>{" "}
              aren't collected: {gap.reason ?? "its profiler isn't available."} Query Pulse reads
              MongoDB's profiler and never turns it on itself.
            </span>
          </p>
          {gap.fix && (
            <div className="flex items-start gap-2 rounded-md bg-card p-2">
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">
                {gap.fix}
              </code>
              <CopyButton text={gap.fix} label="Copy the fix" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
