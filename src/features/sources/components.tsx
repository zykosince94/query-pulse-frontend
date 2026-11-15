import { Check, CircleAlert, Copy, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Capability, ENGINE_LABELS, type Engine, type Source } from "./queries";

export function EngineBadge({ engine }: { engine: Engine }) {
  return <Badge variant="outline">{ENGINE_LABELS[engine]}</Badge>;
}

const STATUS: Record<
  Source["status"],
  { label: string; variant: "success" | "warning" | "destructive"; hint: string }
> = {
  healthy: {
    label: "Healthy",
    variant: "success",
    hint: "Connected, and every feature is available",
  },
  degraded: {
    label: "Degraded",
    variant: "warning",
    hint: "Connected, but some features are unavailable. See the checklist for fixes.",
  },
  failing: { label: "Failing", variant: "destructive", hint: "The last check couldn't connect" },
};

export function StatusBadge({ status }: { status: Source["status"] }) {
  const { label, variant, hint } = STATUS[status];
  return (
    <Badge variant={variant} title={hint}>
      {label}
    </Badge>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={copied ? "Copied" : "Copy fix"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be unavailable (http, permissions); the text is still selectable.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** What works on this source, and the exact fix for what doesn't. */
export function CapabilityChecklist({ capabilities }: { capabilities: Capability[] }) {
  if (capabilities.length === 0) {
    return <p className="text-sm text-muted-foreground">No capability checks have run yet.</p>;
  }
  return (
    <ul aria-label="Capability checklist" className="flex flex-col divide-y rounded-lg border">
      {capabilities.map((cap) => (
        <li key={cap.feature} className="flex flex-col gap-2 p-4">
          <div className="flex items-start gap-3">
            {cap.available ? (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium">
                {cap.label}
                <span className="sr-only">{cap.available ? ": available" : ": unavailable"}</span>
              </span>
              {cap.reason && <span className="text-sm text-muted-foreground">{cap.reason}</span>}
            </div>
          </div>
          {cap.fix && (
            <div className="ml-7 flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How to fix
              </span>
              <div className="flex items-start gap-2 rounded-md bg-muted p-2">
                <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">
                  {cap.fix}
                </code>
                <CopyButton text={cap.fix} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ConnectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm text-destructive"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
