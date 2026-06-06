import { Elysia } from "elysia";
import { onAppError } from "./lib/onError";
import { docs } from "./docs";
import { health } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { adminUserRoutes } from "./routes/admin-users";
import { adminGroupRoutes } from "./routes/admin-groups";
import { categoryRoutes, priorityRoutes, statusRoutes } from "./routes/lookups";
import { noteRoutes } from "./routes/notes";
import { todoRoutes } from "./routes/todos";
import { bulkRoutes } from "./routes/bulk";
import { calendarRoutes } from "./routes/calendar";
import { itemTagRoutes, tagRoutes } from "./routes/tags";
import { itemRoutes, linkRoutes } from "./routes/links";
import { templateRoutes } from "./routes/templates";
import { directoryRoutes, shareRoutes } from "./routes/shares";
import { reminderRoutes } from "./routes/reminders";
import { settingsRoutes } from "./routes/settings";
import { startReminderWorker } from "./scheduler/reminderWorker";
import { pruneExpiredSessions } from "./services/session";

const port = Number(process.env.APP_PORT ?? 8080);

const app = new Elysia()
  .onError(onAppError)
  .use(docs)
  .use(health)
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
  // production: serve the built SPA (apps/web/dist) with index.html fallback
  .get("/*", async ({ path, set }) => {
    if (process.env.APP_ENV !== "production" || path.startsWith("/api/")) {
      set.status = 404;
      return { error: "not found" };
    }
    const distDir = new URL("../../web/dist", import.meta.url).pathname;
    const safePath = path.replaceAll("..", "");
    const file = Bun.file(`${distDir}${safePath === "/" ? "/index.html" : safePath}`);
    if (await file.exists()) return file;
    return Bun.file(`${distDir}/index.html`);
  })
  .listen({ hostname: "0.0.0.0", port });

console.log(`NotesTodo API listening on :${port} — docs at /docs`);

startReminderWorker();
setInterval(() => void pruneExpiredSessions().catch(() => {}), 3600_000);

export type App = typeof app;
