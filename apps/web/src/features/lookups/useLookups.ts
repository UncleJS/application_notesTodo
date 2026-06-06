import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Category {
  id: number;
  name: string;
  color: string | null;
  sortOrder: number;
  archivedAtUTC: string | null;
}

export interface Priority {
  id: number;
  name: string;
  weight: number;
  color: string | null;
  archivedAtUTC: string | null;
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", includeArchived],
    queryFn: () => api<Category[]>(`/api/v1/categories?includeArchived=${includeArchived}`),
    staleTime: 60_000,
  });
}

export function usePriorities(includeArchived = false) {
  return useQuery({
    queryKey: ["priorities", includeArchived],
    queryFn: () => api<Priority[]>(`/api/v1/priorities?includeArchived=${includeArchived}`),
    staleTime: 60_000,
  });
}
