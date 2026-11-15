import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  Link,
  Outlet,
  type RouterHistory,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { LoginPage } from "@/features/auth/LoginPage";
import { currentUserQuery } from "@/features/auth/queries";
import {
  FindingsPage,
  SettingsPage,
  SourcesPage,
  WorkloadPage,
} from "@/features/placeholder/ComingSoon";
import { AppShell } from "@/features/shell/AppShell";

export type RouterContext = { queryClient: QueryClient };

/**
 * Only follow same-origin paths after sign-in. Checking the string's prefix isn't enough:
 * browsers treat `/\evil.example` like `//evil.example` and strip tabs and newlines, so the
 * value is resolved the way the browser would resolve it and the origin compared.
 */
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const origin = window.location.origin;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : undefined;
  } catch {
    return undefined;
  }
}

function NotFound() {
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Button asChild variant="outline">
        <Link to="/">Back to the workload</Link>
      </Button>
    </div>
  );
}

function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const unreachable = !(error instanceof ApiError);
  return (
    <div className="flex min-h-[50svh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">
          {unreachable ? "Can't reach the Query Pulse server" : "Something went wrong"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {unreachable ? "Check that the backend is running, then try again." : error.message}
        </p>
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  // Always return the key: if an unsafe value were simply omitted, the router would keep the
  // raw one from the URL. (A test sending //evil.example and https://evil.example caught this.)
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    // Re-check at the point of use too (defence in depth against open redirects).
    if (user) throw redirect({ href: safeRedirect(search.redirect) ?? "/" });
  },
  component: LoginPage,
});

/** Pathless layout: every child route requires a session and renders inside the shell. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user) {
      throw redirect({
        to: "/login",
        search: location.href === "/" ? {} : { redirect: location.href },
      });
    }
    return { user };
  },
  component: AppShell,
});

const workloadRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: WorkloadPage,
});
const sourcesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/sources",
  component: SourcesPage,
});
const findingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/findings",
  component: FindingsPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([workloadRoute, sourcesRoute, findingsRoute, settingsRoute]),
]);

/**
 * Build the query client and router together. Any request that comes back 401 (session
 * expired, server restarted with a new secret) marks the user signed out and re-runs the
 * route guards, which send them to the sign-in screen.
 */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(currentUserQuery.queryKey, null);
      void router.invalidate();
    }
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    ...(options.history ? { history: options.history } : {}),
  });

  return { router, queryClient };
}

export type AppRouter = ReturnType<typeof createAppRouter>["router"];

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
