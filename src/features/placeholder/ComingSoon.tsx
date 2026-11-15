import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  description: string;
  phase: string;
  items: string[];
};

/** An honest placeholder: says what this screen will do and which phase delivers it. */
export function ComingSoon({ title, description, phase, items }: Props) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Badge variant="outline">{phase}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not built yet</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkloadPage() {
  return (
    <ComingSoon
      title="Workload"
      phase="Phase 4 · v0.4.0"
      description="The home screen: the most expensive operations across your sources."
      items={[
        "Source health strip",
        "Operations ranked by total time, mean time or calls",
        "Time range and filters kept in the URL",
        "Drill-down into an operation's history and plan",
      ]}
    />
  );
}

export function FindingsPage() {
  return (
    <ComingSoon
      title="Findings"
      phase="Phase 5 · v0.5.0"
      description="Rule-based findings, each backed by evidence you can open."
      items={[
        "Findings with confidence and evidence links to operations and plans",
        "Suggested manual next steps (never applied automatically)",
        "Open, resolved and dismissed status",
      ]}
    />
  );
}

export function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      phase="Phase 7 · v1.0.0"
      description="Retention, collection interval and the optional AI assistant."
      items={[
        "Retention and collection interval",
        "AI provider, model and a masked API key (off by default)",
      ]}
    />
  );
}
