// The one shared formatter. Every number the interface shows passes through here, never by hand.
// Rules (Map Application Plan V1, "Numbers"): counts exact with separators; percentages whole, one decimal
// below 10%; durations in the largest sensible unit with a space; early and late in words; metric distances;
// Canadian dollars without cents above $100; 24-hour Halifax clock; dates as 21 Nov 2026; no value is a dash.

import { fill, getLocale } from "../i18n";

export const NO_VALUE = "–";
export const TIME_ZONE = "America/Halifax";

type Num = number | null | undefined;

function isNum(v: Num): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat(getLocale().numberLocale, options);
}

/** 1,240 */
export function formatCount(v: Num): string {
  if (!isNum(v)) return NO_VALUE;
  return nf({ maximumFractionDigits: 0 }).format(Math.round(v));
}

/**
 * 81%, 4.5%. `v` is in percent (0 to 100) unless `fraction` is true (0 to 1).
 */
export function formatPercent(v: Num, fraction = false): string {
  if (!isNum(v)) return NO_VALUE;
  const pct = fraction ? v * 100 : v;
  const digits = Math.abs(pct) < 10 && Math.round(pct * 10) / 10 !== Math.round(pct) ? 1 : 0;
  const rounded = digits ? Math.round(pct * 10) / 10 : Math.round(pct);
  return `${nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rounded)}%`;
}

/** 12 s, 4 min, 1 h 20 min, 2 d. Always positive; use formatDelay for early and late. */
export function formatDuration(seconds: Num): string {
  if (!isNum(seconds)) return NO_VALUE;
  const u = getLocale().units;
  const s = Math.abs(Math.round(seconds));
  if (s < 60) return `${s} ${u.s}`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} ${u.min}`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h < 24) return rest ? `${h} ${u.h} ${rest} ${u.min}` : `${h} ${u.h}`;
  return `${Math.round(h / 24)} ${u.d}`;
}

/** Positive seconds are late. "4 min late", "2 min early", "on time" when exactly zero. */
export function formatDelay(seconds: Num): string {
  if (!isNum(seconds)) return NO_VALUE;
  const d = getLocale().delay;
  if (Math.round(seconds) === 0) return d.onTime;
  return fill(seconds > 0 ? d.late : d.early, { duration: formatDuration(seconds) });
}

/** 300 m, 1.2 km */
export function formatDistance(metres: Num): string {
  if (!isNum(metres)) return NO_VALUE;
  const u = getLocale().units;
  if (Math.abs(metres) < 1000) return `${formatCount(metres < 100 ? metres : Math.round(metres / 10) * 10)} ${u.m}`;
  return `${nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(metres / 1000)} ${u.km}`;
}

/** $412,000; $12.50 below $100. */
export function formatMoney(dollars: Num): string {
  if (!isNum(dollars)) return NO_VALUE;
  const cents = Math.abs(dollars) < 100;
  return nf({
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(dollars);
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function halifaxParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** 19:42, Halifax time, 24-hour clock. */
export function formatClock(v: string | number | Date | null | undefined, withSeconds = false): string {
  const d = toDate(v);
  if (!d) return NO_VALUE;
  const p = halifaxParts(d);
  const hour = p.hour === "24" ? "00" : p.hour;
  return withSeconds ? `${hour}:${p.minute}:${p.second}` : `${hour}:${p.minute}`;
}

/** 21 Nov 2026, Halifax date. */
export function formatDate(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return NO_VALUE;
  const p = halifaxParts(d);
  return `${Number(p.day)} ${getLocale().months[Number(p.month) - 1]} ${p.year}`;
}

/** 21 Nov 2026 19:42 */
export function formatDateTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return NO_VALUE;
  return `${formatDate(d)} ${formatClock(d)}`;
}

/**
 * Age of data: "12 s", "4 min", "2 h"; past a day, the date. The caller adds "ago" through the language file.
 */
export function formatAge(v: string | number | Date | null | undefined, now: number = Date.now()): string {
  const d = toDate(v);
  if (!d) return NO_VALUE;
  const s = Math.max(0, (now - d.getTime()) / 1000);
  if (s >= 86400) return formatDate(d);
  return formatDuration(s);
}

/** A number from /v1/numbers, formatted by its unit. Unknown units get the count rule plus the unit word. */
export function formatByUnit(value: Num, unit: string | null | undefined): string {
  if (!isNum(value)) return NO_VALUE;
  switch ((unit || "").toLowerCase()) {
    case "percent":
    case "%":
      return formatPercent(value);
    case "share":
    case "fraction":
      return formatPercent(value, true);
    case "seconds":
    case "s":
      return formatDuration(value);
    case "delay_seconds":
      return formatDelay(value);
    case "metres":
    case "meters":
    case "m":
      return formatDistance(value);
    case "cad":
    case "dollars":
      return formatMoney(value);
    case "":
    case "count":
      return formatCount(value);
    default:
      return formatCount(value);
  }
}

/** Whether a unit word should be written after the value in running text (counts carry their unit as a noun). */
export function unitWord(unit: string | null | undefined): string {
  const u = (unit || "").toLowerCase();
  if (["percent", "%", "share", "fraction", "seconds", "s", "delay_seconds", "metres", "meters", "m", "cad", "dollars", "", "count"].includes(u)) {
    return "";
  }
  return unit as string;
}
