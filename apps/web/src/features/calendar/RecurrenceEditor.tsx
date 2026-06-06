import { useMemo } from "react";
import { RRule } from "rrule";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Builds an RFC 5545 RRULE string (FREQ/INTERVAL/BYDAY/UNTIL/COUNT).
 * The `timezone` is set to the browser zone whenever a rule exists so the
 * server can expand wall-clock times DST-correctly.
 */

const WEEKDAYS = [
  { code: "MO", label: "Mo" },
  { code: "TU", label: "Tu" },
  { code: "WE", label: "We" },
  { code: "TH", label: "Th" },
  { code: "FR", label: "Fr" },
  { code: "SA", label: "Sa" },
  { code: "SU", label: "Su" },
] as const;

interface ParsedRule {
  freq: "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byday: string[];
  ends: "never" | "until" | "count";
  until: string; // yyyy-mm-dd
  count: number;
}

function parseRrule(rrule: string | null): ParsedRule {
  const def: ParsedRule = { freq: "", interval: 1, byday: [], ends: "never", until: "", count: 10 };
  if (!rrule) return def;
  for (const part of rrule.replace(/^RRULE:/, "").split(";")) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k === "FREQ" && ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(v)) def.freq = v as ParsedRule["freq"];
    if (k === "INTERVAL") def.interval = Number(v) || 1;
    if (k === "BYDAY") def.byday = v.split(",");
    if (k === "UNTIL") {
      def.ends = "until";
      def.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    }
    if (k === "COUNT") {
      def.ends = "count";
      def.count = Number(v) || 1;
    }
  }
  return def;
}

function buildRrule(p: ParsedRule): string | null {
  if (!p.freq) return null;
  const parts = [`FREQ=${p.freq}`];
  if (p.interval > 1) parts.push(`INTERVAL=${p.interval}`);
  if (p.freq === "WEEKLY" && p.byday.length > 0) parts.push(`BYDAY=${p.byday.join(",")}`);
  if (p.ends === "until" && /^\d{4}-\d{2}-\d{2}$/.test(p.until)) {
    parts.push(`UNTIL=${p.until.replace(/-/g, "")}T235959Z`);
  }
  if (p.ends === "count") parts.push(`COUNT=${Math.max(1, p.count)}`);
  return parts.join(";");
}

export function RecurrenceEditor({
  rrule,
  onChange,
}: {
  rrule: string | null;
  onChange: (rrule: string | null, timezone: string | null) => void;
}) {
  const parsed = useMemo(() => parseRrule(rrule), [rrule]);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function update(patch: Partial<ParsedRule>) {
    const next = { ...parsed, ...patch };
    const text = buildRrule(next);
    onChange(text, text ? tz : null);
  }

  const humanText = useMemo(() => {
    if (!rrule) return null;
    try {
      return RRule.fromString(rrule).toText();
    } catch {
      return "invalid rule";
    }
  }, [rrule]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select
          className="w-32"
          value={parsed.freq}
          onChange={(e) => update({ freq: e.target.value as ParsedRule["freq"] })}
        >
          <option value="">Does not repeat</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </Select>
        {parsed.freq && (
          <>
            <span className="text-sm text-foreground">every</span>
            <Input
              type="number"
              min={1}
              value={parsed.interval}
              onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16"
            />
            <span className="text-sm text-foreground">
              {parsed.freq === "DAILY" && "day(s)"}
              {parsed.freq === "WEEKLY" && "week(s)"}
              {parsed.freq === "MONTHLY" && "month(s)"}
              {parsed.freq === "YEARLY" && "year(s)"}
            </span>
          </>
        )}
      </div>
      {parsed.freq === "WEEKLY" && (
        <div className="flex gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.code}
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs text-foreground hover:bg-accent",
                parsed.byday.includes(d.code) && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              onClick={() =>
                update({
                  byday: parsed.byday.includes(d.code)
                    ? parsed.byday.filter((c) => c !== d.code)
                    : [...parsed.byday, d.code],
                })
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {parsed.freq && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">Ends</span>
          <Select
            className="w-28"
            value={parsed.ends}
            onChange={(e) => update({ ends: e.target.value as ParsedRule["ends"] })}
          >
            <option value="never">never</option>
            <option value="until">on date</option>
            <option value="count">after</option>
          </Select>
          {parsed.ends === "until" && (
            <Input
              type="text"
              inputMode="numeric"
              placeholder="yyyy-mm-dd"
              maxLength={10}
              value={parsed.until}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                const v =
                  digits.length <= 4
                    ? digits
                    : digits.length <= 6
                      ? `${digits.slice(0, 4)}-${digits.slice(4)}`
                      : `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
                update({ until: v });
              }}
              className="w-32 font-mono"
            />
          )}
          {parsed.ends === "count" && (
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <Input
                type="number"
                min={1}
                value={parsed.count}
                onChange={(e) => update({ count: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16"
              />
              occurrence(s)
            </span>
          )}
        </div>
      )}
      {humanText && <p className="text-xs text-foreground/80">Repeats {humanText}</p>}
    </div>
  );
}
