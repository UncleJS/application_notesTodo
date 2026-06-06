import {
  bigint,
  boolean,
  datetime,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

export const reminders = mysqlTable("reminders", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  itemId: bigint("item_id", { mode: "number", unsigned: true }).notNull(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).notNull(),
  recipientUserId: bigint("recipient_user_id", { mode: "number", unsigned: true }),
  remindAtUTC: datetime("remind_at_UTC", { mode: "string" }),
  offsetMinutes: int("offset_minutes"),
  /** comma-separated subset of email,webhook */
  channels: varchar("channels", { length: 32 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  nextFireAtUTC: datetime("next_fire_at_UTC", { mode: "string" }),
  lockedAtUTC: datetime("locked_at_UTC", { mode: "string" }),
  lockedBy: varchar("locked_by", { length: 64 }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const reminderDispatch = mysqlTable("reminder_dispatch", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  reminderId: bigint("reminder_id", { mode: "number", unsigned: true }).notNull(),
  itemId: bigint("item_id", { mode: "number", unsigned: true }).notNull(),
  occurrenceAtUTC: datetime("occurrence_at_UTC", { mode: "string" }).notNull(),
  channel: mysqlEnum("channel", ["email", "webhook"]).notNull(),
  status: mysqlEnum("status", ["sent", "failed"]).notNull(),
  attempt: int("attempt").notNull().default(1),
  error: text("error"),
  dispatchedAtUTC: datetime("dispatched_at_UTC", { mode: "string" }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
});
