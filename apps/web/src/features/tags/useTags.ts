import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  archivedAtUTC: string | null;
}

export function useTags(includeArchived = false) {
  return useQuery({
    queryKey: ["tags", includeArchived],
    queryFn: () => api<Tag[]>(`/api/v1/tags?includeArchived=${includeArchived}`),
    staleTime: 60_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Tag>("/api/v1/tags", { method: "POST", json: { name } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tags"], exact: false }),
  });
}
