import { en, type MessageKey, type Messages } from "./en";

/** Locale data that is not a sentence: month names for dates, unit words for durations. */
export interface LocaleData {
  code: string;
  numberLocale: string;
  months: readonly string[];
  units: { s: string; min: string; h: string; d: string; m: string; km: string };
  delay: { late: string; early: string; onTime: string };
}

const enLocale: LocaleData = {
  code: "en",
  numberLocale: "en-CA",
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  units: { s: "s", min: "min", h: "h", d: "d", m: "m", km: "km" },
  delay: { late: "{duration} late", early: "{duration} early", onTime: "on time" },
};

let messages: Messages = en;
let locale: LocaleData = enLocale;

export function setLanguage(next: Messages, data: LocaleData): void {
  messages = next;
  locale = data;
}

export function getLocale(): LocaleData {
  return locale;
}

/** Look up a sentence and fill its {placeholders}. Unknown placeholders are left visible so they get noticed. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = messages[key] ?? key;
  return fill(text, params);
}

export function fill(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function hasKey(key: string): key is MessageKey {
  return key in messages;
}

export type { MessageKey };
