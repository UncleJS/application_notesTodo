import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, clearSessionToken } from "@/lib/api";

export interface Me {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/api/v1/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api("/api/v1/auth/logout", { method: "POST" });
    clearSessionToken();
    qc.setQueryData(["me"], null);
    qc.clear();
  };
}
