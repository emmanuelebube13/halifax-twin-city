// The map shell. It reads the story register, sector register and sources from the API, decides which layers
// to draw (City view: each live story's main layer; a sector: its stories' main layers; a story: its evidence
// layers), and lays out the rail, map and panel (laptop) or chips, map and sheet (phone).

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import { useMediaQuery, useNow, usePoll } from "./api/hooks";
import { usePollMany } from "./api/pollMany";
import type { Feature, FeatureCollection, Lens, NumberData, Sector, Story, StorySummary, VehicleProperties } from "./api/types";
import { t } from "./i18n";
import { formatClock } from "./lib/format";
import { RouteShapeIndex, TrackStore, estimatedSpeedMps, snapTrackPosition, type Sample } from "./lib/glide";
import { layerFreshness, onTimeRuleFrom } from "./lib/status";
import { sheetOnFollow, storyAsOf, storyNumberIds } from "./lib/story";
import { usePins, useView } from "./lib/useView";
import { parseView } from "./lib/url";
import type { Globe3DHandle, PinLayer3D } from "./map/Globe3D";
import type { Place } from "./lib/camera";
import { hasWebGL, saveProfile, savedProfile, saveStreetTwinMode, savedStreetTwinMode, type ProfileName, type StreetTwinMode } from "./lib/profileChoice";
import { threeDDecision, type ThreeDFailure } from "./lib/threeD";
import { MapView, type MapHandle, type MapSelect } from "./map/MapView";
import { featureName, lookFor, anchorOf } from "./map/registry";
import { AgeLine, BottomSheet, ChipRow, Credits, LensSwitch, Legend, Rail, ReplayBar, Search, TopBar, ViewSwitch, type LegendEntry, type SearchItem, type SheetHeight } from "./components/chrome";
import { Icon } from "./components/icons";
import { ListView, SectorsBrowser, SourcesPanel } from "./components/overlays";
import { CityPanel, FeatureCard, FeatureDetailPanel, SectorPanel, busTitle, type SectorCount } from "./components/panels";
import { AnswerFoot, AnswerPlate, ContextChart, LegendTiles, NumberCards, StoryHeading, Trust, statusWord, type LayerView } from "./components/story";

interface Spec {
  layer: string;
  path: "live" | "layers";
  title: string;
  property: string | null;
  legend: { value: string; label: string; shape?: string }[];
  sectorId: string;
}

const key = (s: { path: string; layer: string }) => `${s.path}:${s.layer}`;
const SEARCH_KEYS = ["layers:routes", "layers:stops"];
const naturalSort = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const EMPTY_FEATURES: LayerView["features"] = [];
const EMPTY_VEHICLES: Feature<VehicleProperties>[] = [];

const Globe3D = lazy(() => import("./map/Globe3D"));
/** Developer mode: Cesium's plain globe with no Google tiles, so 3D work spends no ion requests. */
const NO_ION = import.meta.env.VITE_3D_NO_ION === "1";

export function App() {
  const [view, setView] = useView();
  const phone = useMediaQuery("(max-width: 767px)");
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const freshnessClock = useNow(15_000);
  const mapRef = useRef<MapHandle>(null);
  const [following, setFollowing] = useState(false);
  const [sheet, setSheet] = useState<SheetHeight>("peek");
  const [basemapOk, setBasemapOk] = useState<boolean | null>(null);
  const [searchWanted, setSearchWanted] = useState(false);
  const [threeDFailed, setThreeDFailed] = useState<ThreeDFailure | null>(null);
  const globeRef = useRef<Globe3DHandle>(null);
  const show3dRef = useRef(false);
  const [startPlace, setStartPlace] = useState<Place | null>(null);
  // WebGL is checked only when the user asks for 3D; the automatic profile is chosen inside the 3D chunk
  // a link that opens in 3D is checked for WebGL before the 3D view mounts; otherwise only when 3D is asked for
  const [webgl, setWebgl] = useState(() => (parseView(location.search).view === "3d" ? hasWebGL() : true));
  const [mapFailed, setMapFailed] = useState(false);
  const [autoProfile, setAutoProfile] = useState<ProfileName | null>(null);
  const [profileChoice, setProfileChoice] = useState<ProfileName | null>(() => savedProfile());
  const [streetTwinMode, setStreetTwinMode] = useState<StreetTwinMode>(() => savedStreetTwinMode());

  // ---- registers
  const cfgP = usePoll("cfg", api.clientConfig, null);
  const cfg = cfgP.env?.data ?? null;
  const storiesP = usePoll("stories", api.stories, 60_000);
  const sectorsP = usePoll("sectors", api.sectors, 300_000);
  const sourcesP = usePoll("sources", api.sources, 60_000);
  const stories = useMemo(() => storiesP.env?.data ?? [], [storiesP.env]);
  const register = sectorsP.env?.data ?? null;
  const sources = useMemo(() => sourcesP.env?.data ?? [], [sourcesP.env]);
  const rule = useMemo(() => onTimeRuleFrom(cfg?.business_rules), [cfg]);
  void rule;

  const sectorById = useCallback((id: string | null | undefined): Sector | null => register?.sectors.find((s) => s.sector_id === id) ?? null, [register]);
  const sectorName = useCallback((id: string) => sectorById(id)?.name ?? id, [sectorById]);

  // ---- story configurations: every live story (City view draws their main layer) plus the open one
  const cfgIds = useMemo(() => {
    const ids = new Set(stories.filter((s) => s.status === "live").map((s) => s.id));
    if (view.story) ids.add(view.story);
    return [...ids];
  }, [stories, view.story]);
  const storyCfgs = usePollMany<Story>(cfgIds, (id, s) => api.story(id, s), () => 300_000);
  const summary: StorySummary | null = view.story ? (stories.find((s) => s.id === view.story) ?? storyCfgs[view.story]?.env?.data ?? null) : null;
  const story: Story | null = view.story ? (storyCfgs[view.story]?.env?.data ?? null) : null;
  const storySlot = view.story ? storyCfgs[view.story] : undefined;
  const activeSector = view.story ? (summary?.sector_id ?? null) : view.sector;

  // ---- which layers to draw
  const specs: Spec[] = useMemo(() => {
    const out: Spec[] = [];
    const seen = new Set<string>();
    const push = (l: Story["evidence"]["layers"][number], sectorId: string) => {
      const k = key(l);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ layer: l.layer, path: l.path, title: l.title ?? t(`layer.${l.layer}` as never) ?? l.layer, property: l.property ?? null, legend: l.legend ?? [], sectorId });
    };
    if (view.story) {
      if (story && story.status === "live") story.evidence.layers.forEach((l) => push(l, story.sector_id));
      return out;
    }
    for (const s of stories) {
      if (s.status !== "live") continue;
      if (view.sector && s.sector_id !== view.sector) continue;
      const c = storyCfgs[s.id]?.env?.data;
      const main = c?.evidence.layers[0];
      if (main) push(main, s.sector_id);
    }
    return out;
  }, [view.story, view.sector, story, stories, storyCfgs]);

  const layerKeys = useMemo(() => [...specs.map(key), ...(searchWanted ? SEARCH_KEYS : [])], [specs, searchWanted]);
  const liveEvery = (cfg?.live_refresh_seconds ?? 15) * 1000;
  const layerSlots = usePollMany<FeatureCollection>(
    layerKeys,
    (k, s) => {
      const [path, layer] = k.split(":");
      return (path === "live" ? api.live(layer, s) : api.layer(layer, s)) as never;
    },
    (k) => (k.startsWith("live:") ? liveEvery : 300_000),
  );

  // Decouple raw GeoJSON layer data from the 1-second `now` clock so 2D and 3D map layers do not rebuild every second.
  const rawLayers = useMemo(
    () =>
      specs.map((s) => {
        const slot = layerSlots[key(s)];
        const env = slot?.env;
        const srcIds = env?.source.map((r) => r.source_id) ?? [];
        const features = ((env?.data?.features as LayerView["features"] | undefined) ?? EMPTY_FEATURES);
        return {
          spec: s,
          slot,
          env,
          srcIds,
          features,
          fc: (env?.data ?? ({ type: "FeatureCollection", features: EMPTY_FEATURES } as unknown as FeatureCollection)),
        };
      }),
    [specs, layerSlots],
  );

  const layersRef = useRef<LayerView[]>([]);
  const layerDepsRef = useRef<{ rawLayers: typeof rawLayers; cfg: typeof cfg; sources: typeof sources } | null>(null);
  const layers: LayerView[] = useMemo(() => {
    const next = rawLayers.map(({ spec: s, slot, env, srcIds, features }) => ({
      name: s.layer,
      path: s.path,
      title: s.title,
      property: s.property,
      legend: s.legend,
      features,
      asOf: env?.as_of ?? null,
      freshness: layerFreshness({
        asOf: env?.as_of ?? null,
        now: freshnessClock,
        staleAfterSeconds: s.path === "live" ? (cfg?.stale_after_seconds ?? 120) : null,
        failed: !!slot?.error,
        sources: sources.filter((r) => srcIds.includes(r.source_id)),
      }),
      lastOk: slot?.lastOk ?? null,
      loading: !slot || slot.loading,
      sourceIds: srcIds,
      sources: env?.source ?? [],
      tier: env?.reliability_tier ?? null,
    }));
    const prev = layersRef.current;
    const prevDeps = layerDepsRef.current;
    if (
      prevDeps &&
      prevDeps.rawLayers === rawLayers &&
      prevDeps.cfg === cfg &&
      prevDeps.sources === sources &&
      prev.length === next.length &&
      next.every((l, i) => l.freshness === prev[i].freshness)
    ) {
      return prev;
    }
    layerDepsRef.current = { rawLayers, cfg, sources };
    layersRef.current = next;
    return next;
  }, [rawLayers, freshnessClock, cfg, sources]);
  const vehiclesLayer = layers.find((l) => l.name === "vehicles") ?? null;
  const rawVehiclesFeatures = rawLayers.find((r) => r.spec.layer === "vehicles")?.features;
  const liveVehicles = (rawVehiclesFeatures ?? EMPTY_VEHICLES) as unknown as Feature<VehicleProperties>[];

  // ---- buses glide: keep a short track of reports per bus, snapped to route polylines
  const tracks = useRef(new TrackStore());
  const routeFeatures = useMemo(() => {
    const r = rawLayers.find((x) => x.spec.layer === "routes");
    if (r && r.features.length) return r.features as unknown as Feature[];
    return (layerSlots["layers:routes"]?.env?.data?.features ?? EMPTY_FEATURES) as unknown as Feature[];
  }, [rawLayers, layerSlots]);
  const routeIndex = useMemo(() => new RouteShapeIndex(routeFeatures), [routeFeatures]);
  useEffect(() => {
    tracks.current.setRoutes(routeIndex);
  }, [routeIndex]);

  const liveRouteById = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const f of liveVehicles) m.set(f.id, f.properties.route_short_name ?? null);
    return m;
  }, [liveVehicles]);

  const vehEnv = layerSlots["live:vehicles"]?.env;
  useEffect(() => {
    const fs = (vehEnv?.data?.features ?? []) as unknown as Feature<VehicleProperties>[];
    const ids = new Set<number>();
    for (const f of fs) {
      const c = f.geometry?.coordinates as [number, number] | undefined;
      if (!c) continue;
      ids.add(f.id);
      tracks.current.add(f.id, {
        t: Date.parse(f.properties.position_ts) || Date.now(),
        lon: c[0],
        lat: c[1],
        speedMps: f.properties.speed_metres_per_second ?? null,
      });
    }
    tracks.current.retain(ids);
  }, [vehEnv]);

  // Seed the tracks with the last few minutes of reports, so buses glide from the first second instead of
  // waiting at their first report until the 60 s glide clock has two reports to draw between.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !vehEnv) return;
    seeded.current = true;
    api.replay("vehicles", 4).then((env) => {
      for (const tr of env.data?.tracks ?? []) {
        for (const [t, lon, lat] of tr.positions) tracks.current.add(tr.id, { t, lon, lat });
      }
    }).catch(() => { seeded.current = false; /* try again on the next poll */ });
  }, [vehEnv]);

  // ---- replay
  const replayPossible = !!vehiclesLayer;
  const replayP = usePoll(replayPossible ? "replay" : null, (s) => api.replay("vehicles", 30, s), view.lens === "replay" ? 60_000 : null);
  const replay = replayP.env?.data ?? null;
  const replayReady = replayPossible && !replayP.error && !!replay;
  const [replayAt, setReplayAt] = useState(0);
  const replayAtRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const replayFrom = replay ? Date.parse(replay.from) : 0;
  const replayTo = replay ? Date.parse(replay.to) : 0;
  const seekReplay = useCallback((t: number) => {
    replayAtRef.current = t;
    setReplayAt(t);
  }, []);
  useEffect(() => {
    if (view.lens === "replay" && replay) {
      const start = Date.parse(replay.from);
      replayAtRef.current = start;
      setReplayAt(start);
      setPlaying(!reduced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lens, replay?.from]);
  useEffect(() => {
    if (!playing || view.lens !== "replay") return;
    let rafId = 0;
    let lastTs: number | null = null;
    let lastUiSync = 0;
    const step = (ts: number) => {
      if (lastTs === null) {
        lastTs = ts;
        lastUiSync = ts;
        rafId = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(ts - lastTs, 100);
      lastTs = ts;
      const next = replayAtRef.current + dt * speed;
      if (next >= replayTo) {
        replayAtRef.current = replayTo;
        setReplayAt(replayTo);
        setPlaying(false);
        return;
      }
      replayAtRef.current = next;
      if (ts - lastUiSync >= 100) {
        lastUiSync = ts;
        setReplayAt(next);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, replayTo, view.lens]);
  const replayTracks = useMemo(() => {
    const m = new Map<number, { route: string | null; samples: Sample[] }>();
    for (const tr of replay?.tracks ?? []) {
      m.set(tr.id, {
        route: tr.route_short_name ?? null,
        samples: tr.positions.map(([tt, lon, lat]) => ({ t: tt, lon, lat })),
      });
    }
    return m;
  }, [replay]);
  const replayFeatures = useMemo(
    () =>
      (replay?.tracks ?? []).map((tr) => ({
        type: "Feature" as const,
        id: tr.id,
        geometry: { type: "Point", coordinates: tr.positions[0]?.slice(1) ?? [0, 0] },
        properties: {
          kind: "asset" as const,
          sector_id: "S04",
          subsector_id: "TRN-01",
          id: tr.id,
          source_key: tr.label,
          label: tr.label,
          route_short_name: tr.route_short_name,
          headsign: tr.headsign ?? null,
          status: tr.status ?? ("unknown" as const),
          delay_seconds: tr.delay_seconds ?? null,
          next_stop_name: null,
          bearing: null,
          position_ts: replay!.to,
        },
      })) as Feature<VehicleProperties>[],
    [replay],
  );
  const inReplay = view.lens === "replay" && replayReady;

  const glide = !reduced && !inReplay;
  const pausedReplayAt = inReplay && !playing ? replayAt : 0;
  const hasVehiclesLayer = !!vehiclesLayer;
  const vehiclesDim = vehiclesLayer ? vehiclesLayer.freshness === "stale" || vehiclesLayer.freshness === "down" : false;
  const vehicleInput = useMemo(() => {
    if (!hasVehiclesLayer) return null;
    if (inReplay) {
      return {
        features: replayFeatures,
        positionFor: (id: number) => {
          const entry = replayTracks.get(id);
          if (!entry) return null;
          return snapTrackPosition(entry.samples, replayAtRef.current, routeIndex.getIndexed(entry.route));
        },
        dim: false,
      };
    }
    return {
      features: liveVehicles,
      positionFor: (id: number, n: number) => tracks.current.displayPosition(id, n, glide, liveRouteById.get(id)),
      dim: vehiclesDim,
    };
    // pausedReplayAt refreshes vehicleInput when scrubbing Replay while paused without rebuilding on every playback tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVehiclesLayer, liveVehicles, liveRouteById, vehiclesDim, inReplay, replayFeatures, replayTracks, routeIndex, glide, pausedReplayAt]);

  const dimSignature = layers
    .filter((l) => l.name !== "vehicles")
    .map((l) => `${l.name}:${l.freshness === "stale" || l.freshness === "down" ? 1 : 0}`)
    .join("|");
  const mapLayers = useMemo(
    () =>
      rawLayers
        .filter((r) => r.spec.layer !== "vehicles")
        .map((r) => {
          const l = layers.find((x) => x.name === r.spec.layer);
          return { name: r.spec.layer, fc: r.fc, dim: l ? l.freshness === "stale" || l.freshness === "down" : false };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawLayers, dimSignature],
  );

  // ---- numbers for the open story
  const numIds = useMemo(() => (story && story.status === "live" ? storyNumberIds(story) : []), [story]);
  const numberSlots = usePollMany<NumberData>(numIds, (id, s) => api.number(id, s), () => 30_000);
  const numbers: Record<string, NumberData | null> = {};
  for (const id of numIds) numbers[id] = numberSlots[id]?.env?.data ?? null;
  const numbersLoading = numIds.some((id) => !numberSlots[id] || numberSlots[id].loading);

  // ---- selection
  const selectedKey = view.sel ? `${view.sel.kind}:${view.sel.id}` : null;
  const selected = useMemo(() => {
    if (!view.sel) return null;
    const pools: { layer: LayerView | null; features: LayerView["features"] }[] = inReplay
      ? [{ layer: vehiclesLayer, features: replayFeatures as unknown as LayerView["features"] }]
      : [];
    for (const l of layers) pools.push({ layer: l, features: l.features });
    for (const p of pools) {
      const f = p.features.find((x) => x.properties.kind === view.sel!.kind && Number(x.properties.id) === view.sel!.id);
      if (f && p.layer) {
        let props = f.properties;
        if (p.layer.name === "vehicles") {
          const vp = props as unknown as VehicleProperties;
          if (vp.speed_metres_per_second == null) {
            const entry = inReplay ? replayTracks.get(vp.id) : null;
            const est = inReplay
              ? entry
                ? estimatedSpeedMps(entry.samples, routeIndex.get(entry.route))
                : null
              : tracks.current.speedFor(vp.id, vp.route_short_name);
            if (est != null) props = { ...props, speed_metres_per_second: est };
          }
        }
        return { layer: p.layer, props };
      }
    }
    return null;
  }, [view.sel, layers, inReplay, replayFeatures, replayTracks, routeIndex, vehiclesLayer]);

  useEffect(() => setFollowing(false), [selectedKey]);

  const onMapSelect = useCallback(
    (sel: MapSelect | null) => {
      if (!sel) {
        if (view.sel) setView({ sel: null, panel: view.panel === "detail" ? "none" : view.panel });
        return;
      }
      setView({ sel: { kind: sel.kind, id: sel.id }, panel: view.panel === "detail" ? "detail" : view.panel === "list" ? "none" : view.panel });
      if (phone) setSheet((h) => (h === "peek" ? "half" : h));
    },
    [view.sel, view.panel, setView, phone],
  );

  const selectAndShow = useCallback(
    (layerName: string, kind: string, id: number) => {
      const l = layersRef.current.find((x) => x.name === layerName);
      const f = l?.features.find((x) => Number(x.properties.id) === id && x.properties.kind === kind);
      setView({ sel: { kind: kind as never, id }, panel: "none" }, { push: true });
      let at: [number, number] | null = null;
      if (layerName === "vehicles") {
        const routeName = (f?.properties as VehicleProperties | undefined)?.route_short_name ?? liveRouteById.get(id);
        const p = tracks.current.displayPosition(id, Date.now(), glide, routeName);
        if (p) at = [p.lon, p.lat];
      } else if (f) at = anchorOf((f as unknown as Feature).geometry);
      if (at) setTimeout(() => (show3dRef.current ? globeRef.current : mapRef.current)?.flyTo(at![0], at![1], 15.2), 50);
      if (phone) setSheet("half");
    },
    [setView, glide, phone, liveRouteById],
  );

  // ---- navigation
  const openStory = useCallback(
    (id: string) => {
      const s = stories.find((x) => x.id === id);
      const lens: Lens = s && !s.lenses.includes(view.lens) ? (s.lenses[0] ?? "live") : view.lens;
      setView({ story: id, sector: null, sel: null, panel: "none", route: null, lens }, { push: true });
      if (phone) setSheet("half");
    },
    [stories, view.lens, setView, phone],
  );
  const openSector = useCallback((id: string) => setView({ story: null, sector: id, sel: null, panel: "none", route: null, lens: "live" }, { push: true }), [setView]);
  const openCity = useCallback(() => setView({ story: null, sector: null, sel: null, panel: "none", route: null, lens: "live" }, { push: true }), [setView]);
  const setPanel = useCallback((p: typeof view.panel) => setView({ panel: view.panel === p ? "none" : p }, { push: true }), [view.panel, setView]);

  // ---- pins
  const defaultPins = useMemo(() => (register?.sectors ?? []).filter((s) => s.pinned).map((s) => s.sector_id), [register]);
  const [pins, togglePin] = usePins(defaultPins, register?.max_pins ?? 5);
  const pinnedSectors = pins.map((id) => sectorById(id)).filter((s): s is Sector => !!s);

  // ---- search
  const vehiclesStory = useMemo(() => stories.find((s) => storyCfgs[s.id]?.env?.data?.evidence.layers.some((l) => l.layer === "vehicles")) ?? null, [stories, storyCfgs]);
  const searchRouteFeatures = layerSlots["layers:routes"]?.env?.data?.features;
  const searchStopFeatures = layerSlots["layers:stops"]?.env?.data?.features;
  const searchVehicleFeatures = layerSlots["live:vehicles"]?.env?.data?.features as unknown as Feature<VehicleProperties>[] | undefined;
  const searchRefs = useRef({ openStory, openSector, selectAndShow, vehiclesStory, storyId: view.story, specs });
  searchRefs.current = { openStory, openSector, selectAndShow, vehiclesStory, storyId: view.story, specs };
  const searchList: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [];
    for (const s of stories) {
      items.push({ group: "questions", key: `q-${s.id}`, mono: s.id, label: s.question, sub: s.status === "live" ? sectorName(s.sector_id) : statusWord(s.status), run: () => searchRefs.current.openStory(s.id) });
    }
    for (const s of register?.sectors ?? []) {
      items.push({ group: "sectors", key: `s-${s.sector_id}`, label: s.name, sub: s.status === "live" ? t("sectors.questions", { count: s.question_count ?? 0 }) : t("sectors.planned"), run: () => (s.status === "live" ? searchRefs.current.openSector(s.sector_id) : setView({ panel: "sectors" }, { push: true })) });
    }
    for (const f of searchRouteFeatures ?? []) {
      const p = f.properties as Record<string, unknown>;
      const short = String(p.route_short_name ?? "");
      items.push({
        group: "routes", key: `r-${p.id}`, mono: short, label: String(p.route_long_name ?? p.name ?? ""),
        run: () => searchRefs.current.vehiclesStory && setView({ story: searchRefs.current.vehiclesStory.id, sector: null, route: short, sel: null, panel: "none", lens: "live" }, { push: true }),
      });
    }
    for (const f of searchStopFeatures ?? []) {
      const p = f.properties as Record<string, unknown>;
      const at = anchorOf(f.geometry);
      items.push({ group: "stops", key: `st-${p.id}`, mono: String(p.stop_code ?? ""), label: String(p.stop_name ?? p.name ?? ""), run: () => at && (show3dRef.current ? globeRef.current : mapRef.current)?.flyTo(at[0], at[1], 16.5) });
    }
    for (const f of searchVehicleFeatures ?? []) {
      const p = f.properties;
      items.push({
        group: "buses", key: `b-${f.id}`, mono: p.label ?? "", label: busTitle(p),
        run: () => {
          const { vehiclesStory: vs, storyId, specs: curSpecs, selectAndShow: pick } = searchRefs.current;
          if (vs && storyId !== vs.id && !curSpecs.some((s) => s.layer === "vehicles")) setView({ story: vs.id, sector: null }, { push: true });
          pick("vehicles", "asset", f.id);
        },
      });
    }
    return items;
  }, [stories, register, searchRouteFeatures, searchStopFeatures, searchVehicleFeatures, sectorName, setView]);

  // ---- city counts
  const counts: SectorCount[] = useMemo(() => {
    const bySector = new Map<string, SectorCount>();
    for (const l of layers) {
      if (lookFor(l.name).context) continue;
      const spec = specs.find((s) => s.layer === l.name);
      const sec = sectorById(spec?.sectorId);
      if (!sec) continue;
      const c = bySector.get(sec.sector_id) ?? { sector: sec, layers: [] };
      c.layers.push({ name: l.name, title: l.title, count: l.features.length, loading: l.loading });
      bySector.set(sec.sector_id, c);
    }
    return [...bySector.values()];
  }, [layers, specs, sectorById]);

  // ---- legend, trust
  const replayHasStatus = useMemo(
    () => replayFeatures.some((f) => f.properties.status !== "unknown"),
    [replayFeatures],
  );
  const legendEntries: LegendEntry[] = layers
    .filter((l) => !(lookFor(l.name).kind === "stop"))
    .map((l) => ({
      layer: l.name,
      title: l.title,
      statusLegend:
        l.property === "status"
          ? inReplay && l.name === "vehicles" && !replayHasStatus
            ? l.legend.filter((x) => x.value === "unknown")
            : l.legend
          : null,
      freshness: l.freshness,
      asOf: l.asOf,
    }));
  const primary = layers[0] ?? null;
  const rawPrimary = rawLayers[0] ?? null;
  const pinLayersForThreeD = useMemo(
    () =>
      rawLayers
        .filter((r) => {
          const k = lookFor(r.spec.layer).kind;
          return k === "event" || k === "stop";
        })
        .map((r) => {
          const look = lookFor(r.spec.layer);
          return {
            name: r.spec.layer,
            glyph: (look.kind === "stop" ? "stop" : look.glyph) as PinLayer3D["glyph"],
            colour: look.colour,
            dashed: look.dashed,
            features: r.features as unknown as Feature[],
          };
        }),
    [rawLayers],
  );
  // a story whose evidence is not the buses opens in 3D on that evidence
  const fitForThreeD = useMemo(() => {
    if (!view.story || !rawPrimary || rawPrimary.spec.layer === "vehicles" || !rawPrimary.features.length) return null;
    const points = (rawPrimary.features as unknown as Feature[]).map((f) => anchorOf(f.geometry)).filter((p): p is [number, number] => !!p);
    return points.length ? { key: view.story, points } : null;
  }, [view.story, rawPrimary]);
  // One as-of rule for the panel and the map footer: the story's main evidence layer, or, if it has none yet,
  // the newest of the story's numbers. City view: the newest live layer, else the first layer.
  const numbersAsOf = numIds.map((id) => numberSlots[id]?.env?.as_of).filter(Boolean).sort().pop() ?? null;
  const newestAsOf = storyAsOf(primary?.asOf ?? null, numbersAsOf);
  const mapAsOf = view.story ? newestAsOf : (layers.filter((l) => l.path === "live").map((l) => l.asOf).filter(Boolean).sort().pop() ?? primary?.asOf ?? null);
  // the sources whose times the map footer reports: the story's main layer, or in City view the live layer
  const mapAgeSources = view.story ? (primary?.sources ?? []) : (layers.find((l) => l.path === "live")?.sources ?? primary?.sources ?? []);
  const tier = primary?.tier ?? numIds.map((id) => numberSlots[id]?.env?.reliability_tier).find(Boolean) ?? null;

  const decision = threeDDecision({
    three_d_available: !!cfg?.three_d_available,
    cesium_ion_token: cfg?.cesium_ion_token ?? null,
    noIon: NO_ION,
    webgl,
    failed: threeDFailed,
  });
  const can3d = decision.available;
  const show3d = view.view === "3d" && can3d && (!!cfg || NO_ION);
  show3dRef.current = show3d;
  const apiDown = !!storiesP.error && !storiesP.env;

  // a link or a previous story may carry a lens this story does not offer: use the story's first lens
  useEffect(() => {
    if (summary && summary.lenses.length && !summary.lenses.includes(view.lens)) setView({ lens: summary.lenses[0] });
  }, [summary, view.lens, setView]);

  // ---- 2D and 3D keep the place when switching
  const switchView = useCallback(
    (v: "2d" | "3d") => {
      if (v === "3d") {
        const gl = hasWebGL();
        setWebgl(gl);
        if (!gl) return;
        setThreeDFailed(null);
        setStartPlace(mapRef.current?.place() ?? null);
      } else {
        const p = globeRef.current?.place();
        if (p) mapRef.current?.jumpTo(p);
      }
      setView({ view: v });
    },
    [setView],
  );
  const routesForThreeD = useMemo(() => {
    const r = rawLayers.find((x) => x.spec.layer === "routes");
    return r ? (r.features as unknown as Feature[]) : (EMPTY_FEATURES as unknown as Feature[]);
  }, [rawLayers]);
  const vehiclePositionFor = useCallback((id: number, n: number) => vehicleInput?.positionFor(id, n) ?? null, [vehicleInput]);
  const onThreeDFailed = useCallback(
    (reason: ThreeDFailure) => {
      setThreeDFailed(reason);
      setView({ view: "2d" });
    },
    [setView],
  );

  const threeDControl = useMemo(
    () => (show3d ? { zoom: (d: 1 | -1) => globeRef.current?.zoom(d), north: () => globeRef.current?.resetNorth() } : null),
    [show3d],
  );
  const onMapFailed = useCallback(() => setMapFailed(true), []);

  // ---- route filter options
  const routes = useMemo(() => [...new Set(liveVehicles.map((f) => f.properties.route_short_name).filter((x): x is string => !!x))].sort(naturalSort), [liveVehicles]);

  // ---- panels
  const featureCard = useMemo(
    () =>
      selected && view.panel !== "detail" ? (
        <FeatureCard
          layer={selected.layer.name}
          layerTitle={selected.layer.title}
          props={selected.props}
          phone={phone}
          following={following}
          onDetail={() => setView({ panel: "detail" }, { push: true })}
          onFollow={
            selected.layer.name === "vehicles" && !inReplay
              ? () => {
                  const next = !following;
                  setFollowing(next);
                  if (phone) setSheet((s) => sheetOnFollow(s, next));
                }
              : undefined
          }
          onClose={() => setView({ sel: null })}
        />
      ) : null,
    [selected, view.panel, phone, following, setView, inReplay],
  );

  const storyBody = () => {
    if (!summary) {
      if (storySlot?.error) return <p className="error-text" role="alert">{t("story.notFound")}</p>;
      return <AnswerPlate story={null} numbers={{}} loading />;
    }
    const live = summary.status === "live";
    return (
      <>
        <StoryHeading story={summary} sectorName={sectorName(summary.sector_id)} />
        {phone && view.sel && featureCard}
        <AnswerPlate foot={live ? <AnswerFoot asOf={newestAsOf} freshness={primary?.freshness} sources={primary?.sources} /> : undefined} story={story ? { ...story, status: summary.status, status_note: summary.status_note ?? story.status_note } : storySlot?.error ? ({ ...summary, answer: { template: "", numbers: [] }, evidence: { layers: [] }, context: { number_id: "", title: "" }, trust: { source_ids: [] } } as Story) : null} numbers={numbers} loading={numbersLoading} />
        {phone && <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />}
        {live && primary && view.lens !== "replay" && <LegendTiles layer={primary} />}
        {live && view.lens === "replay" && (
          <p className="lens-note">{replayReady ? t("replay.window", { from: formatClock(replayFrom), to: formatClock(replayTo) }) : t("lens.replayNotReady")}</p>
        )}
        {live && routes.length > 0 && view.lens === "live" && (
          <label className="select-field">
            <span className="section-title">{t("story.route")}</span>
            <select value={view.route ?? ""} onChange={(e) => setView({ route: e.target.value || null, sel: null })}>
              <option value="">{t("story.allRoutes")}</option>
              {routes.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </label>
        )}
        {phone && sheet === "peek" && live && <p className="panel-footnote">{t("story.swipe")}</p>}
        {live && story && view.lens === "analytics" && <NumberCards numbers={numbers} ids={story.answer.numbers.filter((id) => !story.answer.template.includes(`{${id}}`))} />}
        {live && story?.context?.number_id && <ContextChart title={story.context.title} number={numbers[story.context.number_id] ?? null} />}
        {live && story && (
          <Trust ageSources={primary?.sources} sourceIds={story.trust.source_ids} sources={sources} asOf={newestAsOf} tier={tier} freshness={primary?.freshness ?? "empty"} onAbout={() => setPanel("sources")} />
        )}
        {!live && <p className="panel-footnote">{t("trust.licence")}</p>}
      </>
    );
  };

  const panelBody = () => {
    if (view.panel === "detail" && view.sel) {
      return (
        <FeatureDetailPanel kind={view.sel.kind} id={view.sel.id} layer={selected?.layer.name ?? ""} layerTitle={selected?.layer.title ?? ""} live={selected?.props ?? null} onBack={() => setView({ panel: "none" })} />
      );
    }
    if (view.story) return <div className="panel-body">{storyBody()}</div>;
    const sec = sectorById(view.sector);
    if (sec) {
      return (
        <>
          <SectorPanel sector={sec} stories={stories} onOpenStory={openStory} />
          {phone && featureCard}
        </>
      );
    }
    return (
      <>
        {phone && featureCard && <div className="panel-body">{featureCard}</div>}
        <CityPanel
          counts={counts}
          stories={stories}
          sectorName={sectorName}
          onOpenStory={openStory}
          onOpenSector={openSector}
          foot={<AnswerFoot asOf={mapAsOf} freshness={vehiclesLayer?.freshness} />}
          afterHead={
            phone ? (
              <div className="sheet-lens">
                <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />
                <Legend entries={legendEntries} compact />
              </div>
            ) : null
          }
        />
      </>
    );
  };

  const overlays = (
    <>
      {view.panel === "list" && <ListView layers={layers} selectedKey={selectedKey} onSelect={selectAndShow} onClose={() => setView({ panel: "none" }, { push: true })} />}
      {view.panel === "sectors" && (
        <SectorsBrowser register={register} error={!!sectorsP.error} pins={pins} onTogglePin={togglePin} phone={phone} onOpen={(id) => openSector(id)} onClose={() => setView({ panel: "none" }, { push: true })} />
      )}
      {view.panel === "sources" && <SourcesPanel rows={sources} error={!!sourcesP.error} onClose={() => setView({ panel: "none" }, { push: true })} />}
    </>
  );

  const search = (
    <Search items={searchList} onFocus={() => setSearchWanted(true)} placeholder={phone ? t("search.placeholderShort") : t("search.placeholder")} compact={phone} />
  );
  const viewSwitch = (compact: boolean) => (
    <ViewSwitch view={show3d ? "3d" : "2d"} can3d={can3d} note={decision.reason ? t(`view.why.${decision.reason}`) : null} compact={compact} onChange={switchView} />
  );

  const profileSwitch = show3d ? (
    <div className="map-3d-switches">
      <label className="profile-switch">
        <span>{t("view.detail")}</span>
        <select
          value={profileChoice ?? "auto"}
          onChange={(e) => {
            const v = e.target.value === "auto" ? null : (e.target.value as ProfileName);
            setProfileChoice(v);
            saveProfile(v);
          }}
        >
          <option value="auto">{autoProfile ? t("view.detailAuto", { level: t(`view.detail.${autoProfile}`) }) : t("view.detailAutoShort")}</option>
          <option value="high">{t("view.detail.high")}</option>
          <option value="medium">{t("view.detail.medium")}</option>
          <option value="low">{t("view.detail.low")}</option>
        </select>
      </label>
      <label className="profile-switch">
        <span>{t("view.streetMode")}</span>
        <select
          value={streetTwinMode}
          onChange={(e) => {
            const v = e.target.value as StreetTwinMode;
            setStreetTwinMode(v);
            saveStreetTwinMode(v);
          }}
        >
          <option value="auto">{t("view.street.auto")}</option>
          <option value="clean">{t("view.street.clean")}</option>
          <option value="photo">{t("view.street.photo")}</option>
        </select>
      </label>
    </div>
  ) : null;

  const map = (
    <MapView
      threeD={threeDControl}
      ref={mapRef}
      dark={dark}
      phone={phone}
      layers={mapLayers}
      vehicles={show3d ? null : vehicleInput}
      selectedKey={selectedKey}
      routeFilter={view.route}
      highlightRoute={view.route ?? (selected?.layer.name === "vehicles" ? ((selected.props.route_short_name as string | null) ?? null) : null)}
      follow={following}
      glide={glide || (inReplay && playing)}
      reducedMotion={reduced}
      hidden={view.panel === "list" && !phone}
      onSelect={onMapSelect}
      onBasemap={setBasemapOk}
      onMapFailed={onMapFailed}
      popup={!phone && !show3d ? featureCard : null}
    >
      {!phone && (
        <div className="map-top-left">
          <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />
        </div>
      )}
      {!phone && <Legend entries={legendEntries} />}
      {!phone && profileSwitch}
      {inReplay && <ReplayBar from={replayFrom} to={replayTo} at={replayAt} playing={playing} speed={speed} onSeek={seekReplay} onPlay={() => setPlaying((p) => !p)} onSpeed={setSpeed} />}
      <Credits asOf={mapAsOf} basemapOk={basemapOk} threeD={show3d} sources={mapAgeSources} />
      {mapFailed && (
        <div className="map-banner" role="alert">
          <Icon name="warning" size={18} /> {t("map.noWebgl")}
          <button type="button" className="btn btn-secondary" onClick={() => setView({ panel: "list" }, { push: true })}>{t("view.list")}</button>
        </div>
      )}
      {apiDown && (
        <div className="map-banner" role="alert">
          <Icon name="warning" size={18} /> {t("error.api")}
          <button type="button" className="btn btn-secondary" onClick={() => { storiesP.refresh(); sectorsP.refresh(); sourcesP.refresh(); cfgP.refresh(); }}>{t("error.retry")}</button>
        </div>
      )}
    </MapView>
  );

  const globe = show3d ? (
    <Suspense fallback={<p className="globe-loading" role="status">{t("view.3dLoading")}</p>}>
      <Globe3D
        ref={globeRef}
        token={NO_ION ? null : (cfg?.cesium_ion_token ?? null)}
        noIon={NO_ION}
        assetId={cfg?.cesium_photorealistic_asset_id ?? 2275207}
        profileChoice={profileChoice}
        streetTwinMode={streetTwinMode}
        onAutoProfile={setAutoProfile}
        vehicles={vehicleInput?.features ?? EMPTY_VEHICLES}
        positionFor={vehiclePositionFor}
        routes={routesForThreeD}
        pinLayers={pinLayersForThreeD}
        fit={fitForThreeD}
        highlightRoute={view.route ?? (selected?.layer.name === "vehicles" ? ((selected.props.route_short_name as string | null) ?? null) : null)}
        glide={glide || (inReplay && playing)}
        selectedKey={selectedKey}
        following={following}
        reducedMotion={reduced}
        startPlace={startPlace}
        phone={phone}
        popup={!phone ? featureCard : null}
        onSelect={onMapSelect}
        onFailed={onThreeDFailed}
      />
    </Suspense>
  ) : null;



  // belt and braces for browsers without overflow: clip: put the phone frame back if anything scrolls it
  useEffect(() => {
    if (!phone) return;
    const el = document.querySelector<HTMLElement>(".app--phone");
    if (!el) return;
    const reset = () => {
      if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0);
    };
    el.addEventListener("scroll", reset);
    return () => el.removeEventListener("scroll", reset);
  }, [phone]);

  useEffect(() => {
    document.title = summary ? `${summary.id}: ${summary.question} | ${t("app.name")}` : t("app.name");
  }, [summary]);

  if (phone) {
    return (
      <div className="app--phone">
        <main className={`stage${show3d ? " is-3d" : ""}`} id="map" data-sheet={sheet}>
          {map}
          {globe}
          <div className="phone-top">
            {search}
            <ChipRow pinned={pinnedSectors} active={activeSector} onCity={openCity} onSector={openSector} onAll={() => setView({ panel: "sectors" }, { push: true })} />
          </div>
          <p className={`phone-attrib phone-attrib--${sheet}`}>{show3d ? t("credits.3d") : basemapOk === false ? t("map.basemapFallback") : t("credits.short")}</p>
          <div className="phone-tools">
            {viewSwitch(true)}
            <button type="button" className="ctl ctl--text ctl--list" onClick={() => setPanel("list")}>
              <Icon name="list" size={18} /> {t("view.listShort")}
            </button>
          </div>
        </main>
        <BottomSheet height={sheet} onHeight={setSheet} reducedMotion={reduced}>
          {panelBody()}
          <p className="sheet-credits">
            {mapAsOf ? <><AgeLine sources={mapAgeSources} asOf={mapAsOf} /> · </> : ""}
            {show3d ? t("credits.3d") : basemapOk === false ? t("map.basemapFallback") : t("credits.short")} · {t("credits.licenceShort")}
          </p>
        </BottomSheet>
        {overlays}
      </div>
    );
  }

  return (
    <div className="app">
      <a className="skip" href="#map">{t("app.skip")}</a>
      <TopBar search={search} viewSwitch={viewSwitch(false)} listOpen={view.panel === "list"} onList={() => setPanel("list")} />
      <Rail
        pinned={pinnedSectors}
        active={activeSector}
        onCity={openCity}
        onSector={openSector}
        onAll={() => setPanel("sectors")}
        onSources={() => setPanel("sources")}
        allOpen={view.panel === "sectors"}
        sourcesOpen={view.panel === "sources"}
      />
      <main className={`stage${show3d ? " is-3d" : ""}`} id="map" tabIndex={-1}>
        {map}
        {globe}
        {overlays}
      </main>
      <aside className="side" aria-label={t("sheet.label")}>
        {panelBody()}
      </aside>
    </div>
  );
}

export { featureName };
