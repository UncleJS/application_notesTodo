import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Time-of-day input per the ui-date-inputs standard: text input (`HH:mm`,
 * viewer's local time) plus the single dropdown with matrix grids
 * (hour 6×4, minute 4×3). Emits a UTC `HH:mm:ss` string (or null) so the
 * stored value follows the all-timestamps-UTC rule; conversion uses the
 * current date's UTC offset.
 */

const TIME_RE = /^\d{2}:\d{2}$/;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const FIVES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function sanitizeTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function localToUtc(hhmm: string): string | null {
  if (!TIME_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h! > 23 || m! > 59) return null;
  const d = new Date();
  d.setHours(h!, m!, 0, 0);
  return d.toISOString().slice(11, 19);
}

function utcToLocal(utcTime: string): string {
  const [h, m, s] = utcTime.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h ?? 0, m ?? 0, s ?? 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TimeInput({
  value,
  onChange,
  disabled,
  className,
}: {
  /** UTC `HH:mm:ss` or null */
  value: string | null;
  onChange: (utcTime: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setTime(value ? utcToLocal(value) : "");
  }, [value]);

  function emit(next: string) {
    setTime(next);
    if (!next) {
      lastEmitted.current = null;
      onChange(null);
      return;
    }
    const utc = localToUtc(next);
    if (utc) {
      lastEmitted.current = utc;
      onChange(utc);
    }
  }

  function setSegment(segment: "h" | "m", v: string) {
    const parts = TIME_RE.test(time) ? time.split(":") : ["00", "00"];
    if (segment === "h") parts[0] = v;
    if (segment === "m") parts[1] = v;
    emit(parts.join(":"));
  }

  const parts = time.split(":");

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:mm"
        maxLength={5}
        value={time}
        disabled={disabled}
        onChange={(e) => emit(sanitizeTime(e.target.value))}
        className="h-8 w-20 rounded-md border border-input bg-transparent px-2 pr-7 font-mono text-xs text-foreground placeholder:text-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open time picker"
            className="absolute right-0 inline-flex h-8 w-7 items-center justify-center text-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="flex w-60 flex-col gap-3" onOpenAutoFocus={(e) => e.preventDefault()}>
          {(
            [
              { label: "Hour", values: HOURS, cols: 6, seg: "h" as const, sel: parts[0] },
              { label: "Minute", values: FIVES, cols: 4, seg: "m" as const, sel: parts[1] },
            ] as const
          ).map(({ label, values, cols, seg, sel }) => (
            <div key={label}>
              <div className="mb-1 text-xs font-medium text-foreground">{label}</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                {values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSegment(seg, v)}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-accent",
                      sel === v && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
