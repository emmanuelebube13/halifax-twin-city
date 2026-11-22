import type { SourceRef } from "../api/types";
import { t } from "../i18n";
import { formatAge, formatDate, NO_VALUE } from "./format";

/** "12 s ago" for recent data, "on 19 Nov 2026" past a day. */
export function ago(v: string | number | Date | null | undefined, now: number = Date.now()): string {
  const s = formatAge(v, now);
  if (s === NO_VALUE || v === null || v === undefined) return NO_VALUE;
  const ms = now - new Date(v).getTime();
  return ms >= 86_400_000 ? t("age.on", { date: s }) : t("age.ago", { age: s });
}

/**
 * The data-age phrase for a layer or story. Checked sources (daily or periodic: they carry last_changed_ts) say
 * when they were last checked and since when nothing changed: "Checked 12 min ago, unchanged since 21 Nov 2026".
 * Live feeds (no last_changed_ts) keep "Updated 12 s ago" from as_of.
 */
export function ageLine(sources: SourceRef[] | null | undefined, asOf: string | null | undefined, now: number = Date.now()): string | null {
  const checked = (sources ?? []).filter((s) => s.last_changed_ts);
  if (checked.length) {
    const checkedTs = checked.map((s) => s.checked_ts).filter((x): x is string => !!x).sort().pop() ?? null;
    const changedTs = checked.map((s) => s.last_changed_ts).filter((x): x is string => !!x).sort().pop() ?? null;
    if (checkedTs && changedTs) return t("age.checked", { age: ago(checkedTs, now), date: formatDate(changedTs) });
  }
  return asOf ? t("age.updated", { age: ago(asOf, now) }) : null;
}
