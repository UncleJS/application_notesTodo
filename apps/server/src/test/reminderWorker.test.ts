import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { items, todos } from "../db/schema/items";
import { reminderDispatch, reminders } from "../db/schema/reminders";
import { nowUtcSql } from "../lib/time";
import { ensureTestDb, truncateAll, seedBaseFixtures, type Fixtures } from "./setup";

// Mock the dispatch channels BEFORE the worker module is imported.
const sendEmail = mock(async () => {});
const sendWebhook = mock(async () => {});
mock.module("../services/dispatch", () => ({
  sendReminderEmail: sendEmail,
  sendReminderWebhook: sendWebhook,
}));

const { tick } = await import("../scheduler/reminderWorker");

let fx: Fixtures;

beforeAll(async () => {
  await ensureTestDb();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedBaseFixtures();
  sendEmail.mockClear();
  sendWebhook.mockClear();
});

async function createTodoItem(ownerId: number): Promise<number> {
  const [res] = await db.insert(items).values({
    itemType: "todo",
    ownerId,
    title: "remind me",
    createdAtUTC: nowUtcSql(),
    updatedAtUTC: nowUtcSql(),
  });
  await db.insert(todos).values({ itemId: res.insertId });
  return res.insertId;
}

async function createDueReminder(itemId: number, createdBy: number): Promise<number> {
  const past = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ");
  const [res] = await db.insert(reminders).values({
    itemId,
    createdBy,
    remindAtUTC: past,
    channels: "email",
    enabled: true,
    nextFireAtUTC: past,
    createdAtUTC: nowUtcSql(),
    updatedAtUTC: nowUtcSql(),
  });
  return res.insertId;
}

const loadReminder = async (id: number) => (await db.select().from(reminders).where(eq(reminders.id, id)))[0]!;

describe("reminder worker", () => {
  it("dispatches a due reminder once and records 'sent'", async () => {
    const itemId = await createTodoItem(fx.userId);
    const reminderId = await createDueReminder(itemId, fx.userId);
    await tick();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const rows = await db
      .select()
      .from(reminderDispatch)
      .where(and(eq(reminderDispatch.reminderId, reminderId), eq(reminderDispatch.status, "sent")));
    expect(rows).toHaveLength(1);
    // one-shot (no offset/rrule) → disabled after dispatch
    expect((await loadReminder(reminderId)).enabled).toBe(false);
  });

  it("does not re-send an occurrence already recorded as sent (dedup)", async () => {
    const itemId = await createTodoItem(fx.userId);
    const reminderId = await createDueReminder(itemId, fx.userId);
    await tick();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // force the same occurrence due again — as after a crash before advancing
    const r = await loadReminder(reminderId);
    await db
      .update(reminders)
      .set({ enabled: true, nextFireAtUTC: r.remindAtUTC, lockedAtUTC: null, lockedBy: null })
      .where(eq(reminders.id, reminderId));
    await tick();
    expect(sendEmail).toHaveBeenCalledTimes(1); // still once
  });

  it("skips and disables when the recipient is archived", async () => {
    const itemId = await createTodoItem(fx.userId);
    const reminderId = await createDueReminder(itemId, fx.userId);
    await db.execute(sql`UPDATE users SET archived_at_UTC = UTC_TIMESTAMP() WHERE id = ${fx.userId}`);
    await tick();
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await loadReminder(reminderId)).enabled).toBe(false);
  });

  it("skips and disables when the item is archived", async () => {
    const itemId = await createTodoItem(fx.userId);
    const reminderId = await createDueReminder(itemId, fx.userId);
    await db.update(items).set({ archivedAtUTC: nowUtcSql() }).where(eq(items.id, itemId));
    await tick();
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await loadReminder(reminderId)).enabled).toBe(false);
  });

  it("records a failed attempt and schedules a retry", async () => {
    sendEmail.mockImplementationOnce(async () => {
      throw new Error("smtp down");
    });
    const itemId = await createTodoItem(fx.userId);
    const reminderId = await createDueReminder(itemId, fx.userId);
    await tick();
    const fails = await db
      .select()
      .from(reminderDispatch)
      .where(and(eq(reminderDispatch.reminderId, reminderId), eq(reminderDispatch.status, "failed")));
    expect(fails).toHaveLength(1);
    const r = await loadReminder(reminderId);
    expect(r.enabled).toBe(true); // retry pending
    expect(r.nextFireAtUTC! > nowUtcSql()).toBe(true); // backed off into the future
  });
});
