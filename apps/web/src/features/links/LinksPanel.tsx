import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { typeIcon } from "@/features/links/itemIcons";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LinkedItem {
  linkId: number;
  linkType: string | null;
  item: { id: number; itemType: "note" | "todo" | "calendar"; title: string; archivedAtUTC: string | null };
}

interface SearchResult {
  id: number;
  itemType: "note" | "todo" | "calendar";
  title: string;
}

export function LinksPanel({ itemId, canEdit = true }: { itemId: number; canEdit?: boolean }) {
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
    enabled: q.length >= 1,
  });

  const addLink = useMutation({
    mutationFn: (toItemId: number) =>
      api(`/api/v1/items/${itemId}/links`, { method: "POST", json: { toItemId } }),
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
  const candidates = search.data?.filter((r) => r.id !== itemId && !linkedIds.has(r.id)) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {links.data?.map((l) => {
          const Icon = typeIcon[l.item.itemType];
          return (
            <li key={l.linkId} className="flex items-center gap-2 text-sm">
              <Icon className="h-3.5 w-3.5 shrink-0 text-foreground" />
              <Link
                to={`/items/${l.item.id}`}
                className={`min-w-0 flex-1 truncate text-foreground hover:underline ${l.item.archivedAtUTC ? "line-through opacity-60" : ""}`}
              >
                {l.item.title}
              </Link>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => removeLink.mutate(l.linkId)}>
                  ×
                </Button>
              )}
            </li>
          );
        })}
        {links.data?.length === 0 && <span className="text-xs text-foreground/70">No linked items</span>}
      </ul>
      {canEdit && (
        <div className="relative">
          <Input
            placeholder="Link an item — search by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-xs"
          />
          {q && candidates.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
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
