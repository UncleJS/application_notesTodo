import { Elysia, t } from "elysia";
import { idParam } from "../lib/params";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { groupMembers, groups, users } from "../db/schema/auth";
import { requireAdmin } from "../middleware/auth";
import { nowUtcSql, sqlToIso } from "../lib/time";
import { isDupEntry } from "../lib/dbErrors";

function groupDto(g: typeof groups.$inferSelect) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    createdAtUTC: sqlToIso(g.createdAtUTC),
    archivedAtUTC: sqlToIso(g.archivedAtUTC),
  };
}

export const adminGroupRoutes = new Elysia({ prefix: "/api/v1/admin/groups" })
  .use(requireAdmin)
  .get(
    "/",
    async ({ query }) => {
      const rows = query.includeArchived === "true"
        ? await db.select().from(groups)
        : await db.select().from(groups).where(isNull(groups.archivedAtUTC));
      return rows.map(groupDto);
    },
    { query: t.Object({ includeArchived: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const [res] = await db.insert(groups).values({
          name: body.name,
          description: body.description ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        const row = (await db.select().from(groups).where(eq(groups.id, res.insertId)))[0]!;
        set.status = 201;
        return groupDto(row);
      } catch (err: unknown) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "group name already in use" };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 128 }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 512 }))),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const id = idParam(params.id);
      await db
        .update(groups)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(groups.id, id));
      const row = (await db.select().from(groups).where(eq(groups.id, id)))[0];
      if (!row) {
        set.status = 404;
        return { error: "not found" };
      }
      return groupDto(row);
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
        description: t.Optional(t.Nullable(t.String({ maxLength: 512 }))),
      }),
    },
  )
  .delete("/:id", async ({ params }) => {
    await db
      .update(groups)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(groups.id, idParam(params.id)));
    return { ok: true };
  })
  .post("/:id/restore", async ({ params, set }) => {
    try {
      await db
        .update(groups)
        .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
        .where(eq(groups.id, idParam(params.id)));
    } catch (err: unknown) {
      if (isDupEntry(err)) {
        set.status = 409;
        return { error: "an active group already has this name" };
      }
      throw err;
    }
    return { ok: true };
  })
  .get("/:id/members", async ({ params }) => {
    const rows = await db
      .select({
        id: groupMembers.id,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(and(eq(groupMembers.groupId, idParam(params.id)), isNull(groupMembers.archivedAtUTC)));
    return rows;
  })
  .post(
    "/:id/members",
    async ({ params, body, set }) => {
      const groupId = idParam(params.id);
      // restore an archived membership if one exists, else insert
      const existing = (
        await db
          .select()
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, body.userId)))
      ).find((m) => m.archivedAtUTC !== null);
      try {
        if (existing) {
          await db
            .update(groupMembers)
            .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
            .where(eq(groupMembers.id, existing.id));
        } else {
          await db.insert(groupMembers).values({
            groupId,
            userId: body.userId,
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          });
        }
      } catch (err: unknown) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "user is already a member" };
        }
        throw err;
      }
      set.status = 201;
      return { ok: true };
    },
    { body: t.Object({ userId: t.Number() }) },
  )
  .delete("/:id/members/:userId", async ({ params }) => {
    await db
      .update(groupMembers)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(
        and(
          eq(groupMembers.groupId, idParam(params.id)),
          eq(groupMembers.userId, idParam(params.userId)),
          isNull(groupMembers.archivedAtUTC),
        ),
      );
    return { ok: true };
  });
