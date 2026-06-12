import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Link2, Repeat, Square } from "lucide-react";
import { api } from "@/lib/api";
import { localDayKey, localTime } from "@/lib/formatLocal";
import { QueryError } from "@/components/QueryError";
import { SkeletonList } from "@/components/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { LookupBadges } from "@/features/lookups/LookupSelects";
import { cn } from "@/lib/utils";

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
  categoryId: number | null;
  priorityId: number | null;
}

type Preset = "7" | "14" | "21" | "month" | "custom";

const PRESET_DAYS: Record<Exclude<Preset, "custom">, number> = {
  "7": 7,
  "14": 14,
  "21": 21,
  month: 30,
};

/** Relative label for a local day key, falling back to the weekday name. */
function dayLabel(key: string, todayKey: string, tomorrowKey: string): string {
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  // key is yyyy-MM-dd in local time — construct a local Date for the weekday.
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" });
}

export function AgendaPanel() {
  const [preset, setPreset] = useState<Preset>("14");
  const [customDays, setCustomDays] = useState(14);

  const days =
    preset === "custom" ? Math.min(400, Math.max(1, customDays || 1)) : PRESET_DAYS[preset];

  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [days]);

  const agenda = useQuery({
    queryKey: ["calendar", "dashboard-agenda", days],
    queryFn: async () => {
      const res = await api<{ occurrences: Occurrence[] }>(
        `/api/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      return res.occurrences;
    },
  });

  const todayKey = localDayKey(new Date().toISOString());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow.toISOString());

  // occurrences arrive sorted ascending — insertion order keeps each day's items in time order
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of agenda.data ?? []) {
      const key = localDayKey(o.occurrenceStartUTC);
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [agenda.data]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Agenda — next {days} {days === 1 ? "day" : "days"}</CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="14">14d</TabsTrigger>
              <TabsTrigger value="21">21d</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
          {preset === "custom" && (
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <Input
                type="number"
                min={1}
                max={400}
                value={customDays}
                onChange={(e) =>
                  setCustomDays(Math.min(400, Math.max(1, Number(e.target.value) || 1)))
                }
                className="w-20"
              />
              days
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {agenda.isLoading && <SkeletonList />}
        {[...byDay.entries()].map(([key, items]) => (
          <div key={key} className="flex flex-col">
            <h3 className="mb-1 border-b border-border/50 pb-1 text-sm font-semibold text-foreground">
              {dayLabel(key, todayKey, tomorrowKey)} · {key}
            </h3>
            {items.map((o, i) => (
              <Link
                key={`${o.itemId}-${o.occurrenceStartUTC}-${i}`}
                to={o.kind === "todo" ? "/todos" : "/calendar"}
                className="flex items-center gap-3 rounded px-1 py-1.5 text-sm hover:bg-accent/40"
              >
                <span className="w-12 shrink-0 font-mono text-xs text-foreground/70">
                  {o.allDay ? "all day" : localTime(o.occurrenceStartUTC)}
                </span>
                {o.kind === "todo" &&
                  (o.done ? (
                    <CheckSquare className="h-3 w-3 shrink-0" />
                  ) : (
                    <Square className="h-3 w-3 shrink-0" />
                  ))}
                {o.recurring && <Repeat className="h-3 w-3 shrink-0" />}
                {o.hasLinks && <Link2 className="h-3 w-3 shrink-0" />}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-foreground",
                    o.done && "line-through opacity-70",
                  )}
                >
                  {o.title}
                  {o.location && <span className="ml-2 text-foreground/70">@ {o.location}</span>}
                </span>
                <LookupBadges categoryId={o.categoryId} priorityId={o.priorityId} />
              </Link>
            ))}
          </div>
        ))}
        {!agenda.isLoading && byDay.size === 0 && !agenda.isError && (
          <p className="text-sm text-foreground">Nothing scheduled in the next {days} days.</p>
        )}
        {agenda.isError && <QueryError error={agenda.error} onRetry={() => void agenda.refetch()} />}
      </CardContent>
    </Card>
  );
}
