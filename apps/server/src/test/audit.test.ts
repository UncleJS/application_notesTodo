import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { ensureTestDb, truncateAll, seedBaseFixtures, makeSession, type Fixtures } from "./setup";
import { call, makeApp, type TestApp } from "./helpers";

let app: TestApp;
let fx: Fixtures;
let token: string; // alice
let adminToken: string;

beforeAll(async () => {
  await ensureTestDb();
  app = makeApp();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
  token = await makeSession(fx.userId);
  adminToken = await makeSession(fx.adminId);
});

async function createNote(title: string, t = token): Promise<number> {
  const res = await call(app, "POST", "/api/v1/notes", { token: t, json: { title } });
  return res.body.id;
}

/** Fetch the self-scoped audit log for a token, optionally with a query string. */
async function selfLogs(t = token, qs = "") {
  const res = await call(app, "GET", `/api/v1/audit-logs${qs}`, { token: t });
  expect(res.status).toBe(200);
  return res.body as {
    logs: Array<{ action: string; itemId: number; itemType: string; changes: unknown; actorUserId: number }>;
    total: number;
  };
}

describe("audit logging — capture", () => {
  it("records a create row on note creation", async () => {
    const id = await createNote("hello");
    const { logs } = await selfLogs();
    const created = logs.filter((l) => l.itemId === id && l.action === "create");
    expect(created.length).toBe(1);
    expect(created[0].itemType).toBe("note");
    expect(created[0].changes).toBeNull();
  });

  it("records an update with a correct field diff, skipping unchanged fields", async () => {
    const id = await createNote("original");
    await call(app, "PATCH", `/api/v1/notes/${id}`, {
      token,
      json: { title: "renamed", bodyMd: "new body" },
    });
    const { logs } = await selfLogs();
    const update = logs.find((l) => l.itemId === id && l.action === "update");
    expect(update).toBeDefined();
    const changes = update!.changes as Array<{ field: string; old: unknown; new: unknown }>;
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
    expect(byField.title).toEqual({ field: "title", old: "original", new: "renamed" });
    expect(byField.bodyMd).toEqual({ field: "bodyMd", old: null, new: "new body" });
    expect(byField.categoryId).toBeUndefined(); // untouched → not logged
  });

  it("writes no update row when nothing actually changes", async () => {
    const id = await createNote("same");
    await call(app, "PATCH", `/api/v1/notes/${id}`, { token, json: { title: "same" } });
    const { logs } = await selfLogs();
    expect(logs.filter((l) => l.itemId === id && l.action === "update").length).toBe(0);
    expect(logs.filter((l) => l.itemId === id && l.action === "create").length).toBe(1);
  });

  it("records archive then restore with null changes", async () => {
    const id = await createNote("lifecycle");
    await call(app, "DELETE", `/api/v1/notes/${id}`, { token });
    await call(app, "POST", `/api/v1/notes/${id}/restore`, { token });
    const { logs } = await selfLogs();
    const actions = logs.filter((l) => l.itemId === id).map((l) => l.action);
    expect(actions).toContain("archive");
    expect(actions).toContain("restore");
    for (const l of logs.filter((l) => l.itemId === id && l.action !== "update")) {
      if (l.action === "archive" || l.action === "restore") expect(l.changes).toBeNull();
    }
  });

  it("serializes datetime and null diffs as ISO / null on a todo", async () => {
    const created = await call(app, "POST", "/api/v1/todos", { token, json: { title: "due" } });
    const id = created.body.id;
    const due = "2026-07-01T09:00:00Z";
    await call(app, "PATCH", `/api/v1/todos/${id}`, { token, json: { dueAtUTC: due } });
    await call(app, "PATCH", `/api/v1/todos/${id}`, { token, json: { dueAtUTC: null } });
    const { logs } = await selfLogs();
    const updates = logs.filter((l) => l.itemId === id && l.action === "update");
    const setDue = updates
      .flatMap((u) => u.changes as Array<{ field: string; old: unknown; new: unknown }>)
      .find((c) => c.field === "dueAtUTC" && c.new === due);
    expect(setDue).toBeDefined();
    expect(setDue!.old).toBeNull();
    const clearDue = updates
      .flatMap((u) => u.changes as Array<{ field: string; old: unknown; new: unknown }>)
      .find((c) => c.field === "dueAtUTC" && c.new === null);
    expect(clearDue).toBeDefined();
    expect(clearDue!.old).toBe(due);
  });

  it("records a toggle as a done false→true update", async () => {
    const created = await call(app, "POST", "/api/v1/todos", { token, json: { title: "toggle" } });
    const id = created.body.id;
    await call(app, "POST", `/api/v1/todos/${id}/toggle`, { token });
    const { logs } = await selfLogs();
    const change = logs
      .filter((l) => l.itemId === id && l.action === "update")
      .flatMap((u) => u.changes as Array<{ field: string; old: unknown; new: unknown }>)
      .find((c) => c.field === "done");
    expect(change).toEqual({ field: "done", old: false, new: true });
  });

  it("records tag add and remove", async () => {
    const id = await createNote("tagged");
    await call(app, "POST", `/api/v1/items/${id}/tags`, { token, json: { tagId: fx.tagId } });
    await call(app, "DELETE", `/api/v1/items/${id}/tags/${fx.tagId}`, { token });
    const { logs } = await selfLogs();
    const actions = logs.filter((l) => l.itemId === id).map((l) => l.action);
    expect(actions).toContain("tag_add");
    expect(actions).toContain("tag_remove");
  });

  it("bulk done writes one row per affected item and none for skipped", async () => {
    const a = (await call(app, "POST", "/api/v1/todos", { token, json: { title: "a" } })).body.id;
    const b = (await call(app, "POST", "/api/v1/todos", { token, json: { title: "b" } })).body.id;
    const otherToken = await makeSession(fx.user2Id);
    const theirs = (await call(app, "POST", "/api/v1/todos", { token: otherToken, json: { title: "x" } }))
      .body.id;
    await call(app, "POST", "/api/v1/todos/bulk", { token, json: { ids: [a, b, theirs], op: "done" } });
    const { logs } = await selfLogs();
    expect(logs.filter((l) => l.itemId === a && l.action === "update").length).toBe(1);
    expect(logs.filter((l) => l.itemId === b && l.action === "update").length).toBe(1);
    expect(logs.filter((l) => l.itemId === theirs).length).toBe(0); // alice never sees bob's item
  });
});

describe("audit logging — visibility", () => {
  it("a user does not see unrelated changes by other users", async () => {
    const otherToken = await makeSession(fx.user2Id);
    const bobNote = await createNote("bob's", otherToken);
    const { logs } = await selfLogs(); // alice
    expect(logs.some((l) => l.itemId === bobNote)).toBe(false);
  });

  it("an owner sees edits made to their item by an edit-shared user", async () => {
    const id = await createNote("shared");
    await call(app, "POST", `/api/v1/items/${id}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "edit" },
    });
    const editorToken = await makeSession(fx.user2Id);
    await call(app, "PATCH", `/api/v1/notes/${id}`, { token: editorToken, json: { title: "edited by bob" } });
    // alice owns the item → sees bob's update
    const aliceLogs = await selfLogs(token);
    const byBob = aliceLogs.logs.find(
      (l) => l.itemId === id && l.action === "update" && l.actorUserId === fx.user2Id,
    );
    expect(byBob).toBeDefined();
    // bob (the actor) also sees his own change
    const bobLogs = await selfLogs(editorToken);
    expect(bobLogs.logs.some((l) => l.itemId === id && l.action === "update")).toBe(true);
  });
});

describe("audit logging — admin endpoint + filters", () => {
  it("non-admin is forbidden from the admin endpoint", async () => {
    const res = await call(app, "GET", "/api/v1/admin/audit-logs", { token });
    expect(res.status).toBe(403);
  });

  it("admin sees all rows and can filter by user, action, and item type", async () => {
    const aliceNote = await createNote("alice note");
    const bobToken = await makeSession(fx.user2Id);
    const bobNote = await createNote("bob note", bobToken);
    await call(app, "DELETE", `/api/v1/notes/${bobNote}`, { token: bobToken });

    const all = await call(app, "GET", "/api/v1/admin/audit-logs", { token: adminToken });
    expect(all.status).toBe(200);
    const ids = all.body.logs.map((l: { itemId: number }) => l.itemId);
    expect(ids).toContain(aliceNote);
    expect(ids).toContain(bobNote);

    const byUser = await call(app, "GET", `/api/v1/admin/audit-logs?userId=${fx.userId}`, {
      token: adminToken,
    });
    expect(byUser.body.logs.every((l: { actorUserId: number }) => l.actorUserId === fx.userId)).toBe(true);

    const archives = await call(app, "GET", "/api/v1/admin/audit-logs?action=archive", {
      token: adminToken,
    });
    expect(archives.body.logs.length).toBeGreaterThan(0);
    expect(archives.body.logs.every((l: { action: string }) => l.action === "archive")).toBe(true);

    const todosOnly = await call(app, "GET", "/api/v1/admin/audit-logs?itemType=todo", {
      token: adminToken,
    });
    expect(todosOnly.body.logs.every((l: { itemType: string }) => l.itemType === "todo")).toBe(true);
  });

  it("filters by category snapshot", async () => {
    const res = await call(app, "POST", "/api/v1/notes", {
      token,
      json: { title: "work note", categoryId: fx.categoryId },
    });
    const id = res.body.id;
    const filtered = await call(app, "GET", `/api/v1/admin/audit-logs?category=${fx.categoryId}`, {
      token: adminToken,
    });
    expect(filtered.body.logs.some((l: { itemId: number }) => l.itemId === id)).toBe(true);
    expect(
      filtered.body.logs.every((l: { categoryId: number | null }) => l.categoryId === fx.categoryId),
    ).toBe(true);
  });
});
