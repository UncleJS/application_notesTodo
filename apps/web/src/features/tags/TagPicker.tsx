import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateTag, useTags } from "./useTags";

export function TagChips({ tagIds }: { tagIds: number[] }) {
  const tags = useTags();
  if (!tagIds.length) return null;
  return (
    <>
      {tagIds.map((id) => {
        const tag = tags.data?.find((t) => t.id === id);
        if (!tag) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
            style={tag.color ? { borderColor: tag.color } : undefined}
          >
            #{tag.name}
          </span>
        );
      })}
    </>
  );
}

export function TagPicker({
  itemId,
  tagIds,
  invalidateKeys,
  canEdit = true,
}: {
  itemId: number;
  tagIds: number[];
  invalidateKeys: unknown[][];
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const tags = useTags();
  const createTag = useCreateTag();
  const [newName, setNewName] = useState("");

  const invalidate = () => {
    for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key, exact: false });
  };

  const attach = useMutation({
    mutationFn: (tagId: number) => api(`/api/v1/items/${itemId}/tags`, { method: "POST", json: { tagId } }),
    onSuccess: invalidate,
  });
  const detach = useMutation({
    mutationFn: (tagId: number) => api(`/api/v1/items/${itemId}/tags/${tagId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const available = tags.data?.filter((t) => !tagIds.includes(t.id)) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tagIds.map((id) => {
          const tag = tags.data?.find((t) => t.id === id);
          if (!tag) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
              style={tag.color ? { borderColor: tag.color } : undefined}
            >
              #{tag.name}
              {canEdit && (
                <button
                  type="button"
                  className="text-foreground hover:opacity-70"
                  onClick={() => detach.mutate(id)}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {tagIds.length === 0 && <span className="text-xs text-foreground/70">No tags</span>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          {available.length > 0 && (
            <Select
              className="h-8 w-36 text-xs"
              value=""
              onChange={(e) => {
                if (e.target.value) attach.mutate(Number(e.target.value));
              }}
            >
              <option value="">Add tag…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              createTag.mutate(name, {
                onSuccess: (tag) => {
                  setNewName("");
                  attach.mutate(tag.id);
                },
              });
            }}
          >
            <Input
              placeholder="New tag"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 w-28 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()}>
              +
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
