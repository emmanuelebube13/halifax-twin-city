import type React from "react";
import { useNow } from "../api/hooks";
import { ageLine, ago } from "../lib/ago";
// The story panel: question, answer (the hero), evidence counts, context chart, trust. Driven entirely by the
// story configuration from /v1/stories/{id}; no story-specific code lives here.

import type { BusStatus, Lens, NumberData, SourceRef, SourceStatus, Story, StorySummary } from "../api/types";
import { hasKey, t } from "../i18n";
import { formatByUnit, formatClock, formatCount, formatDate, formatMonth, NO_VALUE } from "../lib/format";
import { answerIsEmpty, chooseTemplate, renderAnswerParts, storyStatusLabel } from "../lib/story";
import type { Freshness } from "../lib/status";
import { Icon, StatusMark } from "./icons";

export const statusWord = (s: string) => storyStatusLabel(s, (k) => (hasKey(k) ? t(k) : null));

export interface LayerView {
  name: string;
  path: "live" | "layers";
  title: string;
  property: string | null;
  legend: { value: string; label: string; shape?: string }[];
  features: { properties: Record<string, unknown> }[];
  asOf: string | null;
  freshness: Freshness;
  lastOk: number | null;
  loading: boolean;
  sourceIds: string[];
  /** The envelope's sources, with checked and last-changed times. */
  sources: SourceRef[];
  tier: string | null;
}

export function StoryHeading({ story, sectorName }: { story: StorySummary; sectorName: string }) {
  return (
    <header className="story-head">
      <p className="story-id">
        <span className="mono">{story.id}</span>
        <span aria-hidden="true"> · </span>
        {sectorName}
        {story.status !== "live" && <span className={`status-chip status-chip--${story.status}`}>{statusWord(story.status)}</span>}
      </p>
      <h1 className="story-question">{story.question}</h1>
    </header>
  );
}

/** The hero: one sentence, numbers in amber mono on the night-harbour plate. */
/** The plate's footer: how old the answer is; when stale, said plainly in amber so "now" is never claimed falsely. */
export function AnswerFoot({ asOf, freshness, now, sources }: { asOf: string | null; freshness?: Freshness; now?: number; sources?: SourceRef[] }) {
  const tick = useNow(1000);
  const effectiveNow = now ?? tick;
  if (!asOf) return null;
  if (freshness === "stale" || freshness === "down") {
    return (
      <p className="answer-foot is-stale" role="status">
        <Icon name="warning" size={16} /> {t("answer.stale", { time: formatClock(asOf), age: ago(asOf, effectiveNow) })}
      </p>
    );
  }
  return <p className="answer-foot">{ageLine(sources, asOf, effectiveNow)}</p>;
}

export function AnswerPlate({ story, numbers, loading, foot }: { story: Story | null; numbers: Record<string, NumberData | null>; loading: boolean; foot?: React.ReactNode }) {
  if (!story) {
    return (
      <div className="answer-plate is-loading" aria-busy="true">
        <p className="answer-text">{t("story.loading")}</p>
      </div>
    );
  }
  if (story.status !== "live") {
    return (
      <div className="answer-plate is-muted" role="note">
        <p className="answer-kicker">{statusWord(story.status)}</p>
        <p className="answer-text">{story.status_note || t("story.notLiveBody")}</p>
      </div>
    );
  }
  const empty = !loading && answerIsEmpty(story.answer.numbers.filter((id) => story.answer.template.includes(`{${id}}`)), numbers);
  if (empty) {
    return (
      <div className="answer-plate is-muted" role="note">
        <p className="answer-text">{story.answer.empty_text || t("story.noData")}</p>
      </div>
    );
  }
  const parts = renderAnswerParts(chooseTemplate(story.answer, numbers), numbers);
  return (
    <div className="answer-plate" aria-live="polite" aria-busy={loading}>
      <p className="answer-text">
        {parts.map((p, i) =>
          p.kind === "text" ? (
            <span key={i}>{p.text}</span>
          ) : (
            <strong key={`${i}-${p.text}`} className={`answer-num${p.missing ? " is-missing" : ""}`} title={numbers[p.id]?.label}>
              {p.text}
            </strong>
          ),
        )}
      </p>
      {foot}
    </div>
  );
}

/** One tile per legend entry with the count of features on the map that carry it. */
export function LegendTiles({ layer, onPick }: { layer: LayerView; onPick?: (value: string) => void }) {
  if (!layer.property || layer.legend.length === 0) return null;
  const counts = new Map<string, number>();
  for (const f of layer.features) {
    const v = String(f.properties[layer.property] ?? "");
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const main = layer.legend.filter((l) => l.value !== "unknown");
  const other = layer.legend.find((l) => l.value === "unknown");
  const otherCount = other ? (counts.get(other.value) ?? 0) : 0;
  const isStatus = layer.property === "status";
  return (
    <section className="tiles-wrap" aria-label={layer.title}>
      <ul className="tiles" role="list">
        {main.map((l) => (
          <li key={l.value} className="tile">
            <button type="button" className="tile-btn" onClick={() => onPick?.(l.value)} disabled={!onPick}>
              <span className="tile-label">
                {isStatus && <StatusMark status={l.value as BusStatus} />}
                {l.label}
              </span>
              <span className="tile-value mono">{layer.loading && !layer.features.length ? NO_VALUE : formatCount(counts.get(l.value) ?? 0)}</span>
            </button>
          </li>
        ))}
      </ul>
      {other && otherCount > 0 && (
        <p className="tiles-note">
          {isStatus && <StatusMark status="unknown" size={14} />} {formatCount(otherCount)} {other.label.toLowerCase()}
        </p>
      )}
    </section>
  );
}

/**
 * Labels for a series' buckets: years stay years; timestamps within one day show the clock (19:00); longer
 * spans show the date (21 Nov); anything else (a route, a band) is shown as given.
 */
export function seriesLabeller(ts: string[]): (t: string) => string {
  const times = ts.map((x) => (/^\d{4}-\d{2}-\d{2}/.test(x) ? Date.parse(x) : NaN));
  const allTimes = times.length > 0 && times.every((x) => Number.isFinite(x));
  const span = allTimes ? Math.max(...times) - Math.min(...times) : 0;
  return (x: string) => {
    if (/^\d{4}$/.test(x)) return x;
    if (/^\d{4}-\d{2}$/.test(x)) return formatMonth(x);
    if (allTimes) return span > 86_400_000 ? formatDate(x).replace(/ \d{4}$/, "") : formatClock(x);
    return x;
  };
}

/** Approximate width of a 12 px Plex Mono label, in chart units. */
const CHAR_W = 7.4;

/**
 * Which buckets get an axis label so labels never run together: every k-th bucket, counted back from the
 * newest so the latest period is always labelled.
 */
export function labelStep(labels: string[], width: number, gap = 10): number {
  const n = labels.length;
  if (n === 0) return 1;
  const longest = Math.max(...labels.map((l) => l.length)) * CHAR_W + gap;
  const slot = width / n;
  return Math.max(1, Math.ceil(longest / slot));
}

/** The buckets that cover only part of their period: flagged by the API, or the current "to date" bucket. */
export function partialBuckets(number: NumberData | null): Set<number> {
  const out = new Set<number>();
  const series = number?.series ?? [];
  series.forEach((p, i) => {
    if (p.partial) out.add(i);
  });
  if (series.length && /to date|current (year|month|week|day|hour)/i.test(number?.window ?? "")) out.add(series.length - 1);
  return out;
}

/** Context chart: bars of a number's series, with a text summary and a table for screen readers. */
export function ContextChart({ title, number, compact = false }: { title: string; number: NumberData | null; compact?: boolean }) {
  const series = number?.series ?? [];
  const hasData = series.some((p) => p.value !== null);
  const isPct = (number?.unit ?? "").toLowerCase() === "percent";
  const max = isPct ? 100 : Math.max(1, ...series.map((p) => p.value ?? 0));
  const label = seriesLabeller(series.map((p) => p.t));
  const W = 360;
  const H = compact ? 120 : 170;
  const padB = 22;
  const padT = 18;
  const n = Math.max(series.length, 1);
  const gap = n > 12 ? 2 : 6;
  const bw = (W - gap * (n - 1)) / n;
  const valid = series.filter((p) => p.value !== null);
  const last = valid[valid.length - 1];
  const summary = hasData && number
    ? t("chart.summary", { label: title, first: label(series[0].t), last: label(series[series.length - 1].t), value: formatByUnit(last?.value ?? null, number.unit) })
    : t("chart.noData");
  const labels = series.map((p) => label(p.t));
  const step = labelStep(labels, W);
  const partial = partialBuckets(number);
  const tickAt = (i: number, x: number) => {
    // keep the first and last labels inside the chart instead of clipping them at the edges
    const half = (labels[i].length * CHAR_W) / 2;
    const cx = x + bw / 2;
    if (cx - half < 0) return { x: 0, anchor: "start" as const };
    if (cx + half > W) return { x: W, anchor: "end" as const };
    return { x: cx, anchor: "middle" as const };
  };
  return (
    <section className="chart" aria-label={title}>
      <h2 className="section-title">{title}</h2>
      {!hasData ? (
        <p className="chart-empty">{t("chart.noData")}</p>
      ) : (
        <figure className="chart-figure">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet" className="chart-svg">
            <defs>
              <pattern id="chart-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--harbour-tint)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--harbour)" strokeWidth="2.5" />
              </pattern>
            </defs>
            {isPct && [25, 50, 75].map((g) => {
              const y = padT + (H - padT - padB) * (1 - g / 100);
              return <line key={g} x1="0" x2={W} y1={y} y2={y} className="chart-grid" />;
            })}
            {series.map((p, i) => {
              const x = i * (bw + gap);
              const h = p.value === null ? 0 : ((H - padT - padB) * p.value) / max;
              const y = H - padB - h;
              const isLast = p === last;
              return (
                <g key={p.t}>
                  {p.value === null ? (
                    <rect x={x} y={H - padB - 6} width={bw} height={6} className="chart-bar-none" />
                  ) : (
                    <rect x={x} y={y} width={bw} height={Math.max(h, 1)} rx={Math.min(3, bw / 4)} className={`chart-bar${isLast ? " is-last" : ""}${partial.has(i) ? " is-partial" : ""}`} />
                  )}
                  {(n <= 8 || isLast) && p.value !== null && (
                    <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="chart-val">
                      {formatByUnit(p.value, number?.unit)}
                    </text>
                  )}
                  {(n - 1 - i) % step === 0 && (
                    <text x={tickAt(i, x).x} y={H - 6} textAnchor={tickAt(i, x).anchor} className="chart-tick">
                      {labels[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {(number?.window || partial.size > 0) && (
            <figcaption className="chart-caption">
              {number?.window}
              {partial.size > 0 && <span className="chart-partial-note"> {t("chart.partial")}</span>}
            </figcaption>
          )}
          <table className="visually-hidden">
            <caption>{title}</caption>
            <tbody>
              {series.map((p) => (
                <tr key={p.t}>
                  <th scope="row">{label(p.t)}</th>
                  <td>{formatByUnit(p.value, number?.unit)}{partial.has(series.indexOf(p)) ? ` (${t("chart.partialShort")})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </section>
  );
}

/** Number cards for the Analytics lens: every number the story uses, with its window and rule. */
export function NumberCards({ numbers, ids }: { numbers: Record<string, NumberData | null>; ids: string[] }) {
  const list = ids.map((id) => numbers[id]).filter((n): n is NumberData => !!n && !n.series);
  if (!list.length) return null;
  return (
    <ul className="numcards" role="list">
      {list.map((n) => (
        <li key={n.id} className="numcard">
          <span className="numcard-label">{n.label}</span>
          <span className="numcard-value mono">{formatByUnit(n.value, n.unit)}</span>
          {n.window && <span className="numcard-window">{n.window}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Trust footer: source, data age, reliability tier, licence, and the way to every source. */
export function Trust({
  sourceIds, sources, asOf, tier, freshness, now, onAbout, ageSources,
}: {
  ageSources?: SourceRef[];
  sourceIds: string[];
  sources: SourceStatus[];
  asOf: string | null;
  tier: string | null;
  freshness: Freshness;
  now?: number;
  onAbout: () => void;
}) {
  const tick = useNow(1000);
  const effectiveNow = now ?? tick;
  const names = sourceIds.map((id) => sources.find((s) => s.source_id === id)?.dataset_name ?? id);
  const down = sourceIds.map((id) => sources.find((s) => s.source_id === id)).filter((s) => s && s.status === "down");
  return (
    <footer className="trust">
      {(freshness === "stale" || freshness === "down") && (
        <p className={`trust-alert trust-alert--${freshness}`} role="status">
          <Icon name="warning" size={18} />
          <span>
            {freshness === "stale" ? t("layer.stale", { time: formatClock(asOf) }) : t("layer.down")}
            {down.length > 0 && `: ${down.map((s) => s!.dataset_name).join(", ")}`}
          </span>
        </p>
      )}
      <p>
        {names.length > 0 && <>{t("trust.source", { sources: names.join("; ") })} </>}
        {asOf && <>{ageLine(ageSources, asOf, effectiveNow)}. </>}
        {tier && <>{t("trust.tier", { tier: tier.replace(/^Tier\s*/i, "") })} </>}
        <button type="button" className="linklike" onClick={onAbout}>
          {t("trust.about")}
        </button>
      </p>
      <p className="trust-licence">{t("trust.licence")}</p>
    </footer>
  );
}

export function LensNote({ lens, story }: { lens: Lens; story: StorySummary | null }) {
  if (!story || story.lenses.includes(lens)) return null;
  return <p className="lens-note">{t("lens.notForStory")}</p>;
}
