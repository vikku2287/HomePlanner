"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./api";
import { AuthScreen } from "./AuthScreen";
import { FamilySetup } from "./FamilySetup";
import { Planner } from "./Planner";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="centered">
        <p className="error">{error}</p>
        <button onClick={load}>Try again</button>
      </div>
    );
  }
  if (!me) return <div className="centered muted">Loading…</div>;
  if (!me.user) return <AuthScreen onDone={load} />;
  if (!me.family) return <FamilySetup userName={me.user.name} onDone={load} />;
  return (
    <Planner
      key={me.family.id}
      me={me}
      onSignOut={async () => {
        await api("/api/auth/logout", { body: {} });
        load();
      }}
    />
  );
}
