import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Cancel + snapshot + rollback helpers for optimistic list mutations.
 *
 * `keys` are matched as prefixes (exact: false), so all filter variants of a
 * list ("todos", {...filters}) update together. Cached entries that are not
 * arrays (e.g. single-item ["notes", id] entries) are skipped by the updater
 * unless `includeSingles` handles them via the same `apply` on a 1-tuple.
 */
export function makeOptimistic<TItem extends { id: number }, TVars>(
  qc: QueryClient,
  keys: QueryKey[],
  apply: (item: TItem, vars: TVars) => TItem,
) {
  return {
    onMutate: async (vars: TVars) => {
      for (const key of keys) await qc.cancelQueries({ queryKey: key, exact: false });
      const snapshots: Array<[QueryKey, unknown]> = [];
      for (const key of keys) {
        for (const [qk, data] of qc.getQueriesData({ queryKey: key, exact: false })) {
          if (!Array.isArray(data)) continue;
          snapshots.push([qk, data]);
          qc.setQueryData(
            qk,
            (data as TItem[]).map((item) => (item && typeof item === "object" && "id" in item ? apply(item, vars) : item)),
          );
        }
      }
      return { snapshots };
    },
    onError: (_err: unknown, _vars: TVars, ctx?: { snapshots: Array<[QueryKey, unknown]> }) => {
      for (const [qk, data] of ctx?.snapshots ?? []) qc.setQueryData(qk, data);
    },
    onSettled: () => {
      for (const key of keys) void qc.invalidateQueries({ queryKey: key, exact: false });
    },
  };
}
