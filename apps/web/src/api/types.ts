// Types for contract v0 (engineering/contract/openapi.yaml). Names follow the contract exactly.

export interface SourceRef {
  source_id: string;
  name: string;
  publisher: string | null;
}

export interface ErrorInfo {
  code: "not_found" | "bad_request" | "source_unavailable" | "internal_error";
  message: string;
}

export interface Envelope<T> {
  data: T;
  as_of: string | null;
  source: SourceRef[];
  reliability_tier: string | null;
  licence: string;
  error?: ErrorInfo;
}

export type Kind = "location" | "asset" | "event";
export type Lens = "live" | "replay" | "analytics";
export type BusStatus = "on_time" | "late" | "early" | "unknown";

export interface CoreProperties {
  kind: Kind;
  sector_id: string | null;
  subsector_id: string | null;
  id: number;
  source_key: string | null;
  source_id?: string | null;
  [key: string]: unknown;
}

export interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}

export interface Feature<P extends CoreProperties = CoreProperties> {
  type: "Feature";
  id: number;
  geometry: Geometry | null;
  properties: P;
}

export interface FeatureCollection<P extends CoreProperties = CoreProperties> {
  type: "FeatureCollection";
  features: Feature<P>[];
  layer?: string;
  limit_reached?: boolean;
}

export interface VehicleProperties extends CoreProperties {
  kind: "asset";
  label: string | null;
  route_short_name: string | null;
  route_long_name?: string | null;
  route_id?: number | null;
  trip_id?: number | null;
  headsign: string | null;
  status: BusStatus;
  delay_seconds: number | null;
  next_stop_name: string | null;
  bearing: number | null;
  speed_metres_per_second?: number | null;
  position_ts: string;
}

export interface HistoryItem {
  t: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface FeatureDetail extends Feature {
  history: HistoryItem[];
}

export interface StorySummary {
  id: string;
  question: string;
  sector_id: string;
  subsector_id: string;
  lenses: Lens[];
  /** live, planned, collecting_data, source_incomplete; unknown values are shown as words, never as numbers. */
  status: StoryStatus;
  status_note?: string | null;
}

export type StoryStatus = "live" | "planned" | "collecting_data" | "source_incomplete" | (string & {});

export interface LegendItem {
  value: string;
  label: string;
  shape?: "disc" | "diamond" | "ring" | "square" | "line" | "area";
}

export interface EvidenceLayer {
  layer: string;
  path: "live" | "layers";
  title?: string;
  property?: string | null;
  legend: LegendItem[];
}

export interface Story extends StorySummary {
  title?: string;
  answer: { template: string; numbers: string[]; empty_text?: string };
  evidence: { layers: EvidenceLayer[] };
  context: { number_id: string; title: string };
  trust: { source_ids: string[]; note?: string };
}

export interface SeriesPoint {
  t: string;
  value: number | null;
}

export interface NumberData {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  window?: string;
  rule?: string;
  series?: SeriesPoint[];
}

export interface SourceStatus {
  source_id: string;
  dataset_name: string;
  publisher: string | null;
  licence: string;
  reliability_tier: string;
  last_loaded_ts: string | null;
  last_attempt_ts?: string | null;
  status: "ok" | "stale" | "down" | "unknown";
  cadence_code?: string | null;
  source_url?: string | null;
}

export interface Sector {
  sector_id: string;
  name: string;
  group_id: string;
  pinned: boolean;
  question_count: number | null;
  status: "live" | "planned";
  phase_number?: number | null;
  story_ids?: string[];
}

export interface SectorGroup {
  group_id: string;
  name: string;
  sector_ids: string[];
}

export interface SectorRegister {
  max_pins: number;
  groups: SectorGroup[];
  sectors: Sector[];
}

export interface ReplayTrack {
  id: number;
  label: string | null;
  route_short_name: string | null;
  positions: [number, number, number][];
}

export interface Replay {
  layer: string;
  minutes: number;
  from: string;
  to: string;
  tracks: ReplayTrack[];
}

export interface ClientConfig {
  three_d_available: boolean;
  three_d_note?: string | null;
  cesium_ion_token: string | null;
  cesium_photorealistic_asset_id?: number | null;
  time_zone: string;
  stale_after_seconds: number;
  live_refresh_seconds: number;
  business_rules: Record<string, unknown>;
  attribution?: string;
}
