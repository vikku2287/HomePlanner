"use client";

import { useMemo, useState } from "react";
import { occurrencesBetween } from "@/lib/reminders";
import type { Member, Note, PlanEvent } from "@/lib/types";
import { addDays, formatTime, startOfWeek } from "./format";

type Item = { event: PlanEvent; at: Date };

export function WeekView({
  events,
  members,
  notes,
  onToggleDone,
}: {
  events: PlanEvent[];
  members: Member[];
  notes: Note[];
  onToggleDone: (e: PlanEvent) => void;
}) {
  const [offset, setOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), offset * 7), [offset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    const buckets: Item[][] = days.map(() => []);
    for (const event of events) {
      for (const at of occurrencesBetween(event, weekStart, weekEnd)) {
        const idx = Math.floor((at.getTime() - weekStart.getTime()) / 86_400_000);
        // Daylight-saving shifts can push an occurrence an hour either side; clamp it.
        buckets[Math.min(6, Math.max(0, idx))].push({ event, at });
      }
    }
    for (const b of buckets) {
      b.sort((x, y) => Number(y.event.allDay) - Number(x.event.allDay) || x.at.getTime() - y.at.getTime());
    }
    return buckets;
  }, [events, days, weekStart]);

  const memberById = (id: string) => members.find((m) => m.id === id);
  const noteAuthor = (id?: string) => notes.find((n) => n.id === id)?.authorName;
  const today = new Date().toDateString();
  const label =
    offset === 0
      ? "This week"
      : offset === 1
        ? "Next week"
        : offset === -1
          ? "Last week"
          : weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section className="panel">
      <div className="row spread">
        <button className="secondary" onClick={() => setOffset(offset - 1)} aria-label="Previous week">
          ‹
        </button>
        <h2 style={{ margin: 0 }}>{label}</h2>
        <button className="secondary" onClick={() => setOffset(offset + 1)} aria-label="Next week">
          ›
        </button>
      </div>
      <div className="week">
        {days.map((day, i) => (
          <div key={day.toISOString()} className={`day${day.toDateString() === today ? " today" : ""}`}>
            <div className="day-label">
              {day.toLocaleDateString(undefined, { weekday: "short" })}{" "}
              <span className="muted">{day.getDate()}</span>
            </div>
            {byDay[i].length === 0 && <div className="muted empty">—</div>}
            {byDay[i].map(({ event, at }) => {
              const people = event.memberIds.map(memberById).filter((m): m is Member => Boolean(m));
              const from = noteAuthor(event.sourceNoteId);
              return (
                <div
                  key={`${event.id}-${at.toISOString()}`}
                  className={`item ${event.category}${event.done ? " done" : ""}`}
                  style={people[0] ? { borderLeftColor: people[0].color } : undefined}
                >
                  <input
                    type="checkbox"
                    checked={event.done}
                    onChange={() => onToggleDone(event)}
                    aria-label={`Mark ${event.title} done`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title">
                      {!event.allDay && <span className="time">{formatTime(at)}</span>}
                      {event.allDay ? "" : " "}
                      {event.title}
                    </div>
                    <div className="meta muted">
                      {event.end && !event.allDay && `until ${formatTime(new Date(event.end))} · `}
                      {people.length > 0 ? people.map((p) => p.name).join(", ") : "Everyone"}
                      {event.recurrence !== "none" && ` · ${event.recurrence}`}
                      {from && ` · from ${from}'s note`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
