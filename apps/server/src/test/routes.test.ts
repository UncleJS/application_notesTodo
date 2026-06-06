import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { calendarItems } from "../db/schema/items";
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
    expect(list.body.warnings).toEqual([]);
    expect(list.body.occurrences.filter((o: { itemId: number }) => o.itemId === res.body.id)).toHaveLength(5);
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

  it("stored broken rrule surfaces as a warning, not a silent skip", async () => {
    const created = await call(app, "POST", "/api/v1/calendar/items", {
      token,
      json: { title: "legacy", startAtUTC: start },
    });
    // sneak a corrupt rule past write validation, as a legacy row would be
    await db
      .update(calendarItems)
      .set({ rrule: "FREQ=WEEKLY;BYDAY=XX" })
      .where(eq(calendarItems.itemId, created.body.id));
    const list = await call(
      app,
      "GET",
      "/api/v1/calendar?from=2026-06-01T00:00:00Z&to=2026-06-08T00:00:00Z",
      { token },
    );
    expect(list.status).toBe(200);
    expect(list.body.warnings).toHaveLength(1);
    expect(list.body.warnings[0].itemId).toBe(created.body.id);
    expect(list.body.warnings[0].title).toBe("legacy");
    expect(list.body.occurrences.filter((o: { itemId: number }) => o.itemId === created.body.id)).toHaveLength(0);
  });
});

describe("optimistic locking", () => {
  it("PATCH with stale expectedUpdatedAtUTC → 409; current timestamp → 200", async () => {
    const created = await call(app, "POST", "/api/v1/todos", { token, json: { title: "lockme" } });
    const id = created.body.id;
    const seen = created.body.updatedAtUTC;
    // someone else saves in between (bump the stored timestamp)
    await db.execute(
      sql`UPDATE items SET updated_at_UTC = DATE_ADD(updated_at_UTC, INTERVAL 10 SECOND) WHERE id = ${id}`,
    );
    const stale = await call(app, "PATCH", `/api/v1/todos/${id}`, {
      token,
      json: { title: "mine", expectedUpdatedAtUTC: seen },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain("modified by someone else");
    const fresh = await call(app, "GET", `/api/v1/todos/${id}`, { token });
    const ok = await call(app, "PATCH", `/api/v1/todos/${id}`, {
      token,
      json: { title: "mine", expectedUpdatedAtUTC: fresh.body.updatedAtUTC },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe("mine");
  });

  it("PATCH without expectedUpdatedAtUTC keeps last-write-wins", async () => {
    const created = await call(app, "POST", "/api/v1/notes", { token, json: { title: "n" } });
    const res = await call(app, "PATCH", `/api/v1/notes/${created.body.id}`, {
      token,
      json: { title: "updated" },
    });
    expect(res.status).toBe(200);
  });
});
