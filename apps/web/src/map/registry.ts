// The pin register: one entry per layer name says how it is drawn. A new layer is a new entry, not new code;
// a layer with no entry still draws, with the generic square pin.

import type { Feature, FeatureCollection, Geometry } from "../api/types";
import { COLOURS, type Glyph } from "./pins";

export interface LayerLook {
  /** bus: the live vehicles; route and stop: transit context; event: any event or location pin layer. */
  kind: "bus" | "route" | "stop" | "event";
  glyph: Glyph;
  colour: string;
  /** Context layers are drawn for a story but not counted as "live events" in City view. */
  context: boolean;
  cluster: boolean;
  minzoom: number;
  dashed: boolean;
}

const DEFAULT_LOOK: LayerLook = { kind: "event", glyph: "dot", colour: COLOURS.generic, context: false, cluster: true, minzoom: 0, dashed: false };

export const REGISTRY: Record<string, Partial<LayerLook>> = {
  vehicles: { kind: "bus", cluster: true },
  routes: { kind: "route", colour: COLOURS.route, context: true, cluster: false },
  stops: { kind: "stop", glyph: "stop", colour: COLOURS.route, context: true, cluster: false, minzoom: 14 },
  "bunching-stops": { kind: "event", glyph: "bunching", colour: COLOURS.late, cluster: true, minzoom: 11 },
  "stop-wait": { kind: "event", glyph: "clock", colour: COLOURS.route, cluster: true, minzoom: 11 },
  "road-closures": { kind: "event", glyph: "triangle", colour: COLOURS.closure, cluster: true, dashed: true },
  "road-closures-all": { kind: "event", glyph: "triangle", colour: COLOURS.closure, cluster: true, dashed: true },
  "road-closures-upcoming": { kind: "event", glyph: "triangle", colour: COLOURS.closure, cluster: true, dashed: true },
  "building-permits": { kind: "event", glyph: "house", colour: COLOURS.permit, cluster: true },
  "new-units": { kind: "event", glyph: "house", colour: COLOURS.permit, cluster: true },
  "completed-permits": { kind: "event", glyph: "house", colour: COLOURS.permit, cluster: true },
};

export function lookFor(layer: string): LayerLook {
  return { ...DEFAULT_LOOK, ...(REGISTRY[layer] ?? {}) };
}

/** A representative point for a geometry: the point itself, the middle vertex of a line, the centre of a shape. */
export function anchorOf(g: Geometry | null): [number, number] | null {
  if (!g || !g.coordinates) {
    if (g?.type === "GeometryCollection" && g.geometries?.length) return anchorOf(g.geometries[0]);
    return null;
  }
  const c = g.coordinates as unknown;
  switch (g.type) {
    case "Point":
      return c as [number, number];
    case "MultiPoint":
    case "LineString": {
      const a = c as [number, number][];
      return a.length ? a[Math.floor(a.length / 2)] : null;
    }
    case "MultiLineString": {
      const a = (c as [number, number][][]).flat();
      return a.length ? a[Math.floor(a.length / 2)] : null;
    }
    case "Polygon":
    case "MultiPolygon": {
      const ring = g.type === "Polygon" ? (c as [number, number][][])[0] : (c as [number, number][][][])[0]?.[0];
      if (!ring?.length) return null;
      let x = 0;
      let y = 0;
      for (const p of ring) {
        x += p[0];
        y += p[1];
      }
      return [x / ring.length, y / ring.length];
    }
    default:
      return null;
  }
}

/** Pins for a layer: one point per feature, carrying what the map needs to draw and select it. */
export function pinCollection(fc: FeatureCollection | null, layer: string, selectedKey: string | null) {
  const look = lookFor(layer);
  const colourHex = look.colour.replace("#", "").toLowerCase();
  const features = [];
  for (const f of fc?.features ?? []) {
    const at = anchorOf(f.geometry);
    if (!at) continue;
    const key = `${f.properties.kind}:${f.properties.id}`;
    const sel = key === selectedKey;
    const isStation =
      layer === "stops" &&
      (f.properties.stop_kind_code === "Station" ||
        f.properties.shelter_flag === true ||
        /terminal|station/i.test(String(f.properties.stop_name ?? f.properties.name ?? "")));
    const glyph: Glyph = layer === "stops" ? (isStation ? "station" : "stop") : look.glyph;
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: at },
      properties: {
        key,
        kind: f.properties.kind,
        id: f.properties.id,
        layer,
        glyph,
        icon: `glyph-${glyph}-${colourHex}${sel ? "-sel" : ""}`,
        sel: sel ? 1 : 0,
      },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

export function isLineOrArea(f: Feature): boolean {
  const t = f.geometry?.type ?? "";
  return t.includes("LineString") || t.includes("Polygon");
}

/** A readable name for any feature, from whichever name-like property it carries. */
export function featureName(p: Record<string, unknown>): string {
  const pick = (k: string) => (typeof p[k] === "string" && (p[k] as string).trim() ? (p[k] as string) : null);
  return (
    pick("name") ?? pick("location_name") ?? pick("stop_name") ?? pick("headsign") ?? pick("label") ?? pick("source_key") ?? `#${String(p.id ?? "")}`
  );
}
