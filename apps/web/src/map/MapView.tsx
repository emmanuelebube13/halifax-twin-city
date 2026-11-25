/// <reference types="geojson" />
// The 2D map (MapLibre GL JS). It draws whatever layers it is given, using the pin register, so it holds no
// story-specific code. Buses are redrawn on a 10 Hz clock so they glide; with reduced motion they are drawn
// only when new reports arrive.

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import type { Feature, FeatureCollection, Kind, VehicleProperties } from "../api/types";
import type { Place } from "../lib/camera";
import { t } from "../i18n";
import { busStatus } from "../lib/status";
import { basemapAvailable, fallbackStyle, harbourStyle } from "./basemap";
import { COLOURS, PIXEL_RATIO, buildPinImages, busImageId, busRenderImage, drawBusPin, drawCluster, drawGlyphPin, parseBusImageId, type Glyph, type PinImage } from "./pins";
import { lookFor, pinCollection } from "./registry";

let protocolAdded = false;
function ensureProtocol(): void {
  if (protocolAdded) return;
  const p = new Protocol();
  maplibregl.addProtocol("pmtiles", p.tile);
  protocolAdded = true;
}

// The peninsula and downtown Dartmouth, where most of the city's activity is.
export const HALIFAX_CENTRE: [number, number] = [-63.5880, 44.6560];
const MAX_BOUNDS: [[number, number], [number, number]] = [[-64.3, 44.3], [-62.9, 45.1]];

export interface MapLayerInput {
  name: string;
  fc: FeatureCollection | null;
  dim: boolean;
}

export interface VehicleInput {
  features: Feature<VehicleProperties>[];
  positionFor: (id: number, now: number) => { lon: number; lat: number; bearing?: number } | null;
  dim: boolean;
}

export interface MapSelect {
  kind: Kind;
  id: number;
  layer: string;
}

export interface MapHandle {
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  fitAll: () => void;
  /** The place on screen now, for the 3D view to start from. */
  place: () => Place | null;
  /** Jump to a place (back from 3D). */
  jumpTo: (p: Place) => void;
}

interface Props {
  /** While 3D shows, the zoom and north buttons drive the 3D camera instead. */
  threeD?: { zoom: (d: 1 | -1) => void; north: () => void } | null;
  dark: boolean;
  phone: boolean;
  layers: MapLayerInput[];
  vehicles: VehicleInput | null;
  selectedKey: string | null;
  routeFilter: string | null;
  /** A route to draw boldly: the filtered route, or the selected bus's route. */
  highlightRoute: string | null;
  follow: boolean;
  glide: boolean;
  reducedMotion: boolean;
  hidden?: boolean;
  onSelect: (sel: MapSelect | null) => void;
  onBasemap?: (ok: boolean) => void;
  /** The 2D map could not start (no WebGL): the app says so and points to the list view. */
  onMapFailed?: () => void;
  popup?: ReactNode;
  children?: ReactNode;
}

const VEH_SRC = "veh";

export const MapView = memo(forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const popupEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [styleReady, setStyleReady] = useState(0);
  const propsRef = useRef(props);
  propsRef.current = props;
  const pinPoints = useRef(new Map<string, [number, number]>());
  const pinLayerRef = useRef(new Map<string, string>());
  const lastFcRef = useRef(new Map<string, FeatureCollection | null>());
  const lastPinSelRef = useRef(new Map<string, string | null>());
  const prevSelectedKeyRef = useRef<string | null>(null);
  const pinImages = useRef<PinImage[] | null>(null);
  const installed = useRef(new Set<string>());

  // ---- create the map once
  useEffect(() => {
    ensureProtocol();
    let cancelled = false;
    let map: MLMap | null = null;
    let hoverRaf: number | null = null;
    let pendingPoint: { x: number; y: number } | null = null;
    (async () => {
      const ok = await basemapAvailable();
      if (cancelled || !container.current) return;
      propsRef.current.onBasemap?.(ok);
      const dark = propsRef.current.dark;
      try {
        map = new maplibregl.Map({
        container: container.current,
        style: ok ? harbourStyle(dark) : fallbackStyle(dark),
        center: HALIFAX_CENTRE,
        zoom: propsRef.current.phone ? 12.1 : 12.9,
        maxBounds: MAX_BOUNDS,
        attributionControl: false,
        dragRotate: true,
        pitchWithRotate: false,
        fadeDuration: propsRef.current.reducedMotion ? 0 : 200,
        });
      } catch {
        // without WebGL MapLibre cannot draw: say so instead of failing with an uncaught error
        map = null;
        propsRef.current.onMapFailed?.();
        return;
      }
      // errors MapLibre reports while drawing (for example a shader the GPU refuses) are handled, not thrown
      map.on("error", () => undefined);
      mapRef.current = map;
      // on a phone the sheet covers the bottom of the map: keep the evidence in the strip above it
      if (propsRef.current.phone) map.setPadding({ top: 120, bottom: 300, left: 0, right: 0 });
      if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map;
      (map as unknown as { __basemapOk: boolean }).__basemapOk = ok;
      map.getCanvas().setAttribute("aria-label", t("map.label"));
      map.on("styleimagemissing", (e) => {
        if (!map) return;
        const bus = parseBusImageId(e.id);
        if (bus) {
          const c = drawBusPin(busRenderImage(), bus.status, bus.facingWest, bus.selected, bus.route);
          const g = c.getContext("2d") as CanvasRenderingContext2D;
          map.addImage(e.id, g.getImageData(0, 0, c.width, c.height), { pixelRatio: PIXEL_RATIO });
          return;
        }
        const m = /^cluster-(?:(bus)-)?([0-9a-f]{6})-(\d+)$/.exec(e.id);
        if (m) {
          const c = drawCluster(Number(m[3]), m[1] ?? "", `#${m[2]}`);
          const g = c.getContext("2d") as CanvasRenderingContext2D;
          map.addImage(e.id, g.getImageData(0, 0, c.width, c.height), { pixelRatio: PIXEL_RATIO });
          return;
        }
        const gm = /^glyph-(triangle|house|square|dot|stop|station|bunching|clock)(?:-([0-9a-f]{6}))?(-sel)?$/.exec(e.id);
        if (gm) {
          const glyph = gm[1] as Glyph;
          const fallbackColour =
            glyph === "triangle"
              ? COLOURS.closure
              : glyph === "house"
                ? COLOURS.permit
                : glyph === "bunching"
                  ? COLOURS.late
                  : glyph === "clock" || glyph === "stop" || glyph === "station"
                    ? COLOURS.route
                    : COLOURS.generic;
          const c = drawGlyphPin(glyph, gm[2] ? `#${gm[2]}` : fallbackColour, !!gm[3]);
          const g = c.getContext("2d") as CanvasRenderingContext2D;
          map.addImage(e.id, g.getImageData(0, 0, c.width, c.height), { pixelRatio: PIXEL_RATIO });
        }
      });
      map.on("style.load", async () => {
        if (!map) return;
        if (!pinImages.current) pinImages.current = await buildPinImages();
        for (const p of pinImages.current) if (!map.hasImage(p.id)) map.addImage(p.id, p.data, { pixelRatio: PIXEL_RATIO });
        installed.current.clear();
        lastFcRef.current.clear();
        lastPinSelRef.current.clear();
        setStyleReady((n) => n + 1);
      });
      map.on("click", (e) => handleClick(e.point));
      map.on("mousemove", (e) => {
        if (!map || map.isMoving() || map.isEasing()) return;
        pendingPoint = { x: e.point.x, y: e.point.y };
        if (hoverRaf !== null) return;
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = null;
          if (cancelled || !map || !pendingPoint || map.isMoving() || map.isEasing()) return;
          const hit = queryHit(map, pendingPoint);
          const nextCursor = hit ? "pointer" : "";
          if (map.getCanvas().style.cursor !== nextCursor) map.getCanvas().style.cursor = nextCursor;
        });
      });
      map.on("move", () => placePopup());
    })();
    return () => {
      cancelled = true;
      if (hoverRaf !== null) cancelAnimationFrame(hoverRaf);
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- light and dark
  const firstDark = useRef(true);
  useEffect(() => {
    if (firstDark.current) {
      firstDark.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const ok = (map as unknown as { __basemapOk: boolean }).__basemapOk;
    setStyleReady(0);
    map.setStyle(ok ? harbourStyle(props.dark) : fallbackStyle(props.dark));
  }, [props.dark]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [props.hidden, props.phone]);

  function interactiveLayers(map: MLMap): string[] {
    if (!map.style) return [];
    const ids = ["veh-pin", "veh-cluster"];
    for (const name of installed.current) {
      ids.push(`p-${name}-pin`, `p-${name}-station`, `p-${name}-cluster`, `d-${name}-line`, `d-${name}-fill`, `d-${name}-circle`);
    }
    return ids.filter((id) => map.getLayer(id));
  }

  function queryHit(map: MLMap, pt: { x: number; y: number }): MapGeoJSONFeature | null {
    const pad = 14; // 28 px plus the pin itself gives a touch area of at least 44 px
    const layers = interactiveLayers(map);
    if (!layers.length) return null;
    const hits = map.queryRenderedFeatures([[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]], { layers });
    if (!hits.length) return null;
    const rank = (f: MapGeoJSONFeature) => (f.layer.id.startsWith("veh") ? 0 : f.layer.id.startsWith("p-") ? 1 : 2);
    return [...hits].sort((a, b) => rank(a) - rank(b))[0];
  }

  function handleClick(pt: { x: number; y: number }): void {
    const map = mapRef.current;
    if (!map) return;
    const hit = queryHit(map, pt);
    if (!hit) {
      propsRef.current.onSelect(null);
      return;
    }
    const p = hit.properties as Record<string, unknown>;
    if (p.cluster) {
      const srcId = hit.source;
      const src = map.getSource(srcId) as GeoJSONSource;
      const at = (hit.geometry as GeoJSON.Point).coordinates as [number, number];
      src.getClusterExpansionZoom(p.cluster_id as number).then((z) => {
        map.easeTo({ center: at, zoom: Math.min(z + 0.2, 17), duration: propsRef.current.reducedMotion ? 0 : 500 });
      });
      return;
    }
    const layer = hit.layer.id.startsWith("veh") ? "vehicles" : (hit.layer.id.split("-").slice(1, -1).join("-") as string);
    propsRef.current.onSelect({ kind: p.kind as Kind, id: Number(p.id), layer });
  }

  // ---- install and update data layers (only rebuild sources when FeatureCollection ref changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.style || props.threeD || props.hidden) return;
    const wanted = new Set(props.layers.map((l) => l.name));
    const selKey = propsRef.current.selectedKey;
    const clearLayerPins = (layerName: string) => {
      for (const [k, owner] of pinLayerRef.current) {
        if (owner === layerName) {
          pinLayerRef.current.delete(k);
          pinPoints.current.delete(k);
        }
      }
    };
    const recordLayerPins = (layerName: string, pins: ReturnType<typeof pinCollection>) => {
      clearLayerPins(layerName);
      for (const f of pins.features) {
        pinPoints.current.set(f.properties.key, f.geometry.coordinates as [number, number]);
        pinLayerRef.current.set(f.properties.key, layerName);
      }
    };
    // remove layers no longer drawn
    for (const name of [...installed.current]) {
      if (!wanted.has(name)) {
        for (const id of [`p-${name}-pin`, `p-${name}-station`, `p-${name}-cluster`, `d-${name}-line`, `d-${name}-fill`, `d-${name}-circle`]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [`p-${name}`, `d-${name}`]) if (map.getSource(id)) map.removeSource(id);
        installed.current.delete(name);
        lastFcRef.current.delete(name);
        lastPinSelRef.current.delete(name);
        clearLayerPins(name);
      }
    }
    for (const l of props.layers) {
      const look = lookFor(l.name);
      const isNew = !installed.current.has(l.name);
      const fcChanged = lastFcRef.current.get(l.name) !== l.fc;
      if (isNew) {
        const raw = (l.fc ?? { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection;
        map.addSource(`d-${l.name}`, { type: "geojson", data: raw, promoteId: "id" });
        const before = map.getLayer("veh-cluster") ? "veh-cluster" : undefined;
        if (look.kind === "route") {
          map.addLayer({ id: `d-${l.name}-line`, type: "line", source: `d-${l.name}`, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": look.colour, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 14, 2, 17, 4] } }, firstDataLayer(map) ?? before);
        } else if (look.kind === "stop") {
          const pins = pinCollection(l.fc, l.name, selKey);
          map.addSource(`p-${l.name}`, { type: "geojson", data: pins, cluster: false });
          map.addLayer(
            {
              id: `p-${l.name}-station`,
              type: "symbol",
              source: `p-${l.name}`,
              filter: ["==", ["get", "glyph"], "station"],
              minzoom: 12,
              layout: {
                "icon-image": ["get", "icon"],
                "icon-anchor": "bottom",
                "icon-allow-overlap": true,
                "symbol-sort-key": ["get", "sel"],
                "icon-size": ["case", ["==", ["get", "sel"], 1], 1.2, 1],
              },
            },
            before,
          );
          map.addLayer(
            {
              id: `p-${l.name}-pin`,
              type: "symbol",
              source: `p-${l.name}`,
              filter: ["!=", ["get", "glyph"], "station"],
              minzoom: look.minzoom,
              layout: {
                "icon-image": ["get", "icon"],
                "icon-anchor": "bottom",
                "icon-allow-overlap": true,
                "symbol-sort-key": ["get", "sel"],
                "icon-size": ["case", ["==", ["get", "sel"], 1], 1.2, 1],
              },
            },
            before,
          );
          recordLayerPins(l.name, pins);
          lastPinSelRef.current.set(l.name, selKey);
        } else {
          map.addLayer({ id: `d-${l.name}-fill`, type: "fill", source: `d-${l.name}`, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": look.colour, "fill-opacity": 0.18 } }, before);
          map.addLayer({ id: `d-${l.name}-line`, type: "line", source: `d-${l.name}`, filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], layout: { "line-cap": "round" }, paint: { "line-color": look.colour, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 6], ...(look.dashed ? { "line-dasharray": [1.5, 1] } : {}) } }, before);
          const pins = pinCollection(l.fc, l.name, selKey);
          map.addSource(`p-${l.name}`, { type: "geojson", data: pins, cluster: look.cluster, clusterMaxZoom: 14, clusterRadius: 40 });
          const hex = look.colour.replace("#", "").toLowerCase();
          map.addLayer({ id: `p-${l.name}-cluster`, type: "symbol", source: `p-${l.name}`, filter: ["has", "point_count"], layout: { "icon-image": ["concat", `cluster-${hex}-`, ["to-string", ["get", "point_count"]]], "icon-allow-overlap": true } }, before);
          map.addLayer({ id: `p-${l.name}-pin`, type: "symbol", source: `p-${l.name}`, filter: ["!", ["has", "point_count"]], minzoom: look.minzoom, layout: { "icon-image": ["get", "icon"], "icon-anchor": "bottom", "icon-allow-overlap": true, "symbol-sort-key": ["get", "sel"], "icon-size": ["case", ["==", ["get", "sel"], 1], 1.2, 1] } }, before);
          recordLayerPins(l.name, pins);
          lastPinSelRef.current.set(l.name, selKey);
        }
        installed.current.add(l.name);
        lastFcRef.current.set(l.name, l.fc);
      } else if (fcChanged) {
        const raw = (l.fc ?? { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection;
        (map.getSource(`d-${l.name}`) as GeoJSONSource | undefined)?.setData(raw);
        if (look.kind !== "route") {
          const pins = pinCollection(l.fc, l.name, selKey);
          (map.getSource(`p-${l.name}`) as GeoJSONSource | undefined)?.setData(pins);
          recordLayerPins(l.name, pins);
          lastPinSelRef.current.set(l.name, selKey);
        }
        lastFcRef.current.set(l.name, l.fc);
      }
      const op = l.dim ? 0.4 : 1;
      for (const id of [`p-${l.name}-pin`, `p-${l.name}-station`, `p-${l.name}-cluster`]) if (map.getLayer(id)) map.setPaintProperty(id, "icon-opacity", op);
    }
    prevSelectedKeyRef.current = selKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layers, !!props.threeD, props.hidden, styleReady]);

  // ---- pin selection updates only the previous and newly selected pin's layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.style || props.threeD || props.hidden) return;
    const prev = prevSelectedKeyRef.current;
    const next = props.selectedKey;
    if (prev === next) return;
    prevSelectedKeyRef.current = next;
    const affected = new Set<string>();
    const prevLayer = prev ? pinLayerRef.current.get(prev) : undefined;
    const nextLayer = next ? pinLayerRef.current.get(next) : undefined;
    if (prevLayer) affected.add(prevLayer);
    if (nextLayer) affected.add(nextLayer);
    for (const name of affected) {
      if (!installed.current.has(name) || lookFor(name).kind === "route") continue;
      if (lastPinSelRef.current.get(name) === next) continue;
      const l = propsRef.current.layers.find((x) => x.name === name);
      if (!l) continue;
      (map.getSource(`p-${name}`) as GeoJSONSource | undefined)?.setData(pinCollection(l.fc, l.name, next));
      lastPinSelRef.current.set(name, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedKey, !!props.threeD, props.hidden, styleReady]);

  // ---- route highlight and dim paint properties
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.style || props.threeD || props.hidden) return;
    const hr = props.highlightRoute;
    for (const l of props.layers) {
      if (!map.getLayer(`d-${l.name}-line`)) continue;
      const look = lookFor(l.name);
      const routeOp = look.kind === "route" ? (hr ? ["case", ["==", ["get", "route_short_name"], hr], 1, props.routeFilter ? 0.15 : 0.35] : 0.55) : 0.9;
      map.setPaintProperty(`d-${l.name}-line`, "line-opacity", l.dim ? 0.35 : (routeOp as never));
      if (look.kind === "route") {
        const w = (n: number) => (hr ? ["case", ["==", ["get", "route_short_name"], hr], n * 2.4, n] : n);
        map.setPaintProperty(`d-${l.name}-line`, "line-width", ["interpolate", ["linear"], ["zoom"], 11, w(1) as never, 14, w(1.8) as never, 17, w(3.5) as never] as never);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layers, props.routeFilter, props.highlightRoute, !!props.threeD, props.hidden, styleReady]);

  // ---- vehicles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !map.style) return;
    if (!props.vehicles) {
      for (const id of ["veh-pin", "veh-cluster"]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(VEH_SRC)) map.removeSource(VEH_SRC);
      return;
    }
    if (!map.getSource(VEH_SRC)) {
      map.addSource(VEH_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 13, clusterRadius: 44 });
      map.addLayer({ id: "veh-cluster", type: "symbol", source: VEH_SRC, filter: ["has", "point_count"], layout: { "icon-image": ["concat", "cluster-bus-13232e-", ["to-string", ["get", "point_count"]]], "icon-allow-overlap": true } });
      map.addLayer({
        id: "veh-pin",
        type: "symbol",
        source: VEH_SRC,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "symbol-sort-key": ["get", "sel"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, ["case", ["==", ["get", "sel"], 1], 1, 0.82], 15, ["case", ["==", ["get", "sel"], 1], 1.2, 1]],
        },
      });
    }
    map.setPaintProperty("veh-pin", "icon-opacity", props.vehicles.dim ? 0.4 : 1);
    map.setPaintProperty("veh-cluster", "icon-opacity", props.vehicles.dim ? 0.4 : 1);
    if (props.threeD || props.hidden) return;
    if (typeof document === "undefined" || !document.hidden) drawVehicles();
    const onVis = () => {
      if (!document.hidden) drawVehicles();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    if (!props.glide) {
      return () => {
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      };
    }
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      drawVehicles();
    }, 100);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.vehicles, props.selectedKey, props.routeFilter, props.glide, !!props.threeD, props.hidden, styleReady]);

  const lastBearing = useRef(new Map<number, number>());
  const lastPos = useRef(new Map<number, { lon: number; lat: number }>());

  function drawVehicles(): void {
    const map = mapRef.current;
    const v = propsRef.current.vehicles;
    const src = map?.getSource(VEH_SRC) as GeoJSONSource | undefined;
    if (!map || !v || !src) return;
    const now = Date.now();
    const rf = propsRef.current.routeFilter;
    const sel = propsRef.current.selectedKey;
    const features: GeoJSON.Feature[] = [];
    for (const f of v.features) {
      const p = f.properties;
      if (rf && p.route_short_name !== rf) continue;
      const pos = v.positionFor(f.id, now);
      if (!pos) continue;
      // face the way the bus is moving; prefer route-snapped bearing, then movement delta, then reported bearing
      const prev = lastPos.current.get(f.id);
      let bearing = lastBearing.current.get(f.id) ?? p.bearing ?? 90;
      if (typeof pos.bearing === "number" && Number.isFinite(pos.bearing)) {
        bearing = ((pos.bearing % 360) + 360) % 360;
      } else if (prev && (Math.abs(prev.lon - pos.lon) > 1e-6 || Math.abs(prev.lat - pos.lat) > 1e-6)) {
        bearing = (Math.atan2(pos.lon - prev.lon, pos.lat - prev.lat) * 180) / Math.PI;
        bearing = (bearing + 360) % 360;
      } else if (!prev && typeof p.bearing === "number") bearing = p.bearing;
      lastPos.current.set(f.id, pos);
      lastBearing.current.set(f.id, bearing);
      const key = `asset:${f.id}`;
      const isSel = key === sel;
      const status = busStatus(p.status, p.delay_seconds);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [pos.lon, pos.lat] },
        properties: { kind: "asset", id: f.id, key, sel: isSel ? 1 : 0, icon: busImageId(status, bearing > 180, isSel, p.route_short_name) },
      });
      pinPoints.current.set(key, [pos.lon, pos.lat]);
    }
    src.setData({ type: "FeatureCollection", features });
    placePopup();
    followSelected();
  }

  const lastFollow = useRef(0);
  function followSelected(): void {
    const map = mapRef.current;
    const p = propsRef.current;
    if (!map || !p.follow || !p.selectedKey) return;
    const at = pinPoints.current.get(p.selectedKey);
    const now = Date.now();
    if (!at || now - lastFollow.current < 1000) return;
    lastFollow.current = now;
    if (p.reducedMotion) map.jumpTo({ center: at });
    else map.easeTo({ center: at, duration: 950, easing: (x) => x });
  }

  function placePopup(): void {
    const map = mapRef.current;
    const el = popupEl.current;
    if (!map || !el) return;
    const key = propsRef.current.selectedKey;
    const at = key ? pinPoints.current.get(key) : null;
    if (!at) {
      el.style.visibility = "hidden";
      return;
    }
    const pt = map.project(at);
    el.style.visibility = "visible";
    el.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px)`;
  }

  useEffect(() => {
    placePopup();
  });

  // a newly selected pin (also from a shared link) is panned into view, so its popup is never clipped
  useEffect(() => {
    const key = props.selectedKey;
    if (!key || props.phone || props.follow) return;
    const timer = setTimeout(() => {
      const map = mapRef.current;
      const at = pinPoints.current.get(key);
      if (!map || !at) return;
      const pt = map.project(at);
      const w = map.getContainer().clientWidth;
      const h = map.getContainer().clientHeight;
      if (pt.x > 180 && pt.x < w - 180 && pt.y > 300 && pt.y < h - 40) return;
      map.easeTo({ center: at, offset: [0, 120], duration: props.reducedMotion ? 0 : 500 });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedKey, styleReady]);

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat, zoom) => {
      const map = mapRef.current;
      if (!map) return;
      const z = Math.max(zoom ?? 15, map.getZoom());
      // on a phone the sheet covers the lower half: centre the pin in the strip of map above it
      const padding = propsRef.current.phone ? { top: 130, bottom: Math.round(window.innerHeight * 0.5), left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 };
      if (propsRef.current.reducedMotion) map.jumpTo({ center: [lon, lat], zoom: z, padding });
      else map.flyTo({ center: [lon, lat], zoom: z, duration: 900, padding });
    },
    place: () => {
      const map = mapRef.current;
      if (!map) return null;
      const c = map.getCenter();
      return { lon: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    },
    jumpTo: (p) => {
      const map = mapRef.current;
      if (!map) return;
      map.jumpTo({ center: [p.lon, p.lat], zoom: p.zoom, bearing: p.bearing, pitch: Math.min(p.pitch, 60) });
    },
    fitAll: () => {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({ center: HALIFAX_CENTRE, zoom: propsRef.current.phone ? 12.1 : 12.9, bearing: 0, pitch: 0, duration: propsRef.current.reducedMotion ? 0 : 600 });
    },
  }));

  const zoomBy = (d: 1 | -1) => {
    if (props.threeD) return props.threeD.zoom(d);
    mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 12) + d, duration: props.reducedMotion ? 0 : 250 });
  };

  return (
    <div className={`map-shell${props.hidden ? " is-hidden" : ""}`}>
      <div ref={container} className="map-canvas" />
      {props.popup && !props.phone ? (
        <div ref={popupEl} className="map-popup-anchor" style={{ visibility: "hidden" }}>
          {props.popup}
        </div>
      ) : (
        <div ref={popupEl} hidden />
      )}
      <div className="map-controls" role="group" aria-label={t("view.mode")}>
        <button type="button" className="ctl" onClick={() => zoomBy(1)} aria-label={t("map.zoomIn")} title={t("map.zoomIn")}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
        </button>
        <button type="button" className="ctl" onClick={() => zoomBy(-1)} aria-label={t("map.zoomOut")} title={t("map.zoomOut")}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg>
        </button>
        <button type="button" className="ctl" onClick={() => (props.threeD ? props.threeD.north() : mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: props.reducedMotion ? 0 : 400 }))} aria-label={t("map.north")} title={t("map.north")}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3l5 13-5-3-5 3z" /></svg>
        </button>
      </div>
      {props.children}
    </div>
  );
}));

function firstDataLayer(map: MLMap): string | undefined {
  const layers = map.getStyle().layers ?? [];
  const found = layers.find((l) => l.id.startsWith("d-") || l.id.startsWith("p-") || l.id.startsWith("veh"));
  return found?.id;
}
