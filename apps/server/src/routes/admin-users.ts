import { Elysia, t } from "elysia";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema/auth";
import { requireAdmin } from "../middleware/auth";
import { nowUtcSql, sqlToIso } from "../lib/time";
import { isDupEntry } from "../lib/dbErrors";

function userDto(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    isAdmin: u.isAdmin,
    lastLoginAtUTC: sqlToIso(u.lastLoginAtUTC),
    createdAtUTC: sqlToIso(u.createdAtUTC),
    archivedAtUTC: sqlToIso(u.archivedAtUTC),
  };
}

const userBody = t.Object({
  username: t.String({ minLength: 1, maxLength: 64 }),
  password: t.String({ minLength: 4 }),
  displayName: t.Optional(t.Nullable(t.String({ maxLength: 128 }))),
  email: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  isAdmin: t.Optional(t.Boolean()),
});

export const adminUserRoutes = new Elysia({ prefix: "/api/v1/admin/users" })
  .use(requireAdmin)
  .get(
    "/",
    async ({ query }) => {
      const rows = query.includeArchived === "true"
        ? await db.select().from(users)
        : await db.select().from(users).where(isNull(users.archivedAtUTC));
      return rows.map(userDto);
    },
    { query: t.Object({ includeArchived: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ body, set }) => {
      const passwordHash = await Bun.password.hash(body.password);
      try {
        const [res] = await db.insert(users).values({
          username: body.username,
          passwordHash,
          displayName: body.displayName ?? null,
          email: body.email ?? null,
          isAdmin: body.isAdmin ?? false,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        const row = (await db.select().from(users).where(eq(users.id, res.insertId)))[0]!;
        set.status = 201;
        return userDto(row);
      } catch (err: unknown) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "username already in use" };
        }
        throw err;
      }
    },
    { body: userBody },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const id = Number(params.id);
      await db
        .update(users)
        .set({
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(users.id, id));
      const row = (await db.select().from(users).where(eq(users.id, id)))[0];
      if (!row) {
        set.status = 404;
        return { error: "not found" };
      }
      return userDto(row);
    },
    {
      body: t.Object({
        displayName: t.Optional(t.Nullable(t.String({ maxLength: 128 }))),
        email: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        isAdmin: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/:id/reset-password",
    async ({ params, body }) => {
      const passwordHash = await Bun.password.hash(body.password);
      const id = Number(params.id);
      await db.update(users).set({ passwordHash, updatedAtUTC: nowUtcSql() }).where(eq(users.id, id));
      await db.delete(sessions).where(eq(sessions.userId, id)); // force re-login
      return { ok: true };
    },
    { body: t.Object({ password: t.String({ minLength: 4 }) }) },
  )
  .delete("/:id", async ({ params, user, set }) => {
    const id = Number(params.id);
    if (id === user!.id) {
      set.status = 400;
      return { error: "cannot archive yourself" };
    }
    await db.update(users).set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() }).where(eq(users.id, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    return { ok: true };
  })
  .post("/:id/restore", async ({ params, set }) => {
    const id = Number(params.id);
    try {
      await db.update(users).set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() }).where(eq(users.id, id));
    } catch (err: unknown) {
      if (isDupEntry(err)) {
        set.status = 409;
        return { error: "an active user already has this username" };
      }
      throw err;
    }
    return { ok: true };
  });
