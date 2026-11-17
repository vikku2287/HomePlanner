"use client";

import { useState, type FormEvent } from "react";
import type { Note } from "@/lib/types";
import { api } from "./api";
import { formatAgo } from "./format";

const STATUS_LABEL: Record<Note["status"], string> = {
  processing: "Updating the plan…",
  applied: "Plan updated",
  no_change: "No plan change",
  saved: "Saved",
  error: "Couldn't update the plan",
};

export function NotesFeed({
  notes,
  meId,
  aiEnabled,
  onChange,
}: {
  notes: Note[];
  meId: string;
  aiEnabled: boolean;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/notes", { body: { text } });
      setDraft("");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retry(note: Note) {
    try {
      await api(`/api/notes/${note.id}/retry`, { body: {} });
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="panel">
      <h2>Family notes</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Jot down anything the family should know. {aiEnabled ? "The assistant adds it to the weekly plan." : ""}
      </p>
      <form onSubmit={post} className="stack">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={`e.g. "On Tuesday, Wednesday and Thursday fruits not needed for lunch"`}
          aria-label="New note"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(e);
          }}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          {busy ? "Posting…" : "Post note"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="notes">
        {notes.length === 0 && <li className="muted">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className={n.authorMemberId === meId ? "mine" : ""}>
            <div className="meta muted">
              <strong>{n.authorMemberId === meId ? "You" : n.authorName}</strong> · {formatAgo(n.createdAt)}
            </div>
            <div className="text">{n.text}</div>
            <div className={`status ${n.status}`}>
              {STATUS_LABEL[n.status]}
              {n.summary && n.status !== "processing" ? `: ${n.summary}` : ""}
              {n.status === "error" && aiEnabled && (
                <>
                  {" "}
                  <button className="link" onClick={() => retry(n)}>
                    Retry
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
