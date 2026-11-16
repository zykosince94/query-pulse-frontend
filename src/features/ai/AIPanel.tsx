import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCanWrite } from "@/features/auth/queries";
import { CopyButton } from "@/features/sources/components";
import { dateTime } from "@/lib/format";
import {
  type AIAnswer,
  type AIKind,
  evidenceBundleQuery,
  findingAIQuery,
  useAskAI,
} from "./queries";

type Claim = NonNullable<AIAnswer["summary"]>;

function Citations({ claim }: { claim: Claim }) {
  if (!claim.cited) {
    return (
      <Badge variant="warning" title="The model gave no evidence for this claim">
        Not backed by evidence
      </Badge>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {claim.evidence.map((id) => (
        <code
          key={id}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground"
          title="Evidence item this claim cites (see what was sent)"
        >
          {id}
        </code>
      ))}
    </span>
  );
}

function ClaimItem({ claim }: { claim: Claim }) {
  return (
    <li className="flex flex-col gap-1">
      <span>{claim.text}</span>
      <Citations claim={claim} />
    </li>
  );
}

function Answer({ answer, title }: { answer: AIAnswer; title: string }) {
  if (answer.status === "rejected") {
    return (
      <Alert variant="destructive">
        <p className="font-medium">{title}: the answer was discarded.</p>
        <p className="mt-1">{answer.error}</p>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">{title}</h5>
        <span className="text-xs text-muted-foreground">
          {answer.provider} · {answer.model}
          {answer.created_at ? ` · ${dateTime(answer.created_at)}` : ""}
        </span>
      </div>
      {!answer.current && (
        <p className="text-xs text-warning">
          The evidence has changed since this answer was given; ask again for a fresh one.
        </p>
      )}
      {answer.summary && (
        <div className="flex flex-col gap-1 text-sm font-medium">
          <span>{answer.summary.text}</span>
          <Citations claim={answer.summary} />
        </div>
      )}
      {answer.code && (
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2 rounded-md bg-muted p-2">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">
              {answer.code}
            </code>
            <CopyButton
              text={answer.code}
              label={
                answer.language === "mongosh" ? "Copy the drafted command" : "Copy the drafted SQL"
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A draft for review. Query Pulse never runs it.
          </p>
        </div>
      )}
      {answer.claims.length > 0 && (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          {answer.claims.map((claim, i) => (
            // Claims have no id; their order is fixed within one answer.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable order
            <ClaimItem key={i} claim={claim} />
          ))}
        </ul>
      )}
      {answer.caveats.length > 0 && (
        <p className="text-xs text-muted-foreground">Caveats: {answer.caveats.join(" ")}</p>
      )}
    </div>
  );
}

function SentEvidence({ findingId }: { findingId: number }) {
  const [open, setOpen] = useState(false);
  const bundle = useQuery({ ...evidenceBundleQuery(findingId), enabled: open });
  return (
    <div className="flex flex-col gap-2 text-xs">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
        View what is sent
      </Button>
      {open &&
        (bundle.isPending ? (
          <p className="text-muted-foreground" role="status">
            Loading the evidence bundle…
          </p>
        ) : bundle.error ? (
          <p className="text-destructive">Couldn't load the evidence: {bundle.error.message}</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground">
              {bundle.data.items.length} evidence items, built by Query Pulse from this finding.
              Literals are shown as ?; no credentials, hosts or connection details are included.
            </p>
            <section aria-label="Evidence bundle">
              <pre
                // Scrollable, so it must be reachable by keyboard.
                // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs focus
                tabIndex={0}
                className="max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono"
              >
                {JSON.stringify(bundle.data.document, null, 2)}
              </pre>
            </section>
          </div>
        ))}
    </div>
  );
}

function PanelBody({ findingId }: { findingId: number }) {
  const state = useQuery(findingAIQuery(findingId));
  const canWrite = useCanWrite();
  const ask = useAskAI(findingId);
  const [rejected, setRejected] = useState<AIAnswer | null>(null);

  if (state.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading…
      </p>
    );
  }
  if (state.error) {
    return <Alert variant="destructive">Couldn't load the AI panel: {state.error.message}</Alert>;
  }
  const { enabled, explain, draft } = state.data;
  const run = (kind: AIKind) =>
    ask.mutate(kind, {
      onSuccess: (answer) => setRejected(answer.status === "rejected" ? answer : null),
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Advisory. The rules raised this finding; AI only explains it and drafts a fix from the
        evidence below, citing it claim by claim. Check before acting.
      </p>
      {!enabled && (
        <p className="text-sm text-muted-foreground">
          AI is off.{" "}
          {canWrite ? (
            <>
              Turn it on in{" "}
              <Link to="/settings" className="text-primary hover:underline">
                Settings
              </Link>
              .
            </>
          ) : (
            "An admin can turn it on in Settings."
          )}
        </p>
      )}
      {enabled && canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ask.isPending}
            onClick={() => run("explain")}
          >
            {ask.isPending && ask.variables === "explain" ? "Explaining…" : "Explain this finding"}
          </Button>
          <Button variant="outline" size="sm" disabled={ask.isPending} onClick={() => run("draft")}>
            {ask.isPending && ask.variables === "draft" ? "Drafting…" : "Draft a fix"}
          </Button>
        </div>
      )}
      {ask.error && <Alert variant="destructive">{ask.error.message}</Alert>}
      {rejected && (
        <Answer answer={rejected} title={rejected.kind === "draft" ? "Draft" : "Explanation"} />
      )}
      {explain && <Answer answer={explain} title="Explanation" />}
      {draft && <Answer answer={draft} title="Draft fix" />}
      {enabled && !explain && !draft && !rejected && !canWrite && (
        <p className="text-sm text-muted-foreground">No AI answers for this finding yet.</p>
      )}
      <SentEvidence findingId={findingId} />
    </div>
  );
}

/**
 * The AI assistant for one finding, collapsed until opened (so a list of findings doesn't
 * load anything). Everyone sees answers already given and the evidence that would be sent;
 * only the admin can ask, because each request costs money.
 */
export function AIPanel({ findingId }: { findingId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bot aria-hidden />
        AI assistant
        {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
      </Button>
      {open && (
        <section aria-label="AI assistant answers">
          <PanelBody findingId={findingId} />
        </section>
      )}
    </div>
  );
}
