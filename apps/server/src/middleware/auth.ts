import { Elysia } from "elysia";
import { getSessionUser } from "../services/session";

/**
 * Resolves the session user from the `sid` cookie and rejects
 * unauthenticated requests. Use `requireAdmin` for admin-only route groups.
 */
export const requireAuth = new Elysia({ name: "require-auth" })
  .derive({ as: "scoped" }, async ({ cookie }) => ({
    user: await getSessionUser(cookie.sid?.value as string | undefined),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "unauthorized" };
    }
  });

// Self-contained (not composed from requireAuth): `as: "scoped"` context only
// lifts one level, so a nested plugin's derive would not reach the route group.
export const requireAdmin = new Elysia({ name: "require-admin" })
  .derive({ as: "scoped" }, async ({ cookie }) => ({
    user: await getSessionUser(cookie.sid?.value as string | undefined),
  }))
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "unauthorized" };
    }
    if (!user.isAdmin) {
      set.status = 403;
      return { error: "forbidden" };
    }
  });
