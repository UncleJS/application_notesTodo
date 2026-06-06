import { and, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { items } from "../db/schema/items";
import { itemShares } from "../db/schema/shares";
import { groupMembers } from "../db/schema/auth";
import { isoToSql } from "../lib/time";
import type { SessionUser } from "./session";

export type AccessLevel = "owner" | "edit" | "view";

const LEVEL_RANK: Record<AccessLevel, number> = { view: 1, edit: 2, owner: 3 };

export function atLeast(level: AccessLevel | null, required: AccessLevel): boolean {
  return level !== null && LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/**
 * Highest access the user has on an item:
 * owner (or admin) > edit-share > view-share — direct user grants and
 * grants to any active group the user belongs to.
 */
export async function getItemAccess(user: SessionUser, itemId: number): Promise<AccessLevel | null> {
  const row = (
    await db.select({ ownerId: items.ownerId }).from(items).where(eq(items.id, itemId)).limit(1)
  )[0];
  if (!row) return null;
  if (row.ownerId === user.id || user.isAdmin) return "owner";

  const grants = await db
    .select({ level: itemShares.level })
    .from(itemShares)
    .leftJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, itemShares.groupId),
        eq(groupMembers.userId, user.id),
        isNull(groupMembers.archivedAtUTC),
      ),
    )
    .where(
      and(
        eq(itemShares.itemId, itemId),
        isNull(itemShares.archivedAtUTC),
        or(eq(itemShares.userId, user.id), isNotNull(groupMembers.id)),
      ),
    );
  if (grants.some((g) => g.level === "edit")) return "edit";
  if (grants.length > 0) return "view";
  return null;
}

/** Subquery of item ids shared with the user (directly or via group). */
function sharedItemIdsSubquery(userId: number) {
  return db
    .select({ id: itemShares.itemId })
    .from(itemShares)
    .leftJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, itemShares.groupId),
        eq(groupMembers.userId, userId),
        isNull(groupMembers.archivedAtUTC),
      ),
    )
    .where(
      and(isNull(itemShares.archivedAtUTC), or(eq(itemShares.userId, userId), isNotNull(groupMembers.id))),
    );
}

/** WHERE condition for list endpoints: items the user owns or that are shared with them. */
export function visibleItemsCond(user: SessionUser): SQL {
  return or(eq(items.ownerId, user.id), inArray(items.id, sharedItemIdsSubquery(user.id)))!;
}

/**
 * Optimistic-locking check: true when the item's updated_at_UTC no longer
 * matches what the client last saw (someone else saved in between).
 */
export async function isStaleItem(itemId: number, expectedUpdatedAtUTC: string): Promise<boolean> {
  const row = (
    await db.select({ u: items.updatedAtUTC }).from(items).where(eq(items.id, itemId)).limit(1)
  )[0];
  return !!row && row.u !== isoToSql(expectedUpdatedAtUTC);
}
