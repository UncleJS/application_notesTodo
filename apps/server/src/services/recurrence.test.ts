import { describe, expect, test } from "bun:test";
import { expandOccurrences, nextOccurrence } from "./recurrence";

describe("expandOccurrences", () => {
  test("weekly UTC expansion within range", () => {
    const occ = expandOccurrences({
      startAtUTC: new Date("2026-01-05T10:00:00Z"), // Monday
      endAtUTC: new Date("2026-01-05T11:00:00Z"),
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timezone: null,
      exdatesMs: new Set(),
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
    });
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-01-05T10:00:00.000Z",
      "2026-01-12T10:00:00.000Z",
      "2026-01-19T10:00:00.000Z",
      "2026-01-26T10:00:00.000Z",
    ]);
    expect(occ[0]!.end!.toISOString()).toBe("2026-01-05T11:00:00.000Z");
  });

  test("EXDATE removes one occurrence", () => {
    const occ = expandOccurrences({
      startAtUTC: new Date("2026-01-05T10:00:00Z"),
      endAtUTC: null,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timezone: null,
      exdatesMs: new Set([new Date("2026-01-12T10:00:00Z").getTime()]),
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
    });
    expect(occ).toHaveLength(3);
    expect(occ.map((o) => o.start.toISOString())).not.toContain("2026-01-12T10:00:00.000Z");
  });

  test("DST-correct wall-clock recurrence with tzid", () => {
    // Weekly Monday 09:00 Europe/Berlin. DST starts 2026-03-29:
    // before -> 08:00Z, after -> 07:00Z for the same 09:00 wall time.
    const occ = expandOccurrences({
      startAtUTC: new Date("2026-03-23T08:00:00Z"), // Mon 09:00 Berlin (CET)
      endAtUTC: null,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timezone: "Europe/Berlin",
      exdatesMs: new Set(),
      from: new Date("2026-03-22T00:00:00Z"),
      to: new Date("2026-04-07T00:00:00Z"),
    });
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      "2026-03-23T08:00:00.000Z",
      "2026-03-30T07:00:00.000Z",
      "2026-04-06T07:00:00.000Z",
    ]);
  });

  test("COUNT-limited rule ends", () => {
    const occ = expandOccurrences({
      startAtUTC: new Date("2026-01-01T12:00:00Z"),
      endAtUTC: null,
      rrule: "FREQ=DAILY;COUNT=3",
      timezone: null,
      exdatesMs: new Set(),
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-02-01T00:00:00Z"),
    });
    expect(occ).toHaveLength(3);
  });
});

describe("nextOccurrence", () => {
  test("returns next future occurrence, skipping exdates", () => {
    const next = nextOccurrence(
      "FREQ=DAILY",
      new Date("2026-01-01T08:00:00Z"),
      null,
      new Set([new Date("2026-01-03T08:00:00Z").getTime()]),
      new Date("2026-01-02T09:00:00Z"),
    );
    expect(next!.toISOString()).toBe("2026-01-04T08:00:00.000Z");
  });

  test("exhausted series returns null", () => {
    const next = nextOccurrence(
      "FREQ=DAILY;COUNT=2",
      new Date("2026-01-01T08:00:00Z"),
      null,
      new Set(),
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(next).toBeNull();
  });
});
