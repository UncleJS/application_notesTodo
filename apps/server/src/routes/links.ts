import { Elysia, t } from "elysia";
import { and, eq, isNull, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { items } from "../db/schema/items";
import { itemLinks } from "../db/schema/linksTags";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess, visibleItemsCond } from "../services/itemAccess";
import { isDupEntry } from "../lib/dbErrors";
import { nowUtcSql, sqlToIso } from "../lib/time";

export const itemRoutes = new Elysia({ prefix: "/api/v1/items" })
  .use(requireAuth)
  // generic item search — used by the link picker
  .get(
    "/",
    async ({ user, query }) => {
      const conds = [visibleItemsCond(user!), isNull(items.archivedAtUTC)];
      if (query.type) conds.push(eq(items.itemType, query.type as "note" | "todo" | "calendar"));
      if (query.q) conds.push(like(items.title, `%${query.q}%`));
      const rows = await db
        .select({ id: items.id, itemType: items.itemType, title: items.title })
        .from(items)
        .where(and(...conds))
        .limit(30);
      return rows;
    },
    { query: t.Object({ type: t.Optional(t.String()), q: t.Optional(t.String()) }) },
  )
  // generic base item — used by the item detail page header
  .get("/:id", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    const row = (await db.select().from(items).where(eq(items.id, id)))[0];
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    return {
      id: row.id,
      itemType: row.itemType,
      title: row.title,
      ownerId: row.ownerId,
      categoryId: row.categoryId,
      priorityId: row.priorityId,
      access,
      createdAtUTC: sqlToIso(row.createdAtUTC),
      updatedAtUTC: sqlToIso(row.updatedAtUTC),
      archivedAtUTC: sqlToIso(row.archivedAtUTC),
    };
  })
  .get("/:id/links", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    // bidirectional: links where this item is either endpoint
    const rows = await db
      .select({
        linkId: itemLinks.id,
        fromItemId: itemLinks.fromItemId,
        toItemId: itemLinks.toItemId,
        linkType: itemLinks.linkType,
        otherId: items.id,
        otherType: items.itemType,
        otherTitle: items.title,
        otherArchivedAtUTC: items.archivedAtUTC,
      })
      .from(itemLinks)
      .innerJoin(
        items,
        or(
          and(eq(itemLinks.fromItemId, id), eq(items.id, itemLinks.toItemId)),
          and(eq(itemLinks.toItemId, id), eq(items.id, itemLinks.fromItemId)),
        ),
      )
      .where(and(or(eq(itemLinks.fromItemId, id), eq(itemLinks.toItemId, id)), isNull(itemLinks.archivedAtUTC)));
    return rows.map((r) => ({
      linkId: r.linkId,
      linkType: r.linkType,
      item: {
        id: r.otherId,
        itemType: r.otherType,
        title: r.otherTitle,
        archivedAtUTC: sqlToIso(r.otherArchivedAtUTC),
      },
    }));
  })
  .post(
    "/:id/links",
    async ({ user, params, body, set }) => {
      const fromId = Number(params.id);
      const toId = body.toItemId;
      if (fromId === toId) {
        set.status = 400;
        return { error: "cannot link an item to itself" };
      }
      const fromAccess = await getItemAccess(user!, fromId);
      if (!atLeast(fromAccess, "edit")) {
        set.status = fromAccess === null ? 404 : 403;
        return { error: fromAccess === null ? "not found" : "forbidden" };
      }
      const toAccess = await getItemAccess(user!, toId);
      if (!atLeast(toAccess, "view")) {
        set.status = 404;
        return { error: "target item not found" };
      }
      // restore an archived link for this pair if present, else insert
      const archived = (
        await db
          .select()
          .from(itemLinks)
          .where(
            or(
              and(eq(itemLinks.fromItemId, fromId), eq(itemLinks.toItemId, toId)),
              and(eq(itemLinks.fromItemId, toId), eq(itemLinks.toItemId, fromId)),
            ),
          )
      ).find((r) => r.archivedAtUTC !== null);
      try {
        if (archived) {
          await db
            .update(itemLinks)
            .set({ archivedAtUTC: null, linkType: body.linkType ?? null, updatedAtUTC: nowUtcSql() })
            .where(eq(itemLinks.id, archived.id));
        } else {
          await db.insert(itemLinks).values({
            fromItemId: fromId,
            toItemId: toId,
            linkType: body.linkType ?? null,
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          });
        }
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "items are already linked" };
        }
        throw err;
      }
      set.status = 201;
      return { ok: true };
    },
    {
      body: t.Object({
        toItemId: t.Number(),
        linkType: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
      }),
    },
  );

export const linkRoutes = new Elysia({ prefix: "/api/v1/links" })
  .use(requireAuth)
  .delete("/:id", async ({ user, params, set }) => {
    const linkId = Number(params.id);
    const row = (await db.select().from(itemLinks).where(eq(itemLinks.id, linkId)))[0];
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    const fromAccess = await getItemAccess(user!, row.fromItemId);
    const toAccess = await getItemAccess(user!, row.toItemId);
    if (!atLeast(fromAccess, "edit") && !atLeast(toAccess, "edit")) {
      set.status = 403;
      return { error: "forbidden" };
    }
    await db
      .update(itemLinks)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(itemLinks.id, linkId));
    return { ok: true };
  });
