import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Template {
  id: number;
  name: string;
  description: string | null;
  categoryId: number | null;
  priorityId: number | null;
  tagIds: number[];
  archivedAtUTC: string | null;
}

export function useTemplates(includeArchived = false) {
  return useQuery({
    queryKey: ["templates", "list", includeArchived],
    queryFn: () => api<Template[]>(`/api/v1/templates?includeArchived=${includeArchived}`),
    staleTime: 30_000,
  });
}
