import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, errorMessage, type Schemas, unwrap } from "@/api/client";

export type Source = Schemas["SourceOut"];
export type SourceDetail = Schemas["SourceDetail"];
export type Capability = Schemas["CapabilityOut"];
export type ConnectionTestResult = Schemas["ConnectionTestResult"];
export type SourceCreate = Schemas["SourceCreate"];
export type SourceUpdate = Schemas["SourceUpdate"];
export type ConnectionTestRequest = Schemas["ConnectionTestRequest"];
export type Engine = Schemas["SourceEngine"];
export type TlsMode = Source["tls_mode"];

export const DEFAULT_PORTS: Record<Engine, number> = { postgres: 5432, mongodb: 27017 };
export const ENGINE_LABELS: Record<Engine, string> = {
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
};

const keys = {
  all: ["sources"] as const,
  detail: (id: number) => ["sources", id] as const,
};

export const sourcesQuery = queryOptions({
  queryKey: keys.all,
  queryFn: () => unwrap(api.GET("/api/sources")),
});

export const sourceQuery = (id: number) =>
  queryOptions({
    queryKey: keys.detail(id),
    queryFn: () =>
      unwrap(api.GET("/api/sources/{source_id}", { params: { path: { source_id: id } } })),
  });

/** Store a fresh source in the cache and mark the list stale. */
function useStoreSource() {
  const queryClient = useQueryClient();
  return (source: SourceDetail) => {
    queryClient.setQueryData(keys.detail(source.id), source);
    void queryClient.invalidateQueries({ queryKey: keys.all, exact: true });
  };
}

/** Try a connection without saving. A failed connection is a result (`ok: false`), not an error. */
export function useTestConnection() {
  return useMutation({
    mutationFn: (body: ConnectionTestRequest) => unwrap(api.POST("/api/sources/test", { body })),
  });
}

export function useCreateSource() {
  const store = useStoreSource();
  return useMutation({
    mutationFn: (body: SourceCreate) => unwrap(api.POST("/api/sources", { body })),
    onSuccess: store,
  });
}

export function useUpdateSource(id: number) {
  const store = useStoreSource();
  return useMutation({
    mutationFn: (body: SourceUpdate) =>
      unwrap(api.PUT("/api/sources/{source_id}", { params: { path: { source_id: id } }, body })),
    onSuccess: store,
  });
}

export function useRecheckSource(id: number) {
  const store = useStoreSource();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/sources/{source_id}/check", { params: { path: { source_id: id } } })),
    onSuccess: store,
  });
}

export function useDeleteSource(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { response, error } = await api.DELETE("/api/sources/{source_id}", {
        params: { path: { source_id: id } },
      });
      if (!response.ok) {
        throw new ApiError(response.status, errorMessage(error, "Couldn't delete the source"));
      }
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: keys.all, exact: true });
    },
  });
}
