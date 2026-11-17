"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import type { Me } from "./api";

/** How often to check for changes when realtime pings are, or aren't, available. */
const POLL_WITH_REALTIME_MS = 60_000;
const POLL_WITHOUT_REALTIME_MS = 5_000;

/**
 * Keeps this device's copy of the plan fresh. It listens for Supabase Realtime
 * pings when the server is configured for them, and always also polls the cheap
 * /api/sync revision check (more often without realtime, and whenever the app
 * comes back to the foreground), so a missed ping never leaves a phone stale.
 */
export function useFamilySync(
  realtime: Me["realtime"],
  revision: string | undefined,
  refresh: () => void,
) {
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let channel: RealtimeChannel | undefined;
    let client: ReturnType<typeof createClient> | undefined;
    if (realtime) {
      client = createClient(realtime.url, realtime.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      channel = client
        .channel(realtime.channel)
        .on("broadcast", { event: "changed" }, ({ payload }) => {
          if (payload?.revision !== revisionRef.current) refreshRef.current();
        })
        .subscribe();
    }

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) return;
        const { revision: latest } = await res.json();
        if (latest !== revisionRef.current) refreshRef.current();
      } catch {
        // Offline; try again on the next tick.
      }
    };
    const timer = setInterval(check, realtime ? POLL_WITH_REALTIME_MS : POLL_WITHOUT_REALTIME_MS);
    const onWake = () => void check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [realtime]);
}
