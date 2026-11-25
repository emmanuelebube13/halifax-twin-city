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

import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type * as CesiumNS from "cesium";
import type { Feature, Kind, VehicleProperties } from "../api/types";
import { t } from "../i18n";
import { CAMERA_LIMITS, HALIFAX_3D_START, clampCameraPosition, clampOrbit, orbitToPlace, placeToOrbit, rangeForZoom, type Orbit, type Place } from "../lib/camera";
import { PROFILES, chooseProfile, readDeviceHints, resolutionScaleFor, type Profile3D } from "../lib/profile";
import type { ProfileName } from "../lib/profileChoice";
import { busStatus } from "../lib/status";
import type { ThreeDFailure } from "../lib/threeD";
import { COLOURS, PIXEL_RATIO, buildPinImages, busRenderImage, drawCluster, drawGlyphPin, type Glyph } from "./pins";
import { anchorOf } from "./registry";
import { drawBusBadge } from "./badge";
import { clusterScreenPoints, decimateLine } from "./declutter";
import { createCleanTwinController, type CleanTwinController, type StreetTwinMode } from "./cleanTwin3D";

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

export interface PinLayer3D {
  name: string;
  glyph: Glyph;
  colour: string;
  dashed: boolean;
  features: Feature[];
}

interface StaticPin {
  layer: string;
  glyph: PinLayer3D["glyph"];
  colour: string;
  kind: Kind;
  id: number;
  lon: number;
  lat: number;
  height: number | null;
  triedTiles: number;
  bb: CesiumNS.Billboard;
  imageKey: string;
  winX: number;
  winY: number;
  visible: boolean;
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
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  zoom: (direction: 1 | -1) => void;
  resetNorth: () => void;
  place: () => Place | null;
}

interface Props {
  /** Null in the developer globe (no ion). */
  token: string | null;
  noIon: boolean;
  assetId: number;
  /** The user's choice; null means automatic, chosen here from device hints. */
  profileChoice: ProfileName | null;
  onAutoProfile?: (p: ProfileName) => void;
  vehicles: Feature<VehicleProperties>[];
  positionFor: (id: number, now: number) => { lon: number; lat: number; bearing?: number } | null;
  /** Buses are moving on the glide clock: keep asking for frames. */
  glide: boolean;
  selectedKey: string | null;
  following: boolean;
  reducedMotion: boolean;
  startPlace: Place | null;
  /** On a phone the data credits sit behind Cesium's "Data attribution" link; the logos stay on screen. */
  phone: boolean;
  /** Route lines (GeoJSON features), draped on the tiles as one ground primitive. */
  routes: Feature[];
  highlightRoute: string | null;
  /** The other evidence layers (closures, permits...): pins and, for lines, dashed ground lines. */
  pinLayers: PinLayer3D[];
  /** Fit the camera to these points once per key (a story's evidence), when the story opens in 3D. */
  fit: { key: string; points: [number, number][] } | null;
  /** Street-level procedural 3D twin display mode (defaults to "auto"). */
  streetTwinMode?: StreetTwinMode;
  popup?: ReactNode;
  onSelect: (sel: { kind: Kind; id: number; layer: string } | null) => void;
  onFailed: (reason: ThreeDFailure) => void;
  onPlace?: (p: Place) => void;
}

interface BusPrims {
  near: CesiumNS.Model | null;
  mid: CesiumNS.Model | null;
  modelsLoading: boolean;
  badge: CesiumNS.Billboard;
  badgeKey: string;
  height: number | null;
  heightAt: number; // report time the height belongs to
  triedTiles: number;
  bearing: number;
  matrixLon: number;
  matrixLat: number;
  matrixH: number;
  matrixBearing: number;
  last: { lon: number; lat: number } | null;
  winX: number;
  winY: number;
  visible: boolean;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

let autoProfile: ProfileName | null = null;

const Globe3D = memo(forwardRef<Globe3DHandle, Props>(function Globe3D(rawProps, ref) {
  if (!autoProfile) autoProfile = chooseProfile(readDeviceHints());
  const props = { ...rawProps, profile: PROFILES[rawProps.profileChoice ?? autoProfile] as Profile3D };
  const el = useRef<HTMLDivElement>(null);
  const creditsEl = useRef<HTMLDivElement>(null);
  const popupEl = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const tilesetRef = useRef<CesiumNS.Cesium3DTileset | null>(null);
  const busesRef = useRef(new Map<number, BusPrims>());
  const drawRef = useRef<() => void>(() => undefined);
  const declutterStaticRef = useRef<() => void>(() => undefined);
  const pointerDownRef = useRef(false);
  const cameraMovingRef = useRef(false);
  const pinHeightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tileLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinImagesCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const prevSelectedKeyRef = useRef<string | null>(null);
  const brightnessStageRef = useRef<CesiumNS.PostProcessStage | null>(null);
  const cleanTwinRef = useRef<CleanTwinController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  useEffect(() => {
    if (autoProfile) rawProps.onAutoProfile?.(autoProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- create the viewer once
  useEffect(() => {
    let viewer: CesiumNS.Viewer | null = null;
    let handler: CesiumNS.ScreenSpaceEventHandler | null = null;
    let hoverRaf: number | null = null;
    let cleanupDomListeners: (() => void) | null = null;
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
          // Disable Cesium's Globe when rendering Google Photorealistic 3D Tiles so ScreenSpaceCameraController
          // uses its fast 3D-Tiles worldspace pan path instead of stalling or locking on tall building roofs.
          globe: p.noIon ? undefined : false,
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
          // a render error falls back to 2D through renderError below, not Cesium's own error panel
          showRenderLoopErrors: false,
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
      scene.backgroundColor = C.Color.fromCssColorString(p.noIon ? "#dfe3dd" : "#13232e");
      scene.renderError.addEventListener(() => fail("load"));
      applyProfile(C, viewer, null, prof);
      const cleanTwin = createCleanTwinController(C, viewer, {
        noIon: p.noIon,
        getTileset: () => tilesetRef.current,
        getExcludeObjects: () => {
          const objs: object[] = [];
          for (const b of busesRef.current.values()) {
            if (b.near) objs.push(b.near);
            if (b.mid) objs.push(b.mid);
          }
          return objs;
        },
        onActiveChange: (active) => {
          if (tilesetRef.current) tilesetRef.current.show = !active;
          for (const pin of pinsRef.current.values()) {
            pin.height = null;
            pin.triedTiles = -1;
          }
          for (const b of busesRef.current.values()) {
            b.height = null;
            b.heightAt = 0;
            b.triedTiles = -1;
          }
          refreshHeights(true);
          refreshPinHeights();
          scene.requestRender();
        },
      });
      cleanTwinRef.current = cleanTwin;
      cleanTwin.setRoutes(p.routes, p.highlightRoute);
      scene.postRender.addEventListener(() => {
        metrics.frames++;
        placePopup();
      });

      // Track pointer drag state so hover hit-testing, height raycasts and bus ticks never stall camera motion
      const canvas = scene.canvas;
      const onPointerDown = () => {
        pointerDownRef.current = true;
      };
      const onPointerUp = () => {
        pointerDownRef.current = false;
      };
      canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      window.addEventListener("pointercancel", onPointerUp, { passive: true });
      window.addEventListener("blur", onPointerUp, { passive: true });
      cleanupDomListeners = () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("blur", onPointerUp);
      };

      // camera limits & intuitive mouse controls:
      // Left-drag pans around the map; scroll wheel / pinch zooms; right-drag / middle-drag / Ctrl+drag orbits and tilts.
      const sscc = scene.screenSpaceCameraController;
      sscc.minimumZoomDistance = CAMERA_LIMITS.minRange;
      sscc.maximumZoomDistance = CAMERA_LIMITS.maxRange;
      sscc.enableCollisionDetection = true;
      sscc.zoomEventTypes = [C.CameraEventType.WHEEL, C.CameraEventType.PINCH];
      sscc.tiltEventTypes = [
        C.CameraEventType.RIGHT_DRAG,
        C.CameraEventType.MIDDLE_DRAG,
        C.CameraEventType.PINCH,
        { eventType: C.CameraEventType.LEFT_DRAG, modifier: C.KeyboardEventModifier.CTRL },
        { eventType: C.CameraEventType.RIGHT_DRAG, modifier: C.KeyboardEventModifier.CTRL },
      ];
      scene.camera.percentageChanged = 0.05;
      scene.camera.moveStart.addEventListener(() => {
        cameraMovingRef.current = true;
      });
      scene.camera.changed.addEventListener(() => keepCameraInside(C, viewer!, false));
      scene.camera.moveEnd.addEventListener(() => {
        cameraMovingRef.current = false;
        keepCameraInside(C, viewer!, true);
        cleanTwinRef.current?.syncCamera(
          currentOrbit(C, viewer!),
          propsRef.current.streetTwinMode ?? "auto",
          propsRef.current.profile.name,
          propsRef.current.noIon,
        );
        refreshPinHeights();
        refreshHeights(false);
        const pl = currentPlace(C, viewer!);
        if (pl) propsRef.current.onPlace?.(pl);
      });

      // start where the 2D map was; a flat 2D view opens tilted so the buildings stand up
      const h = el.current.clientHeight || 800;
      let orbit: Orbit = p.startPlace ? placeToOrbit(p.startPlace, h) : HALIFAX_3D_START;
      if (p.startPlace && p.startPlace.pitch < 20) orbit = clampOrbit({ ...orbit, pitch: -50 });
      setOrbit(C, viewer, orbit);

      if (p.noIon) {
        // developer globe: plain fog-coloured ground, no tiles, no ion requests
        if (scene.globe) {
          scene.globe.show = true;
          scene.globe.baseColor = C.Color.fromCssColorString("#dfe3dd");
          scene.globe.showGroundAtmosphere = false;
        }
        metrics.firstFrameMs = performance.now() - metrics.startedAt;
        cleanTwin.syncCamera(currentOrbit(C, viewer), p.streetTwinMode ?? "auto", prof.name, p.noIon);
      } else {
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
            showCreditsOnScreen: !p.phone,
          });
          if (cancelled) return;
          tilesetRef.current = tileset;
          scene.primitives.add(tileset);
          tileset.tileLoad.addEventListener(() => {
            metrics.tilesLoaded++;
            if (metrics.firstFrameMs !== null && !tileLoadTimerRef.current) {
              tileLoadTimerRef.current = setTimeout(() => {
                tileLoadTimerRef.current = null;
                if (!pointerDownRef.current && !cameraMovingRef.current) {
                  refreshPinHeights();
                  refreshHeights(false);
                }
              }, 300);
            }
          });
          tileset.tileFailed.addEventListener(() => {
            metrics.tilesFailed++;
            if (metrics.firstFrameMs === null && metrics.tilesFailed > 12) fail("tiles");
          });
          tileset.initialTilesLoaded.addEventListener(() => {
            if (metrics.firstFrameMs === null) metrics.firstFrameMs = performance.now() - metrics.startedAt;
            if (failTimer) clearTimeout(failTimer);
            cleanTwinRef.current?.syncCamera(
              currentOrbit(C, viewer!),
              propsRef.current.streetTwinMode ?? "auto",
              propsRef.current.profile.name,
              propsRef.current.noIon,
            );
            refreshHeights(true);
            refreshPinHeights();
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
      const isOverInteractive = setupBuses(C, viewer, billboards);
      handler = new C.ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
        const picked = scene.pick(e.position) as { id?: { kind?: string; id?: number } } | undefined;
        const id = picked?.id as { kind?: string; id?: number; at?: CesiumNS.Cartesian3; layer?: string } | undefined;
        if (id && id.layer && typeof id.id === "number" && (id.kind === "event" || id.kind === "location" || id.kind === "asset")) {
          propsRef.current.onSelect({ kind: id.kind as Kind, id: id.id, layer: id.layer });
        } else if (id && id.kind === "asset" && typeof id.id === "number") propsRef.current.onSelect({ kind: "asset", id: id.id, layer: "vehicles" });
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

      // Pure screen-space cursor check on hover: never calls WebGL scene.pick() (gl.readPixels) on mousemove,
      // and skips completely while dragging or moving the camera.
      let pendingMouse: { x: number; y: number } | null = null;
      handler.setInputAction((e: { endPosition: CesiumNS.Cartesian2 }) => {
        if (pointerDownRef.current || cameraMovingRef.current) return;
        pendingMouse = { x: e.endPosition.x, y: e.endPosition.y };
        if (hoverRaf !== null) return;
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = null;
          if (!pendingMouse || pointerDownRef.current || cameraMovingRef.current || cancelled) return;
          const hit = isOverInteractive(pendingMouse.x, pendingMouse.y);
          const nextCursor = hit ? "pointer" : "";
          if (scene.canvas.style.cursor !== nextCursor) scene.canvas.style.cursor = nextCursor;
        });
      }, C.ScreenSpaceEventType.MOUSE_MOVE);

      setStatus("ready");
      scene.requestRender();
    })();

    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
      if (hoverRaf !== null) cancelAnimationFrame(hoverRaf);
      if (pinHeightTimerRef.current) {
        clearTimeout(pinHeightTimerRef.current);
        pinHeightTimerRef.current = null;
      }
      if (tileLoadTimerRef.current) {
        clearTimeout(tileLoadTimerRef.current);
        tileLoadTimerRef.current = null;
      }
      cleanupDomListeners?.();
      try {
        handler?.destroy();
      } catch {
        // already gone
      }
      busesRef.current.clear();
      pinsRef.current.clear();
      cleanTwinRef.current?.destroy();
      cleanTwinRef.current = null;
      brightnessStageRef.current = null;
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

  // ---- sync clean 3D street twin when mode, profile or readiness changes
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v || status !== "ready") return;
    cleanTwinRef.current?.syncCamera(
      currentOrbit(C, v),
      props.streetTwinMode ?? "auto",
      props.profile.name,
      props.noIon,
    );
  }, [props.streetTwinMode, props.profile, props.noIon, status]);

  // ---- keep clean 3D street twin route ribbons aligned with active transit routes
  useEffect(() => {
    if (status !== "ready") return;
    cleanTwinRef.current?.setRoutes(props.routes, props.highlightRoute);
  }, [props.routes, props.highlightRoute, status]);

  // ---- buses: on new data, and on a clock while they glide or the camera follows
  useEffect(() => {
    if (typeof document === "undefined" || !document.hidden) {
      refreshHeights(false);
      drawRef.current();
    }
    const onVis = () => {
      if (!document.hidden) {
        refreshHeights(false);
        drawRef.current();
        viewerRef.current?.scene.requestRender();
      }
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    const fast = props.following && !props.reducedMotion;
    if (!props.glide && !fast) {
      return () => {
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      };
    }
    const every = fast ? (props.profile.name === "low" ? 50 : 33) : 100;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      // Yield 100% of frame budget to smooth camera dragging unless actively locked onto a bus
      if (pointerDownRef.current && !propsRef.current.following) return;
      drawRef.current();
    }, every);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.vehicles, props.positionFor, props.glide, props.selectedKey, props.following, props.reducedMotion, props.profile]);

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
  const casingPrim = useRef<CesiumNS.GroundPolylinePrimitive | null>(null);
  const linesPrim = useRef<CesiumNS.GroundPolylinePrimitive[]>([]);
  const pinsRef = useRef(new Map<string, StaticPin>());
  const staticBillboards = useRef<CesiumNS.BillboardCollection | null>(null);

  function updateStaticPinImage(pin: StaticPin, selected: boolean): void {
    const imageKey = `${pin.glyph}|${pin.colour}|${selected}`;
    if (pin.imageKey === imageKey) return;
    let img = pinImagesCacheRef.current.get(imageKey);
    if (!img) {
      img = drawGlyphPin(pin.glyph, pin.colour, selected);
      pinImagesCacheRef.current.set(imageKey, img);
    }
    pin.bb.setImage(`pin|${imageKey}`, img);
    pin.bb.scale = (selected ? 1.25 : 1) / PIXEL_RATIO;
    pin.imageKey = imageKey;
  }

  // ---- the other evidence: dashed ground lines (closures) and pins (closures, permits, stops), rebuilt only when data changes
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v || status !== "ready") return;
    for (const prim of linesPrim.current) v.scene.groundPrimitives.remove(prim);
    linesPrim.current = [];
    if (!staticBillboards.current) staticBillboards.current = v.scene.primitives.add(new C.BillboardCollection({ scene: v.scene })) as CesiumNS.BillboardCollection;
    const coll = staticBillboards.current;
    const wanted = new Set<string>();
    const classType = props.noIon ? C.ClassificationType.BOTH : C.ClassificationType.CESIUM_3D_TILE;
    const selKey = propsRef.current.selectedKey;
    for (const layer of props.pinLayers) {
      const lineInstances: CesiumNS.GeometryInstance[] = [];
      for (const f of layer.features) {
        const g = f.geometry;
        if (g && (g.type === "LineString" || g.type === "MultiLineString")) {
          const lines = g.type === "LineString" ? [g.coordinates as number[][]] : (g.coordinates as number[][][]);
          for (const rawLine of lines) {
            const line = decimateLine(rawLine, 0.00006);
            if (line.length < 2) continue;
            lineInstances.push(new C.GeometryInstance({ geometry: new C.GroundPolylineGeometry({ positions: C.Cartesian3.fromDegreesArray(line.flat()), width: 6 }) }));
          }
        }
        const at = anchorOf(g);
        if (!at) continue;
        let glyph = layer.glyph;
        let colour = layer.colour;
        if (layer.name === "stops") {
          const fp = f.properties as Record<string, unknown>;
          const isStation =
            fp.stop_kind_code === "Station" ||
            fp.shelter_flag === true ||
            /terminal|station/i.test(String(fp.stop_name ?? fp.name ?? ""));
          glyph = isStation ? "station" : "stop";
          colour = COLOURS.route;
        }
        const key = `${f.properties.kind}:${f.properties.id}`;
        wanted.add(key);
        let pin = pinsRef.current.get(key);
        if (!pin) {
          pin = {
            layer: layer.name,
            glyph,
            colour,
            kind: f.properties.kind,
            id: Number(f.properties.id),
            lon: at[0],
            lat: at[1],
            height: null,
            triedTiles: -1,
            imageKey: "",
            winX: Number.NaN,
            winY: Number.NaN,
            visible: false,
            bb: coll.add({
              position: C.Cartesian3.fromDegrees(at[0], at[1], props.noIon ? 0 : -18),
              verticalOrigin: C.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scale: 1 / PIXEL_RATIO,
              id: { kind: f.properties.kind, id: Number(f.properties.id), layer: layer.name },
            }),
          };
          pinsRef.current.set(key, pin);
        } else {
          pin.layer = layer.name;
          pin.glyph = glyph;
          pin.colour = colour;
        }
        updateStaticPinImage(pin, selKey === key);
      }
      if (lineInstances.length) {
        linesPrim.current.push(
          v.scene.groundPrimitives.add(
            new C.GroundPolylinePrimitive({
              geometryInstances: lineInstances,
              appearance: new C.PolylineMaterialAppearance({ material: C.Material.fromType("PolylineDash", { color: C.Color.fromCssColorString(layer.colour), gapColor: C.Color.fromCssColorString("#f4f3ee").withAlpha(0.9), dashLength: 18 }) }),
              classificationType: classType,
              asynchronous: true,
            }),
          ),
        );
      }
    }
    for (const [key, pin] of pinsRef.current) {
      if (wanted.has(key)) continue;
      coll.remove(pin.bb);
      pinsRef.current.delete(key);
    }
    prevSelectedKeyRef.current = selKey;
    refreshPinHeights();
    declutterStaticRef.current();
    v.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pinLayers, status]);

  // ---- O(1) static pin selection update: never rebuilds GroundPolylinePrimitives when clicking features
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || status !== "ready") return;
    const prev = prevSelectedKeyRef.current;
    const next = props.selectedKey;
    if (prev === next) return;
    prevSelectedKeyRef.current = next;
    let changed = false;
    if (prev) {
      const oldPin = pinsRef.current.get(prev);
      if (oldPin) {
        updateStaticPinImage(oldPin, false);
        changed = true;
      }
    }
    if (next) {
      const newPin = pinsRef.current.get(next);
      if (newPin) {
        updateStaticPinImage(newPin, true);
        changed = true;
      }
    }
    if (changed) {
      declutterStaticRef.current();
      v.scene.requestRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedKey, status]);

  /**
   * Static pins get one height sample each, once the tiles under them have loaded.
   * Only samples viewport-visible pins whose `triedTiles` lags `tilesLoaded`, preventing infinite retry loops
   * on off-screen pins where 3D tiles have not been streamed in.
   */
  function refreshPinHeights(): void {
    if (pinHeightTimerRef.current) {
      clearTimeout(pinHeightTimerRef.current);
      pinHeightTimerRef.current = null;
    }
    const C = window.Cesium;
    const v = viewerRef.current;
    const metrics = window.__globe3d;
    const twinActive = Boolean(cleanTwinRef.current?.isActive());
    if (!C || !v || (!twinActive && (propsRef.current.noIon || !tilesetRef.current || !metrics || metrics.firstFrameMs === null))) return;
    if (pointerDownRef.current || cameraMovingRef.current) return;

    const currentTiles = metrics?.tilesLoaded ?? 0;
    const w = v.scene.canvas.clientWidth;
    const h = v.scene.canvas.clientHeight;
    let budget = 48;
    let hasMoreVisible = false;
    let updated = false;
    const scratchCarto = new C.Cartographic();

    for (const pin of pinsRef.current.values()) {
      if (twinActive) {
        const twinH = cleanTwinRef.current!.groundHeightAt(pin.lon, pin.lat);
        if (twinH !== null) {
          const nextH = twinH + 0.12;
          if (pin.height !== nextH) {
            pin.height = nextH;
            pin.bb.position = C.Cartesian3.fromDegrees(pin.lon, pin.lat, nextH);
            updated = true;
          }
          continue;
        }
      }
      if (pin.height !== null || pin.triedTiles === currentTiles) continue;
      const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, pin.bb.position);
      if (!win || win.x < -120 || win.x > w + 120 || win.y < -120 || win.y > h + 120) continue;
      if (budget-- <= 0) {
        hasMoreVisible = true;
        break;
      }
      pin.triedTiles = currentTiles;
      C.Cartographic.fromDegrees(pin.lon, pin.lat, 0, scratchCarto);
      const sampled = v.scene.sampleHeight(scratchCarto);
      if (typeof sampled === "number" && Number.isFinite(sampled)) {
        pin.height = sampled;
        pin.bb.position = C.Cartesian3.fromDegrees(pin.lon, pin.lat, sampled);
        updated = true;
      }
    }
    if (updated) {
      declutterStaticRef.current();
      v.scene.requestRender();
    }
    if (hasMoreVisible) {
      pinHeightTimerRef.current = setTimeout(() => {
        pinHeightTimerRef.current = null;
        refreshPinHeights();
      }, 80);
    }
  }

  // ---- open a story in 3D on its evidence
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    const fit = props.fit;
    if (!C || !v || status !== "ready" || !fit || !fit.points.length || fitted.current === fit.key) return;
    fitted.current = fit.key;
    // frame the densest 80%: drop the points farthest from the median, so outliers do not widen the view
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
    const lons = sorted(fit.points.map((q) => q[0]));
    const lats = sorted(fit.points.map((q) => q[1]));
    const mid: [number, number] = [lons[Math.floor(lons.length / 2)], lats[Math.floor(lats.length / 2)]];
    const near = [...fit.points].sort((a, b) => (a[0] - mid[0]) ** 2 + (a[1] - mid[1]) ** 2 - ((b[0] - mid[0]) ** 2 + (b[1] - mid[1]) ** 2));
    const keep = near.slice(0, Math.max(1, Math.ceil(near.length * 0.8)));
    const pts = keep.slice(0, 2000).map(([lon, lat]) => C.Cartesian3.fromDegrees(lon, lat, 0));
    const sphere = C.BoundingSphere.fromPoints(pts);
    const range = Math.min(CAMERA_LIMITS.maxRange, Math.max(700, sphere.radius * 2.8));
    const offset = new C.HeadingPitchRange(v.scene.camera.heading, rad(-50), range);
    if (propsRef.current.reducedMotion) v.scene.camera.viewBoundingSphere(sphere, offset);
    else v.scene.camera.flyToBoundingSphere(sphere, { offset, duration: 1.0 });
    v.scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }, [props.fit, status]);

  // ---- base transit network routes: built once when routes data arrives, decimated to reduce 3D tile stencil volume load
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
    const routeAttr = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(COLOURS.route).withAlpha(0.75));
    for (const f of props.routes) {
      const g = f.geometry;
      if (!g || !g.coordinates) continue;
      const lines = g.type === "LineString" ? [g.coordinates as number[][]] : g.type === "MultiLineString" ? (g.coordinates as number[][][]) : [];
      for (const rawLine of lines) {
        const line = decimateLine(rawLine, 0.00012);
        if (line.length < 2) continue;
        instances.push(
          new C.GeometryInstance({
            geometry: new C.GroundPolylineGeometry({ positions: C.Cartesian3.fromDegreesArray(line.flat()), width: 3 }),
            attributes: { color: routeAttr },
          }),
        );
      }
    }
    if (!instances.length) return;
    const classType = props.noIon ? C.ClassificationType.BOTH : C.ClassificationType.CESIUM_3D_TILE;
    routesPrim.current = v.scene.groundPrimitives.add(
      new C.GroundPolylinePrimitive({ geometryInstances: instances, appearance: new C.PolylineColorAppearance(), classificationType: classType, asynchronous: true }),
    );
    v.scene.requestRender();
    const timer = setTimeout(() => v.scene.requestRender(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.routes, status]);

  // ---- highlighted single route casing + bold overline: fast incremental update without rebuilding all city routes
  useEffect(() => {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v || status !== "ready") return;
    if (casingPrim.current) {
      v.scene.groundPrimitives.remove(casingPrim.current);
      casingPrim.current = null;
    }
    const hr = props.highlightRoute;
    if (!hr || !props.routes.length) {
      v.scene.requestRender();
      return;
    }
    const casing: CesiumNS.GeometryInstance[] = [];
    const casingColor = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString("#f4f3ee").withAlpha(0.92));
    const boldColor = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(COLOURS.route));
    for (const f of props.routes) {
      if (f.properties.route_short_name !== hr) continue;
      const g = f.geometry;
      if (!g || !g.coordinates) continue;
      const lines = g.type === "LineString" ? [g.coordinates as number[][]] : g.type === "MultiLineString" ? (g.coordinates as number[][][]) : [];
      for (const rawLine of lines) {
        const line = decimateLine(rawLine, 0.00006);
        if (line.length < 2) continue;
        const positions = C.Cartesian3.fromDegreesArray(line.flat());
        casing.push(
          new C.GeometryInstance({
            geometry: new C.GroundPolylineGeometry({ positions, width: 11 }),
            attributes: { color: casingColor },
          }),
          new C.GeometryInstance({
            geometry: new C.GroundPolylineGeometry({ positions, width: 7 }),
            attributes: { color: boldColor },
          }),
        );
      }
    }
    if (!casing.length) return;
    const classType = props.noIon ? C.ClassificationType.BOTH : C.ClassificationType.CESIUM_3D_TILE;
    casingPrim.current = v.scene.groundPrimitives.add(
      new C.GroundPolylinePrimitive({ geometryInstances: casing, appearance: new C.PolylineColorAppearance(), classificationType: classType, asynchronous: true }),
    );
    v.scene.requestRender();
    const timer = setTimeout(() => v.scene.requestRender(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (scene.globe) scene.globe.enableLighting = prof.lighting;
    scene.highDynamicRange = false;
    v.shadows = prof.shadows;
    try {
      const liftShadows = !propsRef.current.noIon && (prof.name === "high" || prof.name === "medium");
      if (liftShadows) {
        if (!brightnessStageRef.current && C.PostProcessStageLibrary?.createBrightnessStage) {
          const stage = C.PostProcessStageLibrary.createBrightnessStage();
          stage.uniforms.brightness = 1.08;
          scene.postProcessStages.add(stage);
          brightnessStageRef.current = stage;
        }
        if (brightnessStageRef.current) {
          brightnessStageRef.current.uniforms.brightness = 1.08;
          brightnessStageRef.current.enabled = true;
        }
      } else if (brightnessStageRef.current) {
        brightnessStageRef.current.enabled = false;
      }
    } catch {
      // brightness stage is optional visual polish
    }
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

  function keepCameraInside(C: Cesium, v: CesiumNS.Viewer, strict: boolean): void {
    const cam = v.scene.camera;
    const carto = cam.positionCartographic;
    const lon = deg(carto.longitude);
    const lat = deg(carto.latitude);
    const height = carto.height;
    // While actively dragging/zooming, allow slight slack above the underground floor (-14 m, still above -18 m harbour)
    // so clamping never fights active pointer gestures; snap strictly to CAMERA_LIMITS on moveEnd.
    if (!strict && pointerDownRef.current && height >= -14 && height <= CAMERA_LIMITS.maxHeight && lon >= CAMERA_LIMITS.west && lon <= CAMERA_LIMITS.east && lat >= CAMERA_LIMITS.south && lat <= CAMERA_LIMITS.north) {
      return;
    }
    const fixed = clampCameraPosition({ lon, lat, height });
    if (!fixed) return;
    // Mutate camera.position in place rather than cam.setView() so active ScreenSpaceCameraController inertia/drag state stays intact
    C.Cartesian3.fromDegrees(fixed.lon, fixed.lat, fixed.height, C.Ellipsoid.WGS84, cam.position);
  }

  // ---- buses

  function setupBuses(C: Cesium, v: CesiumNS.Viewer, billboards: CesiumNS.BillboardCollection): (mx: number, my: number) => boolean {
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
    let activeModelLoads = 0;

    const silhouetteColour = C.Color.fromCssColorString("#f5b544");
    const selectedEyeOffset = new C.Cartesian3(0, 0, -200);
    const badgeScaleByDistance = new C.NearFarScalar(400, 1, 9000, 0.72);
    const scratchHpr = new C.HeadingPitchRoll();

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
        if (!busesRef.current.has(id)) {
          m.destroy();
          return null;
        }
        scene.primitives.add(m);
        m.readyEvent.addEventListener(() => scene.requestRender());
        return m;
      } catch {
        failedModels = true; // keep going with the flat pins
        return null;
      }
    };

    const loadBusModelsIfNear = (id: number, b: BusPrims) => {
      if (failedModels || b.modelsLoading || b.near || b.mid || activeModelLoads >= 4) return;
      b.modelsLoading = true;
      activeModelLoads += 2;
      const prof = propsRef.current.profile;
      void Promise.all([
        makeModel(nearUrl, id, 0, prof.nearModelMetres),
        makeModel(midUrl, id, prof.nearModelMetres, prof.midModelMetres),
      ]).then(([near, mid]) => {
        activeModelLoads = Math.max(0, activeModelLoads - 2);
        if (!busesRef.current.has(id)) return;
        b.near = near;
        b.mid = mid;
        b.matrixLon = Number.NaN; // force initial matrix placement on next draw
        drawRef.current();
      });
    };

    // crowds become counts, as in 2D: pins that overlap on screen beyond the near-model distance merge into one.
    // Separated into buses and static pins so the 100ms bus glide interval only declutters ~100 buses,
    // not 4,800+ static pins every frame.
    const busClusters: { bb: CesiumNS.Billboard; winX: number; winY: number; visible: boolean }[] = [];
    const staticClusters: { bb: CesiumNS.Billboard; winX: number; winY: number; visible: boolean }[] = [];

    const declutterBuses = () => {
      const prof = propsRef.current.profile;
      const cam = scene.camera;
      const selKey = propsRef.current.selectedKey;
      const w = scene.canvas.clientWidth;
      const h = scene.canvas.clientHeight;
      const items: { id: number; x: number; y: number; world: CesiumNS.Cartesian3; bus: BusPrims }[] = [];

      for (const [id, b] of busesRef.current) {
        if (!b.last) {
          b.visible = false;
          continue;
        }
        const world = b.badge.position;
        const win = C.SceneTransforms.worldToWindowCoordinates(scene, world);
        if (`asset:${id}` === selKey || C.Cartesian3.distance(cam.positionWC, world) < prof.nearModelMetres) {
          b.badge.show = true;
          b.visible = Boolean(win && win.x >= -60 && win.x <= w + 60 && win.y >= -60 && win.y <= h + 60);
          b.winX = win ? win.x : Number.NaN;
          b.winY = win ? win.y : Number.NaN;
          continue;
        }
        if (!win || win.x < -60 || win.x > w + 60 || win.y < -60 || win.y > h + 60) {
          b.badge.show = false;
          b.visible = false;
          b.winX = Number.NaN;
          b.winY = Number.NaN;
          continue;
        }
        b.winX = win.x;
        b.winY = win.y;
        items.push({ id, x: win.x, y: win.y, world, bus: b });
      }

      const byId = new Map(items.map((it) => [it.id, it]));
      let used = 0;
      for (const g of clusterScreenPoints(items, 34)) {
        const members = g.ids.map((id) => byId.get(id)!);
        if (members.length === 1) {
          members[0].bus.badge.show = true;
          members[0].bus.visible = true;
          continue;
        }
        for (const m of members) {
          m.bus.badge.show = false;
          m.bus.visible = false;
        }
        const centre = new C.Cartesian3();
        for (const m of members) C.Cartesian3.add(centre, m.world, centre);
        C.Cartesian3.divideByScalar(centre, members.length, centre);
        let entry = busClusters[used];
        if (!entry) {
          entry = {
            bb: billboards.add({ position: centre, verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 1 / PIXEL_RATIO }),
            winX: Number.NaN,
            winY: Number.NaN,
            visible: false,
          };
          busClusters.push(entry);
        }
        const cb = entry.bb;
        cb.position = centre;
        const hex = COLOURS.ink.replace("#", "");
        cb.setImage(`cluster|bus|${hex}|${members.length}`, image(`cluster|bus|${hex}|${members.length}`, () => drawCluster(members.length, "bus", COLOURS.ink)));
        cb.id = { kind: "cluster", count: members.length, at: C.Cartesian3.clone(centre) };
        cb.show = true;
        const cWin = C.SceneTransforms.worldToWindowCoordinates(scene, centre);
        entry.winX = cWin ? cWin.x : Number.NaN;
        entry.winY = cWin ? cWin.y : Number.NaN;
        entry.visible = Boolean(cWin);
        used++;
      }
      for (let i = used; i < busClusters.length; i++) {
        busClusters[i].bb.show = false;
        busClusters[i].visible = false;
      }
    };

    const declutterStaticPins = () => {
      const prof = propsRef.current.profile;
      const cam = scene.camera;
      const selKey = propsRef.current.selectedKey;
      const w = scene.canvas.clientWidth;
      const h = scene.canvas.clientHeight;
      const items: { id: number; x: number; y: number; world: CesiumNS.Cartesian3; pin: StaticPin }[] = [];

      let n = 0;
      for (const [key, pin] of pinsRef.current) {
        const world = pin.bb.position;
        const dist = C.Cartesian3.distance(cam.positionWC, world);
        if (pin.glyph === "stop" && dist > 900 && key !== selKey) {
          pin.bb.show = false;
          pin.visible = false;
          pin.winX = Number.NaN;
          pin.winY = Number.NaN;
          continue;
        }
        if (pin.glyph === "station" && dist > 2800 && key !== selKey) {
          pin.bb.show = false;
          pin.visible = false;
          pin.winX = Number.NaN;
          pin.winY = Number.NaN;
          continue;
        }
        const win = C.SceneTransforms.worldToWindowCoordinates(scene, world);
        // Frustum / viewport culling: hide pins outside the screen viewport
        if (!win || win.x < -60 || win.x > w + 60 || win.y < -60 || win.y > h + 60) {
          pin.bb.show = false;
          pin.visible = false;
          pin.winX = Number.NaN;
          pin.winY = Number.NaN;
          continue;
        }
        pin.winX = win.x;
        pin.winY = win.y;
        if (pin.glyph === "stop" || pin.glyph === "station" || key === selKey || dist < prof.nearModelMetres) {
          pin.bb.show = true;
          pin.visible = true;
          continue;
        }
        items.push({ id: n++, x: win.x, y: win.y, world, pin });
      }

      const byId = new Map(items.map((it) => [it.id, it]));
      let used = 0;
      for (const g of clusterScreenPoints(items, 60)) {
        const members = g.ids.map((id) => byId.get(id)!);
        if (members.length === 1) {
          members[0].pin.bb.show = true;
          members[0].pin.visible = true;
          continue;
        }
        for (const m of members) {
          m.pin.bb.show = false;
          m.pin.visible = false;
        }
        const centre = new C.Cartesian3();
        for (const m of members) C.Cartesian3.add(centre, m.world, centre);
        C.Cartesian3.divideByScalar(centre, members.length, centre);
        let entry = staticClusters[used];
        if (!entry) {
          entry = {
            bb: billboards.add({ position: centre, verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 1 / PIXEL_RATIO }),
            winX: Number.NaN,
            winY: Number.NaN,
            visible: false,
          };
          staticClusters.push(entry);
        }
        const cb = entry.bb;
        cb.position = centre;
        const clusterColour = members[0]?.pin.colour ?? COLOURS.ink;
        const hex = clusterColour.replace("#", "").toLowerCase();
        cb.setImage(`cluster|${hex}|${members.length}`, image(`cluster|${hex}|${members.length}`, () => drawCluster(members.length, "", clusterColour)));
        cb.id = { kind: "cluster", count: members.length, at: C.Cartesian3.clone(centre) };
        cb.show = true;
        const cWin = C.SceneTransforms.worldToWindowCoordinates(scene, centre);
        entry.winX = cWin ? cWin.x : Number.NaN;
        entry.winY = cWin ? cWin.y : Number.NaN;
        entry.visible = Boolean(cWin);
        used++;
      }
      for (let i = used; i < staticClusters.length; i++) {
        staticClusters[i].bb.show = false;
        staticClusters[i].visible = false;
      }
    };

    declutterStaticRef.current = declutterStaticPins;

    let cameraTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDeclutter = () => {
      if (!cameraTimer) {
        cameraTimer = setTimeout(() => {
          cameraTimer = null;
          if (pointerDownRef.current) {
            declutterBuses();
          } else {
            declutterStaticPins();
            declutterBuses();
          }
          scene.requestRender();
        }, 160);
      }
    };
    scene.camera.changed.addEventListener(scheduleDeclutter);
    scene.camera.moveEnd.addEventListener(() => {
      if (cameraTimer) {
        clearTimeout(cameraTimer);
        cameraTimer = null;
      }
      declutterStaticPins();
      declutterBuses();
      scene.requestRender();
    });

    drawRef.current = () => {
      const p = propsRef.current;
      const prof = p.profile;
      const now = Date.now();
      const seen = new Set<number>();
      const sel = p.selectedKey;
      const camPos = scene.camera.positionWC;
      const modelLoadRadius = prof.midModelMetres * 1.25;
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
            modelsLoading: false,
            badge: billboards.add({ show: false, position: C.Cartesian3.ZERO, id: { kind: "asset", id: f.id } }),
            badgeKey: "",
            height: null,
            heightAt: 0,
            triedTiles: -1,
            bearing: f.properties.bearing ?? 90,
            matrixLon: Number.NaN,
            matrixLat: Number.NaN,
            matrixH: Number.NaN,
            matrixBearing: Number.NaN,
            last: null,
            winX: Number.NaN,
            winY: Number.NaN,
            visible: false,
          };
          busesRef.current.set(f.id, b);
          // one pin vocabulary in 3D: the badge at every distance, a little smaller far away
          b.badge.scaleByDistance = badgeScaleByDistance;
        }
        // heading from route-snapped bearing if given, else movement delta, else the reported bearing
        if (typeof pos.bearing === "number" && Number.isFinite(pos.bearing)) {
          b.bearing = ((pos.bearing % 360) + 360) % 360;
        } else if (b.last && (Math.abs(b.last.lon - pos.lon) > 1e-7 || Math.abs(b.last.lat - pos.lat) > 1e-7)) {
          const dLon = (pos.lon - b.last.lon) * Math.cos(rad(pos.lat));
          b.bearing = (deg(Math.atan2(dLon, pos.lat - b.last.lat)) + 360) % 360;
        } else if (!b.last && typeof f.properties.bearing === "number") b.bearing = f.properties.bearing;
        b.last = pos;
        const twinH = cleanTwinRef.current?.isActive() ? cleanTwinRef.current.groundHeightAt(pos.lon, pos.lat) : null;
        const busH = twinH !== null ? twinH + 0.12 : (p.noIon ? 0 : (b.height ?? -18));
        const position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, busH);
        const camDist = C.Cartesian3.distance(camPos, position);
        const isSel = sel === `asset:${f.id}`;

        // Lazily instantiate glTF 3D models only for buses near enough to display them
        if (camDist <= modelLoadRadius || isSel) {
          loadBusModelsIfNear(f.id, b);
        }

        if ((b.near || b.mid) && (camDist <= modelLoadRadius || isSel)) {
          if (pos.lon !== b.matrixLon || pos.lat !== b.matrixLat || busH !== b.matrixH || b.bearing !== b.matrixBearing) {
            scratchHpr.heading = rad(b.bearing - 90);
            scratchHpr.pitch = 0;
            scratchHpr.roll = 0;
            const frame = C.Transforms.headingPitchRollToFixedFrame(position, scratchHpr);
            if (b.near) b.near.modelMatrix = frame;
            if (b.mid) b.mid.modelMatrix = frame;
            b.matrixLon = pos.lon;
            b.matrixLat = pos.lat;
            b.matrixH = busH;
            b.matrixBearing = b.bearing;
          }
          if (b.near) {
            b.near.silhouetteColor = silhouetteColour;
            b.near.silhouetteSize = isSel ? 3 : 0;
          }
          if (b.mid) {
            b.mid.silhouetteColor = silhouetteColour;
            b.mid.silhouetteSize = isSel ? 3 : 0;
          }
        }

        const status = busStatus(f.properties.status, f.properties.delay_seconds);
        const route = f.properties.route_short_name;
        const facingWest = b.bearing > 180;
        const compact = Boolean(b.near) && camDist <= prof.nearModelMetres;
        const badgeKey = `${status}|${route}|${isSel}|${facingWest ? "w" : "e"}|${compact ? "c" : "f"}`;
        if (b.badgeKey !== badgeKey) {
          b.badge.setImage(`badge|${badgeKey}`, image(`badge|${badgeKey}`, () => drawBusBadge(status, route, isSel, facingWest, compact, busRenderImage())));
          b.badge.scale = 1 / PIXEL_RATIO;
          b.badge.verticalOrigin = C.VerticalOrigin.BOTTOM;
          b.badge.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          b.badgeKey = badgeKey;
        }
        b.badge.position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, busH + 4.2);
        b.badge.show = true;
        // the selected bus is drawn in front of its neighbours and a quarter larger, as in 2D
        b.badge.eyeOffset = isSel ? selectedEyeOffset : C.Cartesian3.ZERO;
        b.badge.scale = (isSel ? 1.25 : 1) / PIXEL_RATIO;
        if (isSel) selectedPos = position;
      }
      for (const [id, b] of busesRef.current) {
        if (seen.has(id)) continue;
        if (b.near) scene.primitives.remove(b.near);
        if (b.mid) scene.primitives.remove(b.mid);
        billboards.remove(b.badge);
        busesRef.current.delete(id);
      }
      if (window.__globe3d) window.__globe3d.buses = busesRef.current.size;
      declutterBuses();
      // follow: keep the camera's angle and distance, move with the bus
      if (p.following && selectedPos) {
        const cam = scene.camera;
        const orbit = currentOrbit(C, v);
        const range = orbit ? Math.max(CAMERA_LIMITS.minRange, Math.min(orbit.range, 1500)) : 600;
        cam.lookAt(selectedPos, new C.HeadingPitchRange(cam.heading, Math.min(cam.pitch, rad(-15)), range));
      }
      scene.requestRender();
    };

    const nearScreen = (visible: boolean, x: number, y: number, mx: number, my: number, radiusPx: number, yOffsetPx: number): boolean => {
      if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      const dx = x - mx;
      const dy = y + yOffsetPx - my;
      return dx * dx + dy * dy <= radiusPx * radiusPx;
    };

    return (mx: number, my: number): boolean => {
      for (const b of busesRef.current.values()) {
        if (nearScreen(b.visible, b.winX, b.winY, mx, my, 24, -15)) return true;
      }
      for (const cb of busClusters) {
        if (nearScreen(cb.visible, cb.winX, cb.winY, mx, my, 20, 0)) return true;
      }
      for (const pin of pinsRef.current.values()) {
        if (nearScreen(pin.visible, pin.winX, pin.winY, mx, my, 20, -18)) return true;
      }
      for (const cb of staticClusters) {
        if (nearScreen(cb.visible, cb.winX, cb.winY, mx, my, 20, 0)) return true;
      }
      return false;
    };
  }

  /**
   * One height sample per GPS report: when a bus's newest report is newer than its height, ask the tiles once
   * where the ground is there. Off-screen buses wait until tiles load or the camera moves over them.
   */
  function refreshHeights(all: boolean): void {
    const C = window.Cesium;
    const v = viewerRef.current;
    if (!C || !v) return;
    const p = propsRef.current;
    const twinActive = Boolean(cleanTwinRef.current?.isActive());
    if (p.noIon && !twinActive) {
      for (const b of busesRef.current.values()) b.height = 0;
      return;
    }
    const metrics = window.__globe3d;
    if (!twinActive && (!tilesetRef.current || !metrics || metrics.firstFrameMs === null)) return;
    if (!all && (pointerDownRef.current || cameraMovingRef.current)) return;

    const currentTiles = metrics?.tilesLoaded ?? 0;
    const w = v.scene.canvas.clientWidth;
    const h = v.scene.canvas.clientHeight;
    let budget = all ? 120 : 40;
    const scratchCarto = new C.Cartographic();

    for (const f of p.vehicles) {
      const b = busesRef.current.get(f.id);
      const c = f.geometry?.coordinates as [number, number] | undefined;
      if (!b || !c) continue;
      const reportAt = Date.parse(f.properties.position_ts) || 0;
      if (twinActive) {
        const twinH = cleanTwinRef.current!.groundHeightAt(c[0], c[1]);
        if (twinH !== null) {
          b.height = twinH + 0.12;
          b.heightAt = reportAt;
          continue;
        }
      }
      if (b.height !== null && b.heightAt >= reportAt) continue;
      if (b.triedTiles === currentTiles && b.heightAt === 0 && b.height !== null) continue;
      if (!all && b.badge.position) {
        const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, b.badge.position);
        if (!win || win.x < -120 || win.x > w + 120 || win.y < -120 || win.y > h + 120) {
          if (b.height === null) b.height = -18;
          continue;
        }
      }
      if (budget-- <= 0) break;
      b.triedTiles = currentTiles;
      const objects = [b.near, b.mid].filter(Boolean) as object[];
      C.Cartographic.fromDegrees(c[0], c[1], 0, scratchCarto);
      const sampled = v.scene.sampleHeight(scratchCarto, objects);
      if (typeof sampled === "number" && Number.isFinite(sampled)) {
        b.height = sampled;
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
    const pin = key ? pinsRef.current.get(key) : undefined;
    let world: CesiumNS.Cartesian3 | null = null;
    if (b && b.last) {
      const twinH = cleanTwinRef.current?.isActive() ? cleanTwinRef.current.groundHeightAt(b.last.lon, b.last.lat) : null;
      const popupH = twinH !== null ? twinH + 0.12 : (propsRef.current.noIon ? 0 : (b.height ?? -18));
      world = C.Cartesian3.fromDegrees(b.last.lon, b.last.lat, popupH + 4.2);
    } else if (pin) world = pin.bb.position;
    if (!world) {
      elp.style.visibility = "hidden";
      return;
    }
    const win = C.SceneTransforms.worldToWindowCoordinates(v.scene, world);
    if (!win) {
      elp.style.visibility = "hidden";
      return;
    }
    elp.style.visibility = "visible";
    elp.style.transform = `translate(${Math.round(win.x)}px, ${Math.round(win.y)}px)`;
  }

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat, zoom) => {
      const C = window.Cesium;
      const v = viewerRef.current;
      if (!C || !v) return;
      const o = currentOrbit(C, v);
      const range = rangeForZoom(lat, zoom ?? 15, v.scene.canvas.clientHeight || 800);
      const next = clampOrbit({ lon, lat, range: Math.min(range, o ? o.range : range), heading: o ? o.heading : 0, pitch: o ? Math.min(o.pitch, -25) : -40 });
      const sphere = new C.BoundingSphere(C.Cartesian3.fromDegrees(next.lon, next.lat, 0), 1);
      const offset = new C.HeadingPitchRange(rad(next.heading), rad(next.pitch), next.range);
      if (propsRef.current.reducedMotion) v.scene.camera.viewBoundingSphere(sphere, offset);
      else v.scene.camera.flyToBoundingSphere(sphere, { offset, duration: 0.9 });
      v.scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
    },
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
      <div ref={el} className="globe-canvas" onContextMenu={(e) => e.preventDefault()} />
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
}));

export default Globe3D;
