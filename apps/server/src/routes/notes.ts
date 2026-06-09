import { Elysia, t } from "elysia";
import { idParam } from "../lib/params";
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { items, notes } from "../db/schema/items";
import { itemTags } from "../db/schema/linksTags";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess, isStaleItem, visibleItemsCond } from "../services/itemAccess";
import { tagIdsByItem } from "../services/tags";
import { invalidLookupIds } from "../services/lookups";
import { itemIdsWithLinks } from "../services/links";
import { diffFields, recordAudit } from "../services/audit";
import { nowUtcSql, sqlToIso } from "../lib/time";

function noteDto(item: typeof items.$inferSelect, note: typeof notes.$inferSelect, tagIds: number[] = []) {
  return {
    id: item.id,
    title: item.title,
    bodyMd: note.bodyMd,
    pinned: note.pinned,
    tagIds,
    ownerId: item.ownerId,
    categoryId: item.categoryId,
    priorityId: item.priorityId,
    createdAtUTC: sqlToIso(item.createdAtUTC),
    updatedAtUTC: sqlToIso(item.updatedAtUTC),
    archivedAtUTC: sqlToIso(item.archivedAtUTC),
  };
}

async function loadNote(id: number) {
  const rows = await db
    .select()
    .from(items)
    .innerJoin(notes, eq(notes.itemId, items.id))
    .where(and(eq(items.id, id), eq(items.itemType, "note")))
    .limit(1);
  return rows[0] ?? null;
}

const noteBody = t.Object({
  title: t.String({ minLength: 1, maxLength: 512 }),
  bodyMd: t.Optional(t.Nullable(t.String())),
  pinned: t.Optional(t.Boolean()),
  categoryId: t.Optional(t.Nullable(t.Number())),
  priorityId: t.Optional(t.Nullable(t.Number())),
});

export const noteRoutes = new Elysia({ prefix: "/api/v1/notes" })
  .use(requireAuth)
  .get(
    "/",
    async ({ user, query }) => {
      const conds = [eq(items.itemType, "note" as const), visibleItemsCond(user!)];
      if (query.includeArchived !== "true") conds.push(isNull(items.archivedAtUTC));
      if (query.q) {
        conds.push(or(like(items.title, `%${query.q}%`), like(notes.bodyMd, `%${query.q}%`))!);
      }
      if (query.category) conds.push(eq(items.categoryId, Number(query.category)));
      if (query.priority) conds.push(eq(items.priorityId, Number(query.priority)));
      if (query.tag) {
        conds.push(
          inArray(
            items.id,
            db
              .select({ id: itemTags.itemId })
              .from(itemTags)
              .where(and(eq(itemTags.tagId, Number(query.tag)), isNull(itemTags.archivedAtUTC))),
          ),
        );
      }
      const rows = await db
        .select()
        .from(items)
        .innerJoin(notes, eq(notes.itemId, items.id))
        .where(and(...conds))
        .orderBy(desc(notes.pinned), desc(items.updatedAtUTC));
      const tagMap = await tagIdsByItem(rows.map((r) => r.items.id));
      const linked = await itemIdsWithLinks(rows.map((r) => r.items.id));
      return rows.map((r) => ({
        ...noteDto(r.items, r.notes, tagMap.get(r.items.id) ?? []),
        hasLinks: linked.has(r.items.id),
      }));
    },
    {
      query: t.Object({
        includeArchived: t.Optional(t.String()),
        q: t.Optional(t.String()),
        category: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        tag: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ user, body, set }) => {
      const badLookups = await invalidLookupIds(body);
      if (badLookups.length) {
        set.status = 422;
        return { error: `unknown ${badLookups.join(", ")}` };
      }
      const id = await db.transaction(async (tx) => {
        const [res] = await tx.insert(items).values({
          itemType: "note",
          ownerId: user!.id,
          title: body.title,
          categoryId: body.categoryId ?? null,
          priorityId: body.priorityId ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        await tx.insert(notes).values({
          itemId: res.insertId,
          bodyMd: body.bodyMd ?? null,
          pinned: body.pinned ?? false,
        });
        await recordAudit(tx, {
          itemId: res.insertId,
          itemType: "note",
          actorUserId: user!.id,
          action: "create",
          categoryId: body.categoryId ?? null,
          priorityId: body.priorityId ?? null,
        });
        return res.insertId;
      });
      const row = (await loadNote(id))!;
      set.status = 201;
      return noteDto(row.items, row.notes);
    },
    { body: noteBody },
  )
  .get("/:id", async ({ user, params, set }) => {
    const id = idParam(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    const row = await loadNote(id);
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    const tagMap = await tagIdsByItem([id]);
    return noteDto(row.items, row.notes, tagMap.get(id) ?? []);
  })
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      const id = idParam(params.id);
      const access = await getItemAccess(user!, id);
      if (!atLeast(access, "edit")) {
        set.status = access === null ? 404 : 403;
        return { error: access === null ? "not found" : "forbidden" };
      }
      if (body.expectedUpdatedAtUTC && (await isStaleItem(id, body.expectedUpdatedAtUTC))) {
        set.status = 409;
        return { error: "modified by someone else — reload to get the latest version" };
      }
      const badLookups = await invalidLookupIds(body);
      if (badLookups.length) {
        set.status = 422;
        return { error: `unknown ${badLookups.join(", ")}` };
      }
      const before = (await loadNote(id))!;
      const next: Record<string, unknown> = {};
      if (body.title !== undefined) next.title = body.title;
      if (body.categoryId !== undefined) next.categoryId = body.categoryId;
      if (body.priorityId !== undefined) next.priorityId = body.priorityId;
      if (body.bodyMd !== undefined) next.bodyMd = body.bodyMd;
      if (body.pinned !== undefined) next.pinned = body.pinned;
      const changes = diffFields(
        {
          title: before.items.title,
          categoryId: before.items.categoryId,
          priorityId: before.items.priorityId,
          bodyMd: before.notes.bodyMd,
          pinned: before.notes.pinned,
        },
        next,
        ["title", "categoryId", "priorityId", "bodyMd", "pinned"],
      );
      await db.transaction(async (tx) => {
        await tx
          .update(items)
          .set({
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
            ...(body.priorityId !== undefined ? { priorityId: body.priorityId } : {}),
            updatedAtUTC: nowUtcSql(),
          })
          .where(eq(items.id, id));
        if (body.bodyMd !== undefined || body.pinned !== undefined) {
          await tx
            .update(notes)
            .set({
              ...(body.bodyMd !== undefined ? { bodyMd: body.bodyMd } : {}),
              ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
            })
            .where(eq(notes.itemId, id));
        }
        await recordAudit(tx, {
          itemId: id,
          itemType: "note",
          actorUserId: user!.id,
          action: "update",
          changes,
          categoryId: body.categoryId !== undefined ? body.categoryId : before.items.categoryId,
          priorityId: body.priorityId !== undefined ? body.priorityId : before.items.priorityId,
        });
      });
      const row = (await loadNote(id))!;
      return noteDto(row.items, row.notes);
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 512 })),
        bodyMd: t.Optional(t.Nullable(t.String())),
        pinned: t.Optional(t.Boolean()),
        categoryId: t.Optional(t.Nullable(t.Number())),
        priorityId: t.Optional(t.Nullable(t.Number())),
        // optimistic locking: reject with 409 when the item changed since this timestamp
        expectedUpdatedAtUTC: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  )
  .delete("/:id", async ({ user, params, set }) => {
    const id = idParam(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can archive" };
    }
    const before = (await db.select().from(items).where(eq(items.id, id)).limit(1))[0]!;
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
        .where(eq(items.id, id));
      await recordAudit(tx, {
        itemId: id,
        itemType: "note",
        actorUserId: user!.id,
        action: "archive",
        categoryId: before.categoryId,
        priorityId: before.priorityId,
      });
    });
    return { ok: true };
  })
  .post("/:id/restore", async ({ user, params, set }) => {
    const id = idParam(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can restore" };
    }
    const before = (await db.select().from(items).where(eq(items.id, id)).limit(1))[0]!;
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
        .where(eq(items.id, id));
      await recordAudit(tx, {
        itemId: id,
        itemType: "note",
        actorUserId: user!.id,
        action: "restore",
        categoryId: before.categoryId,
        priorityId: before.priorityId,
      });
    });
    return { ok: true };
  });
