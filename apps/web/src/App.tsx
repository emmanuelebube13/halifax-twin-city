import { ago } from "./lib/ago";
// The map shell. It reads the story register, sector register and sources from the API, decides which layers
// to draw (City view: each live story's main layer; a sector: its stories' main layers; a story: its evidence
// layers), and lays out the rail, map and panel (laptop) or chips, map and sheet (phone).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, api } from "./api/client";
import { useMediaQuery, useNow, usePoll } from "./api/hooks";
import { usePollMany } from "./api/pollMany";
import type { Feature, FeatureCollection, Lens, NumberData, Sector, Story, StorySummary, VehicleProperties } from "./api/types";
import { t } from "./i18n";
import { formatClock } from "./lib/format";
import { TrackStore, positionAt, type Sample } from "./lib/glide";
import { layerFreshness, onTimeRuleFrom } from "./lib/status";
import { storyNumberIds } from "./lib/story";
import { usePins, useView } from "./lib/useView";
import { Globe3D } from "./map/Globe3D";
import { MapView, type MapHandle, type MapSelect } from "./map/MapView";
import { featureName, lookFor, anchorOf } from "./map/registry";
import { BottomSheet, ChipRow, Credits, LensSwitch, Legend, Rail, ReplayBar, Search, TopBar, ViewSwitch, type LegendEntry, type SearchItem, type SheetHeight } from "./components/chrome";
import { Icon } from "./components/icons";
import { ListView, SectorsBrowser, SourcesPanel } from "./components/overlays";
import { CityPanel, FeatureCard, FeatureDetailPanel, SectorPanel, busTitle, type SectorCount } from "./components/panels";
import { AnswerPlate, ContextChart, LegendTiles, NumberCards, StoryHeading, Trust, statusWord, type LayerView } from "./components/story";

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

export function App() {
  const [view, setView] = useView();
  const phone = useMediaQuery("(max-width: 767px)");
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const now = useNow(1000);
  const mapRef = useRef<MapHandle>(null);
  const [following, setFollowing] = useState(false);
  const [sheet, setSheet] = useState<SheetHeight>("peek");
  const [basemapOk, setBasemapOk] = useState<boolean | null>(null);
  const [searchWanted, setSearchWanted] = useState(false);
  const [threeDFailed, setThreeDFailed] = useState(false);

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

  const layers: LayerView[] = useMemo(
    () =>
      specs.map((s) => {
        const slot = layerSlots[key(s)];
        const env = slot?.env;
        const srcIds = env?.source.map((r) => r.source_id) ?? [];
        return {
          name: s.layer,
          path: s.path,
          title: s.title,
          property: s.property,
          legend: s.legend,
          features: (env?.data?.features ?? []) as LayerView["features"],
          asOf: env?.as_of ?? null,
          freshness: layerFreshness({
            asOf: env?.as_of ?? null,
            now,
            staleAfterSeconds: s.path === "live" ? (cfg?.stale_after_seconds ?? 120) : null,
            failed: !!slot?.error,
            sources: sources.filter((r) => srcIds.includes(r.source_id)),
          }),
          lastOk: slot?.lastOk ?? null,
          loading: !slot || slot.loading,
          sourceIds: srcIds,
          tier: env?.reliability_tier ?? null,
        };
      }),
    [specs, layerSlots, now, cfg, sources],
  );
  const vehiclesLayer = layers.find((l) => l.name === "vehicles") ?? null;
  const liveVehicles = (vehiclesLayer?.features ?? []) as unknown as Feature<VehicleProperties>[];

  // ---- buses glide: keep a short track of reports per bus
  const tracks = useRef(new TrackStore());
  const vehEnv = layerSlots["live:vehicles"]?.env;
  useEffect(() => {
    const fs = (vehEnv?.data?.features ?? []) as unknown as Feature<VehicleProperties>[];
    const ids = new Set<number>();
    for (const f of fs) {
      const c = f.geometry?.coordinates as [number, number] | undefined;
      if (!c) continue;
      ids.add(f.id);
      tracks.current.add(f.id, { t: Date.parse(f.properties.position_ts) || Date.now(), lon: c[0], lat: c[1] });
    }
    tracks.current.retain(ids);
  }, [vehEnv]);

  // ---- replay
  const replayPossible = !!vehiclesLayer;
  const replayP = usePoll(replayPossible ? "replay" : null, (s) => api.replay("vehicles", 30, s), view.lens === "replay" ? 60_000 : null);
  const replay = replayP.env?.data ?? null;
  const replayReady = replayPossible && !replayP.error && !!replay;
  const [replayAt, setReplayAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const replayFrom = replay ? Date.parse(replay.from) : 0;
  const replayTo = replay ? Date.parse(replay.to) : 0;
  useEffect(() => {
    if (view.lens === "replay" && replay) {
      setReplayAt(Date.parse(replay.from));
      setPlaying(!reduced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lens, replay?.from]);
  useEffect(() => {
    if (!playing || view.lens !== "replay") return;
    const id = setInterval(() => {
      setReplayAt((a) => {
        const next = a + 250 * speed;
        if (next >= replayTo) {
          setPlaying(false);
          return replayTo;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed, replayTo, view.lens]);
  const replayTracks = useMemo(() => {
    const m = new Map<number, Sample[]>();
    for (const tr of replay?.tracks ?? []) m.set(tr.id, tr.positions.map(([tt, lon, lat]) => ({ t: tt, lon, lat })));
    return m;
  }, [replay]);
  const replayFeatures = useMemo(
    () =>
      (replay?.tracks ?? []).map((tr) => ({
        type: "Feature" as const,
        id: tr.id,
        geometry: { type: "Point", coordinates: tr.positions[0]?.slice(1) ?? [0, 0] },
        properties: {
          kind: "asset" as const, sector_id: "S04", subsector_id: "TRN-01", id: tr.id, source_key: tr.label, label: tr.label, route_short_name: tr.route_short_name,
          headsign: null, status: "unknown" as const, delay_seconds: null, next_stop_name: null, bearing: null, position_ts: replay!.to,
        },
      })) as Feature<VehicleProperties>[],
    [replay],
  );
  const inReplay = view.lens === "replay" && replayReady;
  const replayAtRef = useRef(replayAt);
  replayAtRef.current = replayAt;

  const glide = !reduced && !inReplay;
  const vehicleInput = useMemo(() => {
    if (!vehiclesLayer) return null;
    if (inReplay) {
      return { features: replayFeatures, positionFor: (id: number) => positionAt(replayTracks.get(id) ?? [], replayAtRef.current), dim: false };
    }
    return { features: liveVehicles, positionFor: (id: number, n: number) => tracks.current.displayPosition(id, n, glide), dim: vehiclesLayer.freshness === "stale" || vehiclesLayer.freshness === "down" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclesLayer?.features, vehiclesLayer?.freshness, inReplay, replayFeatures, replayTracks, glide]);

  const mapLayers = useMemo(
    () => layers.filter((l) => l.name !== "vehicles").map((l) => ({ name: l.name, fc: ({ type: "FeatureCollection", features: l.features } as unknown) as FeatureCollection, dim: l.freshness === "stale" || l.freshness === "down" })),
    [layers],
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
      if (f && p.layer) return { layer: p.layer, props: f.properties };
    }
    return null;
  }, [view.sel, layers, inReplay, replayFeatures, vehiclesLayer]);

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
      const l = layers.find((x) => x.name === layerName);
      const f = l?.features.find((x) => Number(x.properties.id) === id && x.properties.kind === kind);
      setView({ sel: { kind: kind as never, id }, panel: "none" }, { push: true });
      let at: [number, number] | null = null;
      if (layerName === "vehicles") {
        const p = tracks.current.displayPosition(id, Date.now(), glide);
        if (p) at = [p.lon, p.lat];
      } else if (f) at = anchorOf((f as unknown as Feature).geometry);
      if (at) setTimeout(() => mapRef.current?.flyTo(at![0], at![1], 15.2), 50);
      if (phone) setSheet("half");
    },
    [layers, setView, glide, phone],
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
  const searchList: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [];
    for (const s of stories) {
      items.push({ group: "questions", key: `q-${s.id}`, mono: s.id, label: s.question, sub: s.status === "live" ? sectorName(s.sector_id) : statusWord(s.status), run: () => openStory(s.id) });
    }
    for (const s of register?.sectors ?? []) {
      items.push({ group: "sectors", key: `s-${s.sector_id}`, label: s.name, sub: s.status === "live" ? t("sectors.questions", { count: s.question_count ?? 0 }) : t("sectors.planned"), run: () => (s.status === "live" ? openSector(s.sector_id) : setView({ panel: "sectors" }, { push: true })) });
    }
    for (const f of layerSlots["layers:routes"]?.env?.data?.features ?? []) {
      const p = f.properties as Record<string, unknown>;
      const short = String(p.route_short_name ?? "");
      items.push({
        group: "routes", key: `r-${p.id}`, mono: short, label: String(p.route_long_name ?? p.name ?? ""),
        run: () => vehiclesStory && setView({ story: vehiclesStory.id, sector: null, route: short, sel: null, panel: "none", lens: "live" }, { push: true }),
      });
    }
    for (const f of layerSlots["layers:stops"]?.env?.data?.features ?? []) {
      const p = f.properties as Record<string, unknown>;
      const at = anchorOf(f.geometry);
      items.push({ group: "stops", key: `st-${p.id}`, mono: String(p.stop_code ?? ""), label: String(p.stop_name ?? p.name ?? ""), run: () => at && mapRef.current?.flyTo(at[0], at[1], 16.5) });
    }
    for (const f of (layerSlots["live:vehicles"]?.env?.data?.features ?? []) as unknown as Feature<VehicleProperties>[]) {
      const p = f.properties;
      items.push({
        group: "buses", key: `b-${f.id}`, mono: p.label ?? "", label: busTitle(p),
        run: () => {
          if (vehiclesStory && view.story !== vehiclesStory.id && !specs.some((s) => s.layer === "vehicles")) setView({ story: vehiclesStory.id, sector: null }, { push: true });
          selectAndShow("vehicles", "asset", f.id);
        },
      });
    }
    return items;
  }, [stories, register, layerSlots, sectorName, openStory, openSector, setView, vehiclesStory, view.story, specs, selectAndShow]);

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
  const legendEntries: LegendEntry[] = layers
    .filter((l) => !(lookFor(l.name).kind === "stop"))
    .map((l) => ({
      layer: l.name,
      title: l.title,
      statusLegend: l.property === "status" ? (inReplay && l.name === "vehicles" ? l.legend.filter((x) => x.value === "unknown") : l.legend) : null,
      freshness: l.freshness,
      asOf: l.asOf,
    }));
  const primary = layers[0] ?? null;
  const newestAsOf = [primary?.asOf, ...numIds.map((id) => numberSlots[id]?.env?.as_of)].filter(Boolean).sort().pop() ?? null;
  const mapAsOf = layers.filter((l) => l.path === "live").map((l) => l.asOf).filter(Boolean).sort().pop() ?? primary?.asOf ?? null;
  const tier = primary?.tier ?? numIds.map((id) => numberSlots[id]?.env?.reliability_tier).find(Boolean) ?? null;

  const can3d = !!(cfg?.three_d_available && cfg.cesium_ion_token) && !threeDFailed;
  const show3d = view.view === "3d" && can3d;
  const apiDown = !!storiesP.error && !storiesP.env;

  // ---- route filter options
  const routes = useMemo(() => [...new Set(liveVehicles.map((f) => f.properties.route_short_name).filter((x): x is string => !!x))].sort(naturalSort), [liveVehicles]);

  // ---- panels
  const featureCard =
    selected && view.panel !== "detail" ? (
      <FeatureCard
        layer={selected.layer.name}
        layerTitle={selected.layer.title}
        props={selected.props}
        now={now}
        phone={phone}
        following={following}
        onDetail={() => setView({ panel: "detail" }, { push: true })}
        onFollow={selected.layer.name === "vehicles" && !inReplay ? () => setFollowing((f) => !f) : undefined}
        onClose={() => setView({ sel: null })}
      />
    ) : null;

  const storyBody = () => {
    if (!summary) {
      if (storySlot?.error) return <p className="error-text" role="alert">{t("story.notFound")}</p>;
      return <AnswerPlate story={null} numbers={{}} loading />;
    }
    const live = summary.status === "live";
    return (
      <>
        <StoryHeading story={summary} sectorName={sectorName(summary.sector_id)} />
        {phone && <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />}
        <AnswerPlate story={story ? { ...story, status: summary.status, status_note: summary.status_note ?? story.status_note } : storySlot?.error ? ({ ...summary, answer: { template: "", numbers: [] }, evidence: { layers: [] }, context: { number_id: "", title: "" }, trust: { source_ids: [] } } as Story) : null} numbers={numbers} loading={numbersLoading} />
        {live && primary && view.lens !== "replay" && <LegendTiles layer={primary} />}
        {phone && featureCard}
        {live && view.lens === "replay" && (
          <p className="lens-note">{replayReady ? t("lens.replay") + `: ${formatClock(replayFrom)} to ${formatClock(replayTo)}` : t("lens.replayNotReady")}</p>
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
        {live && story && view.lens === "analytics" && <NumberCards numbers={numbers} ids={story.answer.numbers} />}
        {live && story?.context?.number_id && <ContextChart title={story.context.title} number={numbers[story.context.number_id] ?? null} />}
        {live && story && (
          <Trust sourceIds={story.trust.source_ids} sources={sources} asOf={newestAsOf} tier={tier} freshness={primary?.freshness ?? "empty"} now={now} onAbout={() => setPanel("sources")} />
        )}
        {!live && <p className="panel-footnote">{t("trust.licence")}</p>}
      </>
    );
  };

  const panelBody = () => {
    if (view.panel === "detail" && view.sel) {
      return (
        <FeatureDetailPanel kind={view.sel.kind} id={view.sel.id} layer={selected?.layer.name ?? ""} layerTitle={selected?.layer.title ?? ""} now={now} onBack={() => setView({ panel: "none" })} />
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
        <CityPanel counts={counts} stories={stories} sectorName={sectorName} onOpenStory={openStory} onOpenSector={openSector} />
      </>
    );
  };

  const overlays = (
    <>
      {view.panel === "list" && <ListView layers={layers} now={now} selectedKey={selectedKey} onSelect={selectAndShow} onClose={() => setView({ panel: "none" }, { push: true })} />}
      {view.panel === "sectors" && (
        <SectorsBrowser register={register} error={!!sectorsP.error} pins={pins} onTogglePin={togglePin} phone={phone} onOpen={(id) => openSector(id)} onClose={() => setView({ panel: "none" }, { push: true })} />
      )}
      {view.panel === "sources" && <SourcesPanel rows={sources} error={!!sourcesP.error} now={now} apiBase={API_BASE} onClose={() => setView({ panel: "none" }, { push: true })} />}
    </>
  );

  const search = (
    <Search items={searchList} onFocus={() => setSearchWanted(true)} placeholder={phone ? t("search.placeholderShort") : t("search.placeholder")} compact={phone} />
  );
  const viewSwitch = (compact: boolean) => (
    <ViewSwitch view={show3d ? "3d" : "2d"} can3d={can3d} note={threeDFailed ? t("view.3dFailed") : (cfg?.three_d_note ?? null)} compact={compact} onChange={(v) => setView({ view: v })} />
  );

  const map = (
    <MapView
      ref={mapRef}
      dark={dark}
      phone={phone}
      layers={mapLayers}
      vehicles={vehicleInput}
      selectedKey={selectedKey}
      routeFilter={view.route}
      follow={following}
      glide={glide || inReplay}
      reducedMotion={reduced}
      hidden={view.panel === "list" && !phone}
      onSelect={onMapSelect}
      onBasemap={setBasemapOk}
      popup={!phone ? featureCard : null}
    >
      {!phone && (
        <div className="map-top-left">
          <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />
        </div>
      )}
      {!phone && <Legend entries={legendEntries} />}
      {inReplay && <ReplayBar from={replayFrom} to={replayTo} at={replayAt} playing={playing} speed={speed} onSeek={setReplayAt} onPlay={() => setPlaying((p) => !p)} onSpeed={setSpeed} />}
      <Credits asOf={mapAsOf} now={now} basemapOk={basemapOk} threeD={show3d} />
      {apiDown && (
        <div className="map-banner" role="alert">
          <Icon name="warning" size={18} /> {t("error.api")}
          <button type="button" className="btn btn-secondary" onClick={() => { storiesP.refresh(); sectorsP.refresh(); sourcesP.refresh(); cfgP.refresh(); }}>{t("error.retry")}</button>
        </div>
      )}
    </MapView>
  );

  const globe = show3d && cfg?.cesium_ion_token ? (
    <Globe3D
      token={cfg.cesium_ion_token}
      assetId={cfg.cesium_photorealistic_asset_id ?? 2275207}
      vehicles={vehicleInput?.features ?? []}
      positionFor={(id, n) => vehicleInput?.positionFor(id, n) ?? null}
      selectedKey={selectedKey}
      reducedMotion={reduced}
      onSelect={(s) => onMapSelect(s)}
      onFailed={() => {
        setThreeDFailed(true);
        setView({ view: "2d" });
      }}
    />
  ) : null;

  useEffect(() => {
    document.title = summary ? `${summary.id}: ${summary.question} | ${t("app.name")}` : t("app.name");
  }, [summary]);

  if (phone) {
    return (
      <div className="app--phone">
        <main className="stage" id="map">
          {map}
          {globe}
          <div className="phone-top">
            {search}
            <ChipRow pinned={pinnedSectors} active={activeSector} onCity={openCity} onSector={openSector} onAll={() => setView({ panel: "sectors" }, { push: true })} />
          </div>
          <div className="phone-tools">
            {viewSwitch(true)}
            <button type="button" className="ctl" aria-label={t("view.list")} title={t("view.list")} onClick={() => setPanel("list")}>
              <Icon name="list" size={22} />
            </button>
          </div>
        </main>
        <BottomSheet height={sheet} onHeight={setSheet} reducedMotion={reduced}>
          <p className="sheet-credits">
            {mapAsOf ? `${t("age.updated", { age: ago(mapAsOf, now) })} · ` : ""}
            {show3d ? "Google, Cesium ion" : basemapOk === false ? t("map.basemapFallback") : "© OpenStreetMap, Protomaps"} · OGL Halifax
          </p>
          {!view.story && view.panel !== "detail" && (
            <div className="sheet-lens">
              <LensSwitch lens={view.lens} story={summary} replayReady={replayReady} live={vehiclesLayer?.freshness === "fresh"} onChange={(l) => setView({ lens: l })} />
              <Legend entries={legendEntries} compact />
            </div>
          )}
          {panelBody()}
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
      <main className="stage" id="map" tabIndex={-1}>
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
