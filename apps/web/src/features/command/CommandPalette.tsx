import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { typeIcon, type ItemType } from "@/features/links/itemIcons";
import { useCreateAction } from "./CreateActionContext";

interface SearchResult {
  id: number;
  itemType: ItemType;
  title: string;
}

interface Command {
  key: string;
  label: string;
  hint?: string;
  icon: "nav" | "new" | ItemType;
  run: () => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { defer } = useCreateAction();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const debouncedQ = useDebounced(q.trim(), 200);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(0);
    }
  }, [open]);

  const search = useQuery({
    queryKey: ["items", "search", debouncedQ],
    queryFn: () => api<SearchResult[]>(`/api/v1/items?q=${encodeURIComponent(debouncedQ)}`),
    enabled: open && debouncedQ.length >= 1,
    staleTime: 15_000,
  });

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const create = (to: string) => () => {
      defer();
      navigate(to);
      onClose();
    };
    const base: Command[] = [
      { key: "new-note", label: "New note", icon: "new", run: create("/notes") },
      { key: "new-todo", label: "New todo", icon: "new", run: create("/todos") },
      { key: "new-event", label: "New event", icon: "new", run: create("/calendar") },
      { key: "nav-dashboard", label: "Go to Dashboard", icon: "nav", run: go("/") },
      { key: "nav-notes", label: "Go to Notes", icon: "nav", run: go("/notes") },
      { key: "nav-todos", label: "Go to Todos", icon: "nav", run: go("/todos") },
      { key: "nav-calendar", label: "Go to Calendar", icon: "nav", run: go("/calendar") },
      { key: "nav-templates", label: "Go to Templates", icon: "nav", run: go("/templates") },
      { key: "nav-settings", label: "Go to Settings", icon: "nav", run: go("/settings") },
    ];
    const needle = q.trim().toLowerCase();
    const filtered = needle ? base.filter((c) => c.label.toLowerCase().includes(needle)) : base;
    const items: Command[] = (search.data ?? []).map((r) => ({
      key: `item-${r.id}`,
      label: r.title,
      hint: r.itemType,
      icon: r.itemType,
      run: () => {
        navigate(r.itemType === "note" ? `/notes/${r.id}` : `/items/${r.id}`);
        onClose();
      },
    }));
    return [...items, ...filtered];
  }, [q, search.data, navigate, onClose, defer]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, commands.length - 1)));
  }, [commands.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[selected]?.run();
    }
  };

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0 p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-foreground/70" />
          <Input
            autoFocus
            placeholder="Search items or type a command…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {commands.map((c, i) => {
            const Icon = c.icon === "nav" ? ArrowRight : c.icon === "new" ? Plus : typeIcon[c.icon];
            return (
              <li key={c.key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground",
                    i === selected ? "bg-accent" : "hover:bg-accent/60",
                  )}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => c.run()}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 text-xs text-foreground/70">{c.hint}</span>}
                </button>
              </li>
            );
          })}
          {commands.length === 0 && (
            <li className="px-2 py-3 text-sm text-foreground/70">
              {search.isLoading ? "Searching…" : "No matches."}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
