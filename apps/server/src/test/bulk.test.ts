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

async function createTodo(title: string, t = token): Promise<number> {
  const res = await call(app, "POST", "/api/v1/todos", { token: t, json: { title } });
  return res.body.id;
}

describe("POST /api/v1/todos/bulk", () => {
  it("marks several todos done", async () => {
    const ids = [await createTodo("a"), await createTodo("b"), await createTodo("c")];
    const res = await call(app, "POST", "/api/v1/todos/bulk", { token, json: { ids, op: "done" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 3, skipped: [] });
    for (const id of ids) {
      const todo = await call(app, "GET", `/api/v1/todos/${id}`, { token });
      expect(todo.body.done).toBe(true);
      expect(todo.body.doneAtUTC).not.toBeNull();
    }
  });

  it("archives owned todos, skips foreign ones", async () => {
    const mine = await createTodo("mine");
    const otherToken = await makeSession(fx.user2Id);
    const theirs = await createTodo("theirs", otherToken);
    const res = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [mine, theirs], op: "archive" },
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toEqual([{ id: theirs, reason: "not found" }]);
    const archived = await call(app, "GET", `/api/v1/todos/${mine}`, { token });
    expect(archived.body.archivedAtUTC).not.toBeNull();
  });

  it("edit-shared user can bulk-done but not bulk-archive", async () => {
    const id = await createTodo("shared");
    await call(app, "POST", `/api/v1/items/${id}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "edit" },
    });
    const editorToken = await makeSession(fx.user2Id);
    const done = await call(app, "POST", "/api/v1/todos/bulk", {
      token: editorToken,
      json: { ids: [id], op: "done" },
    });
    expect(done.body.updated).toBe(1);
    const archive = await call(app, "POST", "/api/v1/todos/bulk", {
      token: editorToken,
      json: { ids: [id], op: "archive" },
    });
    expect(archive.body.updated).toBe(0);
    expect(archive.body.skipped[0].reason).toBe("forbidden");
  });

  it("addTag attaches the tag; unknown tag → 422", async () => {
    const id = await createTodo("tagme");
    const bad = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [id], op: "addTag", tagId: 999999 },
    });
    expect(bad.status).toBe(422);
    const missing = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [id], op: "addTag" },
    });
    expect(missing.status).toBe(422);
    const ok = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [id], op: "addTag", tagId: fx.tagId },
    });
    expect(ok.body.updated).toBe(1);
    const todo = await call(app, "GET", `/api/v1/todos/${id}`, { token });
    expect(todo.body.tagIds).toEqual([fx.tagId]);
    // idempotent — re-applying still succeeds
    const again = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [id], op: "addTag", tagId: fx.tagId },
    });
    expect(again.body.updated).toBe(1);
  });

  it("non-todo items are skipped", async () => {
    const note = await call(app, "POST", "/api/v1/notes", { token, json: { title: "not a todo" } });
    const res = await call(app, "POST", "/api/v1/todos/bulk", {
      token,
      json: { ids: [note.body.id], op: "done" },
    });
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped[0].reason).toBe("not a todo");
  });
});
