"use client";

import { useState, type FormEvent } from "react";

type Turn = { role: "user" | "assistant"; content: string };

export function Chat({ timeZone, onChange }: { timeZone: () => string; onChange: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", content: "Hi! Tell me what's coming up and I'll keep the family plan up to date." },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The greeting is UI-only; the conversation sent to Claude starts with the first user turn.
        body: JSON.stringify({ messages: next.slice(1), timeZone: timeZone() }),
      });
      const body = await res.json();
      setTurns([...next, { role: "assistant", content: res.ok ? body.reply : `⚠️ ${body.error}` }]);
      onChange();
    } catch {
      setTurns([...next, { role: "assistant", content: "⚠️ Couldn't reach the assistant." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel chat">
      <h2>Assistant</h2>
      <div className="messages">
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role}`}>
            {t.content}
          </div>
        ))}
        {busy && <div className="msg assistant muted">…</div>}
      </div>
      <form onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Move Friday's dentist to 4pm"
          aria-label="Message the assistant"
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </aside>
  );
}
