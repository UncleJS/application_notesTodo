import { Elysia, t } from "elysia";
import { idParam } from "../lib/params";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { groups, users } from "../db/schema/auth";
import { itemShares } from "../db/schema/shares";
import { requireAuth } from "../middleware/auth";
import { getItemAccess } from "../services/itemAccess";
import { isDupEntry } from "../lib/dbErrors";
import { nowUtcSql } from "../lib/time";

// Lightweight directory endpoints so any user can pick share targets.
export const directoryRoutes = new Elysia({ prefix: "/api/v1/directory" })
  .use(requireAuth)
  .get("/users", async () => {
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(isNull(users.archivedAtUTC));
    return rows;
  })
  .get("/groups", async () => {
    const rows = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(isNull(groups.archivedAtUTC));
    return rows;
  });

export const shareRoutes = new Elysia({ prefix: "/api/v1" })
  .use(requireAuth)
  .get("/items/:id/shares", async ({ user, params, set }) => {
    const itemId = idParam(params.id);
    const access = await getItemAccess(user!, itemId);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can view shares" };
    }
    const rows = await db
      .select({
        id: itemShares.id,
        level: itemShares.level,
        userId: itemShares.userId,
        groupId: itemShares.groupId,
        username: users.username,
        userDisplayName: users.displayName,
        groupName: groups.name,
      })
      .from(itemShares)
      .leftJoin(users, eq(users.id, itemShares.userId))
      .leftJoin(groups, eq(groups.id, itemShares.groupId))
      .where(and(eq(itemShares.itemId, itemId), isNull(itemShares.archivedAtUTC)));
    return rows.map((r) => ({
      id: r.id,
      level: r.level,
      grantee: r.userId
        ? { type: "user" as const, id: r.userId, name: r.userDisplayName ?? r.username ?? `#${r.userId}` }
        : { type: "group" as const, id: r.groupId!, name: r.groupName ?? `#${r.groupId}` },
    }));
  })
  .post(
    "/items/:id/shares",
    async ({ user, params, body, set }) => {
      const itemId = idParam(params.id);
      const access = await getItemAccess(user!, itemId);
      if (access !== "owner") {
        set.status = access === null ? 404 : 403;
        return { error: access === null ? "not found" : "only the owner can share" };
      }
      if (body.granteeType === "user" && body.granteeId === user!.id) {
        set.status = 400;
        return { error: "cannot share with yourself" };
      }
      // validate the grantee exists and is active before touching item_shares
      const grantee =
        body.granteeType === "user"
          ? await db
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.id, body.granteeId), isNull(users.archivedAtUTC)))
              .limit(1)
          : await db
              .select({ id: groups.id })
              .from(groups)
              .where(and(eq(groups.id, body.granteeId), isNull(groups.archivedAtUTC)))
              .limit(1);
      if (!grantee.length) {
        set.status = 404;
        return { error: body.granteeType === "user" ? "user not found" : "group not found" };
      }
      const granteeCol = body.granteeType === "user" ? itemShares.userId : itemShares.groupId;
      // restore an archived grant for this grantee if present, else insert
      const archived = (
        await db
          .select()
          .from(itemShares)
          .where(and(eq(itemShares.itemId, itemId), eq(granteeCol, body.granteeId)))
      ).find((r) => r.archivedAtUTC !== null);
      try {
        if (archived) {
          await db
            .update(itemShares)
            .set({ archivedAtUTC: null, level: body.level, updatedAtUTC: nowUtcSql() })
            .where(eq(itemShares.id, archived.id));
        } else {
          await db.insert(itemShares).values({
            itemId,
            userId: body.granteeType === "user" ? body.granteeId : null,
            groupId: body.granteeType === "group" ? body.granteeId : null,
            level: body.level,
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          });
        }
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "already shared with this grantee" };
        }
        throw err;
      }
      set.status = 201;
      return { ok: true };
    },
    {
      body: t.Object({
        granteeType: t.Union([t.Literal("user"), t.Literal("group")]),
        granteeId: t.Number(),
        level: t.Union([t.Literal("view"), t.Literal("edit")]),
      }),
    },
  )
  .patch(
    "/shares/:id",
    async ({ user, params, body, set }) => {
      const share = (await db.select().from(itemShares).where(eq(itemShares.id, idParam(params.id))))[0];
      if (!share) {
        set.status = 404;
        return { error: "not found" };
      }
      const access = await getItemAccess(user!, share.itemId);
      if (access !== "owner") {
        set.status = 403;
        return { error: "only the owner can change shares" };
      }
      await db
        .update(itemShares)
        .set({ level: body.level, updatedAtUTC: nowUtcSql() })
        .where(eq(itemShares.id, share.id));
      return { ok: true };
    },
    { body: t.Object({ level: t.Union([t.Literal("view"), t.Literal("edit")]) }) },
  )
  .delete("/shares/:id", async ({ user, params, set }) => {
    const share = (await db.select().from(itemShares).where(eq(itemShares.id, idParam(params.id))))[0];
    if (!share) {
      set.status = 404;
      return { error: "not found" };
    }
    const access = await getItemAccess(user!, share.itemId);
    if (access !== "owner") {
      set.status = 403;
      return { error: "only the owner can remove shares" };
    }
    await db
      .update(itemShares)
      .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(itemShares.id, share.id));
    return { ok: true };
  });
