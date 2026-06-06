import {
  bigint,
  boolean,
  datetime,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

export const items = mysqlTable("items", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  itemType: mysqlEnum("item_type", ["note", "todo", "calendar"]).notNull(),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  priorityId: bigint("priority_id", { mode: "number", unsigned: true }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const notes = mysqlTable("notes", {
  itemId: bigint("item_id", { mode: "number", unsigned: true }).primaryKey(),
  bodyMd: mediumtext("body_md"),
  pinned: boolean("pinned").notNull().default(false),
});

export const todos = mysqlTable("todos", {
  itemId: bigint("item_id", { mode: "number", unsigned: true }).primaryKey(),
  done: boolean("done").notNull().default(false),
  doneAtUTC: datetime("done_at_UTC", { mode: "string" }),
  dueAtUTC: datetime("due_at_UTC", { mode: "string" }),
  notesMd: text("notes_md"),
});

export const calendarItems = mysqlTable("calendar_items", {
  itemId: bigint("item_id", { mode: "number", unsigned: true }).primaryKey(),
  startAtUTC: datetime("start_at_UTC", { mode: "string" }).notNull(),
  endAtUTC: datetime("end_at_UTC", { mode: "string" }),
  allDay: boolean("all_day").notNull().default(false),
  location: varchar("location", { length: 255 }),
  descriptionMd: text("description_md"),
  rrule: varchar("rrule", { length: 1024 }),
  timezone: varchar("timezone", { length: 64 }),
});

export const calendarExdates = mysqlTable("calendar_exdates", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  calendarItemId: bigint("calendar_item_id", { mode: "number", unsigned: true }).notNull(),
  exdateAtUTC: datetime("exdate_at_UTC", { mode: "string" }).notNull(),
});
