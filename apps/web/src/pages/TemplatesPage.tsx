import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { TimeInput } from "@/components/TimeInput";
import { CategorySelect, PrioritySelect } from "@/features/lookups/LookupSelects";
import { useCategories, usePriorities } from "@/features/lookups/useLookups";
import { TagChips } from "@/features/tags/TagPicker";
import { useTags } from "@/features/tags/useTags";
import { InstantiateTemplateDialog } from "@/features/templates/InstantiateTemplateDialog";
import { useTemplates, type Template } from "@/features/templates/useTemplates";

export interface TemplateItem {
  id: number;
  templateId: number;
  itemType: "note" | "todo" | "calendar";
  title: string;
  categoryId: number | null;
  priorityId: number | null;
  relativeDueDays: number | null;
  sortOrder: number;
  bodyMd: string | null;
  startTimeUTC: string | null;
  durationMinutes: number | null;
  allDay: boolean;
  location: string | null;
  descriptionMd: string | null;
  tagIds: number[];
}

function localTime(utcTime: string): string {
  const [h, m, s] = utcTime.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h ?? 0, m ?? 0, s ?? 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

const emptyNewItem = {
  itemType: "todo" as "note" | "todo" | "calendar",
  title: "",
  relativeDueDays: "",
  categoryId: "",
  priorityId: "",
  tagIds: [] as number[],
  bodyMd: "",
  startTimeUTC: null as string | null,
  durationMinutes: "",
  allDay: false,
  location: "",
  descriptionMd: "",
};

/** Tag multi-select: dropdown to add + removable chips. */
function TagIdsPicker({
  tagIds,
  onChange,
}: {
  tagIds: number[];
  onChange: (tagIds: number[]) => void;
}) {
  const tags = useTags();
  return (
    <>
      <Select
        className="h-8 w-32 text-xs"
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id && !tagIds.includes(id)) onChange([...tagIds, id]);
        }}
      >
        <option value="">Tag…</option>
        {tags.data
          ?.filter((t) => !tagIds.includes(t.id))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </Select>
      {tagIds.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5">
          {tagIds.map((id) => {
            const tag = tags.data?.find((t) => t.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
                style={tag?.color ? { borderColor: tag.color } : undefined}
              >
                #{tag?.name ?? id}
                <button
                  type="button"
                  className="text-foreground hover:opacity-70"
                  onClick={() => onChange(tagIds.filter((t) => t !== id))}
                >
                  ×
                </button>
              </span>
            );
          })}
        </span>
      )}
    </>
  );
}

/** Template-level category/priority: override every item's own at instantiation. */
function TemplateDefaultsRow({
  templateId,
  categoryId,
  priorityId,
}: {
  templateId: number;
  categoryId: number | null;
  priorityId: number | null;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (json: { categoryId?: number | null; priorityId?: number | null }) =>
      api(`/api/v1/templates/${templateId}`, { method: "PATCH", json }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["templates"], exact: false }),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-foreground/70">For all items (overrides item's own):</span>
      <CategorySelect value={categoryId} onChange={(v) => save.mutate({ categoryId: v })} />
      <PrioritySelect value={priorityId} onChange={(v) => save.mutate({ priorityId: v })} />
      {save.isError && <p className="text-xs text-destructive">{(save.error as Error).message}</p>}
    </div>
  );
}

/** Template-level tags: applied to every item at instantiation. */
function TemplateTagsRow({ templateId, tagIds }: { templateId: number; tagIds: number[] }) {
  const qc = useQueryClient();
  const tags = useTags();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["templates"], exact: false });
  const attach = useMutation({
    mutationFn: (tagId: number) =>
      api(`/api/v1/templates/${templateId}/tags`, { method: "POST", json: { tagId } }),
    onSuccess: invalidate,
  });
  const detach = useMutation({
    mutationFn: (tagId: number) =>
      api(`/api/v1/templates/${templateId}/tags/${tagId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-foreground/70">Tags for all items:</span>
      {tagIds.map((id) => {
        const tag = tags.data?.find((t) => t.id === id);
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
            style={tag?.color ? { borderColor: tag.color } : undefined}
          >
            #{tag?.name ?? id}
            <button
              type="button"
              className="text-foreground hover:opacity-70"
              onClick={() => detach.mutate(id)}
            >
              ×
            </button>
          </span>
        );
      })}
      <Select
        className="h-7 w-28 text-xs"
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) attach.mutate(id);
        }}
      >
        <option value="">Add tag…</option>
        {tags.data
          ?.filter((t) => !tagIds.includes(t.id))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </Select>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["templates", template.id],
    queryFn: () => api<Template & { items: TemplateItem[] }>(`/api/v1/templates/${template.id}`),
    enabled: !template.archivedAtUTC,
  });
  const categories = useCategories();
  const priorities = usePriorities();

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["templates"], exact: false });

  const [newItem, setNewItem] = useState(emptyNewItem);
  const [editingId, setEditingId] = useState<number | null>(null);
  const isNote = newItem.itemType === "note";
  const isCal = newItem.itemType === "calendar";
  const saveItem = useMutation({
    mutationFn: () => {
      const json = {
        itemType: newItem.itemType,
        title: newItem.title,
        relativeDueDays:
          !isNote && newItem.relativeDueDays !== "" ? Number(newItem.relativeDueDays) : null,
        categoryId: newItem.categoryId ? Number(newItem.categoryId) : null,
        priorityId: newItem.priorityId ? Number(newItem.priorityId) : null,
        tagIds: newItem.tagIds,
        bodyMd: isNote && newItem.bodyMd ? newItem.bodyMd : null,
        startTimeUTC: isCal && !newItem.allDay ? newItem.startTimeUTC : null,
        durationMinutes:
          isCal && !newItem.allDay && newItem.durationMinutes !== ""
            ? Number(newItem.durationMinutes)
            : null,
        allDay: isCal ? newItem.allDay : false,
        location: isCal && newItem.location ? newItem.location : null,
        descriptionMd: isCal && newItem.descriptionMd ? newItem.descriptionMd : null,
      };
      return editingId
        ? api(`/api/v1/templates/${template.id}/items/${editingId}`, { method: "PATCH", json })
        : api(`/api/v1/templates/${template.id}/items`, {
            method: "POST",
            json: { ...json, sortOrder: detail.data?.items.length ?? 0 },
          });
    },
    onSuccess: () => {
      setNewItem(emptyNewItem);
      setEditingId(null);
      invalidate();
    },
  });

  function startEdit(item: TemplateItem) {
    setEditingId(item.id);
    setNewItem({
      itemType: item.itemType,
      title: item.title,
      relativeDueDays: item.relativeDueDays !== null ? String(item.relativeDueDays) : "",
      categoryId: item.categoryId !== null ? String(item.categoryId) : "",
      priorityId: item.priorityId !== null ? String(item.priorityId) : "",
      tagIds: [...item.tagIds],
      bodyMd: item.bodyMd ?? "",
      startTimeUTC: item.startTimeUTC,
      durationMinutes: item.durationMinutes !== null ? String(item.durationMinutes) : "",
      allDay: item.allDay,
      location: item.location ?? "",
      descriptionMd: item.descriptionMd ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setNewItem(emptyNewItem);
  }
  const removeItem = useMutation({
    mutationFn: (itemId: number) =>
      api(`/api/v1/templates/${template.id}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: (_data, itemId) => {
      if (itemId === editingId) cancelEdit();
      invalidate();
    },
  });
  const archive = useMutation({
    mutationFn: () => api(`/api/v1/templates/${template.id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: () => api(`/api/v1/templates/${template.id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });
  const [instOpen, setInstOpen] = useState(false);

  return (
    <Card className={template.archivedAtUTC ? "opacity-60" : undefined}>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{template.name}</CardTitle>
          {template.description && <p className="text-sm text-foreground/80">{template.description}</p>}
        </div>
        <div className="flex gap-2">
          {template.archivedAtUTC ? (
            <Button size="sm" variant="outline" onClick={() => restore.mutate()}>
              Restore
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={!detail.data?.items.length} onClick={() => setInstOpen(true)}>
                Create items
              </Button>
              <Button size="sm" variant="destructive" onClick={() => archive.mutate()}>
                Archive
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      {!template.archivedAtUTC && (
        <CardContent className="flex flex-col gap-3">
          <TemplateDefaultsRow
            templateId={template.id}
            categoryId={detail.data?.categoryId ?? null}
            priorityId={detail.data?.priorityId ?? null}
          />
          <TemplateTagsRow templateId={template.id} tagIds={detail.data?.tagIds ?? []} />
          <ul className="flex flex-col gap-1">
            {detail.data?.items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-2 text-sm text-foreground ${editingId === item.id ? "rounded bg-accent/40 px-1" : ""}`}
              >
                <Badge className="shrink-0">
                  {item.itemType === "calendar" ? "event" : item.itemType}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <TagChips tagIds={item.tagIds} />
                {item.itemType === "calendar" && (
                  <span className="text-xs text-foreground/70">
                    {item.allDay
                      ? "all day"
                      : item.startTimeUTC
                        ? `@ ${localTime(item.startTimeUTC)}${item.durationMinutes ? ` · ${item.durationMinutes}min` : ""}`
                        : null}
                  </span>
                )}
                {item.itemType !== "note" && item.relativeDueDays !== null && (
                  <span className="text-xs text-foreground/70">+{item.relativeDueDays}d</span>
                )}
                <Button size="sm" variant="ghost" title="Edit item" onClick={() => startEdit(item)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" title="Remove item" onClick={() => removeItem.mutate(item.id)}>
                  ×
                </Button>
              </li>
            ))}
            {detail.data?.items.length === 0 && (
              <span className="text-xs text-foreground/70">No items yet — add some below.</span>
            )}
          </ul>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveItem.mutate();
            }}
          >
            {editingId && (
              <span className="w-full text-xs font-medium text-foreground">Editing item…</span>
            )}
            <Select
              className="h-8 w-24 text-xs"
              value={newItem.itemType}
              onChange={(e) =>
                setNewItem({ ...newItem, itemType: e.target.value as typeof newItem.itemType })
              }
            >
              <option value="todo">Todo</option>
              <option value="note">Note</option>
              <option value="calendar">Event</option>
            </Select>
            <Input
              placeholder="Title"
              value={newItem.title}
              onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
              className="h-8 w-48 text-xs"
            />
            {!isNote && (
              <Input
                placeholder="+days"
                type="number"
                value={newItem.relativeDueDays}
                onChange={(e) => setNewItem({ ...newItem, relativeDueDays: e.target.value })}
                className="h-8 w-20 text-xs"
              />
            )}
            {isCal && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={newItem.allDay}
                    onChange={(e) => setNewItem({ ...newItem, allDay: e.target.checked })}
                  />
                  All day
                </label>
                {!newItem.allDay && (
                  <>
                    <TimeInput
                      value={newItem.startTimeUTC}
                      onChange={(v) => setNewItem({ ...newItem, startTimeUTC: v })}
                    />
                    <Input
                      placeholder="Duration min"
                      type="number"
                      value={newItem.durationMinutes}
                      onChange={(e) => setNewItem({ ...newItem, durationMinutes: e.target.value })}
                      className="h-8 w-28 text-xs"
                    />
                  </>
                )}
                <Input
                  placeholder="Location"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  className="h-8 w-36 text-xs"
                />
              </>
            )}
            <Select
              className="h-8 w-32 text-xs"
              value={newItem.categoryId}
              onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
            >
              <option value="">Category…</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              className="h-8 w-32 text-xs"
              value={newItem.priorityId}
              onChange={(e) => setNewItem({ ...newItem, priorityId: e.target.value })}
            >
              <option value="">Priority…</option>
              {priorities.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <TagIdsPicker
              tagIds={newItem.tagIds}
              onChange={(tagIds) => setNewItem({ ...newItem, tagIds })}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newItem.title || saveItem.isPending}>
              {editingId ? "Save" : "Add"}
            </Button>
            {editingId && (
              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
            {isNote && (
              <Textarea
                placeholder="Note body (markdown)"
                value={newItem.bodyMd}
                onChange={(e) => setNewItem({ ...newItem, bodyMd: e.target.value })}
                className="min-h-16 w-full text-xs"
              />
            )}
            {isCal && (
              <Textarea
                placeholder="Event description (markdown)"
                value={newItem.descriptionMd}
                onChange={(e) => setNewItem({ ...newItem, descriptionMd: e.target.value })}
                className="min-h-16 w-full text-xs"
              />
            )}
            {saveItem.isError && (
              <p className="w-full text-xs text-destructive">{(saveItem.error as Error).message}</p>
            )}
          </form>
        </CardContent>
      )}
      {instOpen && (
        <InstantiateTemplateDialog
          templateId={template.id}
          templateName={template.name}
          open
          onOpenChange={setInstOpen}
          onDone={() => navigate("/todos")}
        />
      )}
    </Card>
  );
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const templates = useTemplates(showArchived);

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/templates", {
        method: "POST",
        json: { name: form.name, description: form.description || null },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: "", description: "" });
      void qc.invalidateQueries({ queryKey: ["templates"], exact: false });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Templates</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          New template
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      <div className="flex max-w-3xl flex-col gap-3">
        {templates.data?.map((tpl) => (
          <TemplateCard key={tpl.id} template={tpl} />
        ))}
        {templates.data?.length === 0 && <p className="text-sm text-foreground">No templates.</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>New template</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {create.isError && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
            <Button type="submit" disabled={!form.name || create.isPending}>
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
