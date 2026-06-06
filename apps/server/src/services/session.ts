import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema/auth";
import { nowUtcSql } from "../lib/time";

const SESSION_DAYS = 30;

export interface SessionUser {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
}

export async function getSessionUser(sid: string | undefined): Promise<SessionUser | null> {
  if (!sid) return null;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAtUTC, nowUtcSql()), isNull(users.archivedAtUTC)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSession(userId: number): Promise<{ id: string; maxAge: number }> {
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    id,
    userId,
    expiresAtUTC: expires.toISOString().slice(0, 19).replace("T", " "),
    createdAtUTC: nowUtcSql(),
    lastSeenAtUTC: nowUtcSql(),
  });
  return { id, maxAge: SESSION_DAYS * 86400 };
}

export async function destroySession(sid: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sid));
}

/** Hard-delete expired sessions (system rows — exempt from archive-only rule). */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAtUTC, nowUtcSql()));
}
