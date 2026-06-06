import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { ensureTestDb, truncateAll, seedBaseFixtures, makeSession, type Fixtures } from "./setup";
import { call, makeApp, type TestApp } from "./helpers";

let app: TestApp;
let fx: Fixtures;
let token: string;

beforeAll(async () => {
  await ensureTestDb();
  app = makeApp();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
  token = await makeSession(fx.userId);
});

describe("id param validation", () => {
  it.each(["abc", "0", "-5", "1.5", "9999999999999999999999"])("GET /api/v1/notes/%s → 404", async (bad) => {
    const res = await call(app, "GET", `/api/v1/notes/${bad}`, { token });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("DELETE with junk id → 404, not 500", async () => {
    const res = await call(app, "DELETE", "/api/v1/todos/junk", { token });
    expect(res.status).toBe(404);
  });
});

describe("lookup id validation", () => {
  it("create note with unknown categoryId → 422", async () => {
    const res = await call(app, "POST", "/api/v1/notes", {
      token,
      json: { title: "x", categoryId: 999999 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("categoryId");
  });

  it("create todo with unknown statusId → 422", async () => {
    const res = await call(app, "POST", "/api/v1/todos", {
      token,
      json: { title: "x", statusId: 999999 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("statusId");
  });

  it("valid lookups pass", async () => {
    const res = await call(app, "POST", "/api/v1/todos", {
      token,
      json: { title: "x", categoryId: fx.categoryId, priorityId: fx.priorityId, statusId: fx.statusId },
    });
    expect(res.status).toBe(201);
    expect(res.body.categoryId).toBe(fx.categoryId);
  });

  it("patch note to unknown priorityId → 422", async () => {
    const created = await call(app, "POST", "/api/v1/notes", { token, json: { title: "n" } });
    const res = await call(app, "PATCH", `/api/v1/notes/${created.body.id}`, {
      token,
      json: { priorityId: 999999 },
    });
    expect(res.status).toBe(422);
  });
});

describe("calendar rrule validation", () => {
  const start = "2026-06-01T09:00:00Z";

  it("create with invalid rrule → 422", async () => {
    const res = await call(app, "POST", "/api/v1/calendar/items", {
      token,
      json: { title: "e", startAtUTC: start, rrule: "FREQ=NOPE" },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("invalid recurrence rule");
  });

  it("create with rrule lacking FREQ → 422", async () => {
    const res = await call(app, "POST", "/api/v1/calendar/items", {
      token,
      json: { title: "e", startAtUTC: start, rrule: "COUNT=3" },
    });
    expect(res.status).toBe(422);
  });

  it("create with valid rrule → 201 and expands", async () => {
    const res = await call(app, "POST", "/api/v1/calendar/items", {
      token,
      json: { title: "standup", startAtUTC: start, rrule: "FREQ=DAILY;COUNT=5" },
    });
    expect(res.status).toBe(201);
    const list = await call(
      app,
      "GET",
      "/api/v1/calendar?from=2026-06-01T00:00:00Z&to=2026-06-08T00:00:00Z",
      { token },
    );
    expect(list.status).toBe(200);
    expect(list.body.filter((o: { itemId: number }) => o.itemId === res.body.id)).toHaveLength(5);
  });

  it("patch to invalid rrule → 422", async () => {
    const created = await call(app, "POST", "/api/v1/calendar/items", {
      token,
      json: { title: "e", startAtUTC: start },
    });
    const res = await call(app, "PATCH", `/api/v1/calendar/items/${created.body.id}`, {
      token,
      json: { rrule: "garbage" },
    });
    expect(res.status).toBe(422);
  });
});
