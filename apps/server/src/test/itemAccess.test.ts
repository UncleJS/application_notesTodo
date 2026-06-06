import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { ensureTestDb, truncateAll, seedBaseFixtures, makeSession, type Fixtures } from "./setup";
import { call, makeApp, type TestApp } from "./helpers";
import { getItemAccess } from "../services/itemAccess";
import type { SessionUser } from "../services/session";

let app: TestApp;
let fx: Fixtures;
let ownerToken: string;
let noteId: number;

const asUser = (id: number): SessionUser => ({
  id,
  username: `u${id}`,
  displayName: null,
  email: null,
  isAdmin: false,
});

beforeAll(async () => {
  await ensureTestDb();
  app = makeApp();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
  ownerToken = await makeSession(fx.userId);
  const created = await call(app, "POST", "/api/v1/notes", { token: ownerToken, json: { title: "n" } });
  noteId = created.body.id;
});

describe("getItemAccess", () => {
  it("owner → owner", async () => {
    expect(await getItemAccess(asUser(fx.userId), noteId)).toBe("owner");
  });

  it("admin → owner", async () => {
    expect(await getItemAccess({ ...asUser(fx.adminId), isAdmin: true }, noteId)).toBe("owner");
  });

  it("unrelated user → null", async () => {
    expect(await getItemAccess(asUser(fx.user2Id), noteId)).toBeNull();
  });

  it("direct view share → view", async () => {
    await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token: ownerToken,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "view" },
    });
    expect(await getItemAccess(asUser(fx.user2Id), noteId)).toBe("view");
  });

  it("direct edit share → edit", async () => {
    await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token: ownerToken,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "edit" },
    });
    expect(await getItemAccess(asUser(fx.user2Id), noteId)).toBe("edit");
  });

  it("group share reaches members → view; non-members → null", async () => {
    await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token: ownerToken,
      json: { granteeType: "group", granteeId: fx.groupId, level: "view" },
    });
    // bob is a member of 'team'
    expect(await getItemAccess(asUser(fx.user2Id), noteId)).toBe("view");
    // a fresh user is not
    expect(await getItemAccess(asUser(999999), noteId)).toBeNull();
  });

  it("missing item → null", async () => {
    expect(await getItemAccess(asUser(fx.userId), 999999)).toBeNull();
  });

  it("view share cannot edit via API → 403; no share → 404", async () => {
    await call(app, "POST", `/api/v1/items/${noteId}/shares`, {
      token: ownerToken,
      json: { granteeType: "user", granteeId: fx.user2Id, level: "view" },
    });
    const viewerToken = await makeSession(fx.user2Id);
    const patch = await call(app, "PATCH", `/api/v1/notes/${noteId}`, {
      token: viewerToken,
      json: { title: "hacked" },
    });
    expect(patch.status).toBe(403);
    const adminNote = await call(app, "POST", "/api/v1/notes", {
      token: await makeSession(fx.adminId),
      json: { title: "private" },
    });
    const sneak = await call(app, "GET", `/api/v1/notes/${adminNote.body.id}`, { token: viewerToken });
    expect(sneak.status).toBe(404);
  });
});
