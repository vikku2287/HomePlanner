"use client";

import { useCallback, useEffect, useState } from "react";
import type { DueReminder } from "@/lib/reminders";
import type { Member, PlanEvent } from "@/lib/types";
import { Chat } from "./Chat";

type Suggestion = { title: string; detail: string; kind: string };

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Planner() {
  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [reminders, setReminders] = useState<DueReminder[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // Read after mount so server and client render the same markup.
  const [notifyPermission, setNotifyPermission] = useState<string>("unsupported");

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifyPermission(Notification.permission);
  }, []);

  const refresh = useCallback(async () => {
    const [e, m, r] = await Promise.all([
      fetch("/api/events").then((res) => res.json()),
      fetch("/api/members").then((res) => res.json()),
      fetch("/api/reminders?windowMinutes=60").then((res) => res.json()),
    ]);
    setEvents(e);
    setMembers(m);
    setReminders(r);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Browser notifications for reminders, when the user allows them.
  useEffect(() => {
    if (notifyPermission !== "granted") return;
    for (const r of reminders) {
      const key = `reminded:${r.event.id}:${r.occurrence}`;
      if (Date.parse(r.remindAt) <= Date.now() && !sessionStorage.getItem(key)) {
        new Notification(r.event.title, { body: `Starts ${formatWhen(r.occurrence)}` });
        sessionStorage.setItem(key, "1");
      }
    }
  }, [reminders, notifyPermission]);

  async function toggleDone(event: PlanEvent) {
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !event.done }),
    });
    refresh();
  }

  async function loadSuggestions() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/suggestions?timeZone=${encodeURIComponent(timeZone())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not get suggestions");
      setSuggestions(body.suggestions);
    } catch (err) {
      setSuggestError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  return (
    <main>
      <div>
        <header style={{ marginBottom: 20 }}>
          <h1>HomePlanner</h1>
          <p className="muted" style={{ margin: 0 }}>
            Your family&apos;s plans. Ask the assistant to add, move or finish anything.
          </p>
        </header>

        {reminders.length > 0 && (
          <section className="panel">
            <h2>Coming up</h2>
            {reminders.map((r) => (
              <div key={`${r.event.id}-${r.occurrence}`} className="reminder">
                ⏰ {r.event.title} at {formatWhen(r.occurrence)}
              </div>
            ))}
            {notifyPermission === "default" && (
              <button
                className="secondary"
                onClick={async () => setNotifyPermission(await Notification.requestPermission())}
              >
                Turn on notifications
              </button>
            )}
          </section>
        )}

        <section className="panel">
          <h2>Plans</h2>
          {events.length === 0 && (
            <p className="muted">Nothing planned yet. Try: &quot;Add soccer practice for Maya every Tuesday at 5pm&quot;.</p>
          )}
          {events.map((e) => (
            <div key={e.id} className={`event${e.done ? " done" : ""}`}>
              <input type="checkbox" checked={e.done} onChange={() => toggleDone(e)} aria-label="Done" />
              <div style={{ flex: 1 }}>
                <div className="title">{e.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {formatWhen(e.start)}
                  {e.recurrence !== "none" && ` · repeats ${e.recurrence}`}
                  {e.memberIds.length > 0 && ` · ${e.memberIds.map(memberName).join(", ")}`}
                  {e.remindMinutesBefore !== undefined && ` · reminder ${e.remindMinutesBefore} min before`}
                </div>
              </div>
              <span className="chip">{e.category}</span>
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Family</h2>
          {members.length === 0 ? (
            <p className="muted">No one added yet. Tell the assistant who&apos;s in your family.</p>
          ) : (
            <p style={{ margin: 0 }}>{members.map((m) => m.name).join(", ")}</p>
          )}
        </section>

        <section className="panel">
          <h2>Suggestions</h2>
          <button onClick={loadSuggestions} disabled={suggesting}>
            {suggesting ? "Thinking…" : "Get AI suggestions"}
          </button>
          {suggestError && <p className="reminder">{suggestError}</p>}
          {suggestions && (
            <ul className="suggestions" style={{ marginTop: 12 }}>
              {suggestions.map((s, i) => (
                <li key={i}>
                  <strong>{s.title}</strong> <span className="chip">{s.kind}</span>
                  <div className="muted">{s.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Chat timeZone={timeZone} onChange={refresh} />
    </main>
  );
}
