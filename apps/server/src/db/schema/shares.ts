import { bigint, datetime, mysqlEnum, mysqlTable } from "drizzle-orm/mysql-core";

export const itemShares = mysqlTable("item_shares", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  itemId: bigint("item_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  groupId: bigint("group_id", { mode: "number", unsigned: true }),
  level: mysqlEnum("level", ["view", "edit"]).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});
