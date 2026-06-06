import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { typeIcon, type ItemType } from "./itemIcons";

interface LinkedItem {
  linkId: number;
  linkType: string | null;
  item: { id: number; itemType: ItemType; title: string; archivedAtUTC: string | null };
}

interface SearchResult {
  id: number;
  itemType: ItemType;
  title: string;
}

const detailEndpoint: Record<ItemType, (id: number) => string> = {
  note: (id) => `/api/v1/notes/${id}`,
  todo: (id) => `/api/v1/todos/${id}`,
  calendar: (id) => `/api/v1/calendar/items/${id}`,
};

/** Hover preview body — fetched lazily only while the chip is hovered. */
function ChipPreview({ item }: { item: LinkedItem["item"] }) {
  const detail = useQuery({
    queryKey: ["items", item.id, "preview", item.itemType],
    queryFn: () => api<Record<string, unknown>>(detailEndpoint[item.itemType](item.id)),
    staleTime: 60_000,
  });
  if (detail.isLoading) return <p className="text-xs text-foreground/70">Loading…</p>;
  const d = detail.data;
  if (!d) return <p className="text-xs text-foreground/70">No preview.</p>;
  const snippet = (d.bodyMd ?? d.notesMd ?? d.descriptionMd) as string | null;
  return (
    <div className="flex max-w-64 flex-col gap-1">
      <p className="text-sm font-medium text-foreground">{item.title}</p>
      {item.itemType === "todo" && (
        <p className="text-xs text-foreground/70">
          {(d.done as boolean) ? "done" : "open"}
          {d.dueAtUTC ? ` · due ${formatLocal(d.dueAtUTC as string)}` : ""}
        </p>
      )}
      {item.itemType === "calendar" && d.startAtUTC != null && (
        <p className="text-xs text-foreground/70">{formatLocal(d.startAtUTC as string)}</p>
      )}
      {snippet && <p className="line-clamp-4 whitespace-pre-wrap text-xs text-foreground/80">{snippet}</p>}
    </div>
  );
}

function LinkChip({
  link,
  canEdit,
  onRemove,
}: {
  link: LinkedItem;
  canEdit: boolean;
  onRemove: (linkId: number) => void;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const Icon = typeIcon[link.item.itemType];
  return (
    <Popover open={hovered}>
      <PopoverAnchor asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-foreground ${link.item.archivedAtUTC ? "opacity-60" : ""}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <button
            type="button"
            className={`max-w-40 truncate hover:underline ${link.item.archivedAtUTC ? "line-through" : ""}`}
            onClick={() =>
              navigate(link.item.itemType === "note" ? `/notes/${link.item.id}` : `/items/${link.item.id}`)
            }
          >
            {link.item.title}
          </button>
          {canEdit && (
            <button
              type="button"
              aria-label="Remove link"
              className="text-foreground/70 hover:text-destructive"
              onClick={() => onRemove(link.linkId)}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        className="pointer-events-none p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ChipPreview item={link.item} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact linked-items manager for edit dialogs: chips with hover previews,
 * click-through navigation and an inline link-by-search field — no detour
 * through the item detail page.
 */
export function LinkChips({ itemId, canEdit = true }: { itemId: number; canEdit?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["items", itemId, "links"];
  const links = useQuery({
    queryKey: key,
    queryFn: () => api<LinkedItem[]>(`/api/v1/items/${itemId}/links`),
  });

  const [q, setQ] = useState("");
  const search = useQuery({
    queryKey: ["items", "search", q],
    queryFn: () => api<SearchResult[]>(`/api/v1/items?q=${encodeURIComponent(q)}`),
    enabled: canEdit && q.length >= 1,
  });

  const addLink = useMutation({
    mutationFn: (toItemId: number) => api(`/api/v1/items/${itemId}/links`, { method: "POST", json: { toItemId } }),
    onSuccess: () => {
      setQ("");
      toast({ title: "Item linked" });
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const removeLink = useMutation({
    mutationFn: (linkId: number) => api(`/api/v1/links/${linkId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Link removed" });
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const linkedIds = new Set(links.data?.map((l) => l.item.id) ?? []);
  const candidates = (search.data ?? []).filter((r) => r.id !== itemId && !linkedIds.has(r.id)).slice(0, 8);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {links.data?.map((l) => (
          <LinkChip key={l.linkId} link={l} canEdit={canEdit} onRemove={(id) => removeLink.mutate(id)} />
        ))}
        {links.data?.length === 0 && <span className="text-xs text-foreground/70">No linked items</span>}
      </div>
      {canEdit && (
        <div className="relative">
          <Input
            placeholder="Link an item — search by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-xs"
          />
          {q && candidates.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
              {candidates.map((r) => {
                const Icon = typeIcon[r.itemType];
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-foreground hover:bg-accent"
                      onClick={() => addLink.mutate(r.id)}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
