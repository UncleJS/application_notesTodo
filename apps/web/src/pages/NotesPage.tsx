import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, Pin } from "lucide-react";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LookupBadges } from "@/features/lookups/LookupSelects";
import { TagChips } from "@/features/tags/TagPicker";
import { useCategories, usePriorities } from "@/features/lookups/useLookups";
import { useTags } from "@/features/tags/useTags";

export interface Note {
  id: number;
  title: string;
  bodyMd: string | null;
  pinned: boolean;
  tagIds: number[];
  hasLinks: boolean;
  ownerId: number;
  categoryId: number | null;
  priorityId: number | null;
  updatedAtUTC: string;
  archivedAtUTC: string | null;
}

export default function NotesPage() {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState({ category: "", priority: "", tag: "" });
  const navigate = useNavigate();
  const categories = useCategories();
  const priorities = usePriorities();
  const tags = useTags();

  const notes = useQuery({
    queryKey: ["notes", q, showArchived, filters],
    queryFn: () => {
      const params = new URLSearchParams({ includeArchived: String(showArchived) });
      if (q) params.set("q", q);
      if (filters.category) params.set("category", filters.category);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.tag) params.set("tag", filters.tag);
      return api<Note[]>(`/api/v1/notes?${params}`);
    },
  });

  const createNote = useMutation({
    mutationFn: () => api<Note>("/api/v1/notes", { method: "POST", json: { title: "Untitled note" } }),
    onSuccess: (note) => navigate(`/notes/${note.id}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">Notes</h1>
        <Button size="sm" onClick={() => createNote.mutate()}>
          New note
        </Button>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto w-56"
        />
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
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {notes.data?.map((n) => (
          <Link
            key={n.id}
            to={`/notes/${n.id}`}
            className={`flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 hover:border-ring ${n.archivedAtUTC ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-1.5">
              {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-foreground" />}
              <span className="truncate font-medium text-foreground">{n.title}</span>
              {n.hasLinks && <Link2 className="h-3.5 w-3.5 shrink-0 text-foreground" aria-label="Has linked items" />}
            </div>
            {n.bodyMd && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground/80">{n.bodyMd}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
              <LookupBadges categoryId={n.categoryId} priorityId={n.priorityId} />
              <TagChips tagIds={n.tagIds} />
              <span className="ml-auto text-xs text-foreground/70">{formatLocal(n.updatedAtUTC)}</span>
            </div>
          </Link>
        ))}
        {notes.data?.length === 0 && <p className="text-sm text-foreground">No notes.</p>}
      </div>
    </div>
  );
}
