import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Database, Plus, TriangleAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCanWrite } from "@/features/auth/queries";
import { timeAgo } from "@/lib/format";
import { EngineBadge, StatusBadge } from "./components";
import { sourcesQuery } from "./queries";

function AddSourceButton() {
  const canWrite = useCanWrite();
  if (!canWrite) {
    return (
      <Button disabled title="The demo is read-only">
        <Plus aria-hidden />
        Add source
      </Button>
    );
  }
  return (
    <Button asChild>
      <Link to="/sources/new">
        <Plus aria-hidden />
        Add source
      </Link>
    </Button>
  );
}

export function SourcesPage() {
  const { data: sources, isPending, error, refetch } = useQuery(sourcesQuery);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Data sources</h1>
          <p className="text-sm text-muted-foreground">
            PostgreSQL and MongoDB databases Query Pulse watches, with read-only credentials.
          </p>
        </div>
        <AddSourceButton />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading data sources…
        </p>
      ) : error ? (
        <Alert variant="destructive" className="flex items-center justify-between gap-3">
          <span>Couldn't load data sources: {error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </Alert>
      ) : sources.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <Database aria-hidden className="size-8 text-muted-foreground" />
            <CardTitle className="text-base">No data sources yet</CardTitle>
            <CardDescription>
              Add a PostgreSQL or MongoDB database. Query Pulse tests the connection and shows what
              it can monitor before saving anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <AddSourceButton />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Engine</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Location</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Version</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Last collected</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        to="/sources/$sourceId"
                        params={{ sourceId: source.id }}
                        className="text-primary hover:underline"
                      >
                        {source.name}
                      </Link>
                      {!source.enabled && (
                        <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EngineBadge engine={source.engine} />
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                      {source.host}:{source.port}/{source.database}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {source.server_version ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={source.status} />
                        {source.warnings.length > 0 && (
                          <Badge variant="warning" title={source.warnings.join(" ")}>
                            <TriangleAlert aria-hidden className="size-3" />
                            Incomplete
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {source.engine === "postgres" ? timeAgo(source.last_collected_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
