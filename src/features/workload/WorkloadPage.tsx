import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthStrip } from "./HealthStrip";

/** The home screen: the health strip now (Phase 3), the ranked explorer in Phase 4. */
export function WorkloadPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Workload</h1>
      <HealthStrip />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Workload explorer</CardTitle>
            <Badge variant="outline">Phase 4 · v0.4.0</Badge>
          </div>
          <CardDescription>
            Operations ranked by total time, mean time or calls, with filters and time ranges kept
            in the URL, and drill-down into each operation's history and plan.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
