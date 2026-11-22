// Keeps the view state and the URL in step: every change is written to the address bar, and the browser's
// back and forward buttons restore the view.

import { useCallback, useEffect, useState } from "react";
import { parseView, serializeView, type ViewState } from "./url";

export function useView(): [ViewState, (patch: Partial<ViewState>, opts?: { push?: boolean }) => void] {
  const [view, setState] = useState<ViewState>(() => parseView(location.search));

  useEffect(() => {
    const on = () => setState(parseView(location.search));
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const setView = useCallback((patch: Partial<ViewState>, opts?: { push?: boolean }) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const url = `${location.pathname}${serializeView(next)}${location.hash}`;
      if (opts?.push) history.pushState(null, "", url);
      else history.replaceState(null, "", url);
      return next;
    });
  }, []);

  return [view, setView];
}

const PINS_KEY = "halifax-twin.pins";

/** Pinned sectors, kept in this browser only. Defaults come from the sector register. */
export function usePins(defaults: string[], max: number): [string[], (id: string) => boolean] {
  const [pins, setPins] = useState<string[] | null>(() => {
    try {
      const raw = localStorage.getItem(PINS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });
  const current = (pins ?? defaults).slice(0, max);
  const toggle = useCallback(
    (id: string) => {
      const list = pins ?? defaults;
      let next: string[];
      if (list.includes(id)) next = list.filter((x) => x !== id);
      else if (list.length >= max) return false;
      else next = [...list, id];
      setPins(next);
      try {
        localStorage.setItem(PINS_KEY, JSON.stringify(next));
      } catch {
        // storage blocked: pins last for this visit only
      }
      return true;
    },
    [pins, defaults, max],
  );
  return [current, toggle];
}
