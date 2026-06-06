import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Date-time input per the ui-date-inputs standard:
 * - visible text inputs only (`yyyy-MM-dd` + `HH:mm:ss`), never a visible native date field
 * - hidden native date input behind an explicit calendar button
 * - single time dropdown stacking matrix grids: hour 6×4 (00–23),
 *   minute 4×3 (5-min steps), second 4×3 (5-sec steps)
 * - emits UTC ISO-8601 (`...Z`); the typed value is the viewer's local time
 */

function sanitizeDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function sanitizeTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function toLocalParts(utcIso: string): { date: string; time: string } {
  const d = new Date(utcIso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

function partsToIso(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const t = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${date}T${t}`); // local time
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const FIVES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface DateTimeInputProps {
  /** UTC ISO-8601 or null */
  value: string | null;
  onChange: (utcIso: string | null) => void;
  withSeconds?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DateTimeInput({ value, onChange, withSeconds = true, disabled, className }: DateTimeInputProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (value) {
      const parts = toLocalParts(value);
      setDate(parts.date);
      setTime(parts.time);
    } else {
      setDate("");
      setTime("");
    }
  }, [value]);

  function emit(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    if (!nextDate && !nextTime) {
      lastEmitted.current = null;
      onChange(null);
      return;
    }
    const iso = partsToIso(nextDate, nextTime || "00:00:00");
    if (iso) {
      lastEmitted.current = iso;
      onChange(iso);
    }
  }

  function setSegment(segment: "h" | "m" | "s", v: string) {
    const t = (time.length === 5 ? `${time}:00` : time) || "00:00:00";
    const parts = TIME_RE.test(t) ? t.split(":") : ["00", "00", "00"];
    while (parts.length < 3) parts.push("00");
    if (segment === "h") parts[0] = v;
    if (segment === "m") parts[1] = v;
    if (segment === "s") parts[2] = v;
    emit(date || toLocalParts(new Date().toISOString()).date, parts.join(":"));
  }

  function openPicker() {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) return;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else {
      picker.focus();
      picker.click();
    }
  }

  const timeParts = (time.length === 5 ? `${time}:00` : time).split(":");
  const inputCls =
    "h-9 rounded-md border border-input bg-transparent px-2 font-mono text-sm text-foreground placeholder:text-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  function Grid({
    label,
    values,
    cols,
    selected,
    onPick,
  }: {
    label: string;
    values: string[];
    cols: number;
    selected: string | undefined;
    onPick: (v: string) => void;
  }) {
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-foreground">{label}</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-accent",
                selected === v && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="yyyy-mm-dd"
          pattern="\d{4}-\d{2}-\d{2}"
          maxLength={10}
          value={date}
          disabled={disabled}
          onChange={(e) => emit(sanitizeDate(e.target.value), time)}
          className={cn(inputCls, "w-32 pr-8")}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          aria-label="Open date picker"
          className="absolute right-0 top-0 inline-flex h-9 w-8 items-center justify-center text-foreground"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={DATE_RE.test(date) ? date : ""}
          onChange={(e) => emit(e.target.value, time)}
          className="absolute right-2 top-2 h-5 w-5 opacity-0"
        />
      </div>
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={withSeconds ? "HH:mm:ss" : "HH:mm"}
          maxLength={withSeconds ? 8 : 5}
          value={time}
          disabled={disabled}
          onChange={(e) => emit(date, sanitizeTime(e.target.value))}
          className={cn(inputCls, withSeconds ? "w-24" : "w-18", "pr-7")}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open time picker"
              className="absolute right-0 inline-flex h-9 w-7 items-center justify-center text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-60 flex-col gap-3" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Grid label="Hour" values={HOURS} cols={6} selected={timeParts[0]} onPick={(v) => setSegment("h", v)} />
            <Grid label="Minute" values={FIVES} cols={4} selected={timeParts[1]} onPick={(v) => setSegment("m", v)} />
            {withSeconds && (
              <Grid label="Second" values={FIVES} cols={4} selected={timeParts[2]} onPick={(v) => setSegment("s", v)} />
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
