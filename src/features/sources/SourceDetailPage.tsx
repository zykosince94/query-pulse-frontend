import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/api/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanWrite } from "@/features/auth/queries";
import { dateTime, timeAgo } from "@/lib/format";
import { CapabilityChecklist, ConnectionError, EngineBadge, StatusBadge } from "./components";
import { sourceQuery, useDeleteSource, useRecheckSource } from "./queries";

const TLS_LABELS = {
  disable: "Off",
  require: "Required (not verified)",
  "verify-full": "Verified",
};

function BackLink() {
  return (
    <Link
      to="/sources"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Data sources
    </Link>
  );
}

export function SourceDetailPage({ sourceId }: { sourceId: number }) {
  const { data: source, isPending, error, refetch } = useQuery(sourceQuery(sourceId));
  const canWrite = useCanWrite();
  const recheck = useRecheckSource(sourceId);
  const remove = useDeleteSource(sourceId);
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading source…
      </p>
    );
  }
  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <BackLink />
        <Alert variant="destructive" className="flex items-center justify-between gap-3">
          <span>{notFound ? "This data source doesn't exist." : error.message}</span>
          {!notFound && (
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  const details: [string, string][] = [
    ["Host", `${source.host}:${source.port}`],
    ["Database", source.database],
    ["Username", source.username || "(none)"],
    ["Password", source.has_password ? "Saved (encrypted)" : "None"],
    ["TLS", TLS_LABELS[source.tls_mode]],
    ["Server version", source.server_version ?? "Unknown"],
    ["Last checked", `${timeAgo(source.last_checked_at)} (${dateTime(source.last_checked_at)})`],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{source.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <EngineBadge engine={source.engine} />
            <StatusBadge status={source.status} />
            {!source.enabled && <span className="text-xs text-muted-foreground">Disabled</span>}
          </div>
          {source.description && (
            <p className="text-sm text-muted-foreground">{source.description}</p>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
              <RefreshCw aria-hidden className={recheck.isPending ? "animate-spin" : undefined} />
              {recheck.isPending ? "Checking…" : "Re-check"}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/sources/$sourceId/edit" params={{ sourceId: source.id }}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Delete <strong>{source.name}</strong>? Its settings and saved credentials are removed.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => void router.navigate({ to: "/sources" }),
                })
              }
            >
              {remove.isPending ? "Deleting…" : "Delete source"}
            </Button>
          </div>
        </Alert>
      )}
      {remove.error && <Alert variant="destructive">{remove.error.message}</Alert>}
      {recheck.error && <Alert variant="destructive">{recheck.error.message}</Alert>}

      {source.status === "failing" && source.last_error && (
        <ConnectionError message={`The last check couldn't connect: ${source.last_error}`} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
            {details.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="capabilities-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="capabilities-heading" className="text-lg font-semibold">
            Capabilities
          </h2>
          <p className="text-sm text-muted-foreground">
            What Query Pulse can monitor on this source, and the exact fix for anything missing.
            {source.status === "failing" && " Shown as of the last successful check."}
          </p>
        </div>
        <CapabilityChecklist capabilities={source.capabilities} />
      </section>
    </div>
  );
}
