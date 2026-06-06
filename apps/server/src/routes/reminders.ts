import { Elysia, t } from "elysia";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { calendarExdates, calendarItems, items } from "../db/schema/items";
import { reminderDispatch, reminders } from "../db/schema/reminders";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess } from "../services/itemAccess";
import { nextOccurrence } from "../services/recurrence";
import { dateToSql, isoToSql, nowUtcSql, sqlToDate, sqlToIso } from "../lib/time";

function reminderDto(r: typeof reminders.$inferSelect) {
  return {
    id: r.id,
    itemId: r.itemId,
    createdBy: r.createdBy,
    recipientUserId: r.recipientUserId,
    remindAtUTC: sqlToIso(r.remindAtUTC),
    offsetMinutes: r.offsetMinutes,
    channels: r.channels.split(","),
    enabled: r.enabled,
    nextFireAtUTC: sqlToIso(r.nextFireAtUTC),
    archivedAtUTC: sqlToIso(r.archivedAtUTC),
  };
}

/** Initial next_fire: absolute remind time, or occurrence-relative for calendar items. */
async function computeNextFire(
  itemId: number,
  remindAtUTC: string | null,
  offsetMinutes: number | null,
): Promise<{ nextFire: string } | { error: string }> {
  if (remindAtUTC) return { nextFire: isoToSql(remindAtUTC) };
  if (offsetMinutes === null) return { error: "remindAtUTC or offsetMinutes required" };
  const item = (await db.select().from(items).where(eq(items.id, itemId)))[0];
  if (item?.itemType !== "calendar") {
    return { error: "offsetMinutes reminders are only valid on calendar items" };
  }
  const cal = (await db.select().from(calendarItems).where(eq(calendarItems.itemId, itemId)))[0];
  if (!cal) return { error: "calendar item missing" };
  if (cal.rrule) {
    const exRows = await db
      .select()
      .from(calendarExdates)
      .where(eq(calendarExdates.calendarItemId, itemId));
    const next = nextOccurrence(
      cal.rrule,
      sqlToDate(cal.startAtUTC),
      cal.timezone,
      new Set(exRows.map((e) => sqlToDate(e.exdateAtUTC).getTime())),
      new Date(),
    );
    if (!next) return { error: "recurrence has no future occurrences" };
    return { nextFire: dateToSql(new Date(next.getTime() - offsetMinutes * 60_000)) };
  }
  return {
    nextFire: dateToSql(new Date(sqlToDate(cal.startAtUTC).getTime() - offsetMinutes * 60_000)),
  };
}

const channelsSchema = t.Array(t.Union([t.Literal("email"), t.Literal("webhook")]), { minItems: 1 });

export const reminderRoutes = new Elysia({ prefix: "/api/v1" })
  .use(requireAuth)
  .get("/items/:id/reminders", async ({ user, params, set }) => {
    const itemId = Number(params.id);
    const access = await getItemAccess(user!, itemId);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    const conds = [eq(reminders.itemId, itemId), isNull(reminders.archivedAtUTC)];
    // owner sees all reminders on the item; others see only their own
    if (access !== "owner") conds.push(eq(reminders.createdBy, user!.id));
    const rows = await db.select().from(reminders).where(and(...conds));
    return rows.map(reminderDto);
  })
  .post(
    "/items/:id/reminders",
    async ({ user, params, body, set }) => {
      const itemId = Number(params.id);
      const access = await getItemAccess(user!, itemId);
      if (!atLeast(access, "view")) {
        set.status = access === null ? 404 : 403;
        return { error: "not found" };
      }
      if ((body.remindAtUTC ? 1 : 0) + (body.offsetMinutes !== undefined && body.offsetMinutes !== null ? 1 : 0) !== 1) {
        set.status = 422;
        return { error: "provide exactly one of remindAtUTC or offsetMinutes" };
      }
      const computed = await computeNextFire(itemId, body.remindAtUTC ?? null, body.offsetMinutes ?? null);
      if ("error" in computed) {
        set.status = 422;
        return { error: computed.error };
      }
      const [res] = await db.insert(reminders).values({
        itemId,
        createdBy: user!.id,
        recipientUserId: body.recipientUserId ?? null,
        remindAtUTC: body.remindAtUTC ? isoToSql(body.remindAtUTC) : null,
        offsetMinutes: body.offsetMinutes ?? null,
        channels: body.channels.join(","),
        enabled: true,
        nextFireAtUTC: computed.nextFire,
        createdAtUTC: nowUtcSql(),
        updatedAtUTC: nowUtcSql(),
      });
      const row = (await db.select().from(reminders).where(eq(reminders.id, res.insertId)))[0]!;
      set.status = 201;
      return reminderDto(row);
    },
    {
      body: t.Object({
        remindAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
        offsetMinutes: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
        channels: channelsSchema,
        recipientUserId: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )
  .patch(
    "/reminders/:id",
    async ({ user, params, body, set }) => {
      const r = (await db.select().from(reminders).where(eq(reminders.id, Number(params.id))))[0];
      if (!r) {
        set.status = 404;
        return { error: "not found" };
      }
      const access = await getItemAccess(user!, r.itemId);
      if (r.createdBy !== user!.id && access !== "owner") {
        set.status = 403;
        return { error: "forbidden" };
      }
      const remindAt = body.remindAtUTC !== undefined ? body.remindAtUTC : sqlToIso(r.remindAtUTC);
      const offset = body.offsetMinutes !== undefined ? body.offsetMinutes : r.offsetMinutes;
      const timeChanged = body.remindAtUTC !== undefined || body.offsetMinutes !== undefined;
      let nextFire = r.nextFireAtUTC;
      if (timeChanged || body.enabled === true) {
        const computed = await computeNextFire(r.itemId, remindAt, offset);
        if ("error" in computed) {
          set.status = 422;
          return { error: computed.error };
        }
        nextFire = computed.nextFire;
      }
      await db
        .update(reminders)
        .set({
          ...(body.remindAtUTC !== undefined
            ? { remindAtUTC: body.remindAtUTC ? isoToSql(body.remindAtUTC) : null }
            : {}),
          ...(body.offsetMinutes !== undefined ? { offsetMinutes: body.offsetMinutes } : {}),
          ...(body.channels !== undefined ? { channels: body.channels.join(",") } : {}),
          ...(body.recipientUserId !== undefined ? { recipientUserId: body.recipientUserId } : {}),
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          nextFireAtUTC: nextFire,
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(reminders.id, r.id));
      const row = (await db.select().from(reminders).where(eq(reminders.id, r.id)))[0]!;
      return reminderDto(row);
    },
    {
      body: t.Object({
        remindAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
        offsetMinutes: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
        channels: t.Optional(channelsSchema),
        recipientUserId: t.Optional(t.Nullable(t.Number())),
        enabled: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/reminders/:id", async ({ user, params, set }) => {
    const r = (await db.select().from(reminders).where(eq(reminders.id, Number(params.id))))[0];
    if (!r) {
      set.status = 404;
      return { error: "not found" };
    }
    const access = await getItemAccess(user!, r.itemId);
    if (r.createdBy !== user!.id && access !== "owner") {
      set.status = 403;
      return { error: "forbidden" };
    }
    await db
      .update(reminders)
      .set({ enabled: false, archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
      .where(eq(reminders.id, r.id));
    return { ok: true };
  })
  .get("/reminders/:id/dispatches", async ({ user, params, set }) => {
    const r = (await db.select().from(reminders).where(eq(reminders.id, Number(params.id))))[0];
    if (!r) {
      set.status = 404;
      return { error: "not found" };
    }
    const access = await getItemAccess(user!, r.itemId);
    if (r.createdBy !== user!.id && access !== "owner") {
      set.status = 403;
      return { error: "forbidden" };
    }
    const rows = await db
      .select()
      .from(reminderDispatch)
      .where(eq(reminderDispatch.reminderId, r.id))
      .orderBy(desc(reminderDispatch.id))
      .limit(50);
    return rows.map((d) => ({
      id: d.id,
      occurrenceAtUTC: sqlToIso(d.occurrenceAtUTC),
      channel: d.channel,
      status: d.status,
      attempt: d.attempt,
      error: d.error,
      dispatchedAtUTC: sqlToIso(d.dispatchedAtUTC),
    }));
  });
