// Mock mode: answers API paths from the contract's example responses (src/mocks/fixtures, copied by
// "npm run fixtures"). Times in the examples are moved forward so the newest one is "now"; otherwise every
// layer would show as stale. A path with no example answers like the API does: a not_found error envelope.

import type { Envelope } from "../api/types";

const files = import.meta.glob("./fixtures/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
const byName = new Map<string, unknown>();
for (const [path, body] of Object.entries(files)) byName.set(path.replace("./fixtures/", "").replace(".json", ""), body);

const LICENCE = "Contains information licensed under the Open Government Licence – Halifax";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** The newest envelope as_of: the moment the examples describe as "now" (end dates may lie in the future). */
function newestTime(): number {
  let max = 0;
  for (const b of byName.values()) {
    const asOf = (b as { as_of?: unknown }).as_of;
    if (typeof asOf === "string" && ISO.test(asOf)) max = Math.max(max, Date.parse(asOf));
  }
  return max || Date.now();
}

const shiftMs = Date.now() - newestTime() - 5_000;

function shift(v: unknown, key?: string): unknown {
  if (typeof v === "string" && ISO.test(v)) return new Date(Date.parse(v) + shiftMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  if (Array.isArray(v)) {
    // replay positions: [epoch ms, lon, lat]
    if (key === "positions") return v.map((p) => (Array.isArray(p) ? [p[0] + shiftMs, p[1], p[2]] : p));
    return v.map((x) => shift(x));
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = shift(x, k);
    return out;
  }
  return v;
}

/** Maps an API path to the example file name, as the contract examples are named. */
export function fixtureName(path: string): string | null {
  const p = path.split("?")[0];
  const m = (re: RegExp) => re.exec(p);
  let r: RegExpExecArray | null;
  if (p === "/v1/stories") return "stories";
  if ((r = m(/^\/v1\/stories\/([^/]+)$/))) return `story-${decodeURIComponent(r[1])}`;
  if ((r = m(/^\/v1\/live\/([^/]+)$/))) return `live-${r[1]}`;
  if ((r = m(/^\/v1\/layers\/([^/]+)$/))) return `layers-${r[1]}`;
  if ((r = m(/^\/v1\/numbers\/([^/]+)$/))) return `number-${decodeURIComponent(r[1])}`;
  if ((r = m(/^\/v1\/features\/([^/]+)\/([^/]+)$/))) return `feature-${r[1]}-${r[2]}`;
  if ((r = m(/^\/v1\/replay\/([^/]+)$/))) return `replay-${r[1]}`;
  if (p === "/v1/sources") return "sources";
  if (p === "/v1/sectors") return "sectors";
  if (p === "/v1/client-config") return "client-config";
  if (p === "/v1/health") return "health";
  return null;
}

export async function mockFetch<T>(path: string): Promise<Envelope<T>> {
  await new Promise((r) => setTimeout(r, 60));
  const name = fixtureName(path);
  const body = name ? (byName.get(name) ?? byName.get(`${name}-empty`)) : undefined;
  if (!body) {
    const { ApiError } = await import("../api/client");
    const env = { data: null, as_of: null, source: [], reliability_tier: null, licence: LICENCE, error: { code: "not_found" as const, message: "No example response for this request." } };
    throw new ApiError(404, "not_found", env.error.message, env);
  }
  return shift(structuredClone(body)) as Envelope<T>;
}
