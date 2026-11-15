import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CircleCheck, PlugZap } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCanWrite } from "@/features/auth/queries";
import { CapabilityChecklist, ConnectionError } from "./components";
import {
  type ConnectionTestResult,
  DEFAULT_PORTS,
  ENGINE_LABELS,
  type Engine,
  type SourceDetail,
  sourceQuery,
  type TlsMode,
  useCreateSource,
  useTestConnection,
  useUpdateSource,
} from "./queries";

type FormValues = {
  name: string;
  engine: Engine;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  tls_mode: TlsMode;
  description: string;
  enabled: boolean;
};

const EMPTY: FormValues = {
  name: "",
  engine: "postgres",
  host: "",
  port: String(DEFAULT_PORTS.postgres),
  database: "",
  username: "",
  password: "",
  tls_mode: "disable",
  description: "",
  enabled: true,
};

function fromSource(source: SourceDetail): FormValues {
  return {
    name: source.name,
    engine: source.engine,
    host: source.host,
    port: String(source.port),
    database: source.database,
    username: source.username,
    password: "",
    tls_mode: source.tls_mode,
    description: source.description,
    enabled: source.enabled,
  };
}

/** The settings a connection test depends on. Changing any of them invalidates the last test. */
function connectionKey(v: FormValues): string {
  return JSON.stringify([
    v.engine,
    v.host.trim(),
    v.port,
    v.database.trim(),
    v.username.trim(),
    v.password,
    v.tls_mode,
  ]);
}

function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  if (!result.ok) {
    return <ConnectionError message={result.error?.message ?? "The connection failed."} />;
  }
  const missing = result.capabilities.filter((c) => !c.available).length;
  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-sm text-success"
      >
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Connected to version {result.server_version} in {Math.round(result.latency_ms ?? 0)} ms.
          {missing > 0
            ? ` ${missing} feature${missing > 1 ? "s are" : " is"} unavailable; you can save now and fix ${missing > 1 ? "them" : "it"} later.`
            : " Every feature is available."}
        </span>
      </div>
      <CapabilityChecklist capabilities={result.capabilities} />
    </div>
  );
}

function SourceForm({ existing }: { existing?: SourceDetail }) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(existing ? fromSource(existing) : EMPTY);
  const [tested, setTested] = useState<{ key: string; result: ConnectionTestResult } | null>(null);
  const test = useTestConnection();
  const create = useCreateSource();
  const update = useUpdateSource(existing?.id ?? 0);
  const save = existing ? update : create;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const changeEngine = (engine: Engine) =>
    setValues((v) => ({
      ...v,
      engine,
      // Swap the port only if it's still the other engine's default.
      port: v.port === String(DEFAULT_PORTS[v.engine]) ? String(DEFAULT_PORTS[engine]) : v.port,
    }));

  const key = connectionKey(values);
  const currentTest = tested?.key === key ? tested.result : null;
  const nameOk = values.name.trim().length >= 2;

  // Editing: if the connection settings are exactly as saved (blank password = keep), only
  // name, description or "enabled" changed, which needs no connection test. This keeps a
  // source whose database is down renamable and disableable.
  const connectionUnchanged = existing ? connectionKey(fromSource(existing)) === key : false;

  // A saved password is only ever sent to the server it was saved for (the backend enforces
  // this too). Pointing the source somewhere else means typing the password again.
  const targetChanged = Boolean(
    existing &&
      (values.engine !== existing.engine ||
        values.host.trim() !== existing.host ||
        Number(values.port) !== existing.port ||
        values.username.trim() !== existing.username),
  );
  const needsPassword = Boolean(existing?.has_password && targetChanged && values.password === "");
  const keepPassword = Boolean(existing && values.password === "" && !targetChanged);

  const canSave = nameOk && !needsPassword && (connectionUnchanged || currentTest?.ok === true);

  const connection = {
    engine: values.engine,
    host: values.host.trim(),
    port: Number(values.port),
    database: values.database.trim(),
    username: values.username.trim(),
    tls_mode: values.tls_mode,
  };

  function runTest() {
    save.reset();
    test.mutate(
      keepPassword
        ? { ...connection, source_id: existing?.id ?? null }
        : { ...connection, password: values.password },
      { onSuccess: (result) => setTested({ key, result }) },
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    const fields = {
      ...connection,
      name: values.name.trim(),
      description: values.description.trim(),
      enabled: values.enabled,
    };
    const onSuccess = (source: SourceDetail) =>
      void router.navigate({ to: "/sources/$sourceId", params: { sourceId: source.id } });
    if (existing) {
      update.mutate({ ...fields, password: keepPassword ? null : values.password }, { onSuccess });
    } else {
      create.mutate({ ...fields, password: values.password }, { onSuccess });
    }
  }

  const missingForTest =
    needsPassword ||
    !values.host.trim() ||
    !values.database.trim() ||
    !values.port ||
    (values.engine === "postgres" && !values.username.trim());

  const saveHint = !nameOk
    ? "Name the source and test the connection to save."
    : needsPassword
      ? "Enter the password, then test the connection to save."
      : "Test the connection to save.";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id={id("name")} label="Name">
              <Input
                id={id("name")}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Orders database"
                required
              />
            </Field>
          </div>
          <Field id={id("engine")} label="Engine">
            <Select
              id={id("engine")}
              value={values.engine}
              onChange={(e) => changeEngine(e.target.value as Engine)}
            >
              {(Object.keys(ENGINE_LABELS) as Engine[]).map((engine) => (
                <option key={engine} value={engine}>
                  {ENGINE_LABELS[engine]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={id("tls")}
            label="TLS"
            hint="'Required' encrypts without checking the certificate; 'Verified' also checks it."
          >
            <Select
              id={id("tls")}
              value={values.tls_mode}
              onChange={(e) => set("tls_mode", e.target.value as TlsMode)}
              aria-describedby={`${id("tls")}-hint`}
            >
              <option value="disable">Off</option>
              <option value="require">Required</option>
              <option value="verify-full">Verified</option>
            </Select>
          </Field>
          <Field id={id("host")} label="Host">
            <Input
              id={id("host")}
              value={values.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder="db.internal.example.com"
              autoComplete="off"
              required
            />
          </Field>
          <Field id={id("port")} label="Port">
            <Input
              id={id("port")}
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              value={values.port}
              onChange={(e) => set("port", e.target.value)}
              required
            />
          </Field>
          <Field id={id("database")} label="Database">
            <Input
              id={id("database")}
              value={values.database}
              onChange={(e) => set("database", e.target.value)}
              autoComplete="off"
              required
            />
          </Field>
          <Field
            id={id("username")}
            label="Username"
            hint={
              values.engine === "mongodb"
                ? "Leave blank if the server doesn't require authentication."
                : "Use a read-only role with pg_monitor."
            }
          >
            <Input
              id={id("username")}
              value={values.username}
              onChange={(e) => set("username", e.target.value)}
              autoComplete="off"
              aria-describedby={`${id("username")}-hint`}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id={id("password")}
              label="Password"
              hint={
                needsPassword
                  ? "Enter the password again: the server changed, and a saved password is only ever sent to the server it was saved for."
                  : existing?.has_password && !targetChanged
                    ? "Leave blank to keep the saved password. Passwords are encrypted and never shown again."
                    : "Encrypted before it's stored, and never shown again."
              }
            >
              <Input
                id={id("password")}
                type="password"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
                aria-describedby={`${id("password")}-hint`}
                aria-invalid={needsPassword || undefined}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id={id("description")} label="Description (optional)">
              <Input
                id={id("description")}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={values.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Enabled (collect from this source)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test the connection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Query Pulse connects read-only, reports what it can monitor, and saves only after a
            successful test.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={runTest}
              disabled={test.isPending || missingForTest}
            >
              <PlugZap aria-hidden />
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
          </div>
          {test.error && <Alert variant="destructive">{test.error.message}</Alert>}
          {currentTest && <TestResult result={currentTest} />}
          {tested && !currentTest && (
            <p className="text-sm text-muted-foreground">
              The connection settings changed since the last test. Test again before saving.
            </p>
          )}
        </CardContent>
      </Card>

      {save.error && <Alert variant="destructive">{save.error.message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSave || save.isPending}>
          {save.isPending ? "Saving…" : existing ? "Save changes" : "Save source"}
        </Button>
        <Button variant="ghost" asChild>
          {existing ? (
            <Link to="/sources/$sourceId" params={{ sourceId: existing.id }}>
              Cancel
            </Link>
          ) : (
            <Link to="/sources">Cancel</Link>
          )}
        </Button>
        {!canSave && !save.isPending && (
          <span className="text-xs text-muted-foreground">{saveHint}</span>
        )}
        {existing && connectionUnchanged && (
          <span className="text-xs text-muted-foreground">
            Connection settings unchanged: no test needed.
          </span>
        )}
      </div>
    </form>
  );
}

function ReadOnlyNotice() {
  return (
    <Alert>The demo is read-only: you can look at data sources but not add or change them.</Alert>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        to="/sources"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Data sources
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
    </div>
  );
}

export function NewSourcePage() {
  const canWrite = useCanWrite();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Header title="Add a data source" />
      {canWrite ? <SourceForm /> : <ReadOnlyNotice />}
    </div>
  );
}

export function EditSourcePage({ sourceId }: { sourceId: number }) {
  const canWrite = useCanWrite();
  const { data: source, isPending, error } = useQuery(sourceQuery(sourceId));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Header title={source ? `Edit ${source.name}` : "Edit data source"} />
      {!canWrite ? (
        <ReadOnlyNotice />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading source…
        </p>
      ) : error ? (
        <Alert variant="destructive">{error.message}</Alert>
      ) : (
        <SourceForm existing={source} />
      )}
    </div>
  );
}
