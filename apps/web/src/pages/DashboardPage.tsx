import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pin, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { QueryError } from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Note } from "./NotesPage";
import type { Todo } from "./TodosPage";

interface Occurrence {
  itemId: number;
  title: string;
  occurrenceStartUTC: string;
  occurrenceEndUTC: string | null;
  recurring: boolean;
  location: string | null;
}

export default function DashboardPage() {
  const todos = useQuery({
    queryKey: ["todos", "dashboard"],
    queryFn: () => api<Todo[]>("/api/v1/todos?done=false"),
  });
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400_000);
  const events = useQuery({
    queryKey: ["calendar", "dashboard"],
    queryFn: async () => {
      const res = await api<{ occurrences: Occurrence[] }>(
        `/api/v1/calendar?kind=event&from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(weekAhead.toISOString())}`,
      );
      return res.occurrences;
    },
  });
  const notes = useQuery({
    queryKey: ["notes", "dashboard"],
    queryFn: () => api<Note[]>("/api/v1/notes"),
  });

  const overdue = todos.data?.filter((t) => t.dueAtUTC && new Date(t.dueAtUTC) < now) ?? [];
  const upcoming = todos.data?.filter((t) => !t.dueAtUTC || new Date(t.dueAtUTC) >= now).slice(0, 8) ?? [];
  const pinned = notes.data?.filter((n) => n.pinned).slice(0, 6) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Todos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {overdue.map((t) => (
              <Link key={t.id} to="/todos" className="flex items-center gap-2 text-sm text-foreground hover:underline">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 whitespace-nowrap text-xs font-medium text-destructive">
                  {formatLocal(t.dueAtUTC)}
                </span>
              </Link>
            ))}
            {upcoming.map((t) => (
              <Link key={t.id} to="/todos" className="flex items-center gap-2 text-sm text-foreground hover:underline">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.dueAtUTC && (
                  <span className="shrink-0 whitespace-nowrap text-xs text-foreground/70">
                    {formatLocal(t.dueAtUTC)}
                  </span>
                )}
              </Link>
            ))}
            {todos.data?.length === 0 && <p className="text-sm text-foreground">Nothing open. 🎉</p>}
            {todos.isError && <QueryError error={todos.error} onRetry={() => void todos.refetch()} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next 7 days</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {events.data?.slice(0, 10).map((o, i) => (
              <Link
                key={`${o.itemId}-${i}`}
                to="/calendar"
                className="flex items-center gap-2 text-sm text-foreground hover:underline"
              >
                {o.recurring && <Repeat className="h-3 w-3 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="shrink-0 whitespace-nowrap text-xs text-foreground/70">
                  {formatLocal(o.occurrenceStartUTC)}
                </span>
              </Link>
            ))}
            {events.data?.length === 0 && <p className="text-sm text-foreground">No upcoming events.</p>}
            {events.isError && <QueryError error={events.error} onRetry={() => void events.refetch()} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pinned notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {pinned.map((n) => (
              <Link
                key={n.id}
                to={`/notes/${n.id}`}
                className="flex items-center gap-2 text-sm text-foreground hover:underline"
              >
                <Pin className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
              </Link>
            ))}
            {pinned.length === 0 && <p className="text-sm text-foreground">No pinned notes.</p>}
            {notes.isError && <QueryError error={notes.error} onRetry={() => void notes.refetch()} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
