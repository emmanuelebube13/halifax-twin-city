import { ago } from "../lib/ago";
// List view (equal to the map), the All sectors browser, and Data and sources.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BusStatus, SectorRegister, SourceStatus, VehicleProperties } from "../api/types";
import { t } from "../i18n";
import { formatAge, formatCount, formatDate, formatDateTime, formatDelay } from "../lib/format";
import { busStatus } from "../lib/status";
import { featureName, lookFor } from "../map/registry";
import { Icon, LayerMark, SectorIcon, StatusMark } from "./icons";
import { busTitle } from "./panels";
import type { LayerView } from "./story";

const ROW_LIMIT = 400;

/** Escape closes; focus moves into the overlay when it opens and back when it closes. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function ListView({
  layers, now, onSelect, onClose, selectedKey,
}: {
  layers: LayerView[];
  now: number;
  onSelect: (layer: string, kind: string, id: number) => void;
  onClose: () => void;
  selectedKey: string | null;
}) {
  const ref = useDialog(onClose);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const total = layers.reduce((n, l) => n + l.features.length, 0);
  return (
    <div className="overlay overlay--list" ref={ref} role="region" aria-label={t("list.title")}>
      <header className="overlay-head">
        <div>
          <h1 className="panel-title">{t("list.title")}</h1>
          <p className="panel-sub">{t("list.count", { count: formatCount(total) })}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          <Icon name="map" size={18} /> {t("list.close")}
        </button>
      </header>
      <label className="field">
        <span className="visually-hidden">{t("search.label")}</span>
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search.placeholderShort")} />
      </label>
      {total === 0 && <p className="panel-footnote">{t("list.empty")}</p>}
      {layers.map((l, i) => {
        const look = lookFor(l.name);
        const rows = l.features.filter((f) => !query || JSON.stringify(f.properties).toLowerCase().includes(query));
        const shown = rows.slice(0, ROW_LIMIT);
        const isBus = l.name === "vehicles";
        return (
          <details key={l.name} className="list-section" open={i === 0 || !!query}>
            <summary>
              <LayerMark look={look} />
              <span className="list-section-title">{l.title}</span>
              <span className="mono list-section-count">{formatCount(rows.length)}</span>
            </summary>
            <table className="list-table">
              <thead>
                <tr>
                  <th scope="col">{t("list.col.name")}</th>
                  <th scope="col">{isBus ? t("list.col.status") : t("list.col.detail")}</th>
                  <th scope="col">{t("list.col.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => {
                  const p = f.properties as Record<string, unknown>;
                  const key = `${p.kind}:${p.id}`;
                  const status: BusStatus | null = isBus ? busStatus(p.status as string, p.delay_seconds as number) : null;
                  return (
                    <tr key={key} className={key === selectedKey ? "is-selected" : undefined}>
                      <th scope="row">
                        <button type="button" className="linklike" onClick={() => onSelect(l.name, String(p.kind), Number(p.id))}>
                          {isBus ? busTitle(p as unknown as VehicleProperties) : featureName(p)}
                        </button>
                        {isBus && p.label ? <span className="list-sub mono">{String(p.label)}</span> : null}
                      </th>
                      <td>
                        {status ? (
                          <span className={`status-text--${status} list-status`}>
                            <StatusMark status={status} /> {t(`status.${status}`)}
                            {typeof p.delay_seconds === "number" && status !== "unknown" ? ` (${formatDelay(p.delay_seconds)})` : ""}
                          </span>
                        ) : (
                          <span>{String(p.closure_type_code ?? p.permit_type_code ?? p.stop_code ?? p.route_long_name ?? p.event_status_code ?? "")}{p.event_start_ts ? `, ${formatDate(p.event_start_ts as string)}` : ""}</span>
                        )}
                      </td>
                      <td>{p.position_ts ? formatAge(p.position_ts as string, now) : p.event_start_ts ? formatDate(p.event_start_ts as string) : l.asOf ? formatDateTime(l.asOf) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > ROW_LIMIT && <p className="panel-footnote">{t("list.limited", { shown: formatCount(ROW_LIMIT), total: formatCount(rows.length) })}</p>}
          </details>
        );
      })}
    </div>
  );
}

export function SectorsBrowser({
  register, error, pins, onTogglePin, onOpen, onClose, phone,
}: {
  register: SectorRegister | null;
  error: boolean;
  pins: string[];
  onTogglePin: (id: string) => boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  phone: boolean;
}) {
  const ref = useDialog(onClose);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!register) return [];
    return register.groups.map((g) => ({
      ...g,
      sectors: g.sector_ids.map((id) => register.sectors.find((s) => s.sector_id === id)).filter((s): s is NonNullable<typeof s> => !!s && (!query || s.name.toLowerCase().includes(query))),
    }));
  }, [register, query]);
  const max = register?.max_pins ?? 5;
  return (
    <div className="overlay overlay--sectors" ref={ref} role="dialog" aria-modal={phone} aria-labelledby="sectors-title">
      <header className="overlay-head">
        <div>
          <h1 className="panel-title" id="sectors-title">{t("sectors.title")}</h1>
          {register && (
            <p className="panel-sub">
              {t(phone ? "sectors.introPhone" : "sectors.intro", { count: register.sectors.length, groups: register.groups.length, max })}
            </p>
          )}
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t("sectors.close")}</button>
      </header>
      <label className="field">
        <span className="visually-hidden">{t("sectors.find")}</span>
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sectors.find")} data-autofocus />
      </label>
      {error && !register && <p className="error-text" role="alert">{t("sectors.failed")}</p>}
      <div className="sector-groups">
        {groups.map((g) =>
          g.sectors.length === 0 ? null : (
            <section key={g.group_id} className="sector-group" aria-labelledby={`g-${g.group_id}`}>
              <h2 className="section-title" id={`g-${g.group_id}`}>{g.name}</h2>
              <ul role="list">
                {g.sectors.map((s) => {
                  const live = s.status === "live";
                  const pinned = pins.includes(s.sector_id);
                  return (
                    <li key={s.sector_id} className={`sector-row${live ? " is-live" : ""}`}>
                      {live ? (
                        <button type="button" className="sector-row-main" onClick={() => onOpen(s.sector_id)}>
                          <span className="sector-row-icon"><SectorIcon id={s.sector_id} size={20} /></span>
                          <span className="sector-row-name">{s.name}</span>
                          {s.question_count ? <span className="sector-row-meta">{t("sectors.questions", { count: formatCount(s.question_count) })}</span> : null}
                        </button>
                      ) : (
                        <span className="sector-row-main is-static">
                          <span className="sector-row-icon is-planned" aria-hidden="true" />
                          <span className="sector-row-name">{s.name}</span>
                        </span>
                      )}
                      {live ? (
                        <button
                          type="button"
                          className={`pin-btn${pinned ? " is-pinned" : ""}`}
                          aria-pressed={pinned}
                          aria-label={`${pinned ? t("sectors.pinned") : t("sectors.pin")}: ${s.name}`}
                          onClick={() => {
                            const ok = onTogglePin(s.sector_id);
                            setMsg(ok ? null : t("sectors.pinsFull", { max }));
                          }}
                        >
                          {pinned ? t("sectors.pinned") : t("sectors.pin")}
                        </button>
                      ) : (
                        <span className="sector-row-planned">{t("sectors.planned")}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
        {register && groups.every((g) => g.sectors.length === 0) && <p className="panel-footnote">{t("sectors.none")}</p>}
      </div>
      <p className="pins-note" role="status">{msg ?? t("sectors.pinsUsed", { used: pins.length, max })}</p>
    </div>
  );
}

const SOURCE_STATUS_KEY = { ok: "sources.status.ok", stale: "sources.status.stale", down: "sources.status.down", unknown: "sources.status.unknown" } as const;

export function SourcesPanel({ rows, error, now, apiBase, onClose }: { rows: SourceStatus[]; error: boolean; now: number; apiBase: string; onClose: () => void }) {
  const ref = useDialog(onClose);
  return (
    <div className="overlay overlay--sources" ref={ref} role="dialog" aria-labelledby="sources-title">
      <header className="overlay-head">
        <div>
          <h1 className="panel-title" id="sources-title">{t("sources.title")}</h1>
          <p className="panel-sub">{t("sources.intro")}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t("sources.close")}</button>
      </header>
      {error && rows.length === 0 && <p className="error-text" role="alert">{t("sources.failed")}</p>}
      <ul className="source-list" role="list">
        {rows.map((s) => (
          <li key={s.source_id} className={`source-item source-item--${s.status}`}>
            <div className="source-item-head">
              <span className="mono source-id">{s.source_id}</span>
              <span className={`source-status source-status--${s.status}`}>
                <span className="source-dot" aria-hidden="true" />
                {t(SOURCE_STATUS_KEY[s.status] ?? "sources.status.unknown")}
              </span>
            </div>
            <p className="source-name">{s.dataset_name}</p>
            <dl className="source-facts">
              <div><dt>{t("sources.col.publisher")}</dt><dd>{s.publisher ?? "–"}</dd></div>
              <div><dt>{t("sources.col.licence")}</dt><dd>{s.licence}</dd></div>
              <div><dt>{t("sources.col.tier")}</dt><dd>{s.reliability_tier}</dd></div>
              <div><dt>{t("sources.col.loaded")}</dt><dd>{s.last_loaded_ts ? `${formatDateTime(s.last_loaded_ts)} (${ago(s.last_loaded_ts, now)})` : t("age.never")}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="panel-footnote">
        {t("trust.licence")}. {t("sources.api")}: <span className="mono">{apiBase}/v1</span>
      </p>
    </div>
  );
}
