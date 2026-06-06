import { Elysia } from "elysia";
import { getSessionUser } from "../services/session";

/**
 * Session id from the `sid` cookie, or — fallback for browsers whose privacy
 * settings/extensions block cookies on plain-HTTP LAN origins — from an
 * `Authorization: Bearer <sid>` header. Both carry the same server-side
 * session id; the cookie (httpOnly) remains the primary mechanism.
 */
export function sessionIdFrom(
  cookie: Record<string, { value?: unknown } | undefined>,
  headers: Record<string, string | undefined>,
): string | undefined {
  const fromCookie = cookie.sid?.value as string | undefined;
  if (fromCookie) return fromCookie;
  const auth = headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
}

/**
 * Resolves the session user from the `sid` cookie (or bearer fallback) and
 * rejects unauthenticated requests. Use `requireAdmin` for admin-only groups.
 */
export const requireAuth = new Elysia({ name: "require-auth" })
  .derive({ as: "scoped" }, async ({ cookie, headers }) => ({
    user: await getSessionUser(sessionIdFrom(cookie, headers)),
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
  .derive({ as: "scoped" }, async ({ cookie, headers }) => ({
    user: await getSessionUser(sessionIdFrom(cookie, headers)),
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
