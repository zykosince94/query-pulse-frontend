import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ApiError, api, type User, unwrap } from "@/api/client";

/**
 * The signed-in user, or `null` when there's no session. A 401 here is an answer
 * ("not signed in"), not an error, so it resolves to null instead of throwing.
 */
export const currentUserQuery = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: async (): Promise<User | null> => {
    const { data, response } = await api.GET("/api/auth/me");
    if (response.status === 401) return null;
    if (!data) throw new ApiError(response.status, "Could not load your session");
    return data;
  },
  staleTime: 5 * 60_000,
  // Every route guard waits on this; fail fast to the error screen instead of retrying.
  retry: false,
});

/** What the sign-in screen should offer (e.g. "Try the demo"). Public endpoint. */
export const authConfigQuery = queryOptions({
  queryKey: ["auth", "config"] as const,
  queryFn: () => unwrap(api.GET("/api/auth/config")),
  staleTime: Number.POSITIVE_INFINITY,
});

export function useCurrentUser(): User | null {
  return useQuery(currentUserQuery).data ?? null;
}

/** False for the read-only demo user. Use it to disable write actions in the UI. */
export function useCanWrite(): boolean {
  const user = useCurrentUser();
  return user !== null && !user.read_only;
}

/**
 * After sign-in: store the user and re-run route guards. The login route's guard then sends
 * the user on to where they were going, so the redirect logic lives in one place (the router).
 */
function useOnSignedIn() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (user: User) => {
    queryClient.setQueryData(currentUserQuery.queryKey, user);
    await router.invalidate();
  };
}

export function useLogin() {
  const onSignedIn = useOnSignedIn();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      unwrap(api.POST("/api/auth/login", { body })),
    onSuccess: onSignedIn,
  });
}

export function useDemoLogin() {
  const onSignedIn = useOnSignedIn();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/auth/demo")),
    onSuccess: onSignedIn,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/api/auth/logout");
    },
    onSettled: async () => {
      // Drop every cached response from the old session, then show the sign-in screen.
      queryClient.clear();
      queryClient.setQueryData(currentUserQuery.queryKey, null);
      await router.navigate({ to: "/login" });
    },
  });
}
