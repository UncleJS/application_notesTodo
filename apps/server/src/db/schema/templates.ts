import {
  bigint,
  boolean,
  datetime,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  time,
  varchar,
} from "drizzle-orm/mysql-core";

export const templates = mysqlTable("templates", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 512 }),
  /** when set, override every item's own category/priority at instantiation */
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  priorityId: bigint("priority_id", { mode: "number", unsigned: true }),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const templateItems = mysqlTable("template_items", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  templateId: bigint("template_id", { mode: "number", unsigned: true }).notNull(),
  itemType: mysqlEnum("item_type", ["note", "todo", "calendar"]).notNull().default("todo"),
  title: varchar("title", { length: 512 }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  priorityId: bigint("priority_id", { mode: "number", unsigned: true }),
  /** todo items only — copied onto the created todo */
  statusId: bigint("status_id", { mode: "number", unsigned: true }),
  /** due (todo) / start (calendar) offset in days from the instantiation base date */
  relativeDueDays: int("relative_due_days"),
  sortOrder: int("sort_order").notNull().default(0),
  // note fields
  bodyMd: mediumtext("body_md"),
  // calendar fields
  startTimeUTC: time("start_time_UTC"),
  durationMinutes: int("duration_minutes"),
  allDay: boolean("all_day").notNull().default(false),
  location: varchar("location", { length: 255 }),
  descriptionMd: text("description_md"),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

export const templateItemTags = mysqlTable("template_item_tags", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  templateItemId: bigint("template_item_id", { mode: "number", unsigned: true }).notNull(),
  tagId: bigint("tag_id", { mode: "number", unsigned: true }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});

/** Template-level tags: applied to every created item at instantiation. */
export const templateTags = mysqlTable("template_tags", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  templateId: bigint("template_id", { mode: "number", unsigned: true }).notNull(),
  tagId: bigint("tag_id", { mode: "number", unsigned: true }).notNull(),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
  archivedAtUTC: datetime("archived_at_UTC", { mode: "string" }),
});
