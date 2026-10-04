import { describe, expect, it } from "vitest";
import { dueReminders, nextOccurrence } from "@/lib/reminders";
import type { PlanEvent } from "@/lib/types";

function event(overrides: Partial<PlanEvent>): PlanEvent {
  return {
    id: "e1",
    title: "Dentist",
    start: "2026-10-05T15:00:00.000Z",
    category: "appointment",
    memberIds: [],
    recurrence: "none",
    done: false,
    ...overrides,
  };
}

describe("nextOccurrence", () => {
  it("returns the start for a future one-off event", () => {
    const e = event({});
    expect(nextOccurrence(e, new Date("2026-10-04T00:00:00Z"))?.toISOString()).toBe(e.start);
  });

  it("returns null for a past one-off event", () => {
    expect(nextOccurrence(event({}), new Date("2026-10-06T00:00:00Z"))).toBeNull();
  });

  it("rolls weekly events forward to the next week", () => {
    const e = event({ start: "2026-09-01T17:00:00.000Z", recurrence: "weekly" });
    expect(nextOccurrence(e, new Date("2026-10-04T00:00:00Z"))?.toISOString()).toBe(
      "2026-10-06T17:00:00.000Z",
    );
  });

  it("rolls daily events forward to the same time of day", () => {
    const e = event({ start: "2026-09-01T07:30:00.000Z", recurrence: "daily" });
    expect(nextOccurrence(e, new Date("2026-10-04T08:00:00Z"))?.toISOString()).toBe(
      "2026-10-05T07:30:00.000Z",
    );
  });

  it("rolls monthly events forward by calendar month", () => {
    const e = event({ start: "2026-08-15T09:00:00.000Z", recurrence: "monthly" });
    expect(nextOccurrence(e, new Date("2026-10-04T00:00:00Z"))?.toISOString()).toBe(
      "2026-10-15T09:00:00.000Z",
    );
  });
});

describe("dueReminders", () => {
  const now = new Date("2026-10-05T14:00:00Z");

  it("includes reminders that fire inside the window", () => {
    const due = dueReminders([event({ remindMinutesBefore: 30 })], now, 60);
    expect(due).toHaveLength(1);
    expect(due[0].remindAt).toBe("2026-10-05T14:30:00.000Z");
  });

  it("skips events without reminders, done events, and reminders outside the window", () => {
    const due = dueReminders(
      [
        event({ id: "a" }),
        event({ id: "b", remindMinutesBefore: 30, done: true }),
        event({ id: "c", remindMinutesBefore: 30, start: "2026-10-06T15:00:00.000Z" }),
      ],
      now,
      60,
    );
    expect(due).toEqual([]);
  });
});
