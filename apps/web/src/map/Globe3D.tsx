// Realistic 3D: CesiumJS with Google Photorealistic 3D Tiles through Cesium ion. This module and CesiumJS load
// only when the user picks 3D (React.lazy in App; CesiumJS's prebuilt bundle by script tag), so 2D start-up does
// not grow. The ion token arrives from the API's client-config (localhost only) and lives in memory only: it is
// never stored, logged, put in a URL by this app, or shown.
//
// Speed: render on demand (requestRenderMode) and ask for a frame only when data arrives, a bus glides or the
// camera moves; device profiles tune tile detail, pixel ratio, cache, preloading and anti-aliasing.
//
// Buses: three levels. Near: the textured model with wheels. Middle: a textured box. Far: the 2D pin image as a
// billboard. A badge with the status shape and route number floats above the models so status reads by shape
// and colour over photo buildings. Heights come from one sample per GPS report, never per frame per bus.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type * as CesiumNS from "cesium";
import type { Feature, VehicleProperties } from "../api/types";
import { t } from "../i18n";
import { CAMERA_LIMITS, HALIFAX_3D_START, clampCameraPosition, clampOrbit, orbitToPlace, placeToOrbit, type Orbit, type Place } from "../lib/camera";
import { resolutionScaleFor, type Profile3D } from "../lib/profile";
import { busStatus } from "../lib/status";
import type { ThreeDFailure } from "../lib/threeD";
import { COLOURS, PIXEL_RATIO, busRenderImage, buildPinImages, drawBusBadge, drawBusPin, drawCluster } from "./pins";
import { clusterScreenPoints } from "./declutter";

type Cesium = typeof CesiumNS;

declare global {
  interface Window {
    Cesium?: Cesium;
    CESIUM_BASE_URL?: string;
    /** Numbers only, for the performance runs: never the token. */
    __globe3d?: Globe3DMetrics;
  }
}

export interface Globe3DMetrics {
  mode: "ion" | "plain";
  profile: string;
  startedAt: number;
  firstFrameMs: number | null;
  tilesLoaded: number;
  tilesFailed: number;
  frames: number;
  buses: number;
}

let loading: Promise<Cesium> | null = null;

function loadCesium(): Promise<Cesium> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (loading) return loading;
  const base = `${import.meta.env.BASE_URL}cesium/`;
  window.CESIUM_BASE_URL = base;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${base}Widgets/widgets.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `${base}Cesium.js`;
    s.async = true;
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface Globe3DHandle {
  zoom: (direction: 1 | -1) => void;
  resetNorth: () => void;
  place: () => Place | null;
}

interface Props {
  /** Null in the developer globe (no ion). */
  token: string | null;
  noIon: boolean;
  assetId: number;
  profile: Profile3D;
  vehicles: Feature<VehicleProperties>[];
  positionFor: (id: number, now: number) => { lon: number; lat: number } | null;
  /** Buses are moving on the glide clock: keep asking for frames. */
  glide: boolean;
  selectedKey: string | null;
  following: boolean;
  reducedMotion: boolean;
  startPlace: Place | null;
  /** Route lines (GeoJSON features), draped on the tiles as one ground primitive. */
  routes: Feature[];
  highlightRoute: string | null;
  popup?: ReactNode;
  onSelect: (sel: { kind: "asset"; id: number; layer: string } | null) => void;
  onFailed: (reason: ThreeDFailure) => void;
  onPlace?: (p: Place) => void;
}

interface BusPrims {
  near: CesiumNS.Model | null;
  mid: CesiumNS.Model | null;
  badge: CesiumNS.Billboard;
  far: CesiumNS.Billboard;
  badgeKey: string;
  farKey: string;
  height: number | null;
  heightAt: number; // report time the height belongs to
  bearing: number;
  last: { lon: number; lat: number } | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

const Globe3D = forwardRef<Globe3DHandle, Props>(function Globe3D(props, ref) {
  const el = useRef<HTMLDivElement>(null);
  const creditsEl = useRef<HTMLDivElement>(null);
  const popupEl = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const tilesetRef = useRef<CesiumNS.Cesium3DTileset | null>(null);
  const busesRef = useRef(new Map<number, BusPrims>());
  const drawRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  // ---- create the viewer once
  useEffect(() => {
    let viewer: CesiumNS.Viewer | null = null;
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    const metrics: Globe3DMetrics = { mode: propsRef.current.noIon ? "plain" : "ion", profile: propsRef.current.profile.name, startedAt: performance.now(), firstFrameMs: null, tilesLoaded: 0, tilesFailed: 0, frames: 0, buses: 0 };
    window.__globe3d = metrics;
    const fail = (reason: ThreeDFailure) => {
      if (cancelled) return;
      cancelled = true;
      propsRef.current.onFailed(reason);
    };

    (async () => {
      let C: Cesium;
      try {
        C = await loadCesium();
      } catch {
        return fail("load");
      }
      if (cancelled || !el.current) return;
      const p = propsRef.current;
      const prof = p.profile;
      try {
        viewer = new C.Viewer(el.current, {
          baseLayer: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          scene3DOnly: true,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          msaaSamples: prof.msaaSamples,
          useBrowserRecommendedResolution: false,
          shadows: prof.shadows,
          orderIndependentTranslucency: false,
          creditContainer: creditsEl.current ?? undefined,
          contextOptions: { webgl: { powerPreference: prof.name === "low" ? "low-power" : "high-performance" } },
        });
      } catch {
        return fail("no-webgl");
      }
      viewerRef.current = viewer;
      const scene = viewer.scene;
      applyProfile(C, viewer, null, prof);
      scene.postRender.addEventListener(() => {
        metrics.frames++;
        placePopup();
      });

      // camera limits: no space, no underground, Halifax only
      const sscc = scene.screenSpaceCameraController;
      sscc.minimumZoomDistance = CAMERA_LIMITS.minRange;
      sscc.maximumZoomDistance = CAMERA_LIMITS.maxRange;
      sscc.enableCollisionDetection = true;
      scene.camera.percentageChanged = 0.05;
      scene.camera.changed.addEventListener(() => keepCameraInside(C, viewer!));
      scene.camera.moveEnd.addEventListener(() => {
        const pl = currentPlace(C, viewer!);
        if (pl) propsRef.current.onPlace?.(pl);
      });

      // start where the 2D map was; a flat 2D view opens tilted so the buildings stand up
      const h = el.current.clientHeight || 800;
      let orbit: Orbit = p.startPlace ? placeToOrbit(p.startPlace, h) : HALIFAX_3D_START;
      if (p.startPlace && p.startPlace.pitch < 20) orbit = clampOrbit({ ...orbit, pitch: -40 });
      setOrbit(C, viewer, orbit);

      if (p.noIon) {
        // developer globe: plain fog-coloured ground, no tiles, no ion requests
        scene.globe.show = true;
        scene.globe.baseColor = C.Color.fromCssColorString("#dfe3dd");
        scene.globe.showGroundAtmosphere = false;
        metrics.firstFrameMs = performance.now() - metrics.startedAt;
      } else {
        scene.globe.show = false;
        C.Ion.defaultAccessToken = p.token ?? "";
        try {
          const tileset = await C.Cesium3DTileset.fromIonAssetId(p.assetId, {
            maximumScreenSpaceError: prof.maximumScreenSpaceError,
            cacheBytes: prof.cacheBytes,
            maximumCacheOverflowBytes: prof.cacheBytes / 2,
            preloadWhenHidden: prof.preloadWhenHidden,
            preloadFlightDestinations: prof.preloadFlightDestinations,
            loadSiblings: prof.loadSiblings,
            skipLevelOfDetail: prof.skipLevelOfDetail,
            dynamicScreenSpaceError: true,
            foveatedScreenSpaceError: true,
            showCreditsOnScreen: true,
          });
          if (cancelled) return;
          tilesetRef.current = tileset;
          scene.primitives.add(tileset);
          tileset.tileLoad.addEventListener(() => {
            metrics.tilesLoaded++;
          });
          tileset.tileFailed.addEventListener(() => {
            metrics.tilesFailed++;
            if (metrics.firstFrameMs === null && metrics.tilesFailed > 12) fail("tiles");
          });
          tileset.initialTilesLoaded.addEventListener(() => {
            if (metrics.firstFrameMs === null) metrics.firstFrameMs = performance.now() - metrics.startedAt;
            if (failTimer) clearTimeout(failTimer);
            refreshHeights(true);
            scene.requestRender();
          });
          failTimer = setTimeout(() => {
            if (metrics.firstFrameMs === null) fail("timeout");
          }, 45_000);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          return fail(code === 401 || code === 403 ? "token-refused" : "tiles");
        }
      }

      // pins: the same images as 2D, plus the two models
      await buildPinImages();
      if (cancelled) return;
      const billboards = scene.primitives.add(new C.BillboardCollection({ scene })) as CesiumNS.BillboardCollection;
      setupBuses(C, viewer, billboards);
      const handler = new C.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
        const picked = scene.pick(e.position) as { id?: { kind?: string; id?: number } } | undefined;
        const id = picked?.id as { kind?: string; id?: number; at?: CesiumNS.Cartesian3 } | undefined;
        if (id && id.kind === "asset" && typeof id.id === "number") propsRef.current.onSelect({ kind: "asset", id: id.id, layer: "vehicles" });
        else if (id && id.kind === "cluster" && id.at) {
          const o = currentOrbit(C, viewer!);
          const range = Math.max(CAMERA_LIMITS.minRange, (o?.range ?? 2000) * 0.35);
          const sphere = new C.BoundingSphere(id.at, 1);
          const offset = new C.HeadingPitchRange(scene.camera.heading, scene.camera.pitch, range);
          if (propsRef.current.reducedMotion) scene.camera.viewBoundingSphere(sphere, offset);
          else scene.camera.flyToBoundingSphere(sphere, { offset, duration: 0.6 });
          scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
        } else propsRef.current.onSelect(null);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((e: { endPosition: CesiumNS.Cartesian2 }) => {
        const picked = scene.pick(e.endPosition) as { id?: { kind?: string } } | undefined;
        scene.canvas.style.cursor = picked?.id?.kind === "asset" || picked?.id?.kind === "cluster" ? "pointer" : "";
      }, C.ScreenSpaceEventType.MOUSE_MOVE);
      setStatus("ready");
      scene.requestRender();
    })();

    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
      busesRef.current.clear();
      tilesetRef.current = null;
      viewerRef.current = null;
      try {
        viewer?.destroy();
      } catch {
        // already gone
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- profile switches apply live, without reloading tiles
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v) return;
    applyProfile(C, v, tilesetRef.current, props.profile);
    if (window.__globe3d) window.__globe3d.profile = props.profile.name;
    v.scene.requestRender();
  }, [props.profile]);

  // ---- buses: on new data, and on a clock while they glide or the camera follows
  useEffect(() => {
    refreshHeights(false);
    drawRef.current();
    const fast = props.following && !props.reducedMotion;
    if (!props.glide && !fast) return;
    const every = fast ? (props.profile.name === "low" ? 50 : 33) : 100;
    const id = setInterval(() => drawRef.current(), every);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.vehicles, props.glide, props.selectedKey, props.following, props.reducedMotion, props.profile]);

  // follow: lock the camera to the bus while following; release on stop
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v) return;
    if (!props.following) {
      v.scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
      v.scene.requestRender();
    }
  }, [props.following]);

  // ---- route lines, draped on the tiles (or the plain globe) as one ground primitive
  const routesPrim = useRef<CesiumNS.GroundPolylinePrimitive | null>(null);
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v || status !== "ready") return;
    if (routesPrim.current) {
      v.scene.groundPrimitives.remove(routesPrim.current);
      routesPrim.current = null;
    }
    if (!props.routes.length) return;
    const instances: CesiumNS.GeometryInstance[] = [];
    const hr = props.highlightRoute;
    for (const f of props.routes) {
      const g = f.geometry;
      if (!g || !g.coordinates) continue;
      const lines = g.type === "LineString" ? [g.coordinates as number[][]] : g.type === "MultiLineString" ? (g.coordinates as number[][][]) : [];
      const on = hr !== null && f.properties.route_short_name === hr;
      for (const line of lines) {
        if (line.length < 2) continue;
        instances.push(
          new C.GeometryInstance({
            geometry: new C.GroundPolylineGeometry({ positions: C.Cartesian3.fromDegreesArray(line.flat()), width: on ? 7 : 3 }),
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(COLOURS.route).withAlpha(on ? 1 : hr ? 0.35 : 0.7)) },
          }),
        );
      }
    }
    if (!instances.length) return;
    routesPrim.current = v.scene.groundPrimitives.add(
      new C.GroundPolylinePrimitive({ geometryInstances: instances, appearance: new C.PolylineColorAppearance(), classificationType: C.ClassificationType.BOTH, asynchronous: true }),
    );
    v.scene.requestRender();
    const timer = setTimeout(() => v.scene.requestRender(), 800);
    return () => clearTimeout(timer);
  }, [props.routes, props.highlightRoute, status]);

  // ---- a newly selected bus is brought into view, so its popup is never clipped by the map's edges
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    const key = props.selectedKey;
    if (!C || !v || !key || !key.startsWith("asset:") || props.following) return;
    const timer = setTimeout(() => {
      const b = busesRef.current.get(Number(key.slice(6)));
      if (!b || !b.last) return;
      const world = C.Cartesian3.fromDegrees(b.last.lon, b.last.lat, b.height ?? 0);
      const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, world);
      const w = v.scene.canvas.clientWidth;
      const h = v.scene.canvas.clientHeight;
      if (win && win.x > 190 && win.x < w - 190 && win.y > 330 && win.y < h - 60) return;
      const o = currentOrbit(C, v);
      const offset = new C.HeadingPitchRange(v.scene.camera.heading, v.scene.camera.pitch, Math.min(o ? o.range : 1500, 2500));
      const sphere = new C.BoundingSphere(world, 1);
      if (propsRef.current.reducedMotion) v.scene.camera.viewBoundingSphere(sphere, offset);
      else v.scene.camera.flyToBoundingSphere(sphere, { offset, duration: 0.7 });
      v.scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedKey, status]);

  function applyProfile(C: Cesium, v: CesiumNS.Viewer, ts: CesiumNS.Cesium3DTileset | null, prof: Profile3D): void {
    const scene = v.scene;
    v.resolutionScale = resolutionScaleFor(window.devicePixelRatio || 1, prof.maxPixelRatio);
    scene.msaaSamples = prof.msaaSamples;
    scene.postProcessStages.fxaa.enabled = prof.fxaa;
    scene.fog.enabled = prof.fog;
    scene.fog.density = 0.00022;
    scene.globe.enableLighting = prof.lighting;
    scene.highDynamicRange = false;
    v.shadows = prof.shadows;
    if (ts) {
      ts.maximumScreenSpaceError = prof.maximumScreenSpaceError;
      ts.cacheBytes = prof.cacheBytes;
      ts.maximumCacheOverflowBytes = prof.cacheBytes / 2;
      ts.preloadWhenHidden = prof.preloadWhenHidden;
      ts.preloadFlightDestinations = prof.preloadFlightDestinations;
      ts.loadSiblings = prof.loadSiblings;
      ts.skipLevelOfDetail = prof.skipLevelOfDetail;
    }
    for (const b of busesRef.current.values()) {
      if (b.near) b.near.distanceDisplayCondition = new C.DistanceDisplayCondition(0, prof.nearModelMetres);
      if (b.mid) b.mid.distanceDisplayCondition = new C.DistanceDisplayCondition(prof.nearModelMetres, prof.midModelMetres);
      b.badge.distanceDisplayCondition = new C.DistanceDisplayCondition(0, prof.midModelMetres);
      b.far.distanceDisplayCondition = new C.DistanceDisplayCondition(prof.midModelMetres, Number.POSITIVE_INFINITY);
    }
  }

  function setOrbit(C: Cesium, v: CesiumNS.Viewer, o: Orbit): void {
    const target = C.Cartesian3.fromDegrees(o.lon, o.lat, 0);
    v.scene.camera.lookAt(target, new C.HeadingPitchRange(rad(o.heading), rad(o.pitch), o.range));
    v.scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }

  /** The ground point in the middle of the screen, and how far away it is. */
  function currentOrbit(C: Cesium, v: CesiumNS.Viewer): Orbit | null {
    const cam = v.scene.camera;
    const canvas = v.scene.canvas;
    const ray = cam.getPickRay(new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    if (!ray) return null;
    const hit = C.IntersectionTests.rayEllipsoid(ray, C.Ellipsoid.WGS84);
    if (!hit) return null;
    const point = C.Ray.getPoint(ray, hit.start);
    const carto = C.Cartographic.fromCartesian(point);
    return {
      lon: deg(carto.longitude),
      lat: deg(carto.latitude),
      range: C.Cartesian3.distance(cam.positionWC, point),
      heading: deg(cam.heading),
      pitch: deg(cam.pitch),
    };
  }

  function currentPlace(C: Cesium, v: CesiumNS.Viewer): Place | null {
    const o = currentOrbit(C, v);
    return o ? orbitToPlace(o, v.scene.canvas.clientHeight || 800) : null;
  }

  function keepCameraInside(C: Cesium, v: CesiumNS.Viewer): void {
    const carto = v.scene.camera.positionCartographic;
    const fixed = clampCameraPosition({ lon: deg(carto.longitude), lat: deg(carto.latitude), height: carto.height });
    if (!fixed) return;
    const cam = v.scene.camera;
    cam.setView({
      destination: C.Cartesian3.fromDegrees(fixed.lon, fixed.lat, fixed.height),
      orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
    });
  }

  // ---- buses

  function setupBuses(C: Cesium, v: CesiumNS.Viewer, billboards: CesiumNS.BillboardCollection): void {
    const scene = v.scene;
    const images = new Map<string, HTMLCanvasElement>();
    const image = (key: string, make: () => HTMLCanvasElement) => {
      let c = images.get(key);
      if (!c) {
        c = make();
        images.set(key, c);
      }
      return c;
    };
    const nearUrl = `${import.meta.env.BASE_URL}models/bus-near.glb`;
    const midUrl = `${import.meta.env.BASE_URL}models/bus-mid.glb`;
    let failedModels = false;

    const makeModel = async (url: string, id: number, min: number, max: number): Promise<CesiumNS.Model | null> => {
      if (failedModels) return null;
      try {
        const m = await C.Model.fromGltfAsync({
          url,
          id: { kind: "asset", id },
          forwardAxis: C.Axis.X,
          minimumPixelSize: url === midUrl ? 18 : 0,
          distanceDisplayCondition: new C.DistanceDisplayCondition(min, max),
          shadows: propsRef.current.profile.shadows ? C.ShadowMode.ENABLED : C.ShadowMode.DISABLED,
          incrementallyLoadTextures: false,
        });
        scene.primitives.add(m);
        m.readyEvent.addEventListener(() => scene.requestRender());
        return m;
      } catch {
        failedModels = true; // keep going with the flat pins
        return null;
      }
    };

    // crowds become counts, as in 2D: pins that overlap on screen beyond the near-model distance merge into one
    const clusters: CesiumNS.Billboard[] = [];
    const declutter = () => {
      const prof = propsRef.current.profile;
      const cam = scene.camera;
      const points: { id: number; x: number; y: number; world: CesiumNS.Cartesian3 }[] = [];
      const key = propsRef.current.selectedKey;
      const selId = key && key.startsWith("asset:") ? Number(key.slice(6)) : null;
      for (const [id, b] of busesRef.current) {
        if (!b.last) continue;
        const world = b.far.position;
        if (C.Cartesian3.distance(cam.positionWC, world) < prof.nearModelMetres || id === selId) {
          b.badge.show = true;
          b.far.show = true;
          continue;
        }
        const win = C.SceneTransforms.worldToWindowCoordinates(scene, world);
        if (!win) continue;
        points.push({ id, x: win.x, y: win.y, world });
      }
      const groups = clusterScreenPoints(points, 52);
      let used = 0;
      for (const g of groups) {
        const members = g.ids.map((id) => busesRef.current.get(id)!);
        if (g.ids.length === 1) {
          members[0].badge.show = true;
          members[0].far.show = true;
          continue;
        }
        for (const m of members) {
          m.badge.show = false;
          m.far.show = false;
        }
        const centre = new C.Cartesian3();
        for (const id of g.ids) C.Cartesian3.add(centre, points.find((q) => q.id === id)!.world, centre);
        C.Cartesian3.divideByScalar(centre, g.ids.length, centre);
        let cb = clusters[used];
        if (!cb) {
          cb = billboards.add({ position: centre, verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 1 / PIXEL_RATIO });
          clusters.push(cb);
        }
        cb.position = centre;
        cb.image = image(`cluster|${g.ids.length}`, () => drawCluster(g.ids.length, "", COLOURS.ink)) as unknown as string;
        cb.id = { kind: "cluster", count: g.ids.length, at: C.Cartesian3.clone(centre) };
        cb.show = true;
        used++;
      }
      for (let i = used; i < clusters.length; i++) clusters[i].show = false;
    };
    scene.camera.changed.addEventListener(() => {
      declutter();
      scene.requestRender();
    });

    drawRef.current = () => {
      const p = propsRef.current;
      const prof = p.profile;
      const now = Date.now();
      const seen = new Set<number>();
      const sel = p.selectedKey;
      let selectedPos: CesiumNS.Cartesian3 | null = null;
      for (const f of p.vehicles) {
        const pos = p.positionFor(f.id, now);
        if (!pos) continue;
        seen.add(f.id);
        let b = busesRef.current.get(f.id);
        if (!b) {
          b = {
            near: null,
            mid: null,
            badge: billboards.add({ show: false, position: C.Cartesian3.ZERO, id: { kind: "asset", id: f.id } }),
            far: billboards.add({ show: false, position: C.Cartesian3.ZERO, id: { kind: "asset", id: f.id } }),
            badgeKey: "",
            farKey: "",
            height: null,
            heightAt: 0,
            bearing: f.properties.bearing ?? 90,
            last: null,
          };
          busesRef.current.set(f.id, b);
          const bb = b;
          void makeModel(nearUrl, f.id, 0, prof.nearModelMetres).then((m) => (bb.near = m));
          void makeModel(midUrl, f.id, prof.nearModelMetres, prof.midModelMetres).then((m) => (bb.mid = m));
          b.badge.distanceDisplayCondition = new C.DistanceDisplayCondition(0, prof.midModelMetres);
          b.far.distanceDisplayCondition = new C.DistanceDisplayCondition(prof.midModelMetres, Number.POSITIVE_INFINITY);
        }
        // heading from movement, else the reported bearing
        if (b.last && (Math.abs(b.last.lon - pos.lon) > 1e-7 || Math.abs(b.last.lat - pos.lat) > 1e-7)) {
          const dLon = (pos.lon - b.last.lon) * Math.cos(rad(pos.lat));
          b.bearing = (deg(Math.atan2(dLon, pos.lat - b.last.lat)) + 360) % 360;
        } else if (!b.last && typeof f.properties.bearing === "number") b.bearing = f.properties.bearing;
        b.last = pos;
        const h = b.height ?? 0;
        const position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, h);
        const hpr = new C.HeadingPitchRoll(rad(b.bearing - 90), 0, 0);
        const frame = C.Transforms.headingPitchRollToFixedFrame(position, hpr);
        const isSel = sel === `asset:${f.id}`;
        if (b.near) {
          b.near.modelMatrix = frame;
          b.near.silhouetteColor = C.Color.fromCssColorString("#f5b544");
          b.near.silhouetteSize = isSel ? 3 : 0;
        }
        if (b.mid) {
          b.mid.modelMatrix = frame;
          b.mid.silhouetteColor = C.Color.fromCssColorString("#f5b544");
          b.mid.silhouetteSize = isSel ? 3 : 0;
        }
        const status = busStatus(f.properties.status, f.properties.delay_seconds);
        const route = f.properties.route_short_name;
        const badgeKey = `${status}|${route}|${isSel}`;
        if (b.badgeKey !== badgeKey) {
          b.badge.image = image(`badge|${badgeKey}`, () => drawBusBadge(status, route, isSel)) as unknown as string;
          b.badge.scale = 1 / PIXEL_RATIO;
          b.badge.verticalOrigin = C.VerticalOrigin.BOTTOM;
          b.badge.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          b.badgeKey = badgeKey;
        }
        const west = b.bearing > 180;
        const farKey = `${status}|${route}|${isSel}|${west}`;
        if (b.farKey !== farKey) {
          b.far.image = image(`far|${farKey}`, () => drawBusPin(busRenderImage(), status, west, isSel, route)) as unknown as string;
          b.far.scale = 1 / PIXEL_RATIO;
          b.far.verticalOrigin = C.VerticalOrigin.BOTTOM;
          b.far.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          b.farKey = farKey;
        }
        b.badge.position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, h + 4.2);
        b.badge.show = true;
        b.far.position = position;
        b.far.show = true;
        if (isSel) selectedPos = position;
      }
      for (const [id, b] of busesRef.current) {
        if (seen.has(id)) continue;
        if (b.near) scene.primitives.remove(b.near);
        if (b.mid) scene.primitives.remove(b.mid);
        billboards.remove(b.badge);
        billboards.remove(b.far);
        busesRef.current.delete(id);
      }
      if (window.__globe3d) window.__globe3d.buses = busesRef.current.size;
      declutter();
      // follow: keep the camera's angle and distance, move with the bus
      if (p.following && selectedPos) {
        const cam = scene.camera;
        const orbit = currentOrbit(C, v);
        const range = orbit ? Math.max(CAMERA_LIMITS.minRange, Math.min(orbit.range, 1500)) : 600;
        cam.lookAt(selectedPos, new C.HeadingPitchRange(cam.heading, Math.min(cam.pitch, rad(-15)), range));
      }
      scene.requestRender();
    };
  }

  /**
   * One height sample per GPS report: when a bus's newest report is newer than its height, ask the tiles once
   * where the ground is there. Buses between reports reuse that height. On the plain globe the ground is 0 m.
   */
  function refreshHeights(all: boolean): void {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v) return;
    const p = propsRef.current;
    if (p.noIon) {
      for (const b of busesRef.current.values()) b.height = 0;
      return;
    }
    if (!tilesetRef.current || window.__globe3d?.firstFrameMs === null) return;
    let budget = all ? 400 : 120;
    for (const f of p.vehicles) {
      const b = busesRef.current.get(f.id);
      const c = f.geometry?.coordinates as [number, number] | undefined;
      if (!b || !c) continue;
      const reportAt = Date.parse(f.properties.position_ts) || 0;
      if (b.height !== null && b.heightAt >= reportAt) continue;
      if (budget-- <= 0) break;
      const objects = [b.near, b.mid].filter(Boolean) as object[];
      const h = v.scene.sampleHeight(C.Cartographic.fromDegrees(c[0], c[1]), objects);
      if (typeof h === "number" && Number.isFinite(h)) {
        b.height = h;
        b.heightAt = reportAt;
      } else if (b.height === null) {
        b.height = -18; // Halifax's geoid lies about 18 m below the ellipsoid: close enough until tiles arrive
      }
    }
  }

  function placePopup(): void {
    const C = window.Cesium;
    const v = viewerRef.current;
    const elp = popupEl.current;
    if (!C || !v || !elp) return;
    const key = propsRef.current.selectedKey;
    const id = key?.startsWith("asset:") ? Number(key.slice(6)) : null;
    const b = id !== null ? busesRef.current.get(id) : undefined;
    if (!b || !b.last) {
      elp.style.visibility = "hidden";
      return;
    }
    const world = C.Cartesian3.fromDegrees(b.last.lon, b.last.lat, (b.height ?? 0) + 4.2);
    const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, world);
    if (!win) {
      elp.style.visibility = "hidden";
      return;
    }
    elp.style.visibility = "visible";
    elp.style.transform = `translate(${Math.round(win.x)}px, ${Math.round(win.y)}px)`;
  }

  useImperativeHandle(ref, () => ({
    zoom: (direction) => {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      const o = currentOrbit(C, v);
      if (!o) return;
      const next = clampOrbit({ ...o, range: o.range * (direction > 0 ? 0.55 : 1.8) });
      if (propsRef.current.reducedMotion) setOrbit(C, v, next);
      else {
        v.scene.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(next.lon, next.lat, 0), 1), {
          offset: new C.HeadingPitchRange(rad(next.heading), rad(next.pitch), next.range),
          duration: 0.5,
        });
      }
      v.scene.requestRender();
    },
    resetNorth: () => {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      const o = currentOrbit(C, v);
      if (o) setOrbit(C, v, { ...o, heading: 0 });
      v.scene.requestRender();
    },
    place: () => {
      const C = window.Cesium;
      const v = viewerRef.current;
      return C && v ? currentPlace(C, v) : null;
    },
  }));

  return (
    <div className="globe" aria-label={t("map.label3d")}>
      <div ref={el} className="globe-canvas" />
      <div ref={creditsEl} className="globe-credits" />
      {props.popup ? (
        <div ref={popupEl} className="map-popup-anchor" style={{ visibility: "hidden" }}>
          {props.popup}
        </div>
      ) : (
        <div ref={popupEl} hidden />
      )}
      {status === "loading" && (
        <p className="globe-loading" role="status">
          {t("view.3dLoading")}
        </p>
      )}
    </div>
  );
});

export default Globe3D;
