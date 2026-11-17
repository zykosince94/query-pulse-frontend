import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  aiSettingsQuery,
  runtimeSettingsQuery,
  useDeleteAIKey,
  useSaveAISettings,
} from "@/features/ai/queries";
import { useCanWrite } from "@/features/auth/queries";
import { AppearanceCard } from "@/features/theme/AppearanceCard";
import { dateTime } from "@/lib/format";

function seconds(value: number): string {
  return value >= 60 && value % 60 === 0 ? `${value / 60} min` : `${value} s`;
}

function RuntimeCard() {
  const runtime = useQuery(runtimeSettingsQuery);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Collection and retention</CardTitle>
        <CardDescription>
          Set by the backend's environment (<code>QP_*</code> variables) and shown here read-only;
          change them in the deployment and restart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runtime.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : runtime.error ? (
          <Alert variant="destructive">Couldn't load settings: {runtime.error.message}</Alert>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
            {(
              [
                ["Collection interval", seconds(runtime.data.collector_interval_seconds)],
                ["Rules run every", seconds(runtime.data.rules_interval_seconds)],
                ["Rules look back", `${runtime.data.rules_window_minutes} min`],
                ["Data kept for", `${runtime.data.retention_days} days`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function AICard() {
  const settings = useQuery(aiSettingsQuery);
  const canWrite = useCanWrite();
  const save = useSaveAISettings();
  const removeKey = useDeleteAIKey();
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);

  // The form starts from what's saved, and follows it after a save or a key deletion.
  useEffect(() => {
    if (!settings.data) return;
    setProvider(settings.data.provider ?? settings.data.providers[0]?.id ?? "openai");
    setModel(settings.data.model ?? "");
    setEnabled(settings.data.enabled);
  }, [settings.data]);

  if (settings.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading AI settings…
      </p>
    );
  }
  if (settings.error) {
    return <Alert variant="destructive">Couldn't load AI settings: {settings.error.message}</Alert>;
  }
  const data = settings.data;
  const providerChanged = data.key_set && data.provider !== null && provider !== data.provider;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    save.mutate(
      { provider, model: model.trim(), enabled, ...(apiKey ? { api_key: apiKey } : {}) },
      {
        onSuccess: () => {
          setApiKey("");
          setSaved(true);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">AI assistant</CardTitle>
          <Badge variant={data.enabled ? "success" : "outline"}>
            {data.enabled ? "On" : "Off"}
          </Badge>
        </div>
        <CardDescription>
          Optional, and off until a provider, model and API key are saved and it's turned on. It
          explains findings and drafts fixes from a redacted evidence bundle (no literals,
          credentials or hosts); the rules still decide, and nothing it drafts is run. Each request
          is billed to your provider account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-provider">Provider</Label>
              <Select
                id="ai-provider"
                value={provider}
                disabled={!canWrite}
                onChange={(e) => setProvider(e.target.value)}
              >
                {data.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-model">Model</Label>
              <Input
                id="ai-model"
                value={model}
                required
                maxLength={100}
                disabled={!canWrite}
                placeholder="The model id from your provider's docs"
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-key">API key</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              disabled={!canWrite}
              placeholder={data.key_set ? `Saved key ${data.key_hint ?? ""}` : "Paste your API key"}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {data.key_set
                ? providerChanged
                  ? "Enter the key again: a saved key is only sent to the provider it was saved for."
                  : `A key ending ${data.key_hint} is saved, encrypted. Leave this empty to keep it.`
                : "Stored encrypted and never shown again; only its last four characters are displayed."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canWrite}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4 accent-primary"
            />
            Turn the AI assistant on (the key and model are checked with the provider first)
          </label>
          {save.error && <Alert variant="destructive">Not saved: {save.error.message}</Alert>}
          {removeKey.error && <Alert variant="destructive">{removeKey.error.message}</Alert>}
          {saved && !save.isPending && (
            <p className="text-sm text-success" role="status">
              Saved. AI is {data.enabled ? "on" : "off"}.
            </p>
          )}
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending || !model.trim()}>
                {save.isPending ? (enabled ? "Checking the key…" : "Saving…") : "Save"}
              </Button>
              {data.key_set && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={removeKey.isPending}
                  onClick={() => {
                    setSaved(false);
                    removeKey.mutate();
                  }}
                >
                  Delete the key
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">The demo user can't change settings.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Requests made by this server since it started: {data.provider_calls}
            {data.updated_at ? ` · last changed ${dateTime(data.updated_at)}` : ""}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <AppearanceCard />
      <AICard />
      <RuntimeCard />
    </div>
  );
}
