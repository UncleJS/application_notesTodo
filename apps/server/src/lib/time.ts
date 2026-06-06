/**
 * All DB datetimes are UTC strings in `YYYY-MM-DD HH:mm:ss` form
 * (drizzle datetime mode "string"). Transport is ISO-8601 UTC (`...Z`).
 */

export function nowUtcSql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function isoToSql(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${iso}`);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function sqlToIso(sql: string): string;
export function sqlToIso(sql: string | null): string | null;
export function sqlToIso(sql: string | null): string | null {
  if (!sql) return null;
  return sql.replace(" ", "T") + "Z";
}

export function dateToSql(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function sqlToDate(sql: string): Date {
  return new Date(sqlToIso(sql));
}
