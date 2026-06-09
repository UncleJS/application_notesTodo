import { Elysia } from "elysia";
import { onAppError } from "../lib/onError";
import { authRoutes } from "../routes/auth";
import { adminUserRoutes } from "../routes/admin-users";
import { adminGroupRoutes } from "../routes/admin-groups";
import { categoryRoutes, priorityRoutes, statusRoutes } from "../routes/lookups";
import { noteRoutes } from "../routes/notes";
import { todoRoutes } from "../routes/todos";
import { bulkRoutes } from "../routes/bulk";
import { calendarRoutes } from "../routes/calendar";
import { itemTagRoutes, tagRoutes } from "../routes/tags";
import { itemRoutes, linkRoutes } from "../routes/links";
import { templateRoutes } from "../routes/templates";
import { directoryRoutes, shareRoutes } from "../routes/shares";
import { reminderRoutes } from "../routes/reminders";
import { settingsRoutes } from "../routes/settings";
import { adminAuditRoutes, auditRoutes } from "../routes/audit";

/** Same route composition + error handler as index.ts, without listen(). */
export function makeApp() {
  return new Elysia()
    .onError(onAppError)
    .use(authRoutes)
    .use(adminUserRoutes)
    .use(adminGroupRoutes)
    .use(categoryRoutes)
    .use(priorityRoutes)
    .use(statusRoutes)
    .use(noteRoutes)
    .use(todoRoutes)
    .use(bulkRoutes)
    .use(calendarRoutes)
    .use(tagRoutes)
    .use(itemTagRoutes)
    .use(itemRoutes)
    .use(linkRoutes)
    .use(templateRoutes)
    .use(directoryRoutes)
    .use(shareRoutes)
    .use(reminderRoutes)
    .use(settingsRoutes)
    .use(auditRoutes)
    .use(adminAuditRoutes);
}

export type TestApp = ReturnType<typeof makeApp>;

interface CallOptions {
  token?: string;
  json?: unknown;
}

/** In-process request against the app — no network, no listen(). */
export async function call(
  app: TestApp,
  method: string,
  path: string,
  opts: CallOptions = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  const res = await app.handle(
    new Request(`http://test${path}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    }),
  );
  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}
