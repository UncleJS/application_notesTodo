import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { reminderDispatch, reminders } from "../db/schema/reminders";
import { calendarExdates, calendarItems, items } from "../db/schema/items";
import { users } from "../db/schema/auth";
import { isDupEntry } from "../lib/dbErrors";
import { dateToSql, nowUtcSql, sqlToDate } from "../lib/time";
import { nextOccurrence } from "../services/recurrence";
import { sendReminderEmail, sendReminderWebhook, type ReminderPayload } from "../services/dispatch";

const TICK_MS = 30_000;
const LOCK_STALE_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const BACKOFF_SECONDS = [60, 300, 900];
const workerId = crypto.randomUUID();

let ticking = false;

/** One scheduler pass. Exported for tests; normally driven by startReminderWorker(). */
export async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = nowUtcSql();
    // Atomic claim — also steals stale locks from crashed runs.
    await db.execute(sql`
      UPDATE reminders
         SET locked_at_UTC = UTC_TIMESTAMP(), locked_by = ${workerId}
       WHERE enabled = 1 AND archived_at_UTC IS NULL
         AND next_fire_at_UTC IS NOT NULL AND next_fire_at_UTC <= ${now}
         AND (locked_at_UTC IS NULL
              OR locked_at_UTC < UTC_TIMESTAMP() - INTERVAL ${sql.raw(String(LOCK_STALE_MINUTES))} MINUTE)
       LIMIT 50
    `);
    const claimed = await db.select().from(reminders).where(eq(reminders.lockedBy, workerId));
    for (const r of claimed) {
      try {
        await processReminder(r);
      } catch (err) {
        console.error(`reminder ${r.id} processing failed:`, err);
      } finally {
        await db
          .update(reminders)
          .set({ lockedAtUTC: null, lockedBy: null })
          .where(eq(reminders.id, r.id));
      }
    }
  } finally {
    ticking = false;
  }
}

async function processReminder(r: typeof reminders.$inferSelect): Promise<void> {
  if (!r.enabled || !r.nextFireAtUTC || r.nextFireAtUTC > nowUtcSql()) return;

  const itemRow = (await db.select().from(items).where(eq(items.id, r.itemId)))[0];
  if (!itemRow || itemRow.archivedAtUTC) {
    await db.update(reminders).set({ enabled: false, updatedAtUTC: nowUtcSql() }).where(eq(reminders.id, r.id));
    return;
  }
  const recipientId = r.recipientUserId ?? r.createdBy;
  const recipient = (await db.select().from(users).where(eq(users.id, recipientId)))[0];

  // occurrence this firing refers to: next_fire + offset (offset null → the remind time itself)
  const occurrence = new Date(sqlToDate(r.nextFireAtUTC).getTime() + (r.offsetMinutes ?? 0) * 60_000);
  const occurrenceSql = dateToSql(occurrence);

  const payload: ReminderPayload = {
    reminderId: r.id,
    itemId: itemRow.id,
    itemType: itemRow.itemType,
    title: itemRow.title,
    occurrenceAtUTC: occurrence.toISOString(),
    recipientUsername: recipient?.username ?? `#${recipientId}`,
  };

  const history = await db
    .select()
    .from(reminderDispatch)
    .where(and(eq(reminderDispatch.reminderId, r.id), eq(reminderDispatch.occurrenceAtUTC, occurrenceSql)));

  const channels = r.channels.split(",").filter((c) => c === "email" || c === "webhook") as Array<
    "email" | "webhook"
  >;
  let pendingRetry = false;
  let maxFailCount = 0;

  for (const channel of channels) {
    const sent = history.some((h) => h.channel === channel && h.status === "sent");
    if (sent) continue;
    const failCount = history.filter((h) => h.channel === channel && h.status === "failed").length;
    if (failCount >= MAX_ATTEMPTS) continue; // exhausted — give up on this channel

    try {
      if (channel === "email") await sendReminderEmail(recipient?.email ?? null, payload);
      else await sendReminderWebhook(payload);
      try {
        await db.insert(reminderDispatch).values({
          reminderId: r.id,
          itemId: itemRow.id,
          occurrenceAtUTC: occurrenceSql,
          channel,
          status: "sent",
          attempt: failCount + 1,
          dispatchedAtUTC: nowUtcSql(),
          createdAtUTC: nowUtcSql(),
        });
      } catch (err) {
        if (!isDupEntry(err)) throw err; // dup = another run already recorded the send
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.insert(reminderDispatch).values({
        reminderId: r.id,
        itemId: itemRow.id,
        occurrenceAtUTC: occurrenceSql,
        channel,
        status: "failed",
        attempt: failCount + 1,
        error: message.slice(0, 2000),
        dispatchedAtUTC: nowUtcSql(),
        createdAtUTC: nowUtcSql(),
      });
      if (failCount + 1 < MAX_ATTEMPTS) {
        pendingRetry = true;
        maxFailCount = Math.max(maxFailCount, failCount + 1);
      }
    }
  }

  if (pendingRetry) {
    // keep the same occurrence; retry with backoff
    const backoff = BACKOFF_SECONDS[Math.min(maxFailCount, BACKOFF_SECONDS.length) - 1] ?? 900;
    await db
      .update(reminders)
      .set({
        nextFireAtUTC: dateToSql(new Date(Date.now() + backoff * 1000)),
        updatedAtUTC: nowUtcSql(),
      })
      .where(eq(reminders.id, r.id));
    return;
  }

  // all channels resolved (sent or exhausted) — advance or finish
  if (r.offsetMinutes !== null && itemRow.itemType === "calendar") {
    const cal = (await db.select().from(calendarItems).where(eq(calendarItems.itemId, itemRow.id)))[0];
    if (cal?.rrule) {
      const exRows = await db
        .select()
        .from(calendarExdates)
        .where(eq(calendarExdates.calendarItemId, itemRow.id));
      const next = nextOccurrence(
        cal.rrule,
        sqlToDate(cal.startAtUTC),
        cal.timezone,
        new Set(exRows.map((e) => sqlToDate(e.exdateAtUTC).getTime())),
        occurrence,
      );
      if (next) {
        await db
          .update(reminders)
          .set({
            nextFireAtUTC: dateToSql(new Date(next.getTime() - r.offsetMinutes * 60_000)),
            updatedAtUTC: nowUtcSql(),
          })
          .where(eq(reminders.id, r.id));
        return;
      }
    }
  }
  await db.update(reminders).set({ enabled: false, updatedAtUTC: nowUtcSql() }).where(eq(reminders.id, r.id));
}

export function startReminderWorker(): void {
  console.log(`Reminder worker ${workerId} started (tick ${TICK_MS / 1000}s)`);
  setInterval(() => {
    void tick().catch((err) => console.error("reminder tick failed:", err));
  }, TICK_MS);
}
