import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas, unwrap } from "@/api/client";

export type Finding = Schemas["FindingOut"];
export type FindingStatus = Finding["status"];
export type Evidence = Schemas["EvidenceOut"];
export type Fact = Schemas["FindingFact"];

/** Rules run after collection (every 15 s in the demo, a minute by default). */
const REFRESH_MS = 30_000;

type ListParams = {
  status?: FindingStatus;
  source_id?: number;
  rule_id?: string;
  operation_id?: number;
};

export const findingsQuery = (params: ListParams = {}) =>
  queryOptions({
    queryKey: ["findings", params] as const,
    queryFn: () => unwrap(api.GET("/api/findings", { params: { query: params } })),
    refetchInterval: REFRESH_MS,
    placeholderData: (previous) => previous,
  });

export const rulesQuery = queryOptions({
  queryKey: ["rules"] as const,
  queryFn: () => unwrap(api.GET("/api/rules")),
  staleTime: Number.POSITIVE_INFINITY, // the catalogue only changes with a release
});

/** A stored plan by id: the exact plan a finding cites, even if a newer one exists. */
export const planQuery = (planId: number) =>
  queryOptions({
    queryKey: ["plans", planId] as const,
    queryFn: () =>
      unwrap(api.GET("/api/plans/{plan_id}", { params: { path: { plan_id: planId } } })),
    staleTime: Number.POSITIVE_INFINITY, // plans are immutable
  });

/** Admin only: dismiss, resolve or reopen. Every findings list refreshes afterwards. */
export function useUpdateFinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: FindingStatus }) =>
      unwrap(
        api.PATCH("/api/findings/{finding_id}", {
          params: { path: { finding_id: id } },
          body: { status },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["findings"] }),
  });
}
