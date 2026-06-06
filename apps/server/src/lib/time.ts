/**
 * All DB datetimes are UTC strings in `YYYY-MM-DD HH:mm:ss` form
 * (drizzle datetime mode "string"). Transport is ISO-8601 UTC (`...Z`).
 */

export function nowUtcSql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// datetime strings must carry an explicit offset (Z or ±HH:MM); bare dates are allowed
const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoToSql(iso: string): string {
  if (!BARE_DATE_RE.test(iso) && !HAS_TZ_RE.test(iso)) {
    throw new Error(`datetime missing timezone designator: ${iso}`);
  }
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
