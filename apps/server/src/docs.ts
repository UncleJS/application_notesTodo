import { Elysia } from "elysia";
import { join } from "node:path";
import { parse } from "yaml";
// @ts-expect-error swagger-ui-dist ships no types
import { getAbsoluteFSPath } from "swagger-ui-dist";
import { getSessionUser } from "./services/session";
import { sessionIdFrom } from "./middleware/auth";

// Spec-first: packages/spec/openapi.yaml is the source of truth.
const SPEC_PATH = join(import.meta.dir, "../../../packages/spec/openapi.yaml");
const swaggerDir: string = getAbsoluteFSPath();
const IS_PROD = process.env.APP_ENV === "production";

const docsHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NotesTodo API docs</title>
  <link rel="stylesheet" href="/docs/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/docs/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });
  </script>
</body>
</html>`;

export const docs = new Elysia()
  // production: docs stay enabled but require an authenticated session
  .onBeforeHandle(async ({ path, cookie, headers, set }) => {
    if (!IS_PROD) return;
    if (path !== "/docs" && path !== "/openapi.json" && !path.startsWith("/docs/")) return;
    const user = await getSessionUser(sessionIdFrom(cookie, headers));
    if (!user) {
      set.status = 401;
      return { error: "unauthorized — log in to view API docs" };
    }
  })
  .get("/openapi.json", async () => parse(await Bun.file(SPEC_PATH).text()))
  .get(
    "/docs",
    () => new Response(docsHtml, { headers: { "content-type": "text/html; charset=utf-8" } }),
  )
  .get("/docs/swagger-ui.css", () => Bun.file(join(swaggerDir, "swagger-ui.css")))
  .get("/docs/swagger-ui-bundle.js", () => Bun.file(join(swaggerDir, "swagger-ui-bundle.js")));
