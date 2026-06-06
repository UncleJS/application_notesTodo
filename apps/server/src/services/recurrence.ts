import { RRule, datetime } from "rrule";

/**
 * RFC 5545 RRULE expansion.
 *
 * Storage model: start/end are UTC instants; `timezone` is the IANA zone the
 * rule was authored in. For DST-correct wall-clock recurrence the rule is
 * expanded with rrule's `tzid` support, anchored at the wall time of the
 * start instant in that zone. Without a timezone the rule expands in UTC.
 */

interface ExpandInput {
  startAtUTC: Date;
  endAtUTC: Date | null;
  rrule: string;
  timezone: string | null;
  /** epoch ms of excluded occurrence starts */
  exdatesMs: Set<number>;
  from: Date;
  to: Date;
  maxOccurrences?: number;
}

export interface Occurrence {
  start: Date;
  end: Date | null;
}

function wallParts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) === 24 ? 0 : Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
  };
}

export function buildRule(rruleText: string, startAtUTC: Date, timezone: string | null): RRule {
  const parsed = RRule.parseString(rruleText);
  if (timezone) {
    const w = wallParts(startAtUTC, timezone);
    parsed.dtstart = datetime(w.y, w.m, w.d, w.h, w.min, w.s);
    parsed.tzid = timezone;
  } else {
    parsed.dtstart = startAtUTC;
  }
  return new RRule(parsed);
}

export function expandOccurrences(input: ExpandInput): Occurrence[] {
  const durationMs = input.endAtUTC ? input.endAtUTC.getTime() - input.startAtUTC.getTime() : 0;
  const max = input.maxOccurrences ?? 500;
  const rule = buildRule(input.rrule, input.startAtUTC, input.timezone);
  // widen the lower bound so occurrences that started earlier but overlap
  // the range are included
  const lower = new Date(input.from.getTime() - durationMs);
  const starts = rule.between(lower, input.to, true);
  const out: Occurrence[] = [];
  for (const start of starts) {
    if (out.length >= max) break;
    if (input.exdatesMs.has(start.getTime())) continue;
    const end = input.endAtUTC ? new Date(start.getTime() + durationMs) : null;
    if (start < input.to && (end ?? start) >= input.from) out.push({ start, end });
  }
  return out;
}

/** Next occurrence strictly after `after`, skipping exdates. Null when the series is exhausted. */
export function nextOccurrence(
  rruleText: string,
  startAtUTC: Date,
  timezone: string | null,
  exdatesMs: Set<number>,
  after: Date,
): Date | null {
  const rule = buildRule(rruleText, startAtUTC, timezone);
  let probe = after;
  for (let i = 0; i < 100; i++) {
    const next = rule.after(probe, false);
    if (!next) return null;
    if (!exdatesMs.has(next.getTime())) return next;
    probe = next;
  }
  return null;
}
