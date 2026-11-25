// The only way the app reads data: the serving API (contract v0), or, in mock mode, the contract's example
// responses bundled from engineering/contract/examples. Every call returns the full envelope.

import type {
  ClientConfig, Envelope, FeatureCollection, FeatureDetail, NumberData, Replay, SectorRegister, SourceStatus, Story,
  StorySummary, VehicleProperties,
} from "./types";
import { mockFetch } from "../mocks/mockApi";

export const API_BASE: string =
  import.meta.env.VITE_API_PROXY === "1" ? "" : (import.meta.env.VITE_API_BASE as string | undefined) || "http://127.0.0.1:8010";
export const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS === "1" || import.meta.env.MODE === "mock";

export class ApiError extends Error {
  status: number;
  code: string;
  envelope: Envelope<null> | null;
  constructor(status: number, code: string, message: string, envelope: Envelope<null> | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.envelope = envelope;
  }
}

const MAX_ETAG_CACHE = 128;

interface EtagEntry {
  etag: string;
  env: Envelope<unknown>;
}

const etagCache = new Map<string, EtagEntry>();
const inflight = new Map<string, Promise<Envelope<unknown>>>();

function getCached(path: string): EtagEntry | undefined {
  const hit = etagCache.get(path);
  if (!hit) return undefined;
  etagCache.delete(path);
  etagCache.set(path, hit);
  return hit;
}

function setCached(path: string, entry: EtagEntry): void {
  if (etagCache.has(path)) {
    etagCache.delete(path);
  } else if (etagCache.size >= MAX_ETAG_CACHE) {
    const oldest = etagCache.keys().next().value;
    if (oldest !== undefined) etagCache.delete(oldest);
  }
  etagCache.set(path, entry);
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

async function fetchEnvelope<T>(path: string): Promise<Envelope<T>> {
  const cached = getCached(path);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached) headers["If-None-Match"] = cached.etag;

  let res: Response;
  try {
    res = await fetch(API_BASE + path, { headers });
  } catch {
    throw new ApiError(0, "network", "The data service is not answering.", null);
  }

  if (res.status === 304 && cached) {
    return cached.env as Envelope<T>;
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.error) {
    const env = body as unknown as Envelope<null> | null;
    throw new ApiError(res.status, env?.error?.code ?? "http_" + res.status, env?.error?.message ?? "The request failed.", env);
  }

  const etag = res.headers.get("ETag");
  if (etag) {
    setCached(path, { etag, env: body as Envelope<unknown> });
  }
  return body;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  if (USE_MOCKS) return mockFetch<T>(path);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  let req = inflight.get(path) as Promise<Envelope<T>> | undefined;
  if (!req) {
    req = fetchEnvelope<T>(path).finally(() => {
      inflight.delete(path);
    });
    inflight.set(path, req as Promise<Envelope<unknown>>);
  }
  return withAbort(req, signal);
}

export const api = {
  clientConfig: (s?: AbortSignal) => get<ClientConfig>("/v1/client-config", s),
  stories: (s?: AbortSignal) => get<StorySummary[]>("/v1/stories", s),
  story: (id: string, s?: AbortSignal) => get<Story>(`/v1/stories/${encodeURIComponent(id)}`, s),
  live: (layer: string, s?: AbortSignal) => get<FeatureCollection<VehicleProperties>>(`/v1/live/${encodeURIComponent(layer)}`, s),
  layer: (layer: string, s?: AbortSignal) => get<FeatureCollection>(`/v1/layers/${encodeURIComponent(layer)}`, s),
  number: (id: string, s?: AbortSignal) => get<NumberData>(`/v1/numbers/${encodeURIComponent(id)}`, s),
  feature: (kind: string, id: number, s?: AbortSignal) => get<FeatureDetail>(`/v1/features/${encodeURIComponent(kind)}/${id}`, s),
  sources: (s?: AbortSignal) => get<SourceStatus[]>("/v1/sources", s),
  sectors: (s?: AbortSignal) => get<SectorRegister>("/v1/sectors", s),
  replay: (layer: string, minutes: number, s?: AbortSignal) => get<Replay>(`/v1/replay/${encodeURIComponent(layer)}?minutes=${minutes}`, s),
};
