// Polls a changing set of keys (layers, numbers, story configurations), each on its own clock.
// One key failing keeps its last good answer and its own error; the others are untouched.

import { useEffect, useRef, useState } from "react";
import { ApiError } from "./client";
import type { Envelope } from "./types";

export interface Slot<T> {
  env: Envelope<T> | null;
  error: ApiError | null;
  loading: boolean;
  lastOk: number | null;
}

export function usePollMany<T>(
  keys: string[],
  fetcher: (key: string, signal: AbortSignal) => Promise<Envelope<T>>,
  intervalFor: (key: string) => number | null,
): Record<string, Slot<T>> {
  const [slots, setSlots] = useState<Record<string, Slot<T>>>({});
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(intervalFor);
  intervalRef.current = intervalFor;
  const running = useRef(new Map<string, () => void>());
  const signature = [...new Set(keys)].sort().join("|");

  useEffect(() => {
    const wanted = new Set(signature ? signature.split("|") : []);
    // stop pollers no longer wanted
    for (const [k, stop] of running.current) {
      if (!wanted.has(k)) {
        stop();
        running.current.delete(k);
      }
    }
    // start new ones
    for (const key of wanted) {
      if (running.current.has(key)) continue;
      const ctrl = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let alive = true;
      let inFlight = false;
      let lastRunAt = 0;
      setSlots((s) => (s[key] ? s : { ...s, [key]: { env: null, error: null, loading: true, lastOk: null } }));

      const scheduleNext = (every: number) => {
        if (!alive || !every || document.hidden) return;
        if (timer) clearTimeout(timer);
        const elapsed = lastRunAt ? Date.now() - lastRunAt : every;
        const delay = Math.max(0, every - elapsed);
        timer = setTimeout(run, delay);
      };

      const run = async () => {
        if (!alive || inFlight) return;
        const every = intervalRef.current(key);
        if (every && document.hidden) return;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        inFlight = true;
        try {
          const env = await fetcherRef.current(key, ctrl.signal);
          if (!alive) return;
          setSlots((s) => {
            const prev = s[key];
            if (prev && !prev.loading && prev.error === null && prev.env === env) {
              return s;
            }
            return {
              ...s,
              [key]: {
                env: prev && prev.env === env ? prev.env : env,
                error: null,
                loading: false,
                lastOk: Date.now(),
              },
            };
          });
        } catch (err) {
          if (!alive || (err as Error).name === "AbortError") return;
          const e = err instanceof ApiError ? err : new ApiError(0, "internal_error", "The request failed.", null);
          setSlots((s) => ({ ...s, [key]: { env: s[key]?.env ?? null, error: e, loading: false, lastOk: s[key]?.lastOk ?? null } }));
        } finally {
          inFlight = false;
          lastRunAt = Date.now();
        }
        if (alive && every && !document.hidden) {
          timer = setTimeout(run, every);
        }
      };

      const onVisibilityChange = () => {
        const every = intervalRef.current(key);
        if (!alive || !every) return;
        if (document.visibilityState === "visible") {
          if (inFlight) return;
          const elapsed = lastRunAt ? Date.now() - lastRunAt : every;
          if (elapsed >= every) {
            run();
          } else {
            scheduleNext(every);
          }
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      };

      document.addEventListener("visibilitychange", onVisibilityChange);
      run();
      running.current.set(key, () => {
        alive = false;
        ctrl.abort();
        if (timer) clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      });
    }
  }, [signature]);

  useEffect(
    () => () => {
      for (const stop of running.current.values()) stop();
      running.current.clear();
    },
    [],
  );

  return slots;
}
