// Status rules the interface applies: bus punctuality (shape and colour) and data freshness.
// The API decides a bus's status; these rules are the fallback when it sends only a delay, and they read the
// interim business rule (on time = 60 s early to 300 s late, "not yet decided") from client-config.

import type { BusStatus, SourceStatus } from "../api/types";

export interface OnTimeRule {
  earlySeconds: number;
  lateSeconds: number;
}

export const DEFAULT_ON_TIME_RULE: OnTimeRule = { earlySeconds: 60, lateSeconds: 300 };

/** Reads the on-time window from client-config's business_rules, tolerating a few spellings. */
export function onTimeRuleFrom(rules: Record<string, unknown> | undefined | null): OnTimeRule {
  if (!rules) return DEFAULT_ON_TIME_RULE;
  const block = (rules.on_time ?? rules.on_time_window ?? rules) as Record<string, unknown>;
  const early = Number(block.early_seconds ?? block.on_time_early_seconds ?? block.early_limit_seconds);
  const late = Number(block.late_seconds ?? block.on_time_late_seconds ?? block.late_limit_seconds);
  return {
    earlySeconds: Number.isFinite(early) ? Math.abs(early) : DEFAULT_ON_TIME_RULE.earlySeconds,
    lateSeconds: Number.isFinite(late) ? Math.abs(late) : DEFAULT_ON_TIME_RULE.lateSeconds,
  };
}

/** Positive delay is late. Inside the window (inclusive) is on time. */
export function statusFromDelay(delaySeconds: number | null | undefined, rule: OnTimeRule = DEFAULT_ON_TIME_RULE): BusStatus {
  if (typeof delaySeconds !== "number" || !Number.isFinite(delaySeconds)) return "unknown";
  if (delaySeconds > rule.lateSeconds) return "late";
  if (delaySeconds < -rule.earlySeconds) return "early";
  return "on_time";
}

/** The status to draw: the API's when it sent a known one, otherwise our rule on the delay. */
export function busStatus(apiStatus: string | null | undefined, delaySeconds: number | null | undefined, rule?: OnTimeRule): BusStatus {
  if (apiStatus === "on_time" || apiStatus === "late" || apiStatus === "early") return apiStatus;
  return statusFromDelay(delaySeconds, rule);
}

/** The shape that carries each status, so colour never carries meaning alone. */
export const STATUS_SHAPE: Record<BusStatus, "disc" | "diamond" | "ring" | "square"> = {
  on_time: "disc",
  late: "diamond",
  early: "ring",
  unknown: "square",
};

export const STATUS_ORDER: BusStatus[] = ["on_time", "late", "early", "unknown"];

export type Freshness = "fresh" | "stale" | "down" | "empty";

/**
 * How trustworthy a layer is right now.
 * - down: the last request failed, or a source the layer reads is down;
 * - stale: the data is older than the threshold (2 minutes for live feeds), or a source is stale;
 * - empty: no data yet (as_of null);
 * - fresh otherwise.
 */
export function layerFreshness(opts: {
  asOf: string | null | undefined;
  now: number;
  staleAfterSeconds: number | null;
  failed?: boolean;
  sources?: Pick<SourceStatus, "status">[];
}): Freshness {
  if (opts.failed) return "down";
  if (opts.sources?.some((s) => s.status === "down")) return "down";
  if (!opts.asOf) return "empty";
  if (opts.sources?.some((s) => s.status === "stale")) return "stale";
  if (opts.staleAfterSeconds !== null) {
    const t = new Date(opts.asOf).getTime();
    if (Number.isFinite(t) && (opts.now - t) / 1000 > opts.staleAfterSeconds) return "stale";
  }
  return "fresh";
}

/** Counts of buses by status, for the three tiles and the list. */
export function countByStatus(statuses: BusStatus[]): Record<BusStatus, number> {
  const out: Record<BusStatus, number> = { on_time: 0, late: 0, early: 0, unknown: 0 };
  for (const s of statuses) out[s] += 1;
  return out;
}
