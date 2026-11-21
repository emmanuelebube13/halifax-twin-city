// Halifax Twin map: Cesium with Google Photorealistic 3D Tiles (needs the ion token), and a 2D view
// on OpenStreetMap that always works without a token. Tuned for a small PC with integrated graphics.

const Cesium = window.Cesium;
const HALIFAX_3D = { lon: -63.5835, lat: 44.6355, height: 900, heading: 20, pitch: -32 };
const HALIFAX_2D = { lon: -63.585, lat: 44.655, height: 16000 };
const GOOGLE_PHOTOREALISTIC_ION_ASSET = 2275207;  // Cesium ion asset for Google Photorealistic 3D Tiles

const STATUS_STYLE = {
  "on time": { fill: "#1b1f24", outline: "#ffffff" },
  "late": { fill: "#c2500f", outline: "#ffffff" },
  "early": { fill: "#ffffff", outline: "#1b1f24" },
  "unknown": { fill: "#8a939c", outline: "#ffffff" },
};

// Bus pins: the side view of the Halifax Transit bus in a frame coloured by on-time status, with a pointer
// underneath. Drawn once per status and direction (8 canvases), then shared by every bus.
const PIN = { img: 192, imgH: 53, pad: 6, border: 4, pointer: 12 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawPin(img, style, facingWest) {
  const w = PIN.img + 2 * (PIN.pad + PIN.border);
  const h = PIN.imgH + 2 * (PIN.pad + PIN.border);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h + PIN.pointer;
  const g = c.getContext("2d");
  const r = 10;
  const frame = new Path2D();
  frame.roundRect(PIN.border / 2, PIN.border / 2, w - PIN.border, h - PIN.border, r);
  g.fillStyle = "#ffffff";
  g.fill(frame);
  g.lineWidth = PIN.border;
  g.strokeStyle = style.fill === "#ffffff" ? "#1b1f24" : style.fill;
  g.stroke(frame);
  // pointer
  g.beginPath();
  g.moveTo(w / 2 - PIN.pointer, h - PIN.border);
  g.lineTo(w / 2, h + PIN.pointer - 2);
  g.lineTo(w / 2 + PIN.pointer, h - PIN.border);
  g.closePath();
  g.fillStyle = style.fill === "#ffffff" ? "#1b1f24" : style.fill;
  g.fill();
  // bus, flipped when it travels west so it faces its direction
  g.save();
  const x = PIN.border + PIN.pad;
  const y = PIN.border + PIN.pad;
  if (facingWest) {
    g.translate(x + PIN.img, y);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, PIN.img, PIN.imgH);
  } else {
    g.drawImage(img, x, y, PIN.img, PIN.imgH);
  }
  g.restore();
  if (style.fill === "#ffffff") {          // early: hollow look, thin inner ring
    g.lineWidth = 1.5;
    g.strokeStyle = "#1b1f24";
    g.strokeRect(PIN.border + 2, PIN.border + 2, w - 2 * PIN.border - 4, h - 2 * PIN.border - 4);
  }
  return c;
}

async function buildPins() {
  const img = await loadImage("img/bus-side.png");
  const pins = {};
  for (const [status, style] of Object.entries(STATUS_STYLE)) {
    pins[`${status}|E`] = drawPin(img, style, false);
    pins[`${status}|W`] = drawPin(img, style, true);
  }
  return pins;
}

export class HalifaxMap {
  constructor(container, config, { onSelect, onModeChange, onError } = {}) {
    this.config = config;
    this.onSelect = onSelect || (() => {});
    this.onModeChange = onModeChange || (() => {});
    this.onError = onError || (() => {});
    this.tileset = null;
    this.mode = null;

    if (config.cesium_ion_token) Cesium.Ion.defaultAccessToken = config.cesium_ion_token;

    this.viewer = new Cesium.Viewer(container, {
      baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      })),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      requestRenderMode: true,              // draw only when something changes
      maximumRenderTimeChange: Infinity,
    });
    const scene = this.viewer.scene;
    scene.fog.enabled = false;
    // With requestRenderMode, the globe only fetches tiles while it draws: redraw as each tile arrives.
    scene.globe.tileLoadProgressEvent.addEventListener(() => scene.requestRender());
    this.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
    scene.globe.enableLighting = false;
    this.viewer.resolutionScale = Math.min(1, 1.25 / (window.devicePixelRatio || 1));  // cap the pixel ratio

    this.buses = new Cesium.CustomDataSource("buses");
    this.viewer.dataSources.add(this.buses);
    this.routes = null;

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click) => {
      const picked = scene.pick(click.position);
      const entity = picked && picked.id;
      if (entity && entity.properties && entity.properties.kind && entity.properties.kind.getValue() === "bus") {
        this.onSelect(entity.properties.getValue(Cesium.JulianDate.now()));
      } else {
        this.onSelect(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  get threeDAvailable() { return Boolean(this.config.cesium_ion_token); }

  async show3D() {
    if (!this.threeDAvailable) return this.show2D();
    try {
      if (!this.tileset) {
        const assetId = this.config.cesium_photorealistic_asset_id || GOOGLE_PHOTOREALISTIC_ION_ASSET;
        this.tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
          maximumScreenSpaceError: 24,           // coarser detail than the default 16: lighter on integrated graphics
          showCreditsOnScreen: true,             // Google's terms require the credits on screen
          skipLevelOfDetail: true,
        });
        this.viewer.scene.primitives.add(this.tileset);
      }
      if (this.viewer.scene.mode !== Cesium.SceneMode.SCENE3D) this.viewer.scene.morphTo3D(0);
      this.tileset.show = true;
      this.viewer.scene.globe.show = false;
      this.setHeightReference(Cesium.HeightReference.CLAMP_TO_GROUND);   // sit on the 3D buildings and streets
      this.fly(HALIFAX_3D);
      this.mode = "3D";
      this.onModeChange("3D");
    } catch (e) {
      this.onError(`3D tiles could not load (${e.message || e}). Showing 2D.`);
      this.show2D();
    }
  }

  show2D() {
    if (this.tileset) this.tileset.show = false;
    this.viewer.scene.globe.show = true;
    if (this.viewer.scene.mode !== Cesium.SceneMode.SCENE2D) this.viewer.scene.morphTo2D(0);
    this.setHeightReference(Cesium.HeightReference.NONE);              // flat map: no ground to clamp to
    this.fly({ ...HALIFAX_2D, heading: 0, pitch: -90 });
    this.mode = "2D";
    this.onModeChange("2D");
  }

  setHeightReference(ref) {
    this.heightReference = ref;
    for (const e of this.buses.entities.values) {
      if (e.billboard) e.billboard.heightReference = ref;
      if (e.point) e.point.heightReference = ref;
      if (e.label) e.label.heightReference = ref;
    }
  }

  fly({ lon, lat, height, heading = 0, pitch = -90 }) {
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: { heading: Cesium.Math.toRadians(heading), pitch: Cesium.Math.toRadians(pitch), roll: 0 },
    });
    this.viewer.scene.requestRender();
  }

  zoom(factor) {
    const cam = this.viewer.camera;
    const h = this.viewer.scene.mode === Cesium.SceneMode.SCENE2D ? cam.positionCartographic.height : cam.positionCartographic.height;
    if (factor > 0) cam.zoomIn(h * 0.4); else cam.zoomOut(h * 0.6);
    this.viewer.scene.requestRender();
  }

  resetNorth() {
    if (this.mode === "3D") this.fly(HALIFAX_3D); else this.fly({ ...HALIFAX_2D, heading: 0, pitch: -90 });
  }

  async setBuses(geojson) {
    if (this.pins === undefined) {
      try { this.pins = await buildPins(); } catch (e) { this.pins = null; }   // null: fall back to dots
    }
    const seen = new Set();
    for (const f of geojson.features) {
      const p = f.properties;
      const id = `bus-${p.vehicle_asset_id}`;
      seen.add(id);
      const [lon, lat] = f.geometry.coordinates;
      const style = STATUS_STYLE[p.status] || STATUS_STYLE.unknown;
      const position = Cesium.Cartesian3.fromDegrees(lon, lat);
      let e = this.buses.entities.getById(id);
      if (!e) {
        e = this.buses.entities.add({
          id,
          billboard: this.pins ? {
            scale: 0.3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: this.heightReference,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 15000, 0.6),
          } : undefined,
          point: this.pins ? undefined : {
            pixelSize: 13, outlineWidth: 2,
            heightReference: this.heightReference,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            font: "600 13px 'IBM Plex Sans', sans-serif",
            pixelOffset: new Cesium.Cartesian2(0, this.pins ? -30 : -18),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            fillColor: Cesium.Color.fromCssColorString("#1b1f24"), outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: this.heightReference,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000),
          },
        });
      }
      e.position = position;
      if (this.pins) {
        const west = p.bearing_degrees !== null && p.bearing_degrees > 180 && p.bearing_degrees < 360;
        e.billboard.image = this.pins[`${p.status in STATUS_STYLE ? p.status : "unknown"}|${west ? "W" : "E"}`];
      } else {
        e.point.color = Cesium.Color.fromCssColorString(style.fill);
        e.point.outlineColor = Cesium.Color.fromCssColorString(style.outline);
      }
      e.label.text = p.route || "";
      e.properties = new Cesium.PropertyBag({ kind: "bus", ...p });
    }
    for (const e of [...this.buses.entities.values]) {
      if (!seen.has(e.id)) this.buses.entities.remove(e);
    }
    this.viewer.scene.requestRender();
  }

  async setRoutes(geojson) {
    if (this.routes) this.viewer.dataSources.remove(this.routes, true);
    this.routes = await Cesium.GeoJsonDataSource.load(geojson, {
      clampToGround: true,
      stroke: Cesium.Color.fromCssColorString("#0b5ea8").withAlpha(0.55),
      strokeWidth: 3,
    });
    await this.viewer.dataSources.add(this.routes);
    this.viewer.dataSources.lowerToBottom(this.routes);
    this.viewer.scene.requestRender();
  }

  setVisible(layer, visible) {
    const ds = layer === "buses" ? this.buses : this.routes;
    if (ds) ds.show = visible;
    this.viewer.scene.requestRender();
  }
}
