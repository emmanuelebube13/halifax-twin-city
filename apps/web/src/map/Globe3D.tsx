// Realistic 3D: CesiumJS with Google Photorealistic 3D Tiles through Cesium ion. Loaded only when the API's
// client-config says 3D is available and hands over a token (it does so only for requests from this computer).
// The token is never stored, logged or written anywhere by the app. Google and Cesium credits stay on screen.

import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import type { Feature, VehicleProperties } from "../api/types";
import { t } from "../i18n";
import { busStatus } from "../lib/status";
import { buildPinImages, busImageId, PIXEL_RATIO } from "./pins";

type Cesium = typeof CesiumNS;

declare global {
  interface Window {
    Cesium?: Cesium;
    CESIUM_BASE_URL?: string;
  }
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
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium did not load")));
    s.onerror = () => reject(new Error("Cesium did not load"));
    document.head.appendChild(s);
  });
  return loading;
}

interface Props {
  token: string;
  assetId: number;
  vehicles: Feature<VehicleProperties>[];
  positionFor: (id: number, now: number) => { lon: number; lat: number } | null;
  selectedKey: string | null;
  reducedMotion: boolean;
  onSelect: (sel: { kind: "asset"; id: number; layer: string } | null) => void;
  onFailed: () => void;
}

export function Globe3D(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let viewer: CesiumNS.Viewer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    (async () => {
      try {
        const C = await loadCesium();
        if (cancelled || !el.current) return;
        C.Ion.defaultAccessToken = propsRef.current.token;
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
          requestRenderMode: false,
        });
        viewer.scene.globe.show = false;
        viewer.scene.skyAtmosphere.show = true;
        const tileset = await C.Cesium3DTileset.fromIonAssetId(propsRef.current.assetId, { showCreditsOnScreen: true, maximumScreenSpaceError: 16 });
        if (cancelled) return;
        viewer.scene.primitives.add(tileset);
        viewer.camera.setView({
          destination: C.Cartesian3.fromDegrees(-63.5672, 44.6298, 1400),
          orientation: { heading: C.Math.toRadians(330), pitch: C.Math.toRadians(-35), roll: 0 },
        });
        // pins: the same images as the 2D map
        const pins = await buildPinImages();
        const byId = new Map(pins.map((p) => [p.id, p.canvas]));
        const billboards = viewer.scene.primitives.add(new C.BillboardCollection({ scene: viewer.scene })) as CesiumNS.BillboardCollection;
        const items = new Map<number, CesiumNS.Billboard>();
        const draw = () => {
          const now = Date.now();
          const p = propsRef.current;
          const seen = new Set<number>();
          for (const f of p.vehicles) {
            const pos = p.positionFor(f.id, now);
            if (!pos) continue;
            seen.add(f.id);
            const st = busStatus(f.properties.status, f.properties.delay_seconds);
            const sel = p.selectedKey === `asset:${f.id}`;
            const img = byId.get(busImageId(st, (f.properties.bearing ?? 90) > 180, sel));
            let b = items.get(f.id);
            const position = C.Cartesian3.fromDegrees(pos.lon, pos.lat, 0);
            if (!b) {
              b = billboards.add({
                position,
                image: img,
                scale: 1 / PIXEL_RATIO,
                verticalOrigin: C.VerticalOrigin.BOTTOM,
                heightReference: C.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                id: { kind: "asset", id: f.id },
              });
              items.set(f.id, b);
            } else {
              b.position = position;
              if (img) b.image = img as unknown as string;
              b.scale = (sel ? 1.25 : 1) / PIXEL_RATIO;
            }
          }
          for (const [id, b] of items) {
            if (!seen.has(id)) {
              billboards.remove(b);
              items.delete(id);
            }
          }
        };
        draw();
        timer = setInterval(draw, propsRef.current.reducedMotion ? 5000 : 200);
        const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((e: { position: CesiumNS.Cartesian2 }) => {
          const picked = viewer?.scene.pick(e.position) as { id?: { kind: string; id: number } } | undefined;
          if (picked?.id?.kind === "asset") propsRef.current.onSelect({ kind: "asset", id: picked.id.id, layer: "vehicles" });
          else propsRef.current.onSelect(null);
        }, C.ScreenSpaceEventType.LEFT_CLICK);
        setStatus("ready");
      } catch {
        if (!cancelled) propsRef.current.onFailed();
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      viewer?.destroy();
    };
  }, []);

  return (
    <div className="globe" aria-label={t("map.label")}>
      <div ref={el} className="globe-canvas" />
      {status === "loading" && <p className="globe-loading" role="status">{t("view.3dLoading")}</p>}
    </div>
  );
}
