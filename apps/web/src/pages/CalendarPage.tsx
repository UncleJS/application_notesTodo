import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, ChevronLeft, ChevronRight, Link2, Repeat, Square } from "lucide-react";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/DateTimeInput";
import { CategorySelect, LookupBadges, PrioritySelect } from "@/features/lookups/LookupSelects";
import { useCategories, usePriorities } from "@/features/lookups/useLookups";
import { useTags } from "@/features/tags/useTags";
import { RecurrenceEditor } from "@/features/calendar/RecurrenceEditor";
import { TodoDialog, type Todo, type TodoForm } from "@/pages/TodosPage";
import { cn } from "@/lib/utils";

export interface CalendarItem {
  id: number;
  title: string;
  startAtUTC: string;
  endAtUTC: string | null;
  allDay: boolean;
  location: string | null;
  descriptionMd: string | null;
  rrule: string | null;
  timezone: string | null;
  exdatesUTC: string[];
  tagIds?: number[];
  ownerId: number;
  categoryId: number | null;
  priorityId: number | null;
  archivedAtUTC: string | null;
}

interface Occurrence {
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
}

interface CalForm {
  id?: number;
  title: string;
  startAtUTC: string | null;
  endAtUTC: string | null;
  allDay: boolean;
  location: string;
  descriptionMd: string;
  rrule: string | null;
  timezone: string | null;
  exdatesUTC: string[];
  categoryId: number | null;
  priorityId: number | null;
  archivedAtUTC?: string | null;
  /** set when opened from a recurring occurrence — enables "skip this occurrence" */
  occurrenceStartUTC?: string;
}

const emptyForm: CalForm = {
  title: "",
  startAtUTC: null,
  endAtUTC: null,
  allDay: false,
  location: "",
  descriptionMd: "",
  rrule: null,
  timezone: null,
  exdatesUTC: [],
  categoryId: null,
  priorityId: null,
};

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Monday-based start of the week containing d. */
function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [form, setForm] = useState<CalForm | null>(null);
  const [todoForm, setTodoForm] = useState<TodoForm | null>(null);
  const [filters, setFilters] = useState({ category: "", priority: "", tag: "", kind: "" });
  const categories = useCategories();
  const priorities = usePriorities();
  const tags = useTags();

  const catColor = (id: number | null) =>
    (id !== null ? categories.data?.find((c) => c.id === id)?.color : null) ?? null;

  // visible range per view
  const range = useMemo(() => {
    if (view === "week") {
      const start = weekStart(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { from: start, to: end };
    }
    if (view === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const start = weekStart(first);
      const end = new Date(start);
      end.setDate(end.getDate() + 42);
      return { from: start, to: end };
    }
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 60);
    return { from: start, to: end };
  }, [view, anchor]);

  const occurrences = useQuery({
    queryKey: ["calendar", "range", range.from.toISOString(), range.to.toISOString(), filters],
    queryFn: () => {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.kind) params.set("kind", filters.kind);
      return api<Occurrence[]>(`/api/v1/calendar?${params}`);
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences.data ?? []) {
      const key = localDayKey(o.occurrenceStartUTC);
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [occurrences.data]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["calendar"], exact: false });

  async function openOccurrence(o: Occurrence) {
    if (o.kind === "todo") {
      const todo = await api<Todo>(`/api/v1/todos/${o.itemId}`);
      setTodoForm({
        id: todo.id,
        title: todo.title,
        dueAtUTC: todo.dueAtUTC,
        notesMd: todo.notesMd ?? "",
        categoryId: todo.categoryId,
        priorityId: todo.priorityId,
        archivedAtUTC: todo.archivedAtUTC,
        tagIds: todo.tagIds,
      });
      return;
    }
    const item = await api<CalendarItem>(`/api/v1/calendar/items/${o.itemId}`);
    setForm({
      id: item.id,
      title: item.title,
      startAtUTC: item.startAtUTC,
      endAtUTC: item.endAtUTC,
      allDay: item.allDay,
      location: item.location ?? "",
      descriptionMd: item.descriptionMd ?? "",
      rrule: item.rrule,
      timezone: item.timezone,
      exdatesUTC: item.exdatesUTC,
      categoryId: item.categoryId,
      priorityId: item.priorityId,
      archivedAtUTC: item.archivedAtUTC,
      occurrenceStartUTC: o.recurring ? o.occurrenceStartUTC : undefined,
    });
  }

  const save = useMutation({
    mutationFn: (f: CalForm) => {
      const json = {
        title: f.title,
        startAtUTC: f.startAtUTC,
        endAtUTC: f.endAtUTC,
        allDay: f.allDay,
        location: f.location || null,
        descriptionMd: f.descriptionMd || null,
        rrule: f.rrule,
        timezone: f.timezone,
        exdatesUTC: f.exdatesUTC,
        categoryId: f.categoryId,
        priorityId: f.priorityId,
      };
      return f.id
        ? api<CalendarItem>(`/api/v1/calendar/items/${f.id}`, { method: "PATCH", json })
        : api<CalendarItem>("/api/v1/calendar/items", { method: "POST", json });
    },
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => api(`/api/v1/calendar/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/v1/calendar/items/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const skipOccurrence = useMutation({
    mutationFn: (f: CalForm) =>
      api(`/api/v1/calendar/items/${f.id}`, {
        method: "PATCH",
        json: { exdatesUTC: [...f.exdatesUTC, f.occurrenceStartUTC] },
      }),
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });

  function shift(direction: 1 | -1) {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * 7);
    setAnchor(next);
  }

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const start = weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const start = weekStart(anchor);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [anchor]);

  const todayKey = localDayKey(new Date().toISOString());
  const monthLabel = anchor.toLocaleDateString(undefined, { year: "numeric", month: "long" });

  function dayCell(d: Date, compact: boolean) {
    const key = localDayKey(d.toISOString());
    const dayOcc = byDay.get(key) ?? [];
    const inMonth = d.getMonth() === anchor.getMonth();
    const maxShown = compact ? 3 : 12;
    return (
      <div
        key={key}
        className={cn(
          "flex min-h-20 flex-col gap-0.5 border border-border/50 p-1",
          !inMonth && compact && "opacity-50",
          key === todayKey && "bg-accent/30",
        )}
      >
        <button
          type="button"
          className="self-start rounded px-1 text-xs font-medium text-foreground hover:bg-accent"
          title="New event on this day"
          onClick={() => {
            const start = new Date(d);
            start.setHours(9, 0, 0, 0);
            setForm({ ...emptyForm, startAtUTC: start.toISOString() });
          }}
        >
          {d.getDate()}
        </button>
        {dayOcc.slice(0, maxShown).map((o, i) => {
          const color = catColor(o.categoryId);
          return (
            <button
              key={`${o.itemId}-${o.occurrenceStartUTC}-${i}`}
              type="button"
              className="flex items-center gap-1 truncate rounded border-l-2 border-transparent bg-secondary px-1 py-0.5 text-left text-xs text-foreground hover:bg-accent"
              style={color ? { borderLeftColor: color } : undefined}
              onClick={() => void openOccurrence(o)}
            >
              {!o.allDay && <span className="shrink-0 font-mono">{localTime(o.occurrenceStartUTC)}</span>}
              {o.kind === "todo" &&
                (o.done ? <CheckSquare className="h-3 w-3 shrink-0" /> : <Square className="h-3 w-3 shrink-0" />)}
              {o.recurring && <Repeat className="h-3 w-3 shrink-0" />}
              {o.hasLinks && <Link2 className="h-3 w-3 shrink-0" />}
              <span className={cn("truncate", o.done && "line-through opacity-70")}>{o.title}</span>
            </button>
          );
        })}
        {dayOcc.length > maxShown && (
          <span className="px-1 text-xs text-foreground/70">+{dayOcc.length - maxShown} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
        <Button size="sm" onClick={() => setForm(emptyForm)}>
          New event
        </Button>
        <Select
          className="w-28"
          value={filters.kind}
          onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
        >
          <option value="">All items</option>
          <option value="event">Events</option>
          <option value="todo">Todos</option>
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
        <div className="ml-auto flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-40 text-center text-sm font-medium text-foreground">{monthLabel}</span>
          <Button size="icon" variant="ghost" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {view !== "list" && (
        <div className="grid grid-cols-7 text-center text-xs font-medium text-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
      )}
      {view === "month" && <div className="grid grid-cols-7">{monthDays.map((d) => dayCell(d, true))}</div>}
      {view === "week" && <div className="grid grid-cols-7">{weekDays.map((d) => dayCell(d, false))}</div>}
      {view === "list" && (
        <ul className="flex flex-col">
          {occurrences.data?.map((o, i) => (
            <li
              key={`${o.itemId}-${o.occurrenceStartUTC}-${i}`}
              className="flex items-center gap-3 border-b border-border/50 px-1 py-2 hover:bg-accent/40"
            >
              <span
                className="h-4 w-1 shrink-0 rounded"
                style={{ backgroundColor: catColor(o.categoryId) ?? "transparent" }}
              />
              <button
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
                onClick={() => void openOccurrence(o)}
              >
                {o.kind === "todo" &&
                  (o.done ? (
                    <CheckSquare className="mr-1 inline h-3 w-3" />
                  ) : (
                    <Square className="mr-1 inline h-3 w-3" />
                  ))}
                {o.recurring && <Repeat className="mr-1 inline h-3 w-3" />}
                {o.hasLinks && <Link2 className="mr-1 inline h-3 w-3" />}
                <span className={cn(o.done && "line-through opacity-70")}>{o.title}</span>
                {o.location && <span className="ml-2 font-normal text-foreground/70">@ {o.location}</span>}
              </button>
              <LookupBadges categoryId={o.categoryId} priorityId={o.priorityId} />
              <span className="text-xs text-foreground/70">
                {formatLocal(o.occurrenceStartUTC)}
                {o.occurrenceEndUTC ? ` → ${formatLocal(o.occurrenceEndUTC)}` : ""}
              </span>
            </li>
          ))}
          {occurrences.data?.length === 0 && <p className="py-4 text-sm text-foreground">No events in range.</p>}
        </ul>
      )}

      <TodoDialog
        form={todoForm}
        setForm={setTodoForm}
        onClose={() => {
          setTodoForm(null);
          invalidate();
        }}
        listKey={["todos"]}
      />
      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent className="max-w-lg">
            <DialogTitle>
              {form.id ? "Edit event" : "New event"}
              {form.id && (
                <Link to={`/items/${form.id}`} className="ml-3 text-sm font-normal text-foreground underline">
                  Tags &amp; links
                </Link>
              )}
            </DialogTitle>
            <form
              className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto pr-1"
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
                <Label>Start (local time)</Label>
                <DateTimeInput value={form.startAtUTC} onChange={(v) => setForm({ ...form, startAtUTC: v })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End (local time)</Label>
                <DateTimeInput value={form.endAtUTC} onChange={(v) => setForm({ ...form, endAtUTC: v })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
                />
                All day
              </label>
              <div className="flex flex-col gap-1.5">
                <Label>Repeat</Label>
                <RecurrenceEditor
                  rrule={form.rrule}
                  onChange={(rrule, timezone) => setForm({ ...form, rrule, timezone })}
                />
              </div>
              {form.occurrenceStartUTC && (
                <div className="rounded-md border border-border p-2">
                  <p className="mb-1.5 text-xs text-foreground">
                    Opened from the occurrence on {formatLocal(form.occurrenceStartUTC)}.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => skipOccurrence.mutate(form)}
                  >
                    Skip this occurrence
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
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
                <Label>Description</Label>
                <Textarea
                  value={form.descriptionMd}
                  onChange={(e) => setForm({ ...form, descriptionMd: e.target.value })}
                  className="min-h-20"
                />
              </div>
              {save.isError && <p className="text-sm text-destructive">{(save.error as Error).message}</p>}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={!form.title || !form.startAtUTC || save.isPending}>
                  {form.id ? "Save" : "Create"}
                </Button>
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm({ ...form, id: undefined, archivedAtUTC: null, occurrenceStartUTC: undefined })
                    }
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
      )}
    </div>
  );
}
