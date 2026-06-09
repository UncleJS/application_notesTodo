import { Elysia, t } from "elysia";
import { and, count, desc, eq, gte, lte, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema/auth";
import { items } from "../db/schema/items";
import { auditLogs, AUDIT_ACTIONS, type AuditChange } from "../db/schema/audit";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { isoToSql, sqlToIso } from "../lib/time";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Shared filter query params for both the self and admin audit endpoints. */
const sharedQuery = {
  itemType: t.Optional(t.String()),
  action: t.Optional(t.String()),
  category: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
};

type SharedQuery = {
  itemType?: string;
  action?: string;
  category?: string;
  priority?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

/** WHERE conditions common to both endpoints, derived from the query params. */
function commonConds(q: SharedQuery): SQL[] {
  const conds: SQL[] = [];
  if (q.itemType === "note" || q.itemType === "todo" || q.itemType === "calendar") {
    conds.push(eq(auditLogs.itemType, q.itemType));
  }
  if (q.action && (AUDIT_ACTIONS as readonly string[]).includes(q.action)) {
    conds.push(eq(auditLogs.action, q.action as (typeof AUDIT_ACTIONS)[number]));
  }
  if (q.category) conds.push(eq(auditLogs.categoryId, Number(q.category)));
  if (q.priority) conds.push(eq(auditLogs.priorityId, Number(q.priority)));
  if (q.from) conds.push(gte(auditLogs.createdAtUTC, isoToSql(q.from)));
  if (q.to) conds.push(lte(auditLogs.createdAtUTC, isoToSql(q.to)));
  return conds;
}

function pagination(q: SharedQuery): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Coerce the stored `changes` into an array. The mysql2/drizzle json column
 * can hand back either a parsed array or the raw JSON string depending on the
 * connection, so normalize here to keep the API contract (array | null) firm.
 */
function normalizeChanges(v: AuditChange[] | string | null): AuditChange[] | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as AuditChange[];
    } catch {
      return null;
    }
  }
  return v;
}

function auditLogDto(r: {
  id: number;
  itemId: number;
  itemType: "note" | "todo" | "calendar";
  itemTitle: string | null;
  actorUserId: number;
  actorUsername: string | null;
  actorDisplayName: string | null;
  action: string;
  changes: AuditChange[] | string | null;
  categoryId: number | null;
  priorityId: number | null;
  createdAtUTC: string;
}) {
  return {
    id: r.id,
    itemId: r.itemId,
    itemType: r.itemType,
    itemTitle: r.itemTitle,
    actorUserId: r.actorUserId,
    actorUsername: r.actorUsername,
    actorDisplayName: r.actorDisplayName,
    action: r.action,
    changes: normalizeChanges(r.changes),
    categoryId: r.categoryId,
    priorityId: r.priorityId,
    createdAtUTC: sqlToIso(r.createdAtUTC),
  };
}

/** Run the joined list + count for the given WHERE conditions. */
async function queryAuditLogs(conds: SQL[], page: number, limit: number, offset: number) {
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: auditLogs.id,
      itemId: auditLogs.itemId,
      itemType: auditLogs.itemType,
      itemTitle: items.title,
      actorUserId: auditLogs.actorUserId,
      actorUsername: users.username,
      actorDisplayName: users.displayName,
      action: auditLogs.action,
      changes: auditLogs.changes,
      categoryId: auditLogs.categoryId,
      priorityId: auditLogs.priorityId,
      createdAtUTC: auditLogs.createdAtUTC,
    })
    .from(auditLogs)
    .leftJoin(items, eq(items.id, auditLogs.itemId))
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where)
    .orderBy(desc(auditLogs.createdAtUTC), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);
  const [{ n }] = await db
    .select({ n: count() })
    .from(auditLogs)
    .leftJoin(items, eq(items.id, auditLogs.itemId))
    .where(where);
  return { logs: rows.map(auditLogDto), total: n, page, limit };
}

/** Self/owner-scoped audit log: changes the user made OR to items they own. */
export const auditRoutes = new Elysia({ prefix: "/api/v1/audit-logs" })
  .use(requireAuth)
  .get(
    "/",
    async ({ user, query }) => {
      const conds = commonConds(query);
      conds.push(or(eq(auditLogs.actorUserId, user!.id), eq(items.ownerId, user!.id))!);
      const { page, limit, offset } = pagination(query);
      return queryAuditLogs(conds, page, limit, offset);
    },
    { query: t.Object(sharedQuery) },
  );

/** Admin audit log: all rows, plus a userId (actor) filter. */
export const adminAuditRoutes = new Elysia({ prefix: "/api/v1/admin/audit-logs" })
  .use(requireAdmin)
  .get(
    "/",
    async ({ query }) => {
      const conds = commonConds(query);
      if (query.userId) conds.push(eq(auditLogs.actorUserId, Number(query.userId)));
      const { page, limit, offset } = pagination(query);
      return queryAuditLogs(conds, page, limit, offset);
    },
    { query: t.Object({ ...sharedQuery, userId: t.Optional(t.String()) }) },
  );
