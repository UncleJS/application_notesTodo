import { Elysia, t } from "elysia";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema/auth";
import { createSession, destroySession } from "../services/session";
import { requireAuth } from "../middleware/auth";
import { nowUtcSql } from "../lib/time";

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
  .post(
    "/login",
    async ({ body, cookie, set }) => {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.username, body.username), isNull(users.archivedAtUTC)))
        .limit(1);
      const user = rows[0];
      if (!user || !(await Bun.password.verify(body.password, user.passwordHash))) {
        set.status = 401;
        return { error: "invalid credentials" };
      }
      await db
        .update(users)
        .set({ lastLoginAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
        .where(eq(users.id, user.id));
      const session = await createSession(user.id);
      cookie.sid!.set({
        value: session.id,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: session.maxAge,
      });
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    },
  )
  .post("/logout", async ({ cookie }) => {
    const sid = cookie.sid?.value as string | undefined;
    if (sid) await destroySession(sid);
    cookie.sid?.remove();
    return { ok: true };
  })
  .use(requireAuth)
  .get("/me", ({ user }) => user!)
  .post(
    "/change-password",
    async ({ user, body, set }) => {
      const row = (await db.select().from(users).where(eq(users.id, user!.id)))[0];
      if (!row || !(await Bun.password.verify(body.currentPassword, row.passwordHash))) {
        set.status = 401;
        return { error: "current password is incorrect" };
      }
      await db
        .update(users)
        .set({ passwordHash: await Bun.password.hash(body.newPassword), updatedAtUTC: nowUtcSql() })
        .where(eq(users.id, user!.id));
      return { ok: true };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 4 }),
      }),
    },
  )
  .patch(
    "/me",
    async ({ user, body }) => {
      await db
        .update(users)
        .set({
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(users.id, user!.id));
      const row = (await db.select().from(users).where(eq(users.id, user!.id)))[0]!;
      return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        email: row.email,
        isAdmin: row.isAdmin,
      };
    },
    {
      body: t.Object({
        displayName: t.Optional(t.Nullable(t.String({ maxLength: 128 }))),
        email: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  );
