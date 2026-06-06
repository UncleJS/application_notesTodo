import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? "notestodo",
  user: process.env.DB_USER ?? "notestodo",
  password: process.env.DB_PASSWORD,
  timezone: "Z", // all DB datetimes are UTC
  connectionLimit: 10,
});

export const db = drizzle(pool);

export async function pingDb(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}
