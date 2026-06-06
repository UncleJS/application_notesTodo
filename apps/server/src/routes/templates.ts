import { Elysia, t } from "elysia";
import { idParam } from "../lib/params";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { calendarItems, items, notes, todos } from "../db/schema/items";
import { itemLinks, itemTags, tags } from "../db/schema/linksTags";
import { templateItems, templateItemTags, templates, templateTags } from "../db/schema/templates";
import { requireAuth } from "../middleware/auth";
import { isDupEntry } from "../lib/dbErrors";
import { nowUtcSql, sqlToIso } from "../lib/time";

function templateDto(r: typeof templates.$inferSelect, tagIds: number[] = []) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ownerId: r.ownerId,
    categoryId: r.categoryId,
    priorityId: r.priorityId,
    tagIds,
    createdAtUTC: sqlToIso(r.createdAtUTC),
    archivedAtUTC: sqlToIso(r.archivedAtUTC),
  };
}

function templateItemDto(r: typeof templateItems.$inferSelect, tagIds: number[] = []) {
  return {
    id: r.id,
    templateId: r.templateId,
    itemType: r.itemType,
    title: r.title,
    categoryId: r.categoryId,
    priorityId: r.priorityId,
    statusId: r.statusId,
    relativeDueDays: r.relativeDueDays,
    sortOrder: r.sortOrder,
    bodyMd: r.bodyMd,
    startTimeUTC: r.startTimeUTC,
    durationMinutes: r.durationMinutes,
    allDay: r.allDay,
    location: r.location,
    descriptionMd: r.descriptionMd,
    tagIds,
  };
}

async function ownTemplate(userId: number, isAdmin: boolean, templateId: number) {
  const row = (await db.select().from(templates).where(eq(templates.id, templateId)))[0];
  if (!row) return null;
  if (row.ownerId !== userId && !isAdmin) return null;
  return row;
}

/** Active tag ids per template item in one query. */
async function templateItemTagIds(templateItemIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (templateItemIds.length === 0) return map;
  const rows = await db
    .select({ templateItemId: templateItemTags.templateItemId, tagId: templateItemTags.tagId })
    .from(templateItemTags)
    .where(
      and(inArray(templateItemTags.templateItemId, templateItemIds), isNull(templateItemTags.archivedAtUTC)),
    );
  for (const r of rows) {
    const list = map.get(r.templateItemId) ?? [];
    list.push(r.tagId);
    map.set(r.templateItemId, list);
  }
  return map;
}

/** Active template-level tag ids. */
async function templateTagIds(templateId: number): Promise<number[]> {
  const rows = await db
    .select({ tagId: templateTags.tagId })
    .from(templateTags)
    .where(and(eq(templateTags.templateId, templateId), isNull(templateTags.archivedAtUTC)));
  return rows.map((r) => r.tagId);
}

/** Keep only ids of existing, active tags. */
async function activeTagIds(tagIds: number[]): Promise<number[]> {
  if (tagIds.length === 0) return [];
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inArray(tags.id, tagIds), isNull(tags.archivedAtUTC)));
  return rows.map((r) => r.id);
}

/** 'YYYY-MM-DD HH:MM:SS' UTC for the datetime string columns. */
function toSqlUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const templateItemBody = {
  title: t.String({ minLength: 1, maxLength: 512 }),
  itemType: t.Optional(t.Union([t.Literal("note"), t.Literal("todo"), t.Literal("calendar")])),
  categoryId: t.Optional(t.Nullable(t.Number())),
  priorityId: t.Optional(t.Nullable(t.Number())),
  statusId: t.Optional(t.Nullable(t.Number())),
  relativeDueDays: t.Optional(t.Nullable(t.Number())),
  sortOrder: t.Optional(t.Number()),
  tagIds: t.Optional(t.Array(t.Number())),
  // note
  bodyMd: t.Optional(t.Nullable(t.String())),
  // calendar
  startTimeUTC: t.Optional(t.Nullable(t.String({ pattern: "^\\d{2}:\\d{2}(:\\d{2})?$" }))),
  durationMinutes: t.Optional(t.Nullable(t.Number())),
  allDay: t.Optional(t.Boolean()),
  location: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  descriptionMd: t.Optional(t.Nullable(t.String())),
};

export const templateRoutes = new Elysia({ prefix: "/api/v1/templates" })
  .use(requireAuth)
  .get(
    "/",
    async ({ user, query }) => {
      const conds = [eq(templates.ownerId, user!.id)];
      if (query.includeArchived !== "true") conds.push(isNull(templates.archivedAtUTC));
      const rows = await db
        .select()
        .from(templates)
        .where(and(...conds))
        .orderBy(asc(templates.name));
      return rows.map((r) => templateDto(r));
    },
    { query: t.Object({ includeArchived: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        const [res] = await db.insert(templates).values({
          ownerId: user!.id,
          name: body.name,
          description: body.description ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        const row = (await db.select().from(templates).where(eq(templates.id, res.insertId)))[0]!;
        set.status = 201;
        return templateDto(row);
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "you already have a template with this name" };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 512 }))),
      }),
    },
  )
  .get("/:id", async ({ user, params, set }) => {
    const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
    if (!tpl) {
      set.status = 404;
      return { error: "not found" };
    }
    const rows = await db
      .select()
      .from(templateItems)
      .where(and(eq(templateItems.templateId, tpl.id), isNull(templateItems.archivedAtUTC)))
      .orderBy(asc(templateItems.sortOrder), asc(templateItems.id));
    const tagMap = await templateItemTagIds(rows.map((r) => r.id));
    const tplTagIds = await templateTagIds(tpl.id);
    return {
      ...templateDto(tpl, tplTagIds),
      items: rows.map((r) => templateItemDto(r, tagMap.get(r.id) ?? [])),
    };
  })
  .patch(
    "/:id",
    async ({ user, params, body, set }) => {
      const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
      if (!tpl) {
        set.status = 404;
        return { error: "not found" };
      }
      try {
        await db
          .update(templates)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
            ...(body.priorityId !== undefined ? { priorityId: body.priorityId } : {}),
            updatedAtUTC: nowUtcSql(),
          })
          .where(eq(templates.id, tpl.id));
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "you already have a template with this name" };
        }
        throw err;
      }
      const row = (await db.select().from(templates).where(eq(templates.id, tpl.id)))[0]!;
      return templateDto(row, await templateTagIds(tpl.id));
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.Nullable(t.String({ maxLength: 512 }))),
        categoryId: t.Optional(t.Nullable(t.Number())),
        priorityId: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )
  .delete("/:id", async ({ user, params, set }) => {
    const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
    if (!tpl) {
      set.status = 404;
      return { error: "not found" };
    }
    await db
      .update(templates)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(templates.id, tpl.id));
    return { ok: true };
  })
  .post("/:id/restore", async ({ user, params, set }) => {
    const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
    if (!tpl) {
      set.status = 404;
      return { error: "not found" };
    }
    try {
      await db
        .update(templates)
        .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
        .where(eq(templates.id, tpl.id));
    } catch (err) {
      if (isDupEntry(err)) {
        set.status = 409;
        return { error: "an active template already has this name" };
      }
      throw err;
    }
    return { ok: true };
  })
  // template-level tags — applied to every created item at instantiation
  .post(
    "/:id/tags",
    async ({ user, params, body, set }) => {
      const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
      if (!tpl) {
        set.status = 404;
        return { error: "not found" };
      }
      const valid = await activeTagIds([body.tagId]);
      if (valid.length === 0) {
        set.status = 404;
        return { error: "tag not found" };
      }
      // restore an archived attachment if present, else insert
      const archived = (
        await db
          .select()
          .from(templateTags)
          .where(and(eq(templateTags.templateId, tpl.id), eq(templateTags.tagId, body.tagId)))
      ).find((r) => r.archivedAtUTC !== null);
      try {
        if (archived) {
          await db
            .update(templateTags)
            .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
            .where(eq(templateTags.id, archived.id));
        } else {
          await db.insert(templateTags).values({
            templateId: tpl.id,
            tagId: body.tagId,
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          });
        }
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "tag already attached" };
        }
        throw err;
      }
      set.status = 201;
      return { ok: true };
    },
    { body: t.Object({ tagId: t.Number() }) },
  )
  .delete("/:id/tags/:tagId", async ({ user, params, set }) => {
    const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
    if (!tpl) {
      set.status = 404;
      return { error: "not found" };
    }
    await db
      .update(templateTags)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(
        and(
          eq(templateTags.templateId, tpl.id),
          eq(templateTags.tagId, idParam(params.tagId)),
          isNull(templateTags.archivedAtUTC),
        ),
      );
    return { ok: true };
  })
  .post(
    "/:id/items",
    async ({ user, params, body, set }) => {
      const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
      if (!tpl) {
        set.status = 404;
        return { error: "not found" };
      }
      const itemTagIds = await activeTagIds(body.tagIds ?? []);
      const id = await db.transaction(async (tx) => {
        const [res] = await tx.insert(templateItems).values({
          templateId: tpl.id,
          itemType: body.itemType ?? "todo",
          title: body.title,
          categoryId: body.categoryId ?? null,
          priorityId: body.priorityId ?? null,
          statusId: body.statusId ?? null,
          relativeDueDays: body.relativeDueDays ?? null,
          sortOrder: body.sortOrder ?? 0,
          bodyMd: body.bodyMd ?? null,
          startTimeUTC: body.startTimeUTC ?? null,
          durationMinutes: body.durationMinutes ?? null,
          allDay: body.allDay ?? false,
          location: body.location ?? null,
          descriptionMd: body.descriptionMd ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        if (itemTagIds.length) {
          await tx.insert(templateItemTags).values(
            itemTagIds.map((tagId) => ({
              templateItemId: res.insertId,
              tagId,
              createdAtUTC: nowUtcSql(),
              updatedAtUTC: nowUtcSql(),
            })),
          );
        }
        return res.insertId;
      });
      const row = (await db.select().from(templateItems).where(eq(templateItems.id, id)))[0]!;
      set.status = 201;
      return templateItemDto(row, itemTagIds);
    },
    { body: t.Object(templateItemBody) },
  )
  .patch(
    "/:id/items/:itemId",
    async ({ user, params, body, set }) => {
      const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
      if (!tpl) {
        set.status = 404;
        return { error: "not found" };
      }
      const itemId = idParam(params.itemId);
      await db
        .update(templateItems)
        .set({
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.itemType !== undefined ? { itemType: body.itemType } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.priorityId !== undefined ? { priorityId: body.priorityId } : {}),
          ...(body.statusId !== undefined ? { statusId: body.statusId } : {}),
          ...(body.relativeDueDays !== undefined ? { relativeDueDays: body.relativeDueDays } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.bodyMd !== undefined ? { bodyMd: body.bodyMd } : {}),
          ...(body.startTimeUTC !== undefined ? { startTimeUTC: body.startTimeUTC } : {}),
          ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
          ...(body.allDay !== undefined ? { allDay: body.allDay } : {}),
          ...(body.location !== undefined ? { location: body.location } : {}),
          ...(body.descriptionMd !== undefined ? { descriptionMd: body.descriptionMd } : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, tpl.id)));
      const row = (
        await db
          .select()
          .from(templateItems)
          .where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, tpl.id)))
      )[0];
      if (!row) {
        set.status = 404;
        return { error: "not found" };
      }
      // tagIds replaces the item's tag set: archive removed, restore/insert added
      if (body.tagIds !== undefined) {
        const wanted = new Set(await activeTagIds(body.tagIds));
        const existing = await db
          .select()
          .from(templateItemTags)
          .where(eq(templateItemTags.templateItemId, itemId));
        // handle active rows first so a restore never collides with an active pair
        existing.sort((a, b) => Number(a.archivedAtUTC !== null) - Number(b.archivedAtUTC !== null));
        for (const r of existing) {
          const active = r.archivedAtUTC === null;
          if (active && !wanted.has(r.tagId)) {
            await db
              .update(templateItemTags)
              .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
              .where(eq(templateItemTags.id, r.id));
          } else if (!active && wanted.has(r.tagId)) {
            await db
              .update(templateItemTags)
              .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
              .where(eq(templateItemTags.id, r.id));
          }
          wanted.delete(r.tagId);
        }
        if (wanted.size) {
          await db.insert(templateItemTags).values(
            [...wanted].map((tagId) => ({
              templateItemId: itemId,
              tagId,
              createdAtUTC: nowUtcSql(),
              updatedAtUTC: nowUtcSql(),
            })),
          );
        }
      }
      const tagMap = await templateItemTagIds([row.id]);
      return templateItemDto(row, tagMap.get(row.id) ?? []);
    },
    { body: t.Object({ ...templateItemBody, title: t.Optional(t.String({ minLength: 1, maxLength: 512 })) }) },
  )
  .delete("/:id/items/:itemId", async ({ user, params, set }) => {
    const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
    if (!tpl) {
      set.status = 404;
      return { error: "not found" };
    }
    await db
      .update(templateItems)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(and(eq(templateItems.id, idParam(params.itemId)), eq(templateItems.templateId, tpl.id)));
    return { ok: true };
  })
  .post(
    "/:id/instantiate",
    async ({ user, params, body, set }) => {
      const tpl = await ownTemplate(user!.id, user!.isAdmin, idParam(params.id));
      if (!tpl || tpl.archivedAtUTC) {
        set.status = 404;
        return { error: "not found" };
      }
      const rows = await db
        .select()
        .from(templateItems)
        .where(and(eq(templateItems.templateId, tpl.id), isNull(templateItems.archivedAtUTC)))
        .orderBy(asc(templateItems.sortOrder), asc(templateItems.id));
      if (rows.length === 0) {
        set.status = 400;
        return { error: "template has no items" };
      }
      const base = body.baseDateUTC ? new Date(body.baseDateUTC) : new Date();
      if (Number.isNaN(base.getTime())) {
        set.status = 422;
        return { error: "invalid baseDateUTC" };
      }
      const tagMap = await templateItemTagIds(rows.map((ti) => ti.id));
      const tplTagIds = await templateTagIds(tpl.id);
      const createdIds = await db.transaction(async (tx) => {
        const ids: number[] = [];
        for (const ti of rows) {
          const [res] = await tx.insert(items).values({
            itemType: ti.itemType,
            ownerId: user!.id,
            title: ti.title,
            // template-level category/priority overrides the item's own when set
            categoryId: tpl.categoryId ?? ti.categoryId,
            priorityId: tpl.priorityId ?? ti.priorityId,
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          });
          const offset = new Date(base.getTime() + (ti.relativeDueDays ?? 0) * 86400_000);
          if (ti.itemType === "note") {
            await tx.insert(notes).values({ itemId: res.insertId, bodyMd: ti.bodyMd });
          } else if (ti.itemType === "calendar") {
            const start = new Date(offset);
            if (ti.allDay) {
              start.setUTCHours(0, 0, 0, 0);
            } else if (ti.startTimeUTC) {
              const [h, m, s] = ti.startTimeUTC.split(":").map(Number);
              start.setUTCHours(h ?? 0, m ?? 0, s ?? 0, 0);
            }
            const end =
              !ti.allDay && ti.durationMinutes
                ? new Date(start.getTime() + ti.durationMinutes * 60_000)
                : null;
            await tx.insert(calendarItems).values({
              itemId: res.insertId,
              startAtUTC: toSqlUtc(start),
              endAtUTC: end ? toSqlUtc(end) : null,
              allDay: ti.allDay,
              location: ti.location,
              descriptionMd: ti.descriptionMd,
            });
          } else {
            const due = ti.relativeDueDays !== null ? toSqlUtc(offset) : null;
            await tx.insert(todos).values({ itemId: res.insertId, dueAtUTC: due, statusId: ti.statusId });
          }
          // tags: template-level tags + this item's own tags
          const tagIds = [...new Set([...tplTagIds, ...(tagMap.get(ti.id) ?? [])])];
          if (tagIds.length) {
            await tx.insert(itemTags).values(
              tagIds.map((tagId) => ({
                itemId: res.insertId,
                tagId,
                createdAtUTC: nowUtcSql(),
                updatedAtUTC: nowUtcSql(),
              })),
            );
          }
          ids.push(res.insertId);
        }
        // link all items from this instantiation together (every pair)
        if (ids.length > 1) {
          const pairs: { fromItemId: number; toItemId: number }[] = [];
          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              pairs.push({ fromItemId: ids[i]!, toItemId: ids[j]! });
            }
          }
          await tx.insert(itemLinks).values(
            pairs.map((p) => ({
              ...p,
              linkType: "template",
              createdAtUTC: nowUtcSql(),
              updatedAtUTC: nowUtcSql(),
            })),
          );
        }
        return ids;
      });
      set.status = 201;
      return { createdItemIds: createdIds };
    },
    { body: t.Object({ baseDateUTC: t.Optional(t.String({ format: "date-time" })) }) },
  );
