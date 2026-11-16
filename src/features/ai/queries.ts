import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas, unwrap } from "@/api/client";

export type AISettings = Schemas["AISettingsOut"];
export type AISettingsUpdate = Schemas["AISettingsUpdate"];
export type AIAnswer = Schemas["AnswerOut"];
export type FindingAI = Schemas["FindingAI"];
export type EvidenceBundle = Schemas["EvidenceBundleOut"];
export type AIKind = AIAnswer["kind"];

export const aiSettingsQuery = queryOptions({
  queryKey: ["ai", "settings"] as const,
  queryFn: () => unwrap(api.GET("/api/ai/settings")),
});

export const runtimeSettingsQuery = queryOptions({
  queryKey: ["settings", "runtime"] as const,
  queryFn: () => unwrap(api.GET("/api/settings")),
  staleTime: Number.POSITIVE_INFINITY, // from the environment: changes only with a restart
});

/** Whether AI is on, and the latest explanation and draft for a finding. */
export const findingAIQuery = (findingId: number) =>
  queryOptions({
    queryKey: ["ai", "finding", findingId] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/findings/{finding_id}/ai", { params: { path: { finding_id: findingId } } }),
      ),
  });

/** Exactly what would be sent to the provider for a finding. */
export const evidenceBundleQuery = (findingId: number) =>
  queryOptions({
    queryKey: ["ai", "bundle", findingId] as const,
    queryFn: () =>
      unwrap(
        api.GET("/api/findings/{finding_id}/ai/bundle", {
          params: { path: { finding_id: findingId } },
        }),
      ),
  });

/** Admin only. Saving with `enabled` checks the key and model with the provider first. */
export function useSaveAISettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AISettingsUpdate) => unwrap(api.PUT("/api/ai/settings", { body })),
    onSuccess: (settings) => {
      queryClient.setQueryData(aiSettingsQuery.queryKey, settings);
      void queryClient.invalidateQueries({ queryKey: ["ai", "finding"] });
    },
  });
}

export function useDeleteAIKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/ai/settings/key")),
    onSuccess: (settings) => {
      queryClient.setQueryData(aiSettingsQuery.queryKey, settings);
      void queryClient.invalidateQueries({ queryKey: ["ai", "finding"] });
    },
  });
}

/** Admin only: ask for an explanation or a draft fix. The answer replaces the stored one. */
export function useAskAI(findingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: AIKind) =>
      unwrap(
        api.POST("/api/findings/{finding_id}/ai/{kind}", {
          params: { path: { finding_id: findingId, kind } },
        }),
      ),
    onSuccess: (answer) => {
      // A rejected answer isn't stored server-side; show it, but keep the last good one cached.
      if (answer.status === "ok") {
        queryClient.setQueryData(
          findingAIQuery(findingId).queryKey,
          (previous: FindingAI | undefined) =>
            previous ? { ...previous, [answer.kind]: answer } : previous,
        );
      }
      void queryClient.invalidateQueries({ queryKey: aiSettingsQuery.queryKey });
    },
  });
}
