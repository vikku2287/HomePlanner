"use client";

import { useState, type FormEvent } from "react";
import { api } from "./api";

export function FamilySetup({ userName, onDone }: { userName: string; onDone: () => void }) {
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: FormEvent, action: () => Promise<unknown>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <section className="panel narrow">
        <h1>Hi {userName}!</h1>
        <p className="muted">Join your family&apos;s planner, or start a new one and invite them.</p>

        <h2>Join with an invite code</h2>
        <form className="row" onSubmit={(e) => run(e, () => api("/api/family/join", { body: { inviteCode: code } }))}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD-2345"
            aria-label="Invite code"
            autoCapitalize="characters"
            required
          />
          <button type="submit" disabled={busy}>
            Join
          </button>
        </form>

        <h2 style={{ marginTop: 24 }}>Or start a new family</h2>
        <form
          className="row"
          onSubmit={(e) =>
            run(e, () =>
              api("/api/family", {
                body: { name: familyName, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              }),
            )
          }
        >
          <input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g. The Kumar family"
            aria-label="Family name"
            required
          />
          <button type="submit" disabled={busy}>
            Create
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ fontSize: 13, marginTop: 24 }}>
          <button
            className="link"
            onClick={async () => {
              await api("/api/auth/logout", { body: {} });
              onDone();
            }}
          >
            Sign out
          </button>
        </p>
      </section>
    </div>
  );
}
