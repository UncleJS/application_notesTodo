import { Elysia, t } from "elysia";
import { idParam } from "../lib/params";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { itemTags, tags } from "../db/schema/linksTags";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess } from "../services/itemAccess";
import { isDupEntry } from "../lib/dbErrors";
import { itemAuditMeta, recordAudit } from "../services/audit";
import { nowUtcSql, sqlToIso } from "../lib/time";

function tagDto(r: typeof tags.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    createdAtUTC: sqlToIso(r.createdAtUTC),
    archivedAtUTC: sqlToIso(r.archivedAtUTC),
  };
}

export const tagRoutes = new Elysia({ prefix: "/api/v1/tags" })
  .use(requireAuth)
  .get(
    "/",
    async ({ query }) => {
      const rows =
        query.includeArchived === "true"
          ? await db.select().from(tags).orderBy(asc(tags.name))
          : await db.select().from(tags).where(isNull(tags.archivedAtUTC)).orderBy(asc(tags.name));
      return rows.map(tagDto);
    },
    { query: t.Object({ includeArchived: t.Optional(t.String()) }) },
  )
  // any authenticated user can add to the shared tag pool
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [res] = await db.insert(tags).values({
          name: body.name,
          color: body.color ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        const row = (await db.select().from(tags).where(eq(tags.id, res.insertId)))[0]!;
        set.status = 201;
        return tagDto(row);
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "tag already exists" };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 64 }),
        color: t.Optional(t.Nullable(t.String({ maxLength: 16 }))),
      }),
    },
  )
  // archive/restore/rename of the shared pool is admin-only
  .use(requireAdmin)
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        await db
          .update(tags)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            updatedAtUTC: nowUtcSql(),
          })
          .where(eq(tags.id, idParam(params.id)));
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "tag already exists" };
        }
        throw err;
      }
      const row = (await db.select().from(tags).where(eq(tags.id, idParam(params.id))))[0];
      if (!row) {
        set.status = 404;
        return { error: "not found" };
      }
      return tagDto(row);
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
        color: t.Optional(t.Nullable(t.String({ maxLength: 16 }))),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    await db
      .update(tags)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(tags.id, idParam(params.id)));
    return { ok: true };
  })
  .post("/:id/restore", async ({ params, set }) => {
    try {
      await db
        .update(tags)
        .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
        .where(eq(tags.id, idParam(params.id)));
    } catch (err) {
      if (isDupEntry(err)) {
        set.status = 409;
        return { error: "an active tag already has this name" };
      }
      throw err;
    }
    return { ok: true };
  });

export const itemTagRoutes = new Elysia({ prefix: "/api/v1/items" })
  .use(requireAuth)
  .post(
    "/:id/tags",
    async ({ user, params, body, set }) => {
      const itemId = idParam(params.id);
      const access = await getItemAccess(user!, itemId);
      if (!atLeast(access, "edit")) {
        set.status = access === null ? 404 : 403;
        return { error: access === null ? "not found" : "forbidden" };
      }
      // restore an archived attachment if present, else insert
      const archived = (
        await db
          .select()
          .from(itemTags)
          .where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, body.tagId)))
      ).find((r) => r.archivedAtUTC !== null);
      const meta = await itemAuditMeta(itemId);
      try {
        await db.transaction(async (tx) => {
          if (archived) {
            await tx
              .update(itemTags)
              .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
              .where(eq(itemTags.id, archived.id));
          } else {
            await tx.insert(itemTags).values({
              itemId,
              tagId: body.tagId,
              createdAtUTC: nowUtcSql(),
              updatedAtUTC: nowUtcSql(),
            });
          }
          if (meta) {
            await recordAudit(tx, {
              itemId,
              itemType: meta.itemType,
              actorUserId: user!.id,
              action: "tag_add",
              changes: [{ field: "tagId", old: null, new: body.tagId }],
              categoryId: meta.categoryId,
              priorityId: meta.priorityId,
            });
          }
        });
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
    const itemId = idParam(params.id);
    const access = await getItemAccess(user!, itemId);
    if (!atLeast(access, "edit")) {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "forbidden" };
    }
    const tagId = idParam(params.tagId);
    const meta = await itemAuditMeta(itemId);
    await db.transaction(async (tx) => {
      await tx
        .update(itemTags)
        .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
        .where(
          and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId), isNull(itemTags.archivedAtUTC)),
        );
      if (meta) {
        await recordAudit(tx, {
          itemId,
          itemType: meta.itemType,
          actorUserId: user!.id,
          action: "tag_remove",
          changes: [{ field: "tagId", old: tagId, new: null }],
          categoryId: meta.categoryId,
          priorityId: meta.priorityId,
        });
      }
    });
    return { ok: true };
  });
