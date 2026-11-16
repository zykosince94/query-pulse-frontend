import { Explorer } from "./Explorer";
import { HealthStrip } from "./HealthStrip";

/** The home screen: source health, then the workload explorer. */
export function WorkloadPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Workload</h1>
      <HealthStrip />
      <Explorer />
    </div>
  );
}
