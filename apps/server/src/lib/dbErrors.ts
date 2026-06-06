/** Drizzle wraps the mysql2 error, so the driver code lives on `cause`. */
export function isDupEntry(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY";
}
