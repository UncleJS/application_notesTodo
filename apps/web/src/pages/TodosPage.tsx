import { useState } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { makeOptimistic } from "@/lib/optimistic";
import { getDefaults, rememberDefaults } from "@/lib/itemDefaults";
import { useToast } from "@/components/ui/toast";
import { useRegisterCreateAction } from "@/features/command/CreateActionContext";
import { QueryError } from "@/components/QueryError";
import { SkeletonList } from "@/components/Skeleton";
import { FiltersBar } from "@/components/FiltersBar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateTimeInput } from "@/components/DateTimeInput";
import { CategorySelect, LookupBadges, PrioritySelect, StatusBadge, StatusSelect } from "@/features/lookups/LookupSelects";
import { TagChips, TagPicker } from "@/features/tags/TagPicker";
import { LinkChips } from "@/features/links/LinkChips";
import { useCategories, usePriorities, useStatuses } from "@/features/lookups/useLookups";
import { useTags } from "@/features/tags/useTags";
import { InstantiateTemplateDialog } from "@/features/templates/InstantiateTemplateDialog";
import { useTemplates, type Template } from "@/features/templates/useTemplates";

export interface Todo {
  id: number;
  title: string;
  tagIds: number[];
  hasLinks: boolean;
  done: boolean;
  doneAtUTC: string | null;
  dueAtUTC: string | null;
  notesMd: string | null;
  ownerId: number;
  categoryId: number | null;
  priorityId: number | null;
  statusId: number | null;
  archivedAtUTC: string | null;
}

export interface TodoForm {
  id?: number;
  title: string;
  dueAtUTC: string | null;
  notesMd: string;
  categoryId: number | null;
  priorityId: number | null;
  statusId: number | null;
  archivedAtUTC?: string | null;
  /** carried along for "save as template" — not edited in this dialog */
  tagIds?: number[];
}

const emptyForm: TodoForm = {
  title: "",
  dueAtUTC: null,
  notesMd: "",
  categoryId: null,
  priorityId: null,
  statusId: null,
};

export function TodoDialog({
  form,
  setForm,
  onClose,
  listKey,
}: {
  form: TodoForm | null;
  setForm: (f: TodoForm | null) => void;
  onClose: () => void;
  listKey: unknown[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const templates = useTemplates();
  const [tplTarget, setTplTarget] = useState("");
  const [newTplName, setNewTplName] = useState("");
  // fresh copy while editing so the embedded tag/link panels stay current
  const fresh = useQuery({
    queryKey: ["todos", "detail", form?.id],
    queryFn: () => api<Todo>(`/api/v1/todos/${form!.id}`),
    enabled: !!form?.id,
  });
  const save = useMutation({
    mutationFn: (f: TodoForm) => {
      const json = {
        title: f.title,
        dueAtUTC: f.dueAtUTC,
        notesMd: f.notesMd || null,
        categoryId: f.categoryId,
        priorityId: f.priorityId,
        statusId: f.statusId,
      };
      return f.id
        ? api<Todo>(`/api/v1/todos/${f.id}`, { method: "PATCH", json })
        : api<Todo>("/api/v1/todos", { method: "POST", json });
    },
    onSuccess: (_data, f) => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
      rememberDefaults("todo", { categoryId: f.categoryId, priorityId: f.priorityId });
      toast({ title: f.id ? "Todo saved" : "Todo created" });
      onClose();
    },
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/v1/todos/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
      toast({ title: "Todo restored" });
      onClose();
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => api(`/api/v1/todos/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
      toast({
        title: "Todo archived",
        description: "It can be restored at any time.",
        action: { label: "Undo", onClick: () => restore.mutate(id) },
      });
      onClose();
    },
  });
  const saveAsTemplate = useMutation({
    mutationFn: async (f: TodoForm) => {
      let templateId = Number(tplTarget);
      if (tplTarget === "new") {
        const tpl = await api<Template>("/api/v1/templates", {
          method: "POST",
          json: { name: newTplName, description: null },
        });
        templateId = tpl.id;
      }
      const relativeDueDays = f.dueAtUTC
        ? Math.round((new Date(f.dueAtUTC).getTime() - Date.now()) / 86400_000)
        : null;
      return api(`/api/v1/templates/${templateId}/items`, {
        method: "POST",
        json: {
          itemType: "todo",
          title: f.title,
          categoryId: f.categoryId,
          priorityId: f.priorityId,
          statusId: f.statusId,
          relativeDueDays,
          sortOrder: 0,
          tagIds: f.tagIds ?? [],
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["templates"], exact: false });
      setTplTarget("");
      setNewTplName("");
    },
  });

  if (!form) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>
          {form.id ? "Edit todo" : "New todo"}
          {form.id && (
            <Link to={`/items/${form.id}`} className="ml-3 text-sm font-normal text-foreground underline">
              Tags &amp; links
            </Link>
          )}
        </DialogTitle>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Due (local time)</Label>
            <DateTimeInput value={form.dueAtUTC} onChange={(v) => setForm({ ...form, dueAtUTC: v })} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Category</Label>
              <CategorySelect value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Priority</Label>
              <PrioritySelect value={form.priorityId} onChange={(v) => setForm({ ...form, priorityId: v })} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Status</Label>
              <StatusSelect value={form.statusId} onChange={(v) => setForm({ ...form, statusId: v })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notesMd}
              onChange={(e) => setForm({ ...form, notesMd: e.target.value })}
              className="min-h-24"
            />
          </div>
          {form.id && (
            <div className="flex flex-col gap-1.5">
              <Label>Tags</Label>
              <TagPicker itemId={form.id} tagIds={fresh.data?.tagIds ?? form.tagIds ?? []} invalidateKeys={[["todos"]]} />
            </div>
          )}
          {form.id && (
            <div className="flex flex-col gap-1.5">
              <Label>Linked items</Label>
              <LinkChips itemId={form.id} />
            </div>
          )}
          {form.id && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-2">
              <p className="text-xs text-foreground">Save this todo as a template item</p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="h-8 w-44 text-xs"
                  value={tplTarget}
                  onChange={(e) => setTplTarget(e.target.value)}
                >
                  <option value="">Choose template…</option>
                  {templates.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="new">+ New template…</option>
                </Select>
                {tplTarget === "new" && (
                  <Input
                    placeholder="Template name"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    className="h-8 w-44 text-xs"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    !tplTarget || (tplTarget === "new" && !newTplName) || saveAsTemplate.isPending
                  }
                  onClick={() => saveAsTemplate.mutate(form)}
                >
                  Save as template
                </Button>
              </div>
              {saveAsTemplate.isSuccess && <p className="text-xs text-foreground">Added to template.</p>}
              {saveAsTemplate.isError && (
                <p className="text-xs text-destructive">{(saveAsTemplate.error as Error).message}</p>
              )}
            </div>
          )}
          {save.isError && <p className="text-sm text-destructive">{(save.error as Error).message}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!form.title || save.isPending}>
              {form.id ? "Save" : "Create"}
            </Button>
            {form.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm({ ...form, id: undefined, archivedAtUTC: null })}
              >
                Duplicate
              </Button>
            )}
            {form.id &&
              (form.archivedAtUTC ? (
                <Button type="button" variant="outline" onClick={() => restore.mutate(form.id!)}>
                  Restore
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={() => archive.mutate(form.id!)}>
                  Archive
                </Button>
              ))}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TodosPage() {
  const [filters, setFilters] = useState({
    done: "",
    category: "",
    priority: "",
    status: "",
    tag: "",
    showArchived: false,
  });
  const [form, setForm] = useState<TodoForm | null>(null);
  const [instTpl, setInstTpl] = useState<Template | null>(null);
  // bulk selection mode
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const categories = useCategories();
  const priorities = usePriorities();
  const statuses = useStatuses();
  const tags = useTags();
  const templates = useTemplates();

  useRegisterCreateAction(() => setForm({ ...emptyForm, ...getDefaults("todo") }));

  const listKey = ["todos", filters];
  const todos = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.showArchived) params.set("includeArchived", "true");
      if (filters.done) params.set("done", filters.done);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.status) params.set("status", filters.status);
      if (filters.tag) params.set("tag", filters.tag);
      return api<Todo[]>(`/api/v1/todos?${params}`);
    },
  });

  const toggle = useMutation({
    mutationFn: (id: number) => api<Todo>(`/api/v1/todos/${id}/toggle`, { method: "POST" }),
    ...makeOptimistic<Todo, number>(qc, [["todos"]], (t, id) =>
      t.id === id ? { ...t, done: !t.done, doneAtUTC: t.done ? null : new Date().toISOString() } : t,
    ),
  });

  // inline title edit (double-click a todo title)
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      api<Todo>(`/api/v1/todos/${id}`, { method: "PATCH", json: { title } }),
    ...makeOptimistic<Todo, { id: number; title: string }>(qc, [["todos"]], (t, vars) =>
      t.id === vars.id ? { ...t, title: vars.title } : t,
    ),
  });
  const commitRename = () => {
    if (editing && editing.title.trim()) rename.mutate({ id: editing.id, title: editing.title.trim() });
    setEditing(null);
  };

  const bulk = useMutation({
    mutationFn: (vars: { op: "done" | "archive" | "addTag"; tagId?: number }) =>
      api<{ updated: number; skipped: Array<{ id: number; reason: string }> }>("/api/v1/todos/bulk", {
        method: "POST",
        json: { ids: [...selected], ...vars },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["todos"], exact: false });
      toast({
        title: `${res.updated} updated${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}`,
        description: res.skipped.length ? res.skipped.map((s) => `#${s.id}: ${s.reason}`).join(", ") : undefined,
      });
      setSelected(new Set());
      setSelecting(false);
      setBulkTag("");
    },
    onError: (err) => toast({ title: "Bulk action failed", description: (err as Error).message, variant: "destructive" }),
  });
  const toggleSelected = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Todos</h1>
        <Button size="sm" onClick={() => setForm({ ...emptyForm, ...getDefaults("todo") })}>
          New todo
        </Button>
        <Button
          size="sm"
          variant={selecting ? "secondary" : "outline"}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          {selecting ? "Cancel" : "Select"}
        </Button>
        {templates.data && templates.data.length > 0 && (
          <Select
            className="w-44"
            value=""
            onChange={(e) => {
              const tpl = templates.data?.find((t) => t.id === Number(e.target.value));
              if (tpl) setInstTpl(tpl);
            }}
          >
            <option value="">From template…</option>
            {templates.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <FiltersBar
          badge={[filters.done, filters.category, filters.priority, filters.status, filters.tag].filter(Boolean).length}
        >
          <Select
            className="w-32"
            value={filters.done}
            onChange={(e) => setFilters({ ...filters, done: e.target.value })}
          >
            <option value="">All</option>
            <option value="false">Open</option>
            <option value="true">Done</option>
          </Select>
          <Select
            className="w-36"
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-36"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          >
            <option value="">All priorities</option>
            {priorities.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-32"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All statuses</option>
            {statuses.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-32"
            value={filters.tag}
            onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
          >
            <option value="">All tags</option>
            {tags.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => setFilters({ ...filters, showArchived: e.target.checked })}
            />
            Show archived
          </label>
        </FiltersBar>
      </div>
      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
          <span className="text-sm text-foreground">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!selected.size || bulk.isPending}
            onClick={() => bulk.mutate({ op: "done" })}
          >
            Mark done
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.size || bulk.isPending}
            onClick={() => bulk.mutate({ op: "archive" })}
          >
            Archive
          </Button>
          <Select className="h-8 w-36 text-xs" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)}>
            <option value="">Add tag…</option>
            {tags.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.size || !bulkTag || bulk.isPending}
            onClick={() => bulk.mutate({ op: "addTag", tagId: Number(bulkTag) })}
          >
            Apply
          </Button>
        </div>
      )}
      <ul className="flex flex-col">
        {todos.data?.map((todo) => (
          <li
            key={todo.id}
            className={`flex items-center gap-3 border-b border-border/50 px-1 py-2 hover:bg-accent/40 ${todo.archivedAtUTC ? "opacity-60" : ""}`}
          >
            {selecting ? (
              <input
                type="checkbox"
                checked={selected.has(todo.id)}
                onChange={() => toggleSelected(todo.id)}
                className="h-4 w-4 accent-primary"
                aria-label="Select todo"
              />
            ) : (
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggle.mutate(todo.id)}
                className="h-4 w-4"
              />
            )}
            {editing?.id === todo.id ? (
              <Input
                autoFocus
                className="h-7 min-w-0 flex-1 text-sm"
                value={editing.title}
                onChange={(e) => setEditing({ id: todo.id, title: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button
                className={`min-w-0 flex-1 truncate text-left text-sm text-foreground ${todo.done ? "line-through opacity-70" : ""}`}
                title="Click to edit, double-click to rename inline"
                onDoubleClick={() => {
                  setForm(null); // single-click opened the dialog; dblclick means inline rename instead
                  setEditing({ id: todo.id, title: todo.title });
                }}
                onClick={() =>
                  selecting
                    ? toggleSelected(todo.id)
                    : setForm({
                        id: todo.id,
                        title: todo.title,
                        dueAtUTC: todo.dueAtUTC,
                        notesMd: todo.notesMd ?? "",
                        categoryId: todo.categoryId,
                        priorityId: todo.priorityId,
                        statusId: todo.statusId,
                        archivedAtUTC: todo.archivedAtUTC,
                        tagIds: todo.tagIds,
                      })
                }
              >
                {todo.title}
              </button>
            )}
            {todo.hasLinks && (
              <Link to={`/items/${todo.id}`} title="Has linked items" className="shrink-0">
                <Link2 className="h-3.5 w-3.5 text-foreground" />
              </Link>
            )}
            <StatusBadge statusId={todo.statusId} />
            <LookupBadges categoryId={todo.categoryId} priorityId={todo.priorityId} />
            <TagChips tagIds={todo.tagIds} />
            {todo.dueAtUTC && (
              <span
                className={`text-xs ${!todo.done && new Date(todo.dueAtUTC) < new Date() ? "font-medium text-destructive" : "text-foreground/70"}`}
              >
                {formatLocal(todo.dueAtUTC)}
              </span>
            )}
          </li>
        ))}
        {todos.isLoading && <SkeletonList />}
        {todos.isError && <QueryError error={todos.error} onRetry={() => void todos.refetch()} />}
        {todos.data?.length === 0 && (
          <div className="flex items-center gap-3 py-4">
            <p className="text-sm text-foreground">No todos.</p>
            <Button size="sm" variant="outline" onClick={() => setForm({ ...emptyForm, ...getDefaults("todo") })}>
              Create your first todo
            </Button>
          </div>
        )}
      </ul>
      <TodoDialog form={form} setForm={setForm} onClose={() => setForm(null)} listKey={listKey} />
      {instTpl && (
        <InstantiateTemplateDialog
          templateId={instTpl.id}
          templateName={instTpl.name}
          open
          onOpenChange={(o) => !o && setInstTpl(null)}
          onDone={() => setInstTpl(null)}
        />
      )}
    </div>
  );
}
