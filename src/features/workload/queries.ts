import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas, unwrap } from "@/api/client";

export type SourceHealth = Schemas["SourceHealth"];
export type TrendPoint = Schemas["TrendPoint"];

/** The collector polls every minute (15 s in the local demo); refresh at a similar pace. */
const REFRESH_MS = 30_000;

export const workloadHealthQuery = (minutes = 60) =>
  queryOptions({
    queryKey: ["workload", "health", minutes] as const,
    queryFn: () => unwrap(api.GET("/api/workload/health", { params: { query: { minutes } } })),
    refetchInterval: REFRESH_MS,
  });

export const sourceTrendQuery = (sourceId: number, minutes = 60) =>
  queryOptions({
    queryKey: ["sources", sourceId, "trend", minutes] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/sources/{source_id}/trend", {
          params: { path: { source_id: sourceId }, query: { minutes } },
        }),
      ),
    refetchInterval: REFRESH_MS,
  });

export const collectorStatusQuery = queryOptions({
  queryKey: ["collector", "status"] as const,
  queryFn: () => unwrap(api.GET("/api/collector/status")),
  refetchInterval: REFRESH_MS,
});

// --- workload explorer (Phase 4) -------------------------------------------------------------

export type OperationSummary = Schemas["OperationSummary"];
export type OperationDetail = Schemas["OperationDetail"];
export type OperationPlan = Schemas["OperationPlan"];
export type PlanNode = Schemas["PlanNode"];
export type MongoPlanStage = Schemas["MongoPlanStage"];
export type ServerMetrics = Schemas["ServerMetrics"];

type WindowParams = { minutes?: number; start?: string; end?: string };
type ListParams = WindowParams & {
  sort?: Schemas["OperationList"]["sort"];
  source_id?: number;
  q?: string;
};

/** Ranked operations. Relative windows refresh with the collector; absolute ones are fixed. */
export const operationsQuery = (params: ListParams) =>
  queryOptions({
    queryKey: ["operations", params] as const,
    queryFn: () => unwrap(api.GET("/api/operations", { params: { query: params } })),
    refetchInterval: params.start ? false : REFRESH_MS,
    placeholderData: (previous) => previous,
  });

export const operationQuery = (id: number, params: WindowParams) =>
  queryOptions({
    queryKey: ["operations", id, params] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/operations/{operation_id}", {
          params: { path: { operation_id: id }, query: params },
        }),
      ),
    refetchInterval: params.start ? false : REFRESH_MS,
  });

export const operationPlanQuery = (id: number) =>
  queryOptions({
    queryKey: ["operations", id, "plan"] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/operations/{operation_id}/plan", {
          params: { path: { operation_id: id } },
        }),
      ),
  });

/** A MongoDB source's latest serverStatus sample and operation rates (null until the first). */
export const serverMetricsQuery = (sourceId: number) =>
  queryOptions({
    queryKey: ["sources", sourceId, "server"] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/sources/{source_id}/server", { params: { path: { source_id: sourceId } } }),
      ),
    refetchInterval: REFRESH_MS,
  });

/** Admin only: plan the statement again now (EXPLAIN GENERIC_PLAN; never executes it). */
export function useCapturePlan(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/operations/{operation_id}/plan", {
          params: { path: { operation_id: id } },
        }),
      ),
    onSuccess: (plan) => queryClient.setQueryData(operationPlanQuery(id).queryKey, plan),
  });
}
