// Polling hook: every panel refreshes on its own clock, pauses while the tab is hidden, and keeps the last
// good answer (with its time) when a refresh fails, so a failure greys out only its own panel or layer.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Envelope } from "./types";
import { ApiError } from "./client";

export interface Polled<T> {
  env: Envelope<T> | null;
  error: ApiError | null;
  loading: boolean;
  /** Time of the last successful answer (epoch ms). */
  lastOk: number | null;
  refresh: () => void;
}

export function usePoll<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<Envelope<T>>,
  intervalMs: number | null,
): Polled<T> {
  const [env, setEnv] = useState<Envelope<T> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // a new key starts clean
  useEffect(() => {
    setEnv(null);
    setError(null);
    setLastOk(null);
    setLoading(key !== null);
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const run = async () => {
      if (document.hidden && intervalMs) {
        timer = setTimeout(run, 2000);
        return;
      }
      try {
        const e = await fetcherRef.current(ctrl.signal);
        if (!alive) return;
        setEnv(e);
        setError(null);
        setLastOk(Date.now());
      } catch (err) {
        if (!alive || (err as Error).name === "AbortError") return;
        setError(err instanceof ApiError ? err : new ApiError(0, "internal_error", "The request failed.", null));
      } finally {
        if (alive) setLoading(false);
      }
      if (alive && intervalMs) timer = setTimeout(run, intervalMs);
    };
    run();
    return () => {
      alive = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { env, error, loading, lastOk, refresh };
}

/** Re-renders every `ms` so ages ("12 s ago") stay true. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
