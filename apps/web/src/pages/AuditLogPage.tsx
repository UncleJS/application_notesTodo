import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { useMe } from "@/features/auth/useMe";
import { useCategories, usePriorities, useStatuses } from "@/features/lookups/useLookups";
import { useTags } from "@/features/tags/useTags";
import { QueryError } from "@/components/QueryError";
import { SkeletonList } from "@/components/Skeleton";
import { FiltersBar } from "@/components/FiltersBar";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}

interface AuditLog {
  id: number;
  itemId: number;
  itemType: "note" | "todo" | "calendar";
  itemTitle: string | null;
  actorUserId: number;
  actorUsername: string | null;
  actorDisplayName: string | null;
  action: string;
  changes: AuditChange[] | null;
  categoryId: number | null;
  priorityId: number | null;
  createdAtUTC: string;
}

interface AuditLogPageResult {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

interface DirectoryUser {
  id: number;
  username: string;
  displayName: string | null;
}

const ACTIONS = [
  "create",
  "update",
  "archive",
  "restore",
  "tag_add",
  "tag_remove",
  "link_add",
  "link_remove",
  "share_grant",
  "share_revoke",
  "share_update",
] as const;

const LIMIT = 50;

const emptyFilters = {
  itemType: "",
  action: "",
  category: "",
  priority: "",
  userId: "",
  from: null as string | null,
  to: null as string | null,
};

/** Render any stored old/new value into a short readable string. */
function renderVal(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return formatLocal(v);
    return v;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type LookupKey = "category" | "priority" | "status" | "tag";
type LookupMaps = Record<LookupKey, Map<number, string>>;

/** Build an id → name map from a lookup query result. */
function toNameMap(arr?: { id: number; name: string }[]): Map<number, string> {
  return new Map((arr ?? []).map((x) => [x.id, x.name]));
}

/** Audit field name → prettified label + which lookup resolves its id values. */
const FIELD_CONFIG: Record<string, { label: string; lookup: LookupKey }> = {
  categoryId: { label: "Category", lookup: "category" },
  priorityId: { label: "Priority", lookup: "priority" },
  statusId: { label: "Status", lookup: "status" },
  tagId: { label: "Tag", lookup: "tag" },
};

/** Strip a trailing `Id`/`_UTC`, split camelCase/underscores, and title-case. */
function prettifyField(field: string): string {
  const base = field.replace(/_UTC$/i, "").replace(/Id$/, "");
  return (
    base
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || field
  );
}

/** Resolve an id value through a lookup map, keeping ∅ for null and #id for misses. */
function resolveLookup(v: unknown, map: Map<number, string>): string {
  if (v === null || v === undefined) return "∅";
  const id = typeof v === "number" ? v : Number(v);
  if (!Number.isNaN(id) && map.has(id)) return map.get(id)!;
  return Number.isNaN(id) ? renderVal(v) : `#${id}`;
}

/** field: old → new lines for an `update`; a plain label for other actions. */
function ChangeList({ log, maps }: { log: AuditLog; maps: LookupMaps }) {
  if (!log.changes || log.changes.length === 0) {
    return <span className="text-foreground/70">—</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {log.changes.map((c, i) => {
        const cfg = FIELD_CONFIG[c.field];
        const fieldLabel = cfg?.label ?? prettifyField(c.field);
        const map = cfg ? maps[cfg.lookup] : null;
        const oldStr = map ? resolveLookup(c.old, map) : renderVal(c.old);
        const newStr = map ? resolveLookup(c.new, map) : renderVal(c.new);
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-1">
            <span className="font-medium text-foreground">{fieldLabel}</span>
            <span className="max-w-[18rem] truncate text-foreground/80" title={oldStr}>
              {oldStr}
            </span>
            <span className="text-foreground/60">→</span>
            <span className="max-w-[18rem] truncate text-foreground" title={newStr}>
              {newStr}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AuditLogPage() {
  const me = useMe();
  const isAdmin = me.data?.isAdmin ?? false;
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);

  const categories = useCategories(true);
  const priorities = usePriorities(true);
  const statuses = useStatuses(true);
  const tags = useTags(true);
  const maps: LookupMaps = {
    category: toNameMap(categories.data),
    priority: toNameMap(priorities.data),
    status: toNameMap(statuses.data),
    tag: toNameMap(tags.data),
  };
  const adminAll = isAdmin && scope === "all";
  const users = useQuery({
    queryKey: ["directory-users"],
    queryFn: () => api<DirectoryUser[]>("/api/v1/directory/users"),
    enabled: adminAll,
    staleTime: 60_000,
  });

  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const logs = useQuery({
    queryKey: ["audit", adminAll, filters, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filters.itemType) params.set("itemType", filters.itemType);
      if (filters.action) params.set("action", filters.action);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (adminAll && filters.userId) params.set("userId", filters.userId);
      const base = adminAll ? "/api/v1/admin/audit-logs" : "/api/v1/audit-logs";
      return api<AuditLogPageResult>(`${base}?${params}`);
    },
    placeholderData: (prev) => prev,
  });

  const activeCount = [
    filters.itemType,
    filters.action,
    filters.category,
    filters.priority,
    adminAll ? filters.userId : "",
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  const total = logs.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Activity</h1>
        {isAdmin && (
          <div className="flex overflow-hidden rounded-md border border-border text-sm">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setScope(s);
                  setPage(1);
                }}
                className={
                  "px-3 py-1 text-foreground " +
                  (scope === s ? "bg-secondary font-medium" : "hover:bg-accent")
                }
              >
                {s === "mine" ? "My activity" : "All users"}
              </button>
            ))}
          </div>
        )}
        <FiltersBar badge={activeCount}>
          <Select
            aria-label="Item type"
            className="w-36"
            value={filters.itemType}
            onChange={(e) => set({ itemType: e.target.value })}
          >
            <option value="">All types</option>
            <option value="note">Notes</option>
            <option value="todo">Todos</option>
            <option value="calendar">Calendar</option>
          </Select>
          <Select
            aria-label="Action"
            className="w-40"
            value={filters.action}
            onChange={(e) => set({ action: e.target.value })}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            className="w-40"
            value={filters.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Priority"
            className="w-40"
            value={filters.priority}
            onChange={(e) => set({ priority: e.target.value })}
          >
            <option value="">All priorities</option>
            {priorities.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {adminAll && (
            <Select
              aria-label="User"
              className="w-40"
              value={filters.userId}
              onChange={(e) => set({ userId: e.target.value })}
            >
              <option value="">All users</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.username}
                </option>
              ))}
            </Select>
          )}
          <DateTimeInput value={filters.from} onChange={(v) => set({ from: v })} />
          <DateTimeInput value={filters.to} onChange={(v) => set({ to: v })} />
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => set(emptyFilters)}>
              Clear
            </Button>
          )}
        </FiltersBar>
      </div>

      {logs.isLoading ? (
        <SkeletonList rows={6} />
      ) : logs.isError ? (
        <QueryError error={logs.error} onRetry={() => logs.refetch()} />
      ) : (logs.data?.logs.length ?? 0) === 0 ? (
        <p className="text-foreground/70">No activity matches these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Item</TH>
                <TH>Type</TH>
                <TH>Action</TH>
                <TH>Changes</TH>
              </TR>
            </THead>
            <TBody>
              {logs.data!.logs.map((log) => (
                <TR key={log.id}>
                  <TD className="whitespace-nowrap font-mono text-xs">
                    {formatLocal(log.createdAtUTC)}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {log.actorDisplayName ?? log.actorUsername ?? `#${log.actorUserId}`}
                  </TD>
                  <TD className="max-w-[14rem] truncate">
                    {log.itemTitle ? (
                      <Link to={`/items/${log.itemId}`} className="text-primary hover:underline">
                        {log.itemTitle}
                      </Link>
                    ) : (
                      <span className="text-foreground/60">#{log.itemId} (deleted)</span>
                    )}
                  </TD>
                  <TD>{log.itemType}</TD>
                  <TD>
                    <Badge>{log.action}</Badge>
                  </TD>
                  <TD>
                    <ChangeList log={log} maps={maps} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-foreground">
            Page {page} of {totalPages} · {total} total
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
