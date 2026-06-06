import { bigint, datetime, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const tags = mysqlTable("tags", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const itemTags = mysqlTable("item_tags", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  itemId: bigint("item_id", { mode: "number", unsigned: true }).notNull(),
  tagId: bigint("tag_id", { mode: "number", unsigned: true }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const itemLinks = mysqlTable("item_links", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  fromItemId: bigint("from_item_id", { mode: "number", unsigned: true }).notNull(),
  toItemId: bigint("to_item_id", { mode: "number", unsigned: true }).notNull(),
  linkType: varchar("link_type", { length: 64 }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});
