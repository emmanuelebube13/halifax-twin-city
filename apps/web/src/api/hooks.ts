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
    let inFlight = false;
    let lastRunAt = 0;

    const scheduleNext = () => {
      if (!alive || !intervalMs || document.hidden) return;
      if (timer) clearTimeout(timer);
      const elapsed = lastRunAt ? Date.now() - lastRunAt : intervalMs;
      const delay = Math.max(0, intervalMs - elapsed);
      timer = setTimeout(run, delay);
    };

    const run = async () => {
      if (!alive || inFlight) return;
      if (intervalMs && document.hidden) return;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      inFlight = true;
      try {
        const e = await fetcherRef.current(ctrl.signal);
        if (!alive) return;
        setEnv((prev) => (prev === e ? prev : e));
        setError(null);
        setLastOk(Date.now());
      } catch (err) {
        if (!alive || (err as Error).name === "AbortError") return;
        setError(err instanceof ApiError ? err : new ApiError(0, "internal_error", "The request failed.", null));
      } finally {
        inFlight = false;
        lastRunAt = Date.now();
        if (alive) setLoading(false);
      }
      if (alive && intervalMs && !document.hidden) {
        timer = setTimeout(run, intervalMs);
      }
    };

    const onVisibilityChange = () => {
      if (!alive || !intervalMs) return;
      if (document.visibilityState === "visible") {
        if (inFlight) return;
        const elapsed = lastRunAt ? Date.now() - lastRunAt : intervalMs;
        if (elapsed >= intervalMs) {
          run();
        } else {
          scheduleNext();
        }
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    run();
    return () => {
      alive = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [key, intervalMs, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { env, error, loading, lastOk, refresh };
}

/** Re-renders every `ms` so ages ("12 s ago") stay true. */
export function useNow(ms: number | null = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ms === null || ms <= 0) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNow(Date.now());
    };
    const id = setInterval(tick, ms);
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) setNow(Date.now());
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
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
