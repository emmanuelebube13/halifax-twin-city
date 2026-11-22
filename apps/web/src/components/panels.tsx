import { ago } from "../lib/ago";
// City view, sector view, the feature card (map popup or phone card) and the feature detail panel.

import { useCallback, useEffect, useRef } from "react";
import { api } from "../api/client";
import { usePoll } from "../api/hooks";
import type { BusStatus, Kind, Sector, StorySummary, VehicleProperties } from "../api/types";
import { t } from "../i18n";
import { formatCount, formatDate, formatDateTime, formatDelay, formatMoney, NO_VALUE } from "../lib/format";
import { busStatus } from "../lib/status";
import { featureName, lookFor } from "../map/registry";
import { Icon, LayerMark, SectorIcon, StatusMark } from "./icons";
import { statusWord } from "./story";

export interface SectorCount {
  sector: Sector;
  layers: { name: string; title: string; count: number; loading: boolean }[];
}

export function StoryCard({ story, sectorName, onOpen, active }: { story: StorySummary; sectorName?: string; onOpen: () => void; active?: boolean }) {
  const live = story.status === "live";
  return (
    <li>
      <button type="button" className={`story-card${live ? "" : " is-not-live"}${active ? " is-active" : ""}`} onClick={onOpen}>
        <span className="story-card-meta">
          <span className="mono">{story.id}</span>
          {sectorName && <span className="story-card-sector">{sectorName}</span>}
          {!live && <span className={`status-chip status-chip--${story.status}`}>{statusWord(story.status)}</span>}
        </span>
        <span className="story-card-q">{story.question}</span>
        {!live && story.status_note && <span className="story-card-note">{story.status_note}</span>}
      </button>
    </li>
  );
}

function orderStories(list: StorySummary[]): StorySummary[] {
  const rank = (s: StorySummary) => (s.status === "live" ? 0 : s.status === "collecting_data" ? 1 : s.status === "source_incomplete" ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

export function CityPanel({
  counts, stories, sectorName, onOpenStory, onOpenSector,
}: {
  counts: SectorCount[];
  stories: StorySummary[];
  sectorName: (id: string) => string;
  onOpenStory: (id: string) => void;
  onOpenSector: (id: string) => void;
}) {
  const total = counts.reduce((n, c) => n + c.layers.reduce((m, l) => m + l.count, 0), 0);
  const anyLoading = counts.some((c) => c.layers.some((l) => l.loading));
  const withData = counts.filter((c) => c.layers.some((l) => l.count > 0)).length;
  return (
    <div className="panel-body">
      <header className="city-head">
        <h1 className="panel-title">{t("city.title")}</h1>
        <div className="answer-plate answer-plate--city" aria-live="polite">
          <p className="answer-text">
            {anyLoading && total === 0 ? (
              t("story.loading")
            ) : total === 0 ? (
              t("city.summaryNone")
            ) : (
              <>
                <strong className="answer-num">{formatCount(total)}</strong> {withData === 1 ? t("city.summaryOne") : t("city.summaryRest", { sectors: withData })}
              </>
            )}
          </p>
        </div>
      </header>
      <ul className="sector-counts" role="list">
        {counts.map((c) => (
          <li key={c.sector.sector_id}>
            <button type="button" className="sector-count" onClick={() => onOpenSector(c.sector.sector_id)}>
              <span className="sector-count-icon"><SectorIcon id={c.sector.sector_id} size={22} /></span>
              <span className="sector-count-name">{c.sector.name}</span>
              <span className="sector-count-vals">
                {c.layers.map((l) => (
                  <span key={l.name} className="sector-count-val">
                    <span className="mono">{l.loading && !l.count ? NO_VALUE : formatCount(l.count)}</span> {l.title.toLowerCase()}
                  </span>
                ))}
              </span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <h2 className="section-title">{t("city.questions")}</h2>
      <ul className="story-cards" role="list">
        {orderStories(stories).map((s) => (
          <StoryCard key={s.id} story={s} sectorName={sectorName(s.sector_id)} onOpen={() => onOpenStory(s.id)} />
        ))}
      </ul>
      <p className="panel-footnote">{t("city.footer")}</p>
    </div>
  );
}

export function SectorPanel({ sector, stories, onOpenStory }: { sector: Sector; stories: StorySummary[]; onOpenStory: (id: string) => void }) {
  const mine = orderStories(stories.filter((s) => s.sector_id === sector.sector_id));
  return (
    <div className="panel-body">
      <header>
        <p className="story-id">
          <SectorIcon id={sector.sector_id} size={18} /> {sector.question_count ? t("sectors.questions", { count: formatCount(sector.question_count) }) : statusWord(sector.status)}
        </p>
        <h1 className="panel-title">{sector.name}</h1>
      </header>
      <h2 className="section-title">{t("story.browse")}</h2>
      {mine.length === 0 ? (
        <p className="panel-footnote">{t("story.noData")}</p>
      ) : (
        <ul className="story-cards" role="list">
          {mine.map((s) => (
            <StoryCard key={s.id} story={s} onOpen={() => onOpenStory(s.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function destination(headsign: string | null, route: string | null): string {
  if (!headsign) return NO_VALUE;
  const i = headsign.lastIndexOf(" to ");
  if (i >= 0) return headsign.slice(i + 4);
  if (route && headsign.startsWith(route + " ")) return headsign.slice(route.length + 1);
  return headsign;
}

export function busTitle(p: VehicleProperties): string {
  if (!p.route_short_name) return t("bus.titleNoTrip", { label: p.label ?? String(p.id) });
  return t("bus.title", { route: p.route_short_name, headsign: destination(p.headsign, p.route_short_name) });
}

function eventFacts(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  const s = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
  for (const k of ["closure_type_code", "closure_reason_code", "permit_type_code", "event_status_code", "stop_code"]) {
    const v = s(k);
    if (v) out.push(k === "stop_code" ? t("search.stop", { number: v }) : v);
  }
  if (p.event_start_ts || p.event_end_ts) {
    out.push(`${formatDate(p.event_start_ts as string)}${p.event_end_ts ? ` to ${formatDate(p.event_end_ts as string)}` : ""}`);
  }
  if (typeof p.units_created_count === "number") out.push(`${formatCount(p.units_created_count)} units`);
  if (typeof p.construction_value_amount === "number") out.push(formatMoney(p.construction_value_amount));
  return out.slice(0, 4);
}

const KIND_KEY: Record<string, "closure.kind" | "permit.kind" | "stop.kind" | "route.kind" | "bus.kind"> = {
  "road-closures": "closure.kind",
  "road-closures-upcoming": "closure.kind",
  "new-units": "permit.kind",
  "building-permits": "permit.kind",
  stops: "stop.kind",
  routes: "route.kind",
  vehicles: "bus.kind",
};

export function kindLabel(layer: string, title?: string): string {
  return KIND_KEY[layer] ? t(KIND_KEY[layer]) : (title ?? layer);
}

/** The card for one selected thing: a popup on the laptop map, a card in the phone sheet. */
export function FeatureCard({
  layer, layerTitle, props, now, following, onDetail, onFollow, onClose, phone,
}: {
  layer: string;
  layerTitle: string;
  props: Record<string, unknown>;
  now: number;
  following: boolean;
  onDetail: () => void;
  onFollow?: () => void;
  onClose: () => void;
  phone: boolean;
}) {
  const isBus = layer === "vehicles";
  const v = props as VehicleProperties;
  const status: BusStatus | null = isBus ? busStatus(v.status, v.delay_seconds) : null;
  const title = isBus ? busTitle(v) : featureName(props);
  const ref = useRef<HTMLElement>(null);
  const selKey = `${String(props.kind)}:${String(props.id)}`;
  useEffect(() => {
    if (phone) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [phone, selKey]);
  return (
    <section ref={ref} className={`feature-card${phone ? " feature-card--phone" : ""}`} aria-label={title}>
      {!phone && (
        <button type="button" className="feature-card-close" onClick={onClose} aria-label={t("bus.close")}>
          <Icon name="close" size={18} />
        </button>
      )}
      <p className="feature-card-kind">
        {!isBus && <LayerMark look={lookFor(layer)} />} {kindLabel(layer, layerTitle)}
        {isBus && v.label && <span className="mono"> {v.label}</span>}
      </p>
      <h2 className="feature-card-title">{title}</h2>
      {isBus && status && (
        <p className={`feature-card-status status-text--${status}`}>
          <StatusMark status={status} />
          <span>{v.delay_seconds !== null && v.delay_seconds !== undefined && status !== "unknown" ? `${t(`status.${status}`)} · ${formatDelay(v.delay_seconds)}` : t(`status.${status}`)}</span>
        </p>
      )}
      {isBus ? (
        <dl className="feature-card-facts">
          {v.next_stop_name && (<div><dt className="visually-hidden">{t("bus.nextStop", { stop: "" })}</dt><dd>{t("bus.nextStop", { stop: v.next_stop_name })}</dd></div>)}
          <div><dt className="visually-hidden">{t("list.col.updated")}</dt><dd>{t("bus.updated", { age: ago(v.position_ts, now) })}</dd></div>
        </dl>
      ) : (
        <ul className="feature-card-facts" role="list">
          {eventFacts(props).map((f) => (<li key={f}>{f}</li>))}
        </ul>
      )}
      <div className="feature-card-actions">
        <button type="button" className="btn btn-primary" onClick={onDetail}>{t("bus.openDetail")}</button>
        {isBus && onFollow && (
          <button type="button" className={`btn btn-secondary${following ? " is-on" : ""}`} aria-pressed={following} onClick={onFollow}>
            <Icon name="follow" size={18} /> {following ? t("bus.following") : t("bus.follow")}
          </button>
        )}
        {phone && (
          <button type="button" className="btn btn-quiet" onClick={onClose} aria-label={t("bus.close")}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </section>
  );
}

const HIDDEN_KEYS = new Set(["kind", "sector_id", "subsector_id", "id", "source_id", "geometry"]);

function humanKey(k: string): string {
  const s = k.replace(/_(ts|code|count|amount|name|id)$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanValue(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return NO_VALUE;
  if (k.endsWith("_ts")) return formatDateTime(v as string);
  if (k.endsWith("_date") || k === "event_date") return formatDate(v as string);
  if (k === "delay_seconds") return formatDelay(v as number);
  if (k.endsWith("_amount")) return formatMoney(v as number);
  if (k === "speed_metres_per_second") return `${formatCount((v as number) * 3.6)} km/h`;
  if (k === "bearing") return `${formatCount(v as number)}°`;
  if (typeof v === "number") return formatCount(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export function FeatureDetailPanel({ kind, id, layerTitle, layer, now, onBack }: { kind: Kind; id: number; layer: string; layerTitle: string; now: number; onBack: () => void }) {
  const fetcher = useCallback((s: AbortSignal) => api.feature(kind, id, s), [kind, id]);
  const p = usePoll(`${kind}:${id}`, fetcher, 30_000);
  const f = p.env?.data;
  const props = (f?.properties ?? {}) as Record<string, unknown>;
  const title = layer === "vehicles" && f ? busTitle(props as VehicleProperties) : f ? featureName(props) : t("detail.title");
  return (
    <div className="panel-body">
      <button type="button" className="btn btn-quiet btn-back" onClick={onBack}>
        <Icon name="back" size={18} /> {t("detail.back")}
      </button>
      <p className="story-id">{kindLabel(layer, layerTitle)}</p>
      <h1 className="panel-title">{title}</h1>
      {layer === "vehicles" && <img className="detail-photo" src={`${import.meta.env.BASE_URL}img/bus-front.png`} alt="" width={480} height={254} />}
      {p.loading && !f && <p aria-busy="true">{t("detail.loading")}</p>}
      {p.error && !f && <p className="error-text" role="alert">{t("detail.failed")}</p>}
      {f && (
        <>
          <h2 className="section-title">{t("detail.properties")}</h2>
          <dl className="detail-list">
            {Object.entries(props)
              .filter(([k]) => !HIDDEN_KEYS.has(k))
              .map(([k, v]) => (
                <div key={k} className="detail-row">
                  <dt>{humanKey(k)}</dt>
                  <dd className={typeof v === "number" ? "mono" : undefined}>{humanValue(k, v)}</dd>
                </div>
              ))}
          </dl>
          <h2 className="section-title">{t("detail.history")}</h2>
          {f.history.length === 0 ? (
            <p className="panel-footnote">{t("detail.noHistory")}</p>
          ) : (
            <ol className="history" role="list">
              {f.history.map((h, i) => (
                <li key={`${h.t}-${i}`} className="history-row">
                  <span className="history-time mono">{formatDateTime(h.t)}</span>
                  <span className="history-label">{h.label}</span>
                  <span className="history-meta">
                    {h.type}
                    {h.properties && typeof h.properties.delay_seconds === "number" && `, ${formatDelay(h.properties.delay_seconds)}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="panel-footnote">
            {p.env?.source.map((s) => s.name).join("; ")}. {t("trust.updated", { age: ago(p.env?.as_of ?? null, now) })}
          </p>
        </>
      )}
    </div>
  );
}
