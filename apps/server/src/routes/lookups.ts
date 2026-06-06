import { Elysia, t } from "elysia";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { categories, priorities } from "../db/schema/lookups";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { isDupEntry } from "../lib/dbErrors";
import { nowUtcSql, sqlToIso } from "../lib/time";

// Read: any authenticated user (dropdowns). Mutate: admin via Settings.

// `table` is typed as the categories table for simplicity; priorities is
// structurally compatible for every column this factory touches (the
// extra weight/sortOrder fields flow through `extraFields.pick` untyped).
function makeLookupRoutes(
  prefix: string,
  table: typeof categories,
  orderBy: () => ReturnType<typeof asc>,
  extraFields: {
    body: Record<string, ReturnType<typeof t.Optional>>;
    pick: (body: Record<string, unknown>) => Record<string, unknown>;
  },
) {
  const dto = (r: Record<string, unknown>) => ({
    ...r,
    createdAtUTC: sqlToIso(r.createdAtUTC as string),
    updatedAtUTC: sqlToIso(r.updatedAtUTC as string),
    archivedAtUTC: sqlToIso(r.archivedAtUTC as string | null),
  });

  return new Elysia({ prefix })
    .use(requireAuth)
    .get(
      "/",
      async ({ query }) => {
        const rows =
          query.includeArchived === "true"
            ? await db.select().from(table).orderBy(orderBy())
            : await db.select().from(table).where(isNull(table.archivedAtUTC)).orderBy(orderBy());
        return rows.map((r) => dto(r as Record<string, unknown>));
      },
      { query: t.Object({ includeArchived: t.Optional(t.String()) }) },
    )
    .use(requireAdmin)
    .post(
      "/",
      async ({ body, set }) => {
        try {
          const values = {
            name: (body as { name: string }).name,
            ...extraFields.pick(body as Record<string, unknown>),
            createdAtUTC: nowUtcSql(),
            updatedAtUTC: nowUtcSql(),
          };
          const [res] = await db.insert(table).values(values as never);
          const row = (await db.select().from(table).where(eq(table.id, res.insertId)))[0]!;
          set.status = 201;
          return dto(row as Record<string, unknown>);
        } catch (err) {
          if (isDupEntry(err)) {
            set.status = 409;
            return { error: "name already in use" };
          }
          throw err;
        }
      },
      { body: t.Object({ name: t.String({ minLength: 1, maxLength: 128 }), ...extraFields.body }) },
    )
    .patch(
      "/:id",
      async ({ params, body, set }) => {
        try {
          await db
            .update(table)
            .set({
              ...((body as { name?: string }).name !== undefined
                ? { name: (body as { name: string }).name }
                : {}),
              ...extraFields.pick(body as Record<string, unknown>),
              updatedAtUTC: nowUtcSql(),
            } as never)
            .where(eq(table.id, Number(params.id)));
        } catch (err) {
          if (isDupEntry(err)) {
            set.status = 409;
            return { error: "name already in use" };
          }
          throw err;
        }
        const row = (await db.select().from(table).where(eq(table.id, Number(params.id))))[0];
        if (!row) {
          set.status = 404;
          return { error: "not found" };
        }
        return dto(row as Record<string, unknown>);
      },
      {
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
          ...extraFields.body,
        }),
      },
    )
    .delete("/:id", async ({ params }) => {
      await db
        .update(table)
        .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() } as never)
        .where(eq(table.id, Number(params.id)));
      return { ok: true };
    })
    .post("/:id/restore", async ({ params, set }) => {
      try {
        await db
          .update(table)
          .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() } as never)
          .where(eq(table.id, Number(params.id)));
      } catch (err) {
        if (isDupEntry(err)) {
          set.status = 409;
          return { error: "an active entry already has this name" };
        }
        throw err;
      }
      return { ok: true };
    });
}

export const categoryRoutes = makeLookupRoutes("/api/v1/categories", categories, () => asc(categories.sortOrder), {
  body: {
    color: t.Optional(t.Nullable(t.String({ maxLength: 16 }))),
    sortOrder: t.Optional(t.Number()),
  },
  pick: (b) => ({
    ...(b.color !== undefined ? { color: b.color } : {}),
    ...(b.sortOrder !== undefined ? { sortOrder: b.sortOrder } : {}),
  }),
});

export const priorityRoutes = makeLookupRoutes("/api/v1/priorities", priorities as unknown as typeof categories, () => asc(priorities.weight), {
  body: {
    color: t.Optional(t.Nullable(t.String({ maxLength: 16 }))),
    weight: t.Optional(t.Number()),
  },
  pick: (b) => ({
    ...(b.color !== undefined ? { color: b.color } : {}),
    ...(b.weight !== undefined ? { weight: b.weight } : {}),
  }),
});
