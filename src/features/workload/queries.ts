import { queryOptions } from "@tanstack/react-query";
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
