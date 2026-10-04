import type { PlanEvent } from "./types";

export interface DueReminder {
  event: PlanEvent;
  /** The occurrence start this reminder is for (ISO string). */
  occurrence: string;
  /** When the reminder fires (ISO string). */
  remindAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Returns the next occurrence of `event` that starts at or after `after`. */
export function nextOccurrence(event: PlanEvent, after: Date): Date | null {
  const start = new Date(event.start);
  if (event.recurrence === "none") return start >= after ? start : null;

  const next = new Date(start);
  while (next < after) {
    switch (event.recurrence) {
      case "daily":
        next.setTime(next.getTime() + DAY * Math.max(1, Math.floor((after.getTime() - next.getTime()) / DAY)));
        break;
      case "weekly":
        next.setTime(next.getTime() + 7 * DAY * Math.max(1, Math.floor((after.getTime() - next.getTime()) / (7 * DAY))));
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
    }
  }
  return next;
}

/**
 * Reminders whose fire time falls in the window [now, now + windowMinutes],
 * including ones already due for events that have not started yet.
 */
export function dueReminders(events: PlanEvent[], now: Date, windowMinutes = 60): DueReminder[] {
  const horizon = now.getTime() + windowMinutes * 60 * 1000;
  const out: DueReminder[] = [];
  for (const event of events) {
    if (event.done || event.remindMinutesBefore === undefined) continue;
    const occ = nextOccurrence(event, now);
    if (!occ) continue;
    const remindAt = occ.getTime() - event.remindMinutesBefore * 60 * 1000;
    if (remindAt <= horizon) {
      out.push({ event, occurrence: occ.toISOString(), remindAt: new Date(remindAt).toISOString() });
    }
  }
  return out.sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt));
}
