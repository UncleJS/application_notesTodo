import { bigint, datetime, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const categories = mysqlTable("categories", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 16 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const priorities = mysqlTable("priorities", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  name: varchar("name", { length: 64 }).notNull(),
  weight: int("weight").notNull().default(0),
  color: varchar("color", { length: 16 }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const statuses = mysqlTable("statuses", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 16 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});
