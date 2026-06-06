import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { itemTags } from "../db/schema/linksTags";

/** Active tag ids for a set of items in one query (avoids N+1 in list endpoints). */
export async function tagIdsByItem(itemIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (itemIds.length === 0) return map;
  const rows = await db
    .select({ itemId: itemTags.itemId, tagId: itemTags.tagId })
    .from(itemTags)
    .where(and(inArray(itemTags.itemId, itemIds), isNull(itemTags.archivedAtUTC)));
  for (const r of rows) {
    const list = map.get(r.itemId) ?? [];
    list.push(r.tagId);
    map.set(r.itemId, list);
  }
  return map;
}
