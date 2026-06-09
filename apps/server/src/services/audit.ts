import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { items } from "../db/schema/items";
import { auditLogs, type AuditAction, type AuditChange } from "../db/schema/audit";
import { nowUtcSql, sqlToIso } from "../lib/time";

/** A Drizzle transaction handle — the value passed to db.transaction(async (tx) => …). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Normalize a value for JSON storage so the UI can render it directly:
 * undefined → null, DB datetime strings (`YYYY-MM-DD HH:mm:ss`) → ISO `…Z`.
 * Everything else (booleans, numbers, strings, arrays, objects) passes through.
 */
function serialize(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && SQL_DATETIME_RE.test(v)) return sqlToIso(v);
  return v;
}

/**
 * Compare `prev` vs `next` over the given fields, emitting one {field, old, new}
 * per field present in `next` whose value actually changed. Fields absent from
 * `next` (not touched by this request) and unchanged fields are skipped.
 */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: string[],
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const f of fields) {
    if (!(f in next)) continue; // field not part of this request
    const o = prev[f] ?? null;
    const n = next[f] ?? null;
    if (o === n) continue; // unchanged
    out.push({ field: f, old: serialize(o), new: serialize(n) });
  }
  return out;
}

/**
 * The item's type + category/priority for snapshotting onto an audit row.
 * Used by relation routes (tags, links, shares, bulk) that mutate an item
 * indirectly and need its metadata. Returns null if the item is gone.
 */
export async function itemAuditMeta(
  itemId: number,
): Promise<{ itemType: "note" | "todo" | "calendar"; categoryId: number | null; priorityId: number | null } | null> {
  const row = (
    await db
      .select({ itemType: items.itemType, categoryId: items.categoryId, priorityId: items.priorityId })
      .from(items)
      .where(eq(items.id, itemId))
      .limit(1)
  )[0];
  return row ?? null;
}

export interface RecordAuditInput {
  itemId: number;
  itemType: "note" | "todo" | "calendar";
  actorUserId: number;
  action: AuditAction;
  changes?: AuditChange[] | null;
  categoryId?: number | null; // snapshot at write time
  priorityId?: number | null; // snapshot at write time
}

/**
 * Insert one audit row INSIDE the caller's transaction, so the audit row and
 * the mutation commit or roll back together. An `update` with an empty change
 * set is a no-op (nothing actually changed).
 */
export async function recordAudit(tx: Tx, input: RecordAuditInput): Promise<void> {
  if (input.action === "update" && (!input.changes || input.changes.length === 0)) return;
  await tx.insert(auditLogs).values({
    itemId: input.itemId,
    itemType: input.itemType,
    actorUserId: input.actorUserId,
    action: input.action,
    changes: input.changes ?? null,
    categoryId: input.categoryId ?? null,
    priorityId: input.priorityId ?? null,
    createdAtUTC: nowUtcSql(),
  });
}
