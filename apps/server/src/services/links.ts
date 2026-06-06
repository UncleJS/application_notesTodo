import { inArray, isNull, or } from "drizzle-orm";
import { and } from "drizzle-orm";
import { db } from "../db/client";
import { itemLinks } from "../db/schema/linksTags";

/** Subset of the given item ids that have at least one active link (either direction). */
export async function itemIdsWithLinks(itemIds: number[]): Promise<Set<number>> {
  const set = new Set<number>();
  if (itemIds.length === 0) return set;
  const rows = await db
    .select({ fromItemId: itemLinks.fromItemId, toItemId: itemLinks.toItemId })
    .from(itemLinks)
    .where(
      and(
        or(inArray(itemLinks.fromItemId, itemIds), inArray(itemLinks.toItemId, itemIds)),
        isNull(itemLinks.archivedAtUTC),
      ),
    );
  const wanted = new Set(itemIds);
  for (const r of rows) {
    if (wanted.has(r.fromItemId)) set.add(r.fromItemId);
    if (wanted.has(r.toItemId)) set.add(r.toItemId);
  }
  return set;
}
