import mysql from "mysql2/promise";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const TEST_DB = process.env.DB_NAME ?? "notestodo_test"; // preload.ts set this
const MIGRATIONS_DIR = join(import.meta.dir, "../../drizzle");

let provisioned = false;

/**
 * Create the test database (root credential), grant the app user, and apply
 * the idempotent SQL migrations. Call once from beforeAll in DB-backed suites.
 */
export async function ensureTestDb(): Promise<void> {
  if (provisioned) return;
  const root = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: "root",
    password: process.env.MARIADB_ROOT_PASSWORD,
    multipleStatements: true,
    timezone: "Z",
  });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.query(`GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO ?@'%'`, [process.env.DB_USER ?? "notestodo"]);
  await root.query(`USE \`${TEST_DB}\``);
  await root.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [rows] = await root.query("SELECT name FROM _migrations");
  const applied = new Set((rows as { name: string }[]).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = await Bun.file(join(MIGRATIONS_DIR, file)).text();
    await root.query(text);
    await root.query("INSERT INTO _migrations (name) VALUES (?)", [file]);
  }
  await root.end();
  provisioned = true;
}

/** Empty every data table (keeps _migrations). Run in beforeEach for isolation. */
export async function truncateAll(): Promise<void> {
  const tables = [
    "audit_logs",
    "reminder_dispatch",
    "reminders",
    "item_shares",
    "template_item_tags",
    "template_tags",
    "template_items",
    "templates",
    "item_links",
    "item_tags",
    "tags",
    "calendar_exdates",
    "calendar_items",
    "todos",
    "notes",
    "items",
    "sessions",
    "group_members",
    "groups",
    "users",
    "categories",
    "priorities",
    "statuses",
  ];
  await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=0"));
  for (const t of tables) await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``));
  await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=1"));
  // settings is a singleton row (id=1) created by migrations — restore it
  await db.execute(sql.raw("INSERT IGNORE INTO settings (id) VALUES (1)"));
}

export interface Fixtures {
  adminId: number;
  userId: number;
  user2Id: number;
  groupId: number;
  categoryId: number;
  priorityId: number;
  statusId: number;
  tagId: number;
}

/** Known users/group/lookups for route tests. */
export async function seedBaseFixtures(): Promise<Fixtures> {
  const hash = await Bun.password.hash("admin");
  const insertUser = async (username: string, isAdmin: boolean) => {
    const [res] = await db.execute(
      sql`INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (${username}, ${hash}, ${username}, ${isAdmin})`,
    );
    return (res as unknown as { insertId: number }).insertId;
  };
  const adminId = await insertUser("admin", true);
  const userId = await insertUser("alice", false);
  const user2Id = await insertUser("bob", false);
  const [g] = await db.execute(sql`INSERT INTO groups (name) VALUES ('team')`);
  const groupId = (g as unknown as { insertId: number }).insertId;
  await db.execute(sql`INSERT INTO group_members (group_id, user_id) VALUES (${groupId}, ${user2Id})`);
  const [c] = await db.execute(sql`INSERT INTO categories (name, sort_order) VALUES ('Work', 0)`);
  const [p] = await db.execute(sql`INSERT INTO priorities (name, weight) VALUES ('High', 3)`);
  const [s] = await db.execute(sql`INSERT INTO statuses (name, sort_order) VALUES ('WIP', 0)`);
  const [t] = await db.execute(sql`INSERT INTO tags (name) VALUES ('urgent')`);
  return {
    adminId,
    userId,
    user2Id,
    groupId,
    categoryId: (c as unknown as { insertId: number }).insertId,
    priorityId: (p as unknown as { insertId: number }).insertId,
    statusId: (s as unknown as { insertId: number }).insertId,
    tagId: (t as unknown as { insertId: number }).insertId,
  };
}

/** Server-side session for a user; the returned sid works as a Bearer token. */
export async function makeSession(userId: number): Promise<string> {
  const { createSession } = await import("../services/session");
  const { id } = await createSession(userId);
  return id;
}
