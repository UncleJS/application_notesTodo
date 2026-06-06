import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { resetRateLimits } from "../lib/rateLimit";
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
  resetRateLimits();
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

describe("login rate limiting", () => {
  it("locks the username after 10 failures, even for the right password", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await call(app, "POST", "/api/v1/auth/login", {
        json: { username: "alice", password: "wrong" },
      });
      expect(res.status).toBe(401);
    }
    const limited = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "admin" },
    });
    expect(limited.status).toBe(429);
    // other usernames are unaffected
    const other = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "bob", password: "admin" },
    });
    expect(other.status).toBe(200);
  });

  it("a successful login resets the failure budget", async () => {
    for (let i = 0; i < 9; i++) {
      await call(app, "POST", "/api/v1/auth/login", { json: { username: "alice", password: "wrong" } });
    }
    const ok = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "admin" },
    });
    expect(ok.status).toBe(200);
    const after = await call(app, "POST", "/api/v1/auth/login", {
      json: { username: "alice", password: "wrong" },
    });
    expect(after.status).toBe(401); // budget reset — failing again is 401, not 429
  });
});

describe("admin user archive cascade", () => {
  it("archives the user's items, disables their reminders and kills sessions", async () => {
    const aliceToken = await makeSession(fx.userId);
    const todo = await call(app, "POST", "/api/v1/todos", { token: aliceToken, json: { title: "t" } });
    const note = await call(app, "POST", "/api/v1/notes", { token: aliceToken, json: { title: "n" } });
    await call(app, "POST", `/api/v1/items/${todo.body.id}/reminders`, {
      token: aliceToken,
      json: { remindAtUTC: "2030-01-01T00:00:00Z", channels: ["email"] },
    });

    const adminToken = await makeSession(fx.adminId);
    const res = await call(app, "DELETE", `/api/v1/admin/users/${fx.userId}`, { token: adminToken });
    expect(res.status).toBe(200);

    // session revoked
    expect((await call(app, "GET", "/api/v1/auth/me", { token: aliceToken })).status).toBe(401);
    // items archived (admin sees them as owner)
    const archivedTodo = await call(app, "GET", `/api/v1/todos/${todo.body.id}`, { token: adminToken });
    expect(archivedTodo.body.archivedAtUTC).not.toBeNull();
    const archivedNote = await call(app, "GET", `/api/v1/notes/${note.body.id}`, { token: adminToken });
    expect(archivedNote.body.archivedAtUTC).not.toBeNull();
    // reminders disabled
    const reminders = await call(app, "GET", `/api/v1/items/${todo.body.id}/reminders`, { token: adminToken });
    expect(reminders.body.every((r: { enabled: boolean }) => r.enabled === false)).toBe(true);
    // restoring the user does NOT restore items
    await call(app, "POST", `/api/v1/admin/users/${fx.userId}/restore`, { token: adminToken });
    const stillArchived = await call(app, "GET", `/api/v1/todos/${todo.body.id}`, { token: adminToken });
    expect(stillArchived.body.archivedAtUTC).not.toBeNull();
  });
});
