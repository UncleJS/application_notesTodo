import {
  bigint,
  boolean,
  char,
  datetime,
  mysqlTable,
  varchar,
} from "drizzle-orm/mysql-core";

// Generated `*_active` uniqueness columns exist only in SQL migrations —
// they are never written by the app, so they are omitted here.

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  username: varchar("username", { length: 64 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 128 }),
  isAdmin: boolean("is_admin").notNull().default(false),
  email: varchar("email", { length: 255 }),
  lastLoginAtUTC: datetime("last_login_at_UTC", { mode: "string" }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const groups = mysqlTable("groups", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const groupMembers = mysqlTable("group_members", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  groupId: bigint("group_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

// System table — expiry-based lifecycle, hard delete allowed.
export const sessions = mysqlTable("sessions", {
  id: char("id", { length: 36 }).primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  expiresAtUTC: datetime("expires_at_UTC", { mode: "string" }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  lastSeenAtUTC: datetime("last_seen_at_UTC", { mode: "string" }).notNull(),
});
