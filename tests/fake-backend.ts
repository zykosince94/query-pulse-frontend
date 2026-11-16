import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { Schemas, User } from "@/api/client";

/**
 * A small in-memory stand-in for the backend API, used by Mock Service Worker.
 * Response bodies are typed from the generated schema, so if the backend contract changes,
 * these fakes stop compiling instead of silently drifting.
 *
 * Connection behaviour depends on the host, like the backend's own fake adapter:
 *   badpass.example  → wrong password      down.example → timeout
 *   degraded.example → connects, one capability missing      anything else → all good
 */
export const ADMIN = { username: "admin", password: "admin-password" } as const;
export const ADMIN_USER: User = { username: "admin", role: "admin", read_only: false };
export const DEMO_USER: User = { username: "demo", role: "demo", read_only: true };

type SourceDetail = Schemas["SourceDetail"];
type Capability = Schemas["CapabilityOut"];
type ProbeOutcome =
  | { ok: true; capabilities: Capability[] }
  | { ok: false; error: Schemas["ConnectionErrorOut"] };

export const MISSING_ROLE_FIX = 'GRANT pg_monitor TO "monitor";';

export const backend = {
  session: null as User | null,
  demoEnabled: true,
  sources: [] as SourceDetail[],
  /** Passwords kept "server-side" so tests can check what the client sent. */
  passwords: new Map<number, string>(),
  lastTestPassword: undefined as string | null | undefined,
  /** PUTs that changed only name/description/enabled (no connection test). */
  updatesWithoutTest: 0,
  /** Per-source calls/time per minute, as the collector would have recorded them. */
  trends: new Map<number, Schemas["TrendPoint"][]>(),
  collectorRunning: true,
  /** Operations as the collector would have aggregated them, with optional detail and plan. */
  operations: [] as Schemas["OperationSummary"][],
  history: new Map<number, Schemas["HistoryPoint"][]>(),
  plans: new Map<number, Schemas["OperationPlan"]>(),
  /** The query string of every GET /api/operations, to check what the explorer asked for. */
  operationRequests: [] as URLSearchParams[],
  captures: 0,
  findings: [] as Schemas["FindingOut"][],
  /** Stored plans by id (what GET /api/plans/{id} returns). */
  storedPlans: new Map<number, Schemas["OperationPlan"]>(),
  findingUpdates: [] as { id: number; status: string }[],
  nextId: 1,
  reset() {
    this.session = null;
    this.demoEnabled = true;
    this.sources = [];
    this.passwords = new Map();
    this.lastTestPassword = undefined;
    this.updatesWithoutTest = 0;
    this.trends = new Map();
    this.collectorRunning = true;
    this.operations = [];
    this.history = new Map();
    this.plans = new Map();
    this.operationRequests = [];
    this.captures = 0;
    this.findings = [];
    this.storedPlans = new Map();
    this.findingUpdates = [];
    this.nextId = 1;
  },
};

function probe(host: string): ProbeOutcome {
  if (host === "badpass.example") {
    return {
      ok: false,
      error: {
        code: "auth_failed",
        message: "PostgreSQL rejected the username or password for user 'monitor'.",
      },
    };
  }
  if (host === "down.example") {
    return {
      ok: false,
      error: { code: "timeout", message: "No answer from down.example:5432 within 5s." },
    };
  }
  const degraded = host === "degraded.example";
  return {
    ok: true,
    capabilities: [
      {
        feature: "pg_stat_statements",
        label: "Statement statistics (pg_stat_statements)",
        available: true,
        reason: null,
        fix: null,
      },
      {
        feature: "read_all_stats",
        label: "Statistics for all users' queries",
        available: !degraded,
        reason: degraded ? "This user can only see its own queries' text and statistics." : null,
        fix: degraded ? MISSING_ROLE_FIX : null,
      },
    ],
  };
}

export function capabilitiesFor(host: string): Capability[] {
  const outcome = probe(host);
  return outcome.ok ? outcome.capabilities : [];
}

export function makeSource(overrides: Partial<SourceDetail> = {}): SourceDetail {
  const now = new Date().toISOString();
  const id = overrides.id ?? backend.nextId++;
  return {
    id,
    name: "Orders DB",
    engine: "postgres",
    host: "ok.example",
    port: 5432,
    database: "shop",
    username: "monitor",
    tls_mode: "disable",
    enabled: true,
    description: "",
    has_password: true,
    server_version: "16.4",
    status: "healthy",
    last_checked_at: now,
    last_error: null,
    created_at: now,
    updated_at: now,
    last_collected_at: null,
    warnings: [],
    capabilities: capabilitiesFor("ok.example"),
    ...overrides,
  };
}

const unauthorized = () => HttpResponse.json({ detail: "Not signed in" }, { status: 401 });
const forbidden = () =>
  HttpResponse.json({ detail: "The demo user is read-only" }, { status: 403 });
const notFoundSource = () => HttpResponse.json({ detail: "Source not found" }, { status: 404 });

/** Run auth checks the way the backend does: 401 without a session, 403 for the demo user. */
function guard(write: boolean) {
  if (!backend.session) return unauthorized();
  if (write && backend.session.read_only) return forbidden();
  return null;
}

export const RETARGET_MESSAGE =
  "Enter the password again: the engine, host, port or username changed, and a saved password is only ever sent to the server it was saved for.";

type ConnectionFields = Pick<SourceDetail, "engine" | "host" | "port" | "username"> &
  Partial<Pick<SourceDetail, "database" | "tls_mode">>;

/** Mirrors the backend: a stored password may only go to the server it was saved for. */
function targetChanged(source: SourceDetail, fields: ConnectionFields) {
  return (
    source.engine !== fields.engine ||
    source.host !== fields.host ||
    source.port !== fields.port ||
    source.username !== (fields.username ?? "")
  );
}

function connectionChanged(source: SourceDetail, fields: ConnectionFields) {
  return (
    targetChanged(source, fields) ||
    source.database !== fields.database ||
    source.tls_mode !== (fields.tls_mode ?? "disable")
  );
}

function summary(source: SourceDetail): Schemas["SourceOut"] {
  const { capabilities: _ignored, ...rest } = source;
  return rest;
}

export const handlers = [
  http.get("/api/auth/config", () =>
    HttpResponse.json<Schemas["AuthConfig"]>({ demo_enabled: backend.demoEnabled }),
  ),

  http.get("/api/auth/me", () =>
    backend.session ? HttpResponse.json<User>(backend.session) : unauthorized(),
  ),

  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as Schemas["LoginRequest"];
    if (body.username !== ADMIN.username || body.password !== ADMIN.password) {
      return HttpResponse.json({ detail: "Invalid username or password" }, { status: 401 });
    }
    backend.session = ADMIN_USER;
    return HttpResponse.json<User>(ADMIN_USER);
  }),

  http.post("/api/auth/demo", () => {
    if (!backend.demoEnabled) {
      return HttpResponse.json({ detail: "The demo is not enabled" }, { status: 404 });
    }
    backend.session = DEMO_USER;
    return HttpResponse.json<User>(DEMO_USER);
  }),

  http.post("/api/auth/logout", () => {
    backend.session = null;
    return new HttpResponse(null, { status: 204 });
  }),

  // --- sources ---------------------------------------------------------------------------

  http.get("/api/sources", () => {
    const denied = guard(false);
    if (denied) return denied;
    return HttpResponse.json<Schemas["SourceOut"][]>(backend.sources.map(summary));
  }),

  http.get("/api/sources/:id", ({ params }) => {
    const denied = guard(false);
    if (denied) return denied;
    const source = backend.sources.find((s) => s.id === Number(params.id));
    return source ? HttpResponse.json<SourceDetail>(source) : notFoundSource();
  }),

  http.post("/api/sources/test", async ({ request }) => {
    const denied = guard(true);
    if (denied) return denied;
    const body = (await request.json()) as Schemas["ConnectionTestRequest"];
    const stored = body.source_id
      ? backend.sources.find((s) => s.id === body.source_id)
      : undefined;
    if (
      body.password == null &&
      stored?.has_password &&
      targetChanged(stored, { ...body, username: body.username ?? "" })
    ) {
      return HttpResponse.json({ detail: RETARGET_MESSAGE }, { status: 400 });
    }
    backend.lastTestPassword =
      body.password ?? (body.source_id ? backend.passwords.get(body.source_id) : undefined);
    const outcome = probe(body.host);
    return HttpResponse.json<Schemas["ConnectionTestResult"]>(
      outcome.ok
        ? {
            ok: true,
            server_version: "16.4",
            latency_ms: 4.2,
            error: null,
            capabilities: outcome.capabilities,
          }
        : {
            ok: false,
            server_version: null,
            latency_ms: null,
            error: outcome.error,
            capabilities: [],
          },
    );
  }),

  http.post("/api/sources", async ({ request }) => {
    const denied = guard(true);
    if (denied) return denied;
    const body = (await request.json()) as Schemas["SourceCreate"];
    if (backend.sources.some((s) => s.name.toLowerCase() === body.name.toLowerCase())) {
      return HttpResponse.json({ detail: `A source named '${body.name}' exists` }, { status: 409 });
    }
    const outcome = probe(body.host);
    if (!outcome.ok) return HttpResponse.json({ detail: outcome.error.message }, { status: 400 });
    const source = makeSource({
      name: body.name,
      engine: body.engine,
      host: body.host,
      port: body.port,
      database: body.database,
      username: body.username ?? "",
      tls_mode: body.tls_mode ?? "disable",
      enabled: body.enabled ?? true,
      description: body.description ?? "",
      has_password: Boolean(body.password),
      status: outcome.capabilities.every((c) => c.available) ? "healthy" : "degraded",
      capabilities: outcome.capabilities,
    });
    backend.sources.push(source);
    backend.passwords.set(source.id, body.password ?? "");
    return HttpResponse.json<SourceDetail>(source, { status: 201 });
  }),

  http.put("/api/sources/:id", async ({ request, params }) => {
    const denied = guard(true);
    if (denied) return denied;
    const index = backend.sources.findIndex((s) => s.id === Number(params.id));
    const existing = backend.sources[index];
    if (!existing) return notFoundSource();
    const body = (await request.json()) as Schemas["SourceUpdate"];
    const fields = { ...body, username: body.username ?? "" };
    if (body.password == null && !connectionChanged(existing, fields)) {
      backend.updatesWithoutTest += 1;
      const renamed: SourceDetail = {
        ...existing,
        name: body.name,
        description: body.description ?? "",
        enabled: body.enabled ?? true,
      };
      backend.sources[index] = renamed;
      return HttpResponse.json<SourceDetail>(renamed);
    }
    if (body.password == null && existing.has_password && targetChanged(existing, fields)) {
      return HttpResponse.json({ detail: RETARGET_MESSAGE }, { status: 400 });
    }
    const outcome = probe(body.host);
    if (!outcome.ok) return HttpResponse.json({ detail: outcome.error.message }, { status: 400 });
    if (body.password !== null && body.password !== undefined) {
      backend.passwords.set(existing.id, body.password);
    }
    const updated: SourceDetail = {
      ...existing,
      name: body.name,
      engine: body.engine,
      host: body.host,
      port: body.port,
      database: body.database,
      username: body.username ?? "",
      tls_mode: body.tls_mode ?? "disable",
      enabled: body.enabled ?? true,
      description: body.description ?? "",
      has_password: Boolean(backend.passwords.get(existing.id)),
      capabilities: outcome.capabilities,
      status: outcome.capabilities.every((c) => c.available) ? "healthy" : "degraded",
    };
    backend.sources[index] = updated;
    return HttpResponse.json<SourceDetail>(updated);
  }),

  http.post("/api/sources/:id/check", ({ params }) => {
    const denied = guard(true);
    if (denied) return denied;
    const index = backend.sources.findIndex((s) => s.id === Number(params.id));
    const existing = backend.sources[index];
    if (!existing) return notFoundSource();
    const outcome = probe(existing.host);
    const checked: SourceDetail = outcome.ok
      ? {
          ...existing,
          status: outcome.capabilities.every((c) => c.available) ? "healthy" : "degraded",
          capabilities: outcome.capabilities,
          last_error: null,
        }
      : { ...existing, status: "failing", last_error: outcome.error.message };
    backend.sources[index] = checked;
    return HttpResponse.json<SourceDetail>(checked);
  }),

  http.delete("/api/sources/:id", ({ params }) => {
    const denied = guard(true);
    if (denied) return denied;
    const before = backend.sources.length;
    backend.sources = backend.sources.filter((s) => s.id !== Number(params.id));
    return backend.sources.length < before
      ? new HttpResponse(null, { status: 204 })
      : notFoundSource();
  }),
];

/** A minute-by-minute trend ending now: `calls[i]` calls and `calls[i] * 2` ms per minute. */
export function makeTrend(calls: number[]): Schemas["TrendPoint"][] {
  const now = Date.now();
  return calls.map((n, i) => ({
    start: new Date(now - (calls.length - 1 - i) * 60_000).toISOString(),
    calls: n,
    total_exec_time_ms: n * 2,
  }));
}

handlers.push(
  http.get("/api/workload/health", () => {
    const denied = guard(false);
    if (denied) return denied;
    return HttpResponse.json<Schemas["SourceHealth"][]>(
      backend.sources.map((source) => {
        const points = backend.trends.get(source.id) ?? [];
        return {
          source: summary(source),
          calls: points.reduce((sum, p) => sum + p.calls, 0),
          total_exec_time_ms: points.reduce((sum, p) => sum + p.total_exec_time_ms, 0),
          points,
        };
      }),
    );
  }),

  http.get("/api/sources/:id/trend", ({ params }) => {
    const denied = guard(false);
    if (denied) return denied;
    const id = Number(params.id);
    if (!backend.sources.some((s) => s.id === id)) return notFoundSource();
    return HttpResponse.json<Schemas["SourceTrend"]>({
      source_id: id,
      minutes: 60,
      bucket_seconds: 60,
      points: backend.trends.get(id) ?? [],
    });
  }),

  http.get("/api/collector/status", () => {
    const denied = guard(false);
    if (denied) return denied;
    return HttpResponse.json<Schemas["CollectorStatus"]>(
      backend.collectorRunning
        ? {
            status: "running",
            last_beat_at: new Date().toISOString(),
            source_count: backend.sources.length,
            message: "Collecting.",
          }
        : {
            status: "not_running",
            last_beat_at: null,
            source_count: backend.sources.length,
            message: "The collector has never run.",
          },
    );
  }),
);

// --- workload explorer (Phase 4) -------------------------------------------------------------

export function makeOperation(
  overrides: Partial<Schemas["OperationSummary"]> = {},
): Schemas["OperationSummary"] {
  const now = new Date().toISOString();
  const calls = overrides.calls ?? 100;
  const total = overrides.total_exec_time_ms ?? 1000;
  return {
    id: overrides.id ?? backend.nextId++,
    source_id: 1,
    source_name: "Orders DB",
    engine: "postgres",
    query: "SELECT id FROM orders WHERE customer_id = $1",
    calls,
    total_exec_time_ms: total,
    mean_exec_time_ms: calls ? total / calls : 0,
    rows: calls,
    shared_blks_hit: 90,
    shared_blks_read: 10,
    share_of_total_time: 0.5,
    first_seen_at: now,
    last_seen_at: now,
    ...overrides,
  };
}

/** The demo's P1 plan: a sequential scan on orders, filtered by customer_id. */
export const SEQ_SCAN_PLAN: Schemas["PlanNode"] = {
  path: "0",
  node_type: "Seq Scan",
  relation_name: "orders",
  alias: "orders",
  startup_cost: 0,
  total_cost: 4443,
  plan_rows: 10,
  plan_width: 21,
  filter: "(customer_id = $1)",
  sort_key: [],
  details: {},
  children: [],
};

export function capturedPlan(operationId: number, root = SEQ_SCAN_PLAN): Schemas["OperationPlan"] {
  const now = new Date().toISOString();
  return {
    operation_id: operationId,
    status: "captured",
    plan_id: 7,
    captured_at: now,
    checked_at: now,
    root,
    raw: [{ Plan: { "Node Type": root.node_type } }],
  };
}

const ORDERS: Record<string, keyof Schemas["OperationSummary"]> = {
  total_time: "total_exec_time_ms",
  mean_time: "mean_exec_time_ms",
  calls: "calls",
};

handlers.push(
  http.get("/api/operations", ({ request }) => {
    const denied = guard(false);
    if (denied) return denied;
    const query = new URL(request.url).searchParams;
    backend.operationRequests.push(query);
    const sort = (query.get("sort") ?? "total_time") as Schemas["OperationList"]["sort"];
    const key = ORDERS[sort] ?? "total_exec_time_ms";
    const source = query.get("source_id");
    const text = query.get("q")?.toLowerCase();
    const matching = backend.operations
      .filter((op) => !source || op.source_id === Number(source))
      .filter((op) => !text || op.query.toLowerCase().includes(text))
      .sort((a, b) => Number(b[key]) - Number(a[key]));
    const end = query.get("end") ?? new Date().toISOString();
    return HttpResponse.json<Schemas["OperationList"]>({
      start: query.get("start") ?? new Date(Date.now() - 3_600_000).toISOString(),
      end,
      sort,
      total_count: matching.length,
      total_exec_time_ms: backend.operations.reduce((sum, op) => sum + op.total_exec_time_ms, 0),
      operations: matching.slice(0, Number(query.get("limit") ?? 50)),
    });
  }),

  http.get("/api/operations/:id", ({ params }) => {
    const denied = guard(false);
    if (denied) return denied;
    const op = backend.operations.find((o) => o.id === Number(params.id));
    if (!op) return HttpResponse.json({ detail: "Operation not found" }, { status: 404 });
    const source =
      backend.sources.find((s) => s.id === op.source_id) ?? makeSource({ id: op.source_id });
    return HttpResponse.json<Schemas["OperationDetail"]>({
      operation: op,
      source: summary(source),
      toplevel: true,
      start: new Date(Date.now() - 3_600_000).toISOString(),
      end: new Date().toISOString(),
      bucket_seconds: 60,
      history: backend.history.get(op.id) ?? [],
    });
  }),

  http.get("/api/operations/:id/plan", ({ params }) => {
    const denied = guard(false);
    if (denied) return denied;
    const id = Number(params.id);
    return HttpResponse.json<Schemas["OperationPlan"]>(
      backend.plans.get(id) ?? {
        operation_id: id,
        status: "not_captured",
        reason:
          "No plan captured yet. The collector plans the busiest operations of each source every few minutes.",
      },
    );
  }),

  http.post("/api/operations/:id/plan", ({ params }) => {
    const denied = guard(true);
    if (denied) return denied;
    const id = Number(params.id);
    backend.captures += 1;
    const plan = capturedPlan(id);
    backend.plans.set(id, plan);
    return HttpResponse.json<Schemas["OperationPlan"]>(plan);
  }),
);

// --- findings (Phase 5) -------------------------------------------------------------------------

export function makeFinding(overrides: Partial<Schemas["FindingOut"]> = {}): Schemas["FindingOut"] {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? backend.nextId++,
    source_id: 1,
    source_name: "Orders DB",
    rule_id: "PG-SEQSCAN-HOT",
    rule_title: "Sequential scan in a hot query",
    target_kind: "operation",
    target_key: "operation:11",
    fingerprint_id: 11,
    relation: "public.orders",
    query: "SELECT id, status, total FROM orders WHERE customer_id = $1",
    title: "Sequential scan on public.orders in a hot query",
    summary:
      "This query takes 54% of the source's execution time, and its plan reads all 200,000 rows.",
    confidence: "high",
    evidence_strength: "plan",
    suggested_action: "Create an index on public.orders (customer_id).",
    action_sql: "CREATE INDEX CONCURRENTLY ON public.orders (customer_id);",
    facts: [
      { key: "share_of_total_time", label: "Share of execution time", value: 0.54 },
      { key: "table_rows", label: "Rows in the table", value: 200000 },
      { key: "total_exec_time_ms", label: "Execution time in the window (ms)", value: 5600 },
    ],
    evidence: [
      {
        kind: "operation",
        label: "1,000 calls, 5,600 ms in the window",
        available: true,
        fingerprint_id: 11,
        start: "2026-11-16T11:00:00Z",
        end: "2026-11-16T12:00:00Z",
      },
      {
        kind: "plan",
        label: "Plan #7: Seq Scan on orders",
        available: true,
        fingerprint_id: 11,
        plan_id: 7,
        node_path: "0",
      },
      {
        kind: "relation_stat",
        label: "public.orders: 200,000 live rows",
        available: true,
        relation_stat_id: 3,
      },
    ],
    status: "open",
    status_changed_by: "rules",
    status_changed_at: now,
    first_seen_at: now,
    last_seen_at: now,
    resolved_at: null,
    ...overrides,
  };
}

handlers.push(
  http.get("/api/findings", ({ request }) => {
    const denied = guard(false);
    if (denied) return denied;
    const query = new URL(request.url).searchParams;
    const scoped = backend.findings.filter(
      (f) =>
        (!query.get("source_id") || f.source_id === Number(query.get("source_id"))) &&
        (!query.get("rule_id") || f.rule_id === query.get("rule_id")) &&
        (!query.get("operation_id") || f.fingerprint_id === Number(query.get("operation_id"))),
    );
    const count = (status: string) => scoped.filter((f) => f.status === status).length;
    return HttpResponse.json<Schemas["FindingList"]>({
      counts: { open: count("open"), resolved: count("resolved"), dismissed: count("dismissed") },
      findings: scoped.filter((f) => !query.get("status") || f.status === query.get("status")),
    });
  }),

  http.patch("/api/findings/:id", async ({ request, params }) => {
    const denied = guard(true);
    if (denied) return denied;
    const index = backend.findings.findIndex((f) => f.id === Number(params.id));
    const existing = backend.findings[index];
    if (!existing) return HttpResponse.json({ detail: "Finding not found" }, { status: 404 });
    const body = (await request.json()) as Schemas["FindingStatusUpdate"];
    backend.findingUpdates.push({ id: existing.id, status: body.status });
    const updated: Schemas["FindingOut"] = {
      ...existing,
      status: body.status,
      status_changed_by: "user",
      resolved_at: body.status === "resolved" ? new Date().toISOString() : null,
    };
    backend.findings[index] = updated;
    return HttpResponse.json<Schemas["FindingOut"]>(updated);
  }),

  http.get("/api/rules", () => {
    const denied = guard(false);
    if (denied) return denied;
    return HttpResponse.json<Schemas["RuleOut"][]>([
      {
        id: "PG-SEQSCAN-HOT",
        title: "Sequential scan in a hot query",
        description: "",
        evidence_strength: "plan",
        confidence: "high",
        thresholds: {},
      },
      {
        id: "PG-UNUSED-INDEX",
        title: "Unused index",
        description: "",
        evidence_strength: "statistics",
        confidence: "medium",
        thresholds: {},
      },
    ]);
  }),

  http.get("/api/plans/:id", ({ params }) => {
    const denied = guard(false);
    if (denied) return denied;
    const plan = backend.storedPlans.get(Number(params.id));
    return plan
      ? HttpResponse.json<Schemas["OperationPlan"]>(plan)
      : HttpResponse.json({ detail: "Plan not found" }, { status: 404 });
  }),
);

export const server = setupServer(...handlers);
