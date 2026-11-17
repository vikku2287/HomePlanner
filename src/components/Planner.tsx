"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dueReminders, type DueReminder } from "@/lib/reminders";
import type { PlanEvent } from "@/lib/types";
import { api, type Me, type Plan } from "./api";
import { Chat } from "./Chat";
import { FamilyPanel } from "./FamilyPanel";
import { NotesFeed } from "./NotesFeed";
import { WeekView } from "./WeekView";
import { formatWhen } from "./format";
import { useFamilySync } from "./useFamilySync";

type Tab = "week" | "notes" | "ask" | "family";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "week", label: "Week", icon: "📅" },
  { id: "notes", label: "Notes", icon: "📝" },
  { id: "ask", label: "Assistant", icon: "💬" },
  { id: "family", label: "Family", icon: "👪" },
];

export function Planner({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tab, setTab] = useState<Tab>("week");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<DueReminder[]>([]);
  // Read after mount so server and client render the same markup.
  const [notifyPermission, setNotifyPermission] = useState<string>("unsupported");
  const inFlight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    // Coalesce bursts of change pings into at most one extra fetch.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        setPlan(await api<Plan>("/api/plan"));
        setLoadError(null);
      } while (again.current);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useFamilySync(me.realtime, plan?.revision, refresh);

  // A note being processed finishes in the background; keep checking until it does.
  const processing = plan?.notes.some((n) => n.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [processing, refresh]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifyPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const tick = () => setReminders(plan ? dueReminders(plan.events, new Date(), 60) : []);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [plan]);

  // Notifications for reminders while the app is open, when the user allows them.
  useEffect(() => {
    if (notifyPermission !== "granted") return;
    for (const r of reminders) {
      const key = `reminded:${r.event.id}:${r.occurrence}`;
      if (Date.parse(r.remindAt) <= Date.now() && !localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        navigator.serviceWorker?.ready
          .then((reg) => reg.showNotification(r.event.title, { body: `Starts ${formatWhen(r.occurrence)}` }))
          .catch(() => new Notification(r.event.title, { body: `Starts ${formatWhen(r.occurrence)}` }));
      }
    }
  }, [reminders, notifyPermission]);

  async function toggleDone(event: PlanEvent) {
    // Optimistic: tick it now, then let the server's copy win.
    setPlan((p) => p && { ...p, events: p.events.map((e) => (e.id === event.id ? { ...e, done: !e.done } : e)) });
    await api(`/api/events/${event.id}`, { method: "PATCH", body: { done: !event.done } }).catch(() => {});
    refresh();
  }

  const ai = Boolean(me.ai);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{me.family?.name ?? "HomePlanner"}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {loadError ? `⚠️ ${loadError}` : plan ? "In sync with your family" : "Loading…"}
          </p>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
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

      {plan && (
        <div className={`content tab-${tab}`}>
          <div className="pane pane-week">
            <WeekView events={plan.events} members={plan.members} notes={plan.notes} onToggleDone={toggleDone} />
          </div>
          <div className="pane pane-notes">
            <NotesFeed notes={plan.notes} meId={plan.meId} aiEnabled={ai} onChange={refresh} />
          </div>
          <div className="pane pane-ask">
            <Chat onChange={refresh} />
          </div>
          <div className="pane pane-family">
            <FamilyPanel me={me} members={plan.members} onChange={refresh} onSignOut={onSignOut} />
          </div>
        </div>
      )}
    </div>
  );
}
