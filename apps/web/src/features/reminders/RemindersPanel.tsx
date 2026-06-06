import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/DateTimeInput";

interface Reminder {
  id: number;
  itemId: number;
  remindAtUTC: string | null;
  offsetMinutes: number | null;
  channels: string[];
  enabled: boolean;
  nextFireAtUTC: string | null;
}

interface Dispatch {
  id: number;
  occurrenceAtUTC: string;
  channel: string;
  status: "sent" | "failed";
  attempt: number;
  error: string | null;
  dispatchedAtUTC: string;
}

function DispatchLog({ reminderId }: { reminderId: number }) {
  const dispatches = useQuery({
    queryKey: ["reminders", reminderId, "dispatches"],
    queryFn: () => api<Dispatch[]>(`/api/v1/reminders/${reminderId}/dispatches`),
  });
  if (!dispatches.data?.length) return <p className="text-xs text-foreground/70">No dispatches yet.</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {dispatches.data.map((d) => (
        <li key={d.id} className="text-xs text-foreground">
          {formatLocal(d.dispatchedAtUTC)} · {d.channel} ·{" "}
          <span className={d.status === "failed" ? "text-destructive" : undefined}>
            {d.status}
            {d.attempt > 1 ? ` (attempt ${d.attempt})` : ""}
          </span>
          {d.error && <span className="text-destructive"> — {d.error}</span>}
        </li>
      ))}
    </ul>
  );
}

export function RemindersPanel({ itemId, isCalendar }: { itemId: number; isCalendar: boolean }) {
  const qc = useQueryClient();
  const key = ["items", itemId, "reminders"];
  const remindersQ = useQuery({
    queryKey: key,
    queryFn: () => api<Reminder[]>(`/api/v1/items/${itemId}/reminders`),
  });

  const [mode, setMode] = useState<"absolute" | "offset">("absolute");
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [offsetMin, setOffsetMin] = useState("15");
  const [channels, setChannels] = useState<{ email: boolean; webhook: boolean }>({ email: true, webhook: false });
  const [logFor, setLogFor] = useState<number | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () =>
      api(`/api/v1/items/${itemId}/reminders`, {
        method: "POST",
        json: {
          remindAtUTC: mode === "absolute" ? remindAt : null,
          offsetMinutes: mode === "offset" ? Number(offsetMin) : null,
          channels: [...(channels.email ? ["email"] : []), ...(channels.webhook ? ["webhook"] : [])],
        },
      }),
    onSuccess: () => {
      setRemindAt(null);
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: (r: Reminder) =>
      api(`/api/v1/reminders/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/reminders/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {remindersQ.data?.map((r) => (
          <li key={r.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-foreground">
              {r.enabled ? <Bell className="h-3.5 w-3.5 shrink-0" /> : <BellOff className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">
                {r.remindAtUTC
                  ? `At ${formatLocal(r.remindAtUTC)}`
                  : `${r.offsetMinutes} min before each occurrence`}
                <span className="ml-1.5 text-xs text-foreground/70">[{r.channels.join(", ")}]</span>
              </span>
              {r.enabled && r.nextFireAtUTC && (
                <span className="text-xs text-foreground/70">next {formatLocal(r.nextFireAtUTC)}</span>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLogFor(logFor === r.id ? null : r.id)}>
                log
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>
                {r.enabled ? "disable" : "enable"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                ×
              </Button>
            </div>
            {logFor === r.id && <DispatchLog reminderId={r.id} />}
          </li>
        ))}
        {remindersQ.data?.length === 0 && <span className="text-xs text-foreground/70">No reminders</span>}
      </ul>
      <form
        className="flex flex-col gap-2 border-t border-border/50 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex items-center gap-2">
          <Select className="h-8 w-44 text-xs" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="absolute">At a specific time</option>
            {isCalendar && <option value="offset">Before each occurrence</option>}
          </Select>
          {mode === "offset" && (
            <span className="flex items-center gap-1.5 text-xs text-foreground">
              <Input
                type="number"
                min={0}
                value={offsetMin}
                onChange={(e) => setOffsetMin(e.target.value)}
                className="h-8 w-20 text-xs"
              />
              minutes before
            </span>
          )}
        </div>
        {mode === "absolute" && <DateTimeInput value={remindAt} onChange={setRemindAt} />}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={channels.email}
              onChange={(e) => setChannels({ ...channels, email: e.target.checked })}
            />
            Email
          </label>
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={channels.webhook}
              onChange={(e) => setChannels({ ...channels, webhook: e.target.checked })}
            />
            Webhook
          </label>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={
              create.isPending ||
              (!channels.email && !channels.webhook) ||
              (mode === "absolute" ? !remindAt : offsetMin === "")
            }
          >
            Add reminder
          </Button>
        </div>
        {create.isError && <p className="text-xs text-destructive">{(create.error as Error).message}</p>}
      </form>
    </div>
  );
}
