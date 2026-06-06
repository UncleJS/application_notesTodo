import { useState } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateTimeInput } from "@/components/DateTimeInput";
import { CategorySelect, LookupBadges, PrioritySelect } from "@/features/lookups/LookupSelects";
import { TagChips } from "@/features/tags/TagPicker";
import { useCategories, usePriorities } from "@/features/lookups/useLookups";
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
  archivedAtUTC: string | null;
}

interface TodoForm {
  id?: number;
  title: string;
  dueAtUTC: string | null;
  notesMd: string;
  categoryId: number | null;
  priorityId: number | null;
  archivedAtUTC?: string | null;
  /** carried along for "save as template" — not edited in this dialog */
  tagIds?: number[];
}

const emptyForm: TodoForm = { title: "", dueAtUTC: null, notesMd: "", categoryId: null, priorityId: null };

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
  const templates = useTemplates();
  const [tplTarget, setTplTarget] = useState("");
  const [newTplName, setNewTplName] = useState("");
  const save = useMutation({
    mutationFn: (f: TodoForm) => {
      const json = {
        title: f.title,
        dueAtUTC: f.dueAtUTC,
        notesMd: f.notesMd || null,
        categoryId: f.categoryId,
        priorityId: f.priorityId,
      };
      return f.id
        ? api<Todo>(`/api/v1/todos/${f.id}`, { method: "PATCH", json })
        : api<Todo>("/api/v1/todos", { method: "POST", json });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
      onClose();
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => api(`/api/v1/todos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
      onClose();
    },
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/v1/todos/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey.slice(0, 1), exact: false });
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
  const [filters, setFilters] = useState({ done: "", category: "", priority: "", tag: "", showArchived: false });
  const [form, setForm] = useState<TodoForm | null>(null);
  const [instTpl, setInstTpl] = useState<Template | null>(null);
  const qc = useQueryClient();
  const categories = useCategories();
  const priorities = usePriorities();
  const tags = useTags();
  const templates = useTemplates();

  const listKey = ["todos", filters];
  const todos = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.showArchived) params.set("includeArchived", "true");
      if (filters.done) params.set("done", filters.done);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.tag) params.set("tag", filters.tag);
      return api<Todo[]>(`/api/v1/todos?${params}`);
    },
  });

  const toggle = useMutation({
    mutationFn: (id: number) => api<Todo>(`/api/v1/todos/${id}/toggle`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["todos"], exact: false }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Todos</h1>
        <Button size="sm" onClick={() => setForm(emptyForm)}>
          New todo
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
        <div className="ml-auto flex items-center gap-2">
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
        </div>
      </div>
      <ul className="flex flex-col">
        {todos.data?.map((todo) => (
          <li
            key={todo.id}
            className={`flex items-center gap-3 border-b border-border/50 px-1 py-2 hover:bg-accent/40 ${todo.archivedAtUTC ? "opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggle.mutate(todo.id)}
              className="h-4 w-4"
            />
            <button
              className={`min-w-0 flex-1 truncate text-left text-sm text-foreground ${todo.done ? "line-through opacity-70" : ""}`}
              onClick={() =>
                setForm({
                  id: todo.id,
                  title: todo.title,
                  dueAtUTC: todo.dueAtUTC,
                  notesMd: todo.notesMd ?? "",
                  categoryId: todo.categoryId,
                  priorityId: todo.priorityId,
                  archivedAtUTC: todo.archivedAtUTC,
                  tagIds: todo.tagIds,
                })
              }
            >
              {todo.title}
            </button>
            {todo.hasLinks && (
              <Link to={`/items/${todo.id}`} title="Has linked items" className="shrink-0">
                <Link2 className="h-3.5 w-3.5 text-foreground" />
              </Link>
            )}
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
        {todos.data?.length === 0 && <p className="py-4 text-sm text-foreground">No todos.</p>}
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
