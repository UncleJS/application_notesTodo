import { Elysia, t } from "elysia";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { items, todos } from "../db/schema/items";
import { itemTags, tags } from "../db/schema/linksTags";
import { requireAuth } from "../middleware/auth";
import { atLeast, getItemAccess } from "../services/itemAccess";
import { isDupEntry } from "../lib/dbErrors";
import { nowUtcSql } from "../lib/time";

/**
 * Bulk operations on todos. Per-id access is enforced individually:
 * done/addTag need ≥edit, archive needs owner. Items that fail the check
 * (or aren't todos) are skipped and reported, not fatal.
 */
export const bulkRoutes = new Elysia({ prefix: "/api/v1/todos" })
  .use(requireAuth)
  .post(
    "/bulk",
    async ({ user, body, set }) => {
      if (body.op === "addTag") {
        if (!body.tagId) {
          set.status = 422;
          return { error: "tagId is required for addTag" };
        }
        const tag = (
          await db
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.id, body.tagId), isNull(tags.archivedAtUTC)))
            .limit(1)
        )[0];
        if (!tag) {
          set.status = 422;
          return { error: "unknown tagId" };
        }
      }

      const skipped: Array<{ id: number; reason: string }> = [];
      let updated = 0;

      for (const id of new Set(body.ids)) {
        const required = body.op === "archive" ? "owner" : "edit";
        const access = await getItemAccess(user!, id);
        if (!atLeast(access, required)) {
          skipped.push({ id, reason: access === null ? "not found" : "forbidden" });
          continue;
        }
        const row = (
          await db
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.id, id), eq(items.itemType, "todo")))
            .limit(1)
        )[0];
        if (!row) {
          skipped.push({ id, reason: "not a todo" });
          continue;
        }

        if (body.op === "done") {
          await db
            .update(todos)
            .set({ done: true, doneAtUTC: nowUtcSql() })
            .where(and(eq(todos.itemId, id), eq(todos.done, false)));
          await db.update(items).set({ updatedAtUTC: nowUtcSql() }).where(eq(items.id, id));
        } else if (body.op === "archive") {
          await db
            .update(items)
            .set({ archivedAtUTC: nowUtcSql(), updatedAtUTC: nowUtcSql() })
            .where(eq(items.id, id));
        } else {
          // addTag — restore an archived attachment if present, else insert (dup = already tagged)
          const archived = (
            await db
              .select()
              .from(itemTags)
              .where(and(eq(itemTags.itemId, id), eq(itemTags.tagId, body.tagId!)))
          ).find((r) => r.archivedAtUTC !== null);
          try {
            if (archived) {
              await db
                .update(itemTags)
                .set({ archivedAtUTC: null, updatedAtUTC: nowUtcSql() })
                .where(eq(itemTags.id, archived.id));
            } else {
              await db.insert(itemTags).values({
                itemId: id,
                tagId: body.tagId!,
                createdAtUTC: nowUtcSql(),
                updatedAtUTC: nowUtcSql(),
              });
            }
          } catch (err) {
            if (!isDupEntry(err)) throw err; // dup = already tagged — count as updated
          }
        }
        updated++;
      }

      return { updated, skipped };
    },
    {
      body: t.Object({
        ids: t.Array(t.Number(), { minItems: 1, maxItems: 200 }),
        op: t.Union([t.Literal("done"), t.Literal("archive"), t.Literal("addTag")]),
        tagId: t.Optional(t.Number()),
      }),
    },
  );
