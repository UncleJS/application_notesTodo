import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { ensureTestDb, truncateAll, seedBaseFixtures, makeSession, type Fixtures } from "./setup";
import { call, makeApp, type TestApp } from "./helpers";

let app: TestApp;
let fx: Fixtures;

beforeAll(async () => {
  await ensureTestDb();
  app = makeApp();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
});

describe("auth flow", () => {
  it("login with valid credentials returns token + user", async () => {
    const res = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "admin" },
    });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
  });

  it("login with bad password → 401", async () => {
    const res = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("archived user cannot log in", async () => {
    await db.execute(sql`UPDATE users SET archived_at_UTC = UTC_TIMESTAMP() WHERE id = ${fx.userId}`);
    const res = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "admin" },
    });
    expect(res.status).toBe(401);
  });

  it("bearer token works against a protected route", async () => {
    const token = await makeSession(fx.userId);
    const res = await call(app, "GET", "/api/v1/auth/me", { token });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
  });

  it("archived user's existing session stops working", async () => {
    const token = await makeSession(fx.userId);
    await db.execute(sql`UPDATE users SET archived_at_UTC = UTC_TIMESTAMP() WHERE id = ${fx.userId}`);
    const res = await call(app, "GET", "/api/v1/auth/me", { token });
    expect(res.status).toBe(401);
  });

  it("no token → 401", async () => {
    const res = await call(app, "GET", "/api/v1/todos");
    expect(res.status).toBe(401);
  });

  it("admin route rejects non-admin → 403", async () => {
    const token = await makeSession(fx.userId);
    const res = await call(app, "GET", "/api/v1/admin/users", { token });
    expect(res.status).toBe(403);
  });
});
