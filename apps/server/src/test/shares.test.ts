import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { ensureTestDb, truncateAll, seedBaseFixtures, makeSession, type Fixtures } from "./setup";
import { call, makeApp, type TestApp } from "./helpers";

let app: TestApp;
let fx: Fixtures;
let token: string;
let noteId: number;

beforeAll(async () => {
  await ensureTestDb();
  app = makeApp();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
  token = await makeSession(fx.userId);
  const created = await call(app, "POST", "/api/v1/notes", { token, json: { title: "shared note" } });
  noteId = created.body.id;
});

describe("share grantee validation", () => {
  it("share with non-existent user → 404 'user not found'", async () => {
    const res = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: 999999, level: "view" },
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("user not found");
  });

  it("share with non-existent group → 404 'group not found'", async () => {
    const res = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "group", granteeId: 999999, level: "view" },
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("group not found");
  });

  it("self-share → 400", async () => {
    const res = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.userId, level: "view" },
    });
    expect(res.status).toBe(400);
  });

  it("valid share → 201; duplicate → 409", async () => {
    const first = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "view" },
    });
    expect(first.status).toBe(201);
    const dup = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "edit" },
    });
    expect(dup.status).toBe(409);
  });

  it("removed share can be re-granted (restore path)", async () => {
    await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "view" },
    });
    const shares = await call(app, "GET", `/api/v1/items/${noteId}/shares`, { token });
    await call(app, "DELETE", `/api/v1/shares/${shares.body[0].id}`, { token });
    const again = await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "edit" },
    });
    expect(again.status).toBe(201);
    const after = await call(app, "GET", `/api/v1/items/${noteId}/shares`, { token });
    expect(after.body).toHaveLength(1);
    expect(after.body[0].level).toBe("edit");
  });
});
