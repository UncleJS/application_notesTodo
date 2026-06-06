import { Elysia, t } from "elysia";
import { and, asc, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "../db/client";
import { items, todos } from "../db/schema/items";
import { itemTags } from "../db/schema/linksTags";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess, visibleItemsCond } from "../services/itemAccess";
import { tagIdsByItem } from "../services/tags";
import { itemIdsWithLinks } from "../services/links";
import { isoToSql, nowUtcSql, sqlToIso } from "../lib/time";

export function todoDto(item: typeof items.$inferSelect, todo: typeof todos.$inferSelect, tagIds: number[] = []) {
  return {
    id: item.id,
    title: item.title,
    tagIds,
    done: todo.done,
    doneAtUTC: sqlToIso(todo.doneAtUTC),
    dueAtUTC: sqlToIso(todo.dueAtUTC),
    notesMd: todo.notesMd,
    ownerId: item.ownerId,
    categoryId: item.categoryId,
    priorityId: item.priorityId,
    createdAtUTC: sqlToIso(item.createdAtUTC),
    updatedAtUTC: sqlToIso(item.updatedAtUTC),
    archivedAtUTC: sqlToIso(item.archivedAtUTC),
  };
}

async function loadTodo(id: number) {
  const rows = await db
    .select()
    .from(items)
    .innerJoin(todos, eq(todos.itemId, items.id))
    .where(and(eq(items.id, id), eq(items.itemType, "todo")))
    .limit(1);
  return rows[0] ?? null;
}

export const todoRoutes = new Elysia({ prefix: "/api/v1/todos" })
  .use(requireAuth)
  .get(
    "/",
    async ({ user, query }) => {
      const conds = [eq(items.itemType, "todo" as const), visibleItemsCond(user!)];
      if (query.includeArchived !== "true") conds.push(isNull(items.archivedAtUTC));
      if (query.q) conds.push(like(items.title, `%${query.q}%`));
      if (query.category) conds.push(eq(items.categoryId, Number(query.category)));
      if (query.priority) conds.push(eq(items.priorityId, Number(query.priority)));
      if (query.done === "true") conds.push(eq(todos.done, true));
      if (query.done === "false") conds.push(eq(todos.done, false));
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
        .innerJoin(todos, eq(todos.itemId, items.id))
        .where(and(...conds))
        .orderBy(asc(todos.done), asc(todos.dueAtUTC), desc(items.updatedAtUTC));
      const tagMap = await tagIdsByItem(rows.map((r) => r.items.id));
      const linked = await itemIdsWithLinks(rows.map((r) => r.items.id));
      return rows.map((r) => ({
        ...todoDto(r.items, r.todos, tagMap.get(r.items.id) ?? []),
        hasLinks: linked.has(r.items.id),
      }));
    },
    {
      query: t.Object({
        includeArchived: t.Optional(t.String()),
        q: t.Optional(t.String()),
        category: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        done: t.Optional(t.String()),
        tag: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ user, body, set }) => {
      const id = await db.transaction(async (tx) => {
        const [res] = await tx.insert(items).values({
          itemType: "todo",
          ownerId: user!.id,
          title: body.title,
          categoryId: body.categoryId ?? null,
          priorityId: body.priorityId ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        await tx.insert(todos).values({
          itemId: res.insertId,
          dueAtUTC: body.dueAtUTC ? isoToSql(body.dueAtUTC) : null,
          notesMd: body.notesMd ?? null,
        });
        return res.insertId;
      });
      const row = (await loadTodo(id))!;
      set.status = 201;
      return todoDto(row.items, row.todos);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 512 }),
        dueAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
        notesMd: t.Optional(t.Nullable(t.String())),
        categoryId: t.Optional(t.Nullable(t.Number())),
        priorityId: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )
  .get("/:id", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    const row = await loadTodo(id);
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    const tagMap = await tagIdsByItem([id]);
    const linked = await itemIdsWithLinks([id]);
    return { ...todoDto(row.items, row.todos, tagMap.get(id) ?? []), hasLinks: linked.has(id) };
  })
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      const id = Number(params.id);
      const access = await getItemAccess(user!, id);
      if (!atLeast(access, "edit")) {
        set.status = access === null ? 404 : 403;
        return { error: access === null ? "not found" : "forbidden" };
      }
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
        const todoSet: Partial<typeof todos.$inferInsert> = {};
        if (body.dueAtUTC !== undefined) todoSet.dueAtUTC = body.dueAtUTC ? isoToSql(body.dueAtUTC) : null;
        if (body.notesMd !== undefined) todoSet.notesMd = body.notesMd;
        if (body.done !== undefined) {
          todoSet.done = body.done;
          todoSet.doneAtUTC = body.done ? nowUtcSql() : null;
        }
        if (Object.keys(todoSet).length > 0) {
          await tx.update(todos).set(todoSet).where(eq(todos.itemId, id));
        }
      });
      const row = (await loadTodo(id))!;
      return todoDto(row.items, row.todos);
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 512 })),
        done: t.Optional(t.Boolean()),
        dueAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
        notesMd: t.Optional(t.Nullable(t.String())),
        categoryId: t.Optional(t.Nullable(t.Number())),
        priorityId: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )
  .post("/:id/toggle", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "edit")) {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "forbidden" };
    }
    const row = await loadTodo(id);
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    const done = !row.todos.done;
    await db
      .update(todos)
      .set({ done, doneAtUTC: done ? nowUtcSql() : null })
      .where(eq(todos.itemId, id));
    await db.update(items).set({ updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
    const updated = (await loadTodo(id))!;
    return todoDto(updated.items, updated.todos);
  })
  .delete("/:id", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can archive" };
    }
    await db.update(items).set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
    return { ok: true };
  })
  .post("/:id/restore", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can restore" };
    }
    await db.update(items).set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
    return { ok: true };
  });
