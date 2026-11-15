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
  nextId: 1,
  reset() {
    this.session = null;
    this.demoEnabled = true;
    this.sources = [];
    this.passwords = new Map();
    this.lastTestPassword = undefined;
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

export const server = setupServer(...handlers);
