# Query Pulse Frontend

The React app for [Query Pulse](https://github.com/zykosince94/query-pulse-backend): database
performance intelligence for PostgreSQL and MongoDB. The backend repo owns the full local stack
and the main README.

## What works today

- **Sign-in** with username and password, plus **"Try the demo"** (a read-only session) when the
  backend has the demo user enabled.
- **Protected app shell**: navigation for Workload, Data sources, Findings and Settings. Signed-out
  visitors are sent to sign-in and returned to the page they asked for afterwards (same-site paths
  only). The demo user sees a "Read-only demo" badge.
- **Session handling**: sign out, automatic return to sign-in when the session expires, and a
  clear "can't reach the server" screen with retry.
- **Data sources**:
  - A list with engine and status badges.
  - An add/edit form where **Save** is enabled only after the current connection settings pass
    **Test connection**.
  - A detail page with the **capability checklist**: what works, and the exact fix (with a
    Copy button) for what doesn't.
  - Re-check and delete. Write actions are disabled or hidden for the demo user.
- **Typed API client** generated from the backend's `openapi.json`.

The Workload, Findings and Settings pages are placeholders that say which phase delivers them.

## Quick start

Requires Node 24 (see `.nvmrc`) and the backend running on `localhost:8000`.

```bash
# in query-pulse-backend: make demo   (or run the API locally, see its README)
npm install
npm run dev          # http://localhost:5173
```

Local demo credentials (from the backend's compose file): `admin` / `admin-demo-password`, or use
**Try the demo**.

Vite proxies `/api` to the backend (`QP_BACKEND_URL`, default `http://localhost:8000`), so the
browser talks to a single origin and the session cookie works without CORS.

## Commands

| Task                                             | Command                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Dev server                                       | `npm run dev`                                                 |
| Lint + format check (Biome)                      | `npm run lint` · fix: `npm run fmt`                           |
| Type check                                       | `npm run typecheck`                                           |
| Unit and component tests (Vitest)                | `npm test` · watch: `npm run test:watch`                      |
| End-to-end tests (Playwright, needs the backend) | `npm run e2e` (first time: `npx playwright install chromium`) |
| Production build                                 | `npm run build`                                               |
| Regenerate API types                             | `npm run gen:api`                                             |
| Check API types are current                      | `npm run gen:api:check`                                       |

## The API contract

The backend's committed `openapi.json` is the only contract between the repos.

- `npm run gen:api` turns it into TypeScript types in `src/api/schema.d.ts`. By default it reads
  the sibling checkout `../query-pulse-backend/openapi.json`; set `QP_OPENAPI_SOURCE` to another
  path or a URL. CI uses the backend's `main` branch.
- Every request goes through the typed `openapi-fetch` client in `src/api/client.ts`. A backend
  change the frontend hasn't absorbed fails the type check, and CI fails if the generated types
  are stale.
- After the backend API changes: `npm run gen:api`, fix any type errors, and commit both.

## Stack

Vite · React 19 · TypeScript (strict) · TanStack Router (code-based route tree) · TanStack Query ·
Tailwind CSS v4 · shadcn/ui-style components · openapi-typescript + openapi-fetch · Biome ·
Vitest + React Testing Library + Mock Service Worker · Playwright.

## Documentation

The [functionality reference](https://github.com/zykosince94/query-pulse-backend/blob/main/docs/functionality.md)
in the backend repo describes every screen, endpoint, setting and security behaviour across both
repos.

## Layout

```
src/
  api/              generated schema.d.ts + the typed client and error helpers
  routes/           route tree, guards, query client and router setup
  features/
    auth/           sign-in page, session queries and mutations
    shell/          app shell: navigation, user, sign out
    sources/        data sources: list, add/edit form, detail and capability checklist
    placeholder/    pages for screens that later phases build
  components/ui/    shadcn/ui-style building blocks (button, input, card, ...)
  styles/           tokens.css (shared design tokens) and Tailwind setup
tests/              Vitest tests; fake-backend.ts mocks the API with types from the spec
e2e/                Playwright tests against the real backend
scripts/gen-api.mjs API type generation
```

## Conventions

- **Colors and radii come from `src/styles/tokens.css`** through Tailwind classes such as
  `bg-primary` and `text-muted-foreground`, never raw hex values. API Pulse copies the same file.
- **Server data lives in TanStack Query**; local UI state uses `useState`.
- **Write actions** check `useCanWrite()` so the demo user sees them disabled. The backend
  enforces the same rule with a 403 either way.
- **New UI components**: `npx shadcn@latest add <component>` (configured in `components.json`).
