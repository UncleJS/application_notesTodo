import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { categories, priorities, statuses } from "../db/schema/lookups";

type LookupIds = {
  categoryId?: number | null;
  priorityId?: number | null;
  statusId?: number | null;
};

/**
 * Check that every provided (non-null) lookup id refers to an active row.
 * Returns the names of invalid fields, e.g. ["categoryId"]; empty = all valid.
 */
export async function invalidLookupIds(ids: LookupIds, dbx: typeof db = db): Promise<string[]> {
  const invalid: string[] = [];
  const checks: Array<[string, number | null | undefined, typeof categories | typeof priorities | typeof statuses]> = [
    ["categoryId", ids.categoryId, categories],
    ["priorityId", ids.priorityId, priorities],
    ["statusId", ids.statusId, statuses],
  ];
  for (const [field, id, table] of checks) {
    if (id === undefined || id === null) continue;
    const rows = await dbx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), isNull(table.archivedAtUTC)))
      .limit(1);
    if (!rows.length) invalid.push(field);
  }
  return invalid;
}
