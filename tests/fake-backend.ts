import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { Schemas, User } from "@/api/client";

/**
 * A tiny in-memory stand-in for the backend's auth API, used by Mock Service Worker.
 * Response bodies are typed from the generated schema, so if the backend contract changes,
 * these fakes stop compiling instead of silently drifting.
 */
export const ADMIN = { username: "admin", password: "admin-password" } as const;

const ADMIN_USER: User = { username: "admin", role: "admin", read_only: false };
const DEMO_USER: User = { username: "demo", role: "demo", read_only: true };

export const backend = {
  session: null as User | null,
  demoEnabled: true,
  reset() {
    this.session = null;
    this.demoEnabled = true;
  },
};

const unauthorized = () => HttpResponse.json({ detail: "Not signed in" }, { status: 401 });

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
];

export const server = setupServer(...handlers);
