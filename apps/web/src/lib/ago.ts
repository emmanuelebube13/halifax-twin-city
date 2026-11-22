import { t } from "../i18n";
import { formatAge, NO_VALUE } from "./format";

/** "12 s ago" for recent data, "on 19 Nov 2026" past a day. */
export function ago(v: string | number | Date | null | undefined, now: number = Date.now()): string {
  const s = formatAge(v, now);
  if (s === NO_VALUE || v === null || v === undefined) return NO_VALUE;
  const ms = now - new Date(v).getTime();
  return ms >= 86_400_000 ? t("age.on", { date: s }) : t("age.ago", { age: s });
}
