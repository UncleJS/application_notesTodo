import { bigint, datetime, json, mysqlEnum, mysqlTable } from "drizzle-orm/mysql-core";

/** One field-level change within an `update`. `old`/`new` are JSON-serializable. */
export type AuditChange = { field: string; old: unknown; new: unknown };

export const AUDIT_ACTIONS = [
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
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Append-only audit trail for items — see drizzle/0012_audit_logs.sql.
 * Rows are never updated, archived, or deleted. category_id / priority_id are
 * snapshots captured at write time for admin filtering.
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  itemId: bigint("item_id", { mode: "number", unsigned: true }).notNull(),
  itemType: mysqlEnum("item_type", ["note", "todo", "calendar"]).notNull(),
  actorUserId: bigint("actor_user_id", { mode: "number", unsigned: true }).notNull(),
  action: mysqlEnum("action", AUDIT_ACTIONS).notNull(),
  changes: json("changes").$type<AuditChange[] | null>(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  priorityId: bigint("priority_id", { mode: "number", unsigned: true }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
});
