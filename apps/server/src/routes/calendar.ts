import { Elysia, t } from "elysia";
import { and, asc, eq, gte, inArray, isNull, like, lt } from "drizzle-orm";
import { db } from "../db/client";
import { calendarExdates, calendarItems, items, todos } from "../db/schema/items";
import { itemTags } from "../db/schema/linksTags";
import { tagIdsByItem } from "../services/tags";
import { itemIdsWithLinks } from "../services/links";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess, visibleItemsCond } from "../services/itemAccess";
import { isoToSql, nowUtcSql, sqlToDate, sqlToIso } from "../lib/time";
import { expandOccurrences } from "../services/recurrence";

export function calendarDto(
  item: typeof items.$inferSelect,
  cal: typeof calendarItems.$inferSelect,
  exdates: string[] = [],
) {
  return {
    id: item.id,
    title: item.title,
    startAtUTC: sqlToIso(cal.startAtUTC),
    endAtUTC: sqlToIso(cal.endAtUTC),
    allDay: cal.allDay,
    location: cal.location,
    descriptionMd: cal.descriptionMd,
    rrule: cal.rrule,
    timezone: cal.timezone,
    exdatesUTC: exdates,
    ownerId: item.ownerId,
    categoryId: item.categoryId,
    priorityId: item.priorityId,
    createdAtUTC: sqlToIso(item.createdAtUTC),
    updatedAtUTC: sqlToIso(item.updatedAtUTC),
    archivedAtUTC: sqlToIso(item.archivedAtUTC),
  };
}

async function loadCalendarItem(id: number) {
  const rows = await db
    .select()
    .from(items)
    .innerJoin(calendarItems, eq(calendarItems.itemId, items.id))
    .where(and(eq(items.id, id), eq(items.itemType, "calendar")))
    .limit(1);
  if (!rows[0]) return null;
  const ex = await db
    .select({ at: calendarExdates.exdateAtUTC })
    .from(calendarExdates)
    .where(eq(calendarExdates.calendarItemId, id));
  return { ...rows[0], exdates: ex.map((e) => sqlToIso(e.at)) };
}

const calendarBody = t.Object({
  title: t.String({ minLength: 1, maxLength: 512 }),
  startAtUTC: t.String({ format: "date-time" }),
  endAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
  allDay: t.Optional(t.Boolean()),
  location: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  descriptionMd: t.Optional(t.Nullable(t.String())),
  rrule: t.Optional(t.Nullable(t.String({ maxLength: 1024 }))),
  timezone: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
  exdatesUTC: t.Optional(t.Array(t.String({ format: "date-time" }))),
  categoryId: t.Optional(t.Nullable(t.Number())),
  priorityId: t.Optional(t.Nullable(t.Number())),
});

export const calendarRoutes = new Elysia({ prefix: "/api/v1/calendar" })
  .use(requireAuth)
  // expanded occurrences (RRULE-aware) for calendar views
  .get(
    "/",
    async ({ user, query, set }) => {
      const from = new Date(query.from);
      const to = new Date(query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        set.status = 422;
        return { error: "invalid range" };
      }
      if (to.getTime() - from.getTime() > 400 * 86400_000) {
        set.status = 422;
        return { error: "range too large (max 400 days)" };
      }
      const wantEvents = query.kind === undefined || query.kind === "event";
      const wantTodos = query.kind === undefined || query.kind === "todo";
      const filterConds = (type: "calendar" | "todo") => {
        const conds = [eq(items.itemType, type), visibleItemsCond(user!), isNull(items.archivedAtUTC)];
        if (query.category) conds.push(eq(items.categoryId, Number(query.category)));
        if (query.priority) conds.push(eq(items.priorityId, Number(query.priority)));
        if (query.tag) {
          conds.push(
            inArray(
              items.id,
              db
                .select({ id: itemTags.itemId })
                .from(itemTags)
                .where(and(eq(itemTags.tagId, Number(query.tag)), isNull(itemTags.archivedAtUTC))),
            ),
          );
        }
        return conds;
      };
      const rows = wantEvents
        ? await db
            .select()
            .from(items)
            .innerJoin(calendarItems, eq(calendarItems.itemId, items.id))
            .where(and(...filterConds("calendar")))
        : [];
      const recurringIds = rows.filter((r) => r.calendar_items.rrule).map((r) => r.items.id);
      const exRows = recurringIds.length
        ? await db
            .select()
            .from(calendarExdates)
            .where(inArray(calendarExdates.calendarItemId, recurringIds))
        : [];
      const exByItem = new Map<number, Set<number>>();
      for (const ex of exRows) {
        const set_ = exByItem.get(ex.calendarItemId) ?? new Set<number>();
        set_.add(sqlToDate(ex.exdateAtUTC).getTime());
        exByItem.set(ex.calendarItemId, set_);
      }

      // due-dated todos shown alongside events
      const todoRows = wantTodos
        ? await db
            .select()
            .from(items)
            .innerJoin(todos, eq(todos.itemId, items.id))
            .where(
              and(
                ...filterConds("todo"),
                gte(todos.dueAtUTC, isoToSql(from.toISOString())),
                lt(todos.dueAtUTC, isoToSql(to.toISOString())),
              ),
            )
        : [];

      const linked = await itemIdsWithLinks([
        ...rows.map((r) => r.items.id),
        ...todoRows.map((r) => r.items.id),
      ]);
      const occurrences: Array<{
        itemId: number;
        kind: "event" | "todo";
        title: string;
        occurrenceStartUTC: string;
        occurrenceEndUTC: string | null;
        allDay: boolean;
        recurring: boolean;
        location: string | null;
        done: boolean | null;
        hasLinks: boolean;
        ownerId: number;
        categoryId: number | null;
        priorityId: number | null;
      }> = [];
      for (const r of todoRows) {
        occurrences.push({
          itemId: r.items.id,
          kind: "todo",
          title: r.items.title,
          occurrenceStartUTC: sqlToDate(r.todos.dueAtUTC!).toISOString(),
          occurrenceEndUTC: null,
          allDay: false,
          recurring: false,
          location: null,
          done: r.todos.done,
          hasLinks: linked.has(r.items.id),
          ownerId: r.items.ownerId,
          categoryId: r.items.categoryId,
          priorityId: r.items.priorityId,
        });
      }
      for (const r of rows) {
        const start = sqlToDate(r.calendar_items.startAtUTC);
        const end = r.calendar_items.endAtUTC ? sqlToDate(r.calendar_items.endAtUTC) : null;
        const base = {
          itemId: r.items.id,
          kind: "event" as const,
          title: r.items.title,
          allDay: r.calendar_items.allDay,
          recurring: !!r.calendar_items.rrule,
          location: r.calendar_items.location,
          done: null,
          hasLinks: linked.has(r.items.id),
          ownerId: r.items.ownerId,
          categoryId: r.items.categoryId,
          priorityId: r.items.priorityId,
        };
        if (!r.calendar_items.rrule) {
          if (start < to && (end ?? start) >= from) {
            occurrences.push({
              ...base,
              occurrenceStartUTC: start.toISOString(),
              occurrenceEndUTC: end?.toISOString() ?? null,
            });
          }
          continue;
        }
        try {
          const occ = expandOccurrences({
            startAtUTC: start,
            endAtUTC: end,
            rrule: r.calendar_items.rrule,
            timezone: r.calendar_items.timezone,
            exdatesMs: exByItem.get(r.items.id) ?? new Set(),
            from,
            to,
          });
          for (const o of occ) {
            occurrences.push({
              ...base,
              occurrenceStartUTC: o.start.toISOString(),
              occurrenceEndUTC: o.end?.toISOString() ?? null,
            });
          }
        } catch (err) {
          console.error(`bad rrule on item ${r.items.id}:`, err);
        }
      }
      occurrences.sort((a, b) => a.occurrenceStartUTC.localeCompare(b.occurrenceStartUTC));
      return occurrences;
    },
    {
      query: t.Object({
        from: t.String({ format: "date-time" }),
        to: t.String({ format: "date-time" }),
        category: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        tag: t.Optional(t.String()),
        kind: t.Optional(t.Union([t.Literal("event"), t.Literal("todo")])),
      }),
    },
  )
  .get(
    "/items",
    async ({ user, query }) => {
      const conds = [eq(items.itemType, "calendar" as const), visibleItemsCond(user!)];
      if (query.includeArchived !== "true") conds.push(isNull(items.archivedAtUTC));
      if (query.q) conds.push(like(items.title, `%${query.q}%`));
      if (query.tag) {
        conds.push(
          inArray(
            items.id,
            db
              .select({ id: itemTags.itemId })
              .from(itemTags)
              .where(and(eq(itemTags.tagId, Number(query.tag)), isNull(itemTags.archivedAtUTC))),
          ),
        );
      }
      const rows = await db
        .select()
        .from(items)
        .innerJoin(calendarItems, eq(calendarItems.itemId, items.id))
        .where(and(...conds))
        .orderBy(asc(calendarItems.startAtUTC));
      const tagMap = await tagIdsByItem(rows.map((r) => r.items.id));
      return rows.map((r) => ({
        ...calendarDto(r.items, r.calendar_items),
        tagIds: tagMap.get(r.items.id) ?? [],
      }));
    },
    {
      query: t.Object({
        includeArchived: t.Optional(t.String()),
        q: t.Optional(t.String()),
        tag: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/items",
    async ({ user, body, set }) => {
      const id = await db.transaction(async (tx) => {
        const [res] = await tx.insert(items).values({
          itemType: "calendar",
          ownerId: user!.id,
          title: body.title,
          categoryId: body.categoryId ?? null,
          priorityId: body.priorityId ?? null,
          createdAtUTC: nowUtcSql(),
          updatedAtUTC: nowUtcSql(),
        });
        await tx.insert(calendarItems).values({
          itemId: res.insertId,
          startAtUTC: isoToSql(body.startAtUTC),
          endAtUTC: body.endAtUTC ? isoToSql(body.endAtUTC) : null,
          allDay: body.allDay ?? false,
          location: body.location ?? null,
          descriptionMd: body.descriptionMd ?? null,
          rrule: body.rrule ?? null,
          timezone: body.timezone ?? null,
        });
        if (body.exdatesUTC?.length) {
          await tx.insert(calendarExdates).values(
            body.exdatesUTC.map((d) => ({ calendarItemId: res.insertId, exdateAtUTC: isoToSql(d) })),
          );
        }
        return res.insertId;
      });
      const row = (await loadCalendarItem(id))!;
      set.status = 201;
      return calendarDto(row.items, row.calendar_items, row.exdates);
    },
    { body: calendarBody },
  )
  .get("/items/:id", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (!atLeast(access, "view")) {
      set.status = access === null ? 404 : 403;
      return { error: "not found" };
    }
    const row = await loadCalendarItem(id);
    if (!row) {
      set.status = 404;
      return { error: "not found" };
    }
    const tagMap = await tagIdsByItem([id]);
    return { ...calendarDto(row.items, row.calendar_items, row.exdates), tagIds: tagMap.get(id) ?? [] };
  })
  .patch(
    "/items/:id",
    async ({ user, params, body, set }) => {
      const id = Number(params.id);
      const access = await getItemAccess(user!, id);
      if (!atLeast(access, "edit")) {
        set.status = access === null ? 404 : 403;
        return { error: access === null ? "not found" : "forbidden" };
      }
      await db.transaction(async (tx) => {
        await tx
          .update(items)
          .set({
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
            ...(body.priorityId !== undefined ? { priorityId: body.priorityId } : {}),
            updatedAtUTC: nowUtcSql(),
          })
          .where(eq(items.id, id));
        const calSet: Partial<typeof calendarItems.$inferInsert> = {};
        if (body.startAtUTC !== undefined) calSet.startAtUTC = isoToSql(body.startAtUTC);
        if (body.endAtUTC !== undefined) calSet.endAtUTC = body.endAtUTC ? isoToSql(body.endAtUTC) : null;
        if (body.allDay !== undefined) calSet.allDay = body.allDay;
        if (body.location !== undefined) calSet.location = body.location;
        if (body.descriptionMd !== undefined) calSet.descriptionMd = body.descriptionMd;
        if (body.rrule !== undefined) calSet.rrule = body.rrule;
        if (body.timezone !== undefined) calSet.timezone = body.timezone;
        if (Object.keys(calSet).length > 0) {
          await tx.update(calendarItems).set(calSet).where(eq(calendarItems.itemId, id));
        }
        if (body.exdatesUTC !== undefined) {
          // exdates are tiny system rows scoped to the item — replace wholesale
          await tx.delete(calendarExdates).where(eq(calendarExdates.calendarItemId, id));
          if (body.exdatesUTC.length) {
            await tx.insert(calendarExdates).values(
              body.exdatesUTC.map((d) => ({ calendarItemId: id, exdateAtUTC: isoToSql(d) })),
            );
          }
        }
      });
      const row = (await loadCalendarItem(id))!;
      return calendarDto(row.items, row.calendar_items, row.exdates);
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 512 })),
        startAtUTC: t.Optional(t.String({ format: "date-time" })),
        endAtUTC: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
        allDay: t.Optional(t.Boolean()),
        location: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        descriptionMd: t.Optional(t.Nullable(t.String())),
        rrule: t.Optional(t.Nullable(t.String({ maxLength: 1024 }))),
        timezone: t.Optional(t.Nullable(t.String({ maxLength: 64 }))),
        exdatesUTC: t.Optional(t.Array(t.String({ format: "date-time" }))),
        categoryId: t.Optional(t.Nullable(t.Number())),
        priorityId: t.Optional(t.Nullable(t.Number())),
      }),
    },
  )
  .delete("/items/:id", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can archive" };
    }
    await db.update(items).set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
    return { ok: true };
  })
  .post("/items/:id/restore", async ({ user, params, set }) => {
    const id = Number(params.id);
    const access = await getItemAccess(user!, id);
    if (access !== "owner") {
      set.status = access === null ? 404 : 403;
      return { error: access === null ? "not found" : "only the owner can restore" };
    }
    await db.update(items).set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
    return { ok: true };
  });
