import { ageLine } from "../lib/ago";
// The frame around the map: top bar with search, sector rail and chips, lens switch, legend, credits,
// replay controls and the phone's three-height bottom sheet.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useNow } from "../api/hooks";
import type { BusStatus, Lens, Sector, SourceRef, StorySummary } from "../api/types";
import { t } from "../i18n";
import { formatClock } from "../lib/format";
import type { Freshness } from "../lib/status";
import { lookFor } from "../map/registry";
import { Icon, LayerMark, Mark, SectorIcon, StatusMark } from "./icons";

// ---------------------------------------------------------------- search

export interface SearchItem {
  group: "questions" | "sectors" | "routes" | "stops" | "buses";
  key: string;
  label: string;
  sub?: string;
  mono?: string;
  run: () => void;
}

const GROUP_KEY = {
  questions: "search.group.questions",
  sectors: "search.group.sectors",
  routes: "search.group.routes",
  stops: "search.group.stops",
  buses: "search.group.buses",
} as const;

/** Ranks items by how well they match: id or label start beats a word start beats anywhere. */
export function searchItems(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: [number, SearchItem][] = [];
  for (const it of items) {
    const hay = `${it.mono ?? ""} ${it.label} ${it.sub ?? ""}`.toLowerCase();
    const label = it.label.toLowerCase();
    const mono = (it.mono ?? "").toLowerCase();
    let score = -1;
    if (mono === q || label === q) score = 0;
    else if (mono.startsWith(q) || label.startsWith(q)) score = 1;
    else if (hay.split(/[\s,[\]()]+/).some((w) => w.startsWith(q))) score = 2;
    else if (hay.includes(q)) score = 3;
    if (score >= 0) scored.push([score, it]);
  }
  const order = ["questions", "sectors", "routes", "stops", "buses"];
  scored.sort((a, b) => a[0] - b[0] || order.indexOf(a[1].group) - order.indexOf(b[1].group));
  // keep a few from each group so one long group does not hide the others
  const perGroup = new Map<string, number>();
  const out: SearchItem[] = [];
  for (const [, it] of scored) {
    const n = perGroup.get(it.group) ?? 0;
    if (n >= 5) continue;
    perGroup.set(it.group, n + 1);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

export function Search({ items, onFocus, placeholder, compact }: { items: SearchItem[]; onFocus?: () => void; placeholder: string; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const results = useMemo(() => searchItems(items, q), [items, q]);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const choose = (it: SearchItem) => {
    it.run();
    setQ("");
    setOpen(false);
  };
  const showList = open && q.trim().length > 0;
  let lastGroup = "";
  return (
    <div className={`search${compact ? " search--compact" : ""}`} ref={wrap}>
      <Icon name="search" size={20} />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && results[active] ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label={t("search.label")}
        placeholder={placeholder}
        value={q}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="search-results" id={`${id}-list`} role="listbox" aria-label={t("search.label")}>
          {results.length === 0 && <li className="search-none" role="option" aria-selected="false" aria-disabled="true">{t("search.none")}</li>}
          {results.map((it, i) => {
            const head = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <li
                key={it.key}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-item${i === active ? " is-active" : ""}${head ? " has-head" : ""}`}
                data-group={head ? t(GROUP_KEY[it.group]) : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(it)}
                onMouseEnter={() => setActive(i)}
              >
                {it.mono && <span className="mono search-mono">{it.mono}</span>}
                <span className="search-label">{it.label}</span>
                {it.sub && <span className="search-sub">{it.sub}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- top bar

export function ViewSwitch({ view, can3d, note, onChange, compact }: { view: "2d" | "3d"; can3d: boolean; note: string | null; onChange: (v: "2d" | "3d") => void; compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        className="ctl ctl--text"
        aria-label={view === "3d" ? t("view.to2d") : t("view.to3d")}
        aria-disabled={!can3d}
        title={can3d ? undefined : note ?? t("view.3dUnavailable")}
        onClick={() => can3d && onChange(view === "3d" ? "2d" : "3d")}
      >
        {view === "3d" ? t("view.2d") : t("view.3d")}
      </button>
    );
  }
  return (
    <div className="seg" role="group" aria-label={t("view.mode")}>
      <button type="button" className={view === "2d" ? "is-on" : ""} aria-pressed={view === "2d"} onClick={() => onChange("2d")}>{t("view.2d")}</button>
      <button
        type="button"
        className={view === "3d" ? "is-on" : ""}
        aria-pressed={view === "3d"}
        aria-disabled={!can3d}
        aria-describedby={can3d ? undefined : "note-3d"}
        onClick={() => can3d && onChange("3d")}
      >
        {t("view.3d")}
      </button>
      {!can3d && <span role="tooltip" id="note-3d" className="seg-note">{note ?? t("view.3dUnavailable")}</span>}
    </div>
  );
}

export function TopBar({ search, viewSwitch, listOpen, onList }: { search: ReactNode; viewSwitch: ReactNode; listOpen: boolean; onList: () => void }) {
  return (
    <header className="topbar">
      <a className="brand" href="./" aria-label={t("app.name")}>
        <Mark />
        <span className="brand-name">{t("app.name")}</span>
      </a>
      {search}
      <div className="topbar-end">
        {viewSwitch}
        <button type="button" className={`btn btn-secondary${listOpen ? " is-on" : ""}`} aria-pressed={listOpen} onClick={onList}>
          <Icon name={listOpen ? "map" : "list"} size={18} /> {listOpen ? t("view.map") : t("view.list")}
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- rail and chips

export function Rail({ pinned, active, onCity, onSector, onAll, onSources, allOpen, sourcesOpen }: {
  pinned: Sector[];
  active: string | null;
  onCity: () => void;
  onSector: (id: string) => void;
  onAll: () => void;
  onSources: () => void;
  allOpen: boolean;
  sourcesOpen: boolean;
}) {
  const item = (key: string, label: string, on: boolean, click: () => void) => (
    <li key={key}>
      <button type="button" className={`rail-item${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined} onClick={click}>
        <SectorIcon id={key} />
        <span>{label}</span>
      </button>
    </li>
  );
  return (
    <nav className="rail" aria-label={t("nav.primary")}>
      <ul role="list">
        {item("city", t("nav.city"), active === null && !allOpen && !sourcesOpen, onCity)}
        {pinned.map((s) => item(s.sector_id, shortName(s.name), active === s.sector_id && !allOpen, () => onSector(s.sector_id)))}
      </ul>
      <hr />
      <ul role="list">{item("all", t("nav.allSectors"), allOpen, onAll)}</ul>
      <ul role="list" className="rail-end">{item("sources", t("nav.sources"), sourcesOpen, onSources)}</ul>
    </nav>
  );
}

/** Rail and chip labels stay within three words: "Housing & Real Estate" becomes "Housing". */
export function shortName(name: string): string {
  const first = name.split(/\s+&\s+|\s+and\s+|,\s*/)[0];
  return first.split(/\s+/).slice(0, 3).join(" ");
}

export function ChipRow({ pinned, active, onCity, onSector, onAll }: { pinned: Sector[]; active: string | null; onCity: () => void; onSector: (id: string) => void; onAll: () => void }) {
  return (
    <nav className="chips" aria-label={t("nav.primary")}>
      <button type="button" className="chip chip--all" onClick={onAll}>
        <SectorIcon id="all" size={18} /> {t("nav.sectors")}
      </button>
      <button type="button" className={`chip${active === null ? " is-on" : ""}`} aria-current={active === null ? "page" : undefined} onClick={onCity}>
        {t("nav.city")}
      </button>
      {pinned.map((s) => (
        <button key={s.sector_id} type="button" className={`chip${active === s.sector_id ? " is-on" : ""}`} aria-current={active === s.sector_id ? "page" : undefined} onClick={() => onSector(s.sector_id)}>
          {shortName(s.name)}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- lens

export function LensSwitch({ lens, story, replayReady, live, onChange }: { lens: Lens; story: StorySummary | null; replayReady: boolean; live: boolean; onChange: (l: Lens) => void }) {
  const lenses: Lens[] = ["live", "replay", "analytics"];
  const note = (l: Lens): string | null => {
    if (story && !story.lenses.includes(l)) return t("lens.notForStory");
    if (!story && l === "analytics") return t("lens.notForStory");
    if (l === "replay" && !replayReady) return t("lens.replayNotReady");
    return null;
  };
  return (
    <div className="lens" role="radiogroup" aria-label={t("lens.label")}>
      {lenses.map((l) => {
        const why = note(l);
        const on = l === lens;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={!!why}
            title={why ?? undefined}
            className={`lens-btn${on ? " is-on" : ""}${why ? " is-off" : ""}`}
            onClick={() => !why && onChange(l)}
          >
            {l === "live" && <span className={`sonar${live && on ? " is-live" : ""}`} aria-hidden="true" />}
            {t(`lens.${l}`)}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- legend and credits

export interface LegendEntry {
  layer: string;
  title: string;
  statusLegend: { value: string; label: string }[] | null;
  freshness: Freshness;
  asOf: string | null;
}

export function Legend({ entries, compact }: { entries: LegendEntry[]; compact?: boolean }) {
  if (!entries.length) return null;
  return (
    <section className={`legend${compact ? " legend--compact" : ""}`} aria-label={t("status.legend")}>
      {entries.map((e) => (
        <div key={e.layer} className={`legend-row legend-row--${e.freshness}`}>
          {e.statusLegend ? (
            <ul className="legend-items" role="list" aria-label={e.title}>
              {e.statusLegend.map((s) => (
                <li key={s.value}>
                  <StatusMark status={s.value as BusStatus} />
                  {s.label}
                </li>
              ))}
            </ul>
          ) : (
            <span className="legend-layer">
              <LayerMark look={lookFor(e.layer)} />
              {e.title}
            </span>
          )}
          {e.freshness === "stale" && <span className="legend-flag">{t("layer.stale", { time: formatClock(e.asOf) })}</span>}
          {e.freshness === "down" && <span className="legend-flag">{t("layer.down")}</span>}
        </div>
      ))}
    </section>
  );
}

export function AgeLine({ sources, asOf, now }: { sources?: SourceRef[]; asOf: string; now?: number }) {
  const tick = useNow(1000);
  const effectiveNow = now ?? tick;
  return <>{ageLine(sources, asOf, effectiveNow)}</>;
}

export function Credits({ asOf, now, basemapOk, threeD, sources }: { asOf: string | null; now?: number; basemapOk: boolean | null; threeD: boolean; sources?: SourceRef[] }) {
  const tick = useNow(1000);
  const effectiveNow = now ?? tick;
  return (
    <div className="credits">
      {asOf && <span className="credits-age">{ageLine(sources, asOf, effectiveNow)}</span>}
      <span>{threeD ? t("credits.3d") : basemapOk === false ? t("map.basemapFallback") : t("map.attribution")}</span>
      <span className="credits-licence">{t("credits.licence")}</span>
    </div>
  );
}

// ---------------------------------------------------------------- replay

export function ReplayBar({ from, to, at, playing, speed, onSeek, onPlay, onSpeed }: {
  from: number;
  to: number;
  at: number;
  playing: boolean;
  speed: number;
  onSeek: (t: number) => void;
  onPlay: () => void;
  onSpeed: (s: number) => void;
}) {
  return (
    <div className="replay" role="group" aria-label={t("lens.replay")}>
      <button type="button" className="ctl" onClick={onPlay} aria-label={playing ? t("replay.pause") : t("replay.play")}>
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <span className="mono replay-clock">{formatClock(at, true)}</span>
      <input
        type="range"
        min={from}
        max={to}
        step={1000}
        value={at}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label={t("replay.time")}
        aria-valuetext={formatClock(at, true)}
      />
      <label className="replay-speed">
        <span className="visually-hidden">{t("replay.speed")}</span>
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
          <option value={30}>30x</option>
          <option value={60}>60x</option>
        </select>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- phone sheet

export type SheetHeight = "peek" | "half" | "full";
const ORDER: SheetHeight[] = ["peek", "half", "full"];

export function BottomSheet({ height, onHeight, children, reducedMotion }: { height: SheetHeight; onHeight: (h: SheetHeight) => void; children: ReactNode; reducedMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; start: number; moved: boolean } | null>(null);
  const [dy, setDy] = useState(0);
  const wasDrag = useRef(false);
  const next = ORDER[(ORDER.indexOf(height) + 1) % ORDER.length];

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, start: Date.now(), moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = e.clientY - drag.current.y;
    if (Math.abs(d) > 4) drag.current.moved = true;
    setDy(d);
  };
  const onUp = () => {
    const d = dy;
    const moved = drag.current?.moved;
    wasDrag.current = !!moved;
    drag.current = null;
    setDy(0);
    if (!moved) return;
    const i = ORDER.indexOf(height);
    if (d < -40) onHeight(ORDER[Math.min(i + (d < -260 ? 2 : 1), 2)]);
    else if (d > 40) onHeight(ORDER[Math.max(i - (d > 260 ? 2 : 1), 0)]);
  };

  return (
    <section
      ref={ref}
      className={`sheet sheet--${height}${dy ? " is-dragging" : ""}${reducedMotion ? " no-motion" : ""}`}
      style={dy ? { transform: `translateY(calc(var(--sheet-offset) + ${dy}px))` } : undefined}
      aria-label={t("sheet.label")}
    >
      <div className="sheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <button
          type="button"
          className="sheet-handle"
          aria-label={height === "full" ? t("sheet.peek") : height === "half" ? t("sheet.full") : t("sheet.half")}
          onClick={() => {
            if (wasDrag.current) {
              wasDrag.current = false;
              return;
            }
            onHeight(next);
          }}
        >
          <span aria-hidden="true" />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
