/**
 * Applies apps/server/drizzle/*.sql in filename order, tracked in _migrations.
 * Hand-authored SQL migrations (generated `*_active` unique columns need raw DDL).
 * Run inside the dev container: bun run db:migrate
 */
import mysql from "mysql2/promise";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "../../drizzle");

async function connectWithRetry(): Promise<mysql.Connection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mysql.createConnection({
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 3306),
        database: process.env.DB_NAME ?? "notestodo",
        user: process.env.DB_USER ?? "notestodo",
        password: process.env.DB_PASSWORD,
        multipleStatements: true,
        timezone: "Z",
      });
    } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`DB not ready (attempt ${attempt}/30), retrying in 2s…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const conn = await connectWithRetry();

await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(255) PRIMARY KEY,
  applied_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

const [rows] = await conn.query("SELECT name FROM _migrations");
const applied = new Set((rows as { name: string }[]).map((r) => r.name));

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  if (applied.has(file)) continue;
  console.log(`Applying ${file}…`);
  const sql = await Bun.file(join(MIGRATIONS_DIR, file)).text();
  await conn.query(sql);
  await conn.query("INSERT INTO _migrations (name) VALUES (?)", [file]);
}

// Seed: first admin user (local-only app; change the password after first login)
const [userCount] = await conn.query("SELECT COUNT(*) AS n FROM users");
if ((userCount as { n: number }[])[0]!.n === 0) {
  const hash = await Bun.password.hash("admin");
  await conn.query(
    "INSERT INTO users (username, password_hash, display_name, is_admin) VALUES ('admin', ?, 'Administrator', TRUE)",
    [hash],
  );
  console.log("Seeded admin user — username 'admin', password 'admin'. CHANGE IT after first login.");
}

// Seed: default lookups — insert-by-name, idempotent (skips names that
// already exist, archived or active), so reruns and pre-populated DBs are safe.
const defaultCategories = ["Personal", "Work", "Hobby"];
for (let i = 0; i < defaultCategories.length; i++) {
  const name = defaultCategories[i]!;
  const [rows] = await conn.query("SELECT id FROM categories WHERE name = ?", [name]);
  if ((rows as unknown[]).length === 0) {
    await conn.query("INSERT INTO categories (name, sort_order) VALUES (?, ?)", [name, i]);
    console.log(`Seeded category '${name}'.`);
  }
}
const defaultPriorities: Array<[string, number]> = [
  ["Low", 1],
  ["Medium", 2],
  ["High", 3],
  ["Immediate", 4],
];
for (const [name, weight] of defaultPriorities) {
  const [rows] = await conn.query("SELECT id FROM priorities WHERE name = ?", [name]);
  if ((rows as unknown[]).length === 0) {
    await conn.query("INSERT INTO priorities (name, weight) VALUES (?, ?)", [name, weight]);
    console.log(`Seeded priority '${name}' (weight ${weight}).`);
  }
}

console.log(`Migrations up to date (${files.length} total).`);
await conn.end();
