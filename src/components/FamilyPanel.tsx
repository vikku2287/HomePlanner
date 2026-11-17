"use client";

import { useState, type FormEvent } from "react";
import type { Member } from "@/lib/types";
import { api, type Me } from "./api";

type Suggestion = { title: string; detail: string; kind: string };

export function FamilyPanel({
  me,
  members,
  onChange,
  onSignOut,
}: {
  me: Me;
  members: Member[];
  onChange: () => void;
  onSignOut: () => void;
}) {
  const [inviteCode, setInviteCode] = useState(me.family?.inviteCode ?? "");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Member["role"]>("child");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inviteText = `Join our family planner on HomePlanner: ${typeof location !== "undefined" ? location.origin : ""} with invite code ${inviteCode}`;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "HomePlanner invite", text: inviteText });
      else {
        await navigator.clipboard.writeText(inviteText);
        setMessage("Invite copied. Paste it into a message to your family.");
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  async function rotate() {
    const res = await api<{ inviteCode: string }>("/api/family/invite", { body: {} });
    setInviteCode(res.inviteCode);
    setMessage("New code ready. The old one no longer works.");
  }

  async function addMember(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/members", { body: { name: newName, role: newRole } });
      setNewName("");
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function loadSuggestions() {
    setSuggesting(true);
    setMessage(null);
    try {
      setSuggestions((await api<{ suggestions: Suggestion[] }>("/api/suggestions")).suggestions);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>{me.family?.name}</h2>
        <ul className="members">
          {members.map((m) => (
            <li key={m.id}>
              <span className="dot" style={{ background: m.color }} />
              {m.name}
              <span className="muted"> · {m.role}</span>
              {m.userId ? <span className="chip">on the app</span> : null}
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={addMember} style={{ marginTop: 12 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add someone without a phone"
            aria-label="Name"
            required
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as Member["role"])} aria-label="Role">
            <option value="child">child</option>
            <option value="parent">parent</option>
            <option value="other">other</option>
          </select>
          <button type="submit">Add</button>
        </form>
      </section>

      <section className="panel">
        <h2>Invite family</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Share this code. They install the app, create an account and enter it to join.
        </p>
        <div className="invite">{inviteCode}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={share}>Share invite</button>
          <button className="secondary" onClick={rotate}>
            New code
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Suggestions</h2>
        <button onClick={loadSuggestions} disabled={suggesting}>
          {suggesting ? "Thinking…" : "Get AI suggestions for the week"}
        </button>
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

      {message && <p className="muted">{message}</p>}

      <p className="muted" style={{ fontSize: 13 }}>
        Signed in as {me.user?.email} ·{" "}
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </>
  );
}
