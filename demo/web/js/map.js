// Halifax Twin map: Cesium with Google Photorealistic 3D Tiles (needs the ion token), and a 2D view
// on OpenStreetMap that always works without a token. Tuned for a small PC with integrated graphics.
//
// Buses drive: each bus position is a time series of its real GPS reports, and the map clock runs a little
// behind real time (LIVE_LAG_S) so every bus moves smoothly between two reports it has already sent.

const Cesium = window.Cesium;
const HALIFAX_3D = { lon: -63.5835, lat: 44.6355, height: 900, heading: 20, pitch: -32 };
const HALIFAX_2D = { lon: -63.585, lat: 44.655, height: 16000 };
const GOOGLE_PHOTOREALISTIC_ION_ASSET = 2275207;  // Cesium ion asset for Google Photorealistic 3D Tiles
export const LIVE_LAG_S = 60;

const STATUS_STYLE = {
  "on time": { fill: "#1b1f24" },
  "late": { fill: "#c2500f" },
  "early": { fill: "#ffffff" },
  "unknown": { fill: "#8a939c" },
};
const ROUTE_COLOUR = Cesium.Color.fromCssColorString("#0b5ea8");

// ---------------------------------------------------------------- bus pins

const PIN = { img: 192, imgH: 53, pad: 6, border: 4, pointer: 12 };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawPin(img, style, facingWest, selected) {
  const w = PIN.img + 2 * (PIN.pad + PIN.border);
  const h = PIN.imgH + 2 * (PIN.pad + PIN.border);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h + PIN.pointer;
  const g = c.getContext("2d");
  const ink = style.fill === "#ffffff" ? "#1b1f24" : style.fill;
  const frame = new Path2D();
  frame.roundRect(PIN.border / 2, PIN.border / 2, w - PIN.border, h - PIN.border, 10);
  g.fillStyle = selected ? "#ffe9a8" : "#ffffff";
  g.fill(frame);
  g.lineWidth = selected ? PIN.border * 1.8 : PIN.border;
  g.strokeStyle = selected ? "#0b5ea8" : ink;
  g.stroke(frame);
  g.beginPath();
  g.moveTo(w / 2 - PIN.pointer, h - PIN.border);
  g.lineTo(w / 2, h + PIN.pointer - 2);
  g.lineTo(w / 2 + PIN.pointer, h - PIN.border);
  g.closePath();
  g.fillStyle = ink;
  g.fill();
  const x = PIN.border + PIN.pad;
  const y = PIN.border + PIN.pad;
  g.save();
  if (facingWest) {
    g.translate(x + PIN.img, y);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, PIN.img, PIN.imgH);
  } else {
    g.drawImage(img, x, y, PIN.img, PIN.imgH);
  }
  g.restore();
  if (style.fill === "#ffffff") {
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
    for (const dir of ["E", "W"]) {
      pins[`${status}|${dir}`] = drawPin(img, style, dir === "W", false);
      pins[`${status}|${dir}|sel`] = drawPin(img, style, dir === "W", true);
    }
  }
  return pins;
}

// ---------------------------------------------------------------- map

export class HalifaxMap {
  constructor(container, config, { onSelect, onModeChange, onError, onTick } = {}) {
    this.config = config;
    this.onSelect = onSelect || (() => {});
    this.onModeChange = onModeChange || (() => {});
    this.onError = onError || (() => {});
    this.onTick = onTick || (() => {});
    this.tileset = null;
    this.mode = null;
    this.timeMode = "live";       // live or replay
    this.busProps = new Map();     // vehicle_asset_id -> latest properties
    this.selectedBus = null;
    this.selectedRoute = null;
    this.pins = undefined;

    if (config.cesium_ion_token) Cesium.Ion.defaultAccessToken = config.cesium_ion_token;

    this.viewer = new Cesium.Viewer(container, {
      baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      requestRenderMode: true,            // draw only when something changes ...
      maximumRenderTimeChange: 0.05,      // ... and when the clock moves, so buses glide (about 20 frames a second)
      targetFrameRate: 30,
    });
    const scene = this.viewer.scene;
    scene.fog.enabled = false;
    scene.globe.tileLoadProgressEvent.addEventListener(() => scene.requestRender());
    this.viewer.resolutionScale = Math.min(1, 1.25 / (window.devicePixelRatio || 1));
    this.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;

    const clock = this.viewer.clock;
    clock.shouldAnimate = true;
    clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    this.goLive();
    clock.onTick.addEventListener(() => this._tick());

    this.buses = new Cesium.CustomDataSource("buses");
    this.viewer.dataSources.add(this.buses);
    this.routes = null;
    this.routeEntities = new Map();    // route number -> entities

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click) => this._click(click.position), Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((move) => {
      const picked = scene.pick(move.endPosition);
      scene.canvas.style.cursor = picked && picked.id && picked.id.properties ? "pointer" : "";
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  get threeDAvailable() { return Boolean(this.config.cesium_ion_token); }

  // ---- clock

  goLive() {
    const c = this.viewer.clock;
    this.timeMode = "live";
    c.multiplier = 1;
    c.shouldAnimate = true;
    c.clockRange = Cesium.ClockRange.UNBOUNDED;
    c.currentTime = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), -LIVE_LAG_S, new Cesium.JulianDate());
  }

  startReplay(trails, minutes, speed) {
    const c = this.viewer.clock;
    const now = Cesium.JulianDate.now();
    this.timeMode = "replay";
    c.startTime = Cesium.JulianDate.addMinutes(now, -minutes, new Cesium.JulianDate());
    c.stopTime = Cesium.JulianDate.addSeconds(now, -LIVE_LAG_S, new Cesium.JulianDate());
    c.currentTime = c.startTime.clone();
    c.clockRange = Cesium.ClockRange.LOOP_STOP;
    c.multiplier = speed;
    c.shouldAnimate = true;
    return this.addTrails(trails);
  }

  _tick() {
    const c = this.viewer.clock;
    if (this.timeMode === "live") {
      // stay LIVE_LAG_S behind real time (the tab may have been asleep)
      const target = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), -LIVE_LAG_S, new Cesium.JulianDate());
      if (Math.abs(Cesium.JulianDate.secondsDifference(c.currentTime, target)) > 5) c.currentTime = target;
    }
    this.onTick(Cesium.JulianDate.toDate(c.currentTime), this.timeMode, c.multiplier);
  }

  // ---- 2D / 3D

  async show3D() {
    if (!this.threeDAvailable) return this.show2D();
    try {
      if (!this.tileset) {
        const assetId = this.config.cesium_photorealistic_asset_id || GOOGLE_PHOTOREALISTIC_ION_ASSET;
        this.tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId, {
          maximumScreenSpaceError: 24, showCreditsOnScreen: true, skipLevelOfDetail: true,
        });
        this.viewer.scene.primitives.add(this.tileset);
      }
      if (this.viewer.scene.mode !== Cesium.SceneMode.SCENE3D) this.viewer.scene.morphTo3D(0);
      this.tileset.show = true;
      this.viewer.scene.globe.show = false;
      this.setHeightReference(Cesium.HeightReference.CLAMP_TO_GROUND);
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
    this.setHeightReference(Cesium.HeightReference.NONE);
    this.fly({ ...HALIFAX_2D, heading: 0, pitch: -90 });
    this.mode = "2D";
    this.onModeChange("2D");
  }

  setHeightReference(ref) {
    this.heightReference = ref;
    for (const e of this.buses.entities.values) {
      if (e.billboard) e.billboard.heightReference = ref;
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
    const h = cam.positionCartographic.height;
    if (factor > 0) cam.zoomIn(h * 0.4); else cam.zoomOut(h * 0.6);
    this.viewer.scene.requestRender();
  }

  resetNorth() {
    if (this.mode === "3D") this.fly(HALIFAX_3D); else this.fly({ ...HALIFAX_2D, heading: 0, pitch: -90 });
  }

  // ---- buses

  _busEntity(id) {
    let e = this.buses.entities.getById(`bus-${id}`);
    if (e) return e;
    const position = new Cesium.SampledPositionProperty();
    position.setInterpolationOptions({ interpolationDegree: 1, interpolationAlgorithm: Cesium.LinearApproximation });
    position.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    position.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
    e = this.buses.entities.add({
      id: `bus-${id}`,
      position,
      billboard: {
        image: this.pins ? this.pins["unknown|E"] : undefined,
        scale: 0.3,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: this.heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.2, 15000, 0.6),
      },
      label: {
        text: "",
        font: "600 13px 'IBM Plex Sans', sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -30),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        fillColor: Cesium.Color.fromCssColorString("#1b1f24"), outlineColor: Cesium.Color.WHITE, outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: this.heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000),
      },
    });
    e.properties = new Cesium.PropertyBag({ kind: "bus", vehicle_asset_id: id });
    return e;
  }

  _addSample(e, ms, lon, lat) {
    e.position.addSample(Cesium.JulianDate.fromDate(new Date(ms)), Cesium.Cartesian3.fromDegrees(lon, lat));
  }

  async addTrails(trails) {
    if (this.pins === undefined) {
      try { this.pins = await buildPins(); } catch (e) { this.pins = null; }
    }
    for (const [id, points] of Object.entries(trails.buses)) {
      const e = this._busEntity(Number(id));
      for (const [ms, lon, lat] of points) this._addSample(e, ms, lon, lat);
      const p = this.busProps.get(Number(id)) || { vehicle_asset_id: Number(id), status: "unknown" };
      this._styleBus(e, p);
    }
    this.viewer.scene.requestRender();
  }

  _styleBus(e, p) {
    if (!this.pins) return;
    const west = p.bearing_degrees !== null && p.bearing_degrees !== undefined && p.bearing_degrees > 180;
    const status = p.status in STATUS_STYLE ? p.status : "unknown";
    const sel = this.selectedBus === p.vehicle_asset_id ? "|sel" : "";
    e.billboard.image = this.pins[`${status}|${west ? "W" : "E"}${sel}`];
    e.label.text = p.route || "";
  }

  async setBuses(geojson) {
    if (this.pins === undefined) {
      try { this.pins = await buildPins(); } catch (e) { this.pins = null; }
    }
    const seen = new Set();
    for (const f of geojson.features) {
      const p = f.properties;
      seen.add(`bus-${p.vehicle_asset_id}`);
      const e = this._busEntity(p.vehicle_asset_id);
      const [lon, lat] = f.geometry.coordinates;
      this._addSample(e, Date.parse(p.position_ts), lon, lat);
      e.properties = new Cesium.PropertyBag({ kind: "bus", ...p });
      this.busProps.set(p.vehicle_asset_id, p);
      this._styleBus(e, p);
    }
    if (this.timeMode === "live") {
      for (const e of [...this.buses.entities.values]) if (!seen.has(e.id)) this.buses.entities.remove(e);
    }
    this._applyRouteFilter();
    this.viewer.scene.requestRender();
  }

  busList() {
    return [...this.busProps.values()];
  }

  selectBus(id, { fly = false } = {}) {
    const prev = this.selectedBus;
    this.selectedBus = id;
    for (const pid of [prev, id]) {
      if (pid === null || pid === undefined) continue;
      const e = this.buses.entities.getById(`bus-${pid}`);
      const p = this.busProps.get(pid);
      if (e && p) this._styleBus(e, p);
    }
    if (fly && id !== null) {
      const e = this.buses.entities.getById(`bus-${id}`);
      if (e) {
        const pos = e.position.getValue(this.viewer.clock.currentTime);
        if (pos) {
          const range = this.mode === "3D" ? 700 : 3000;
          this.viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos, 50), {
            duration: 1.2,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(this.mode === "3D" ? -35 : -90), range),
          });
        }
      }
    }
    this.viewer.scene.requestRender();
  }

  // ---- routes

  async setRoutes(geojson) {
    if (this.routes) this.viewer.dataSources.remove(this.routes, true);
    this.routes = await Cesium.GeoJsonDataSource.load(geojson, {
      clampToGround: true, stroke: ROUTE_COLOUR.withAlpha(0.55), strokeWidth: 3,
    });
    this.routeEntities = new Map();
    for (const e of this.routes.entities.values) {
      const r = e.properties && e.properties.route && e.properties.route.getValue();
      e.properties.addProperty("kind", "route");
      if (!this.routeEntities.has(r)) this.routeEntities.set(r, []);
      this.routeEntities.get(r).push(e);
    }
    await this.viewer.dataSources.add(this.routes);
    this.viewer.dataSources.lowerToBottom(this.routes);
    this.viewer.scene.requestRender();
  }

  routeList() {
    return [...this.routeEntities.entries()].map(([route, ents]) => ({
      route, route_name: ents[0].properties.route_name.getValue(),
    }));
  }

  selectRoute(route, { fly = false } = {}) {
    this.selectedRoute = route;
    for (const [r, ents] of this.routeEntities) {
      for (const e of ents) {
        const on = route === null || r === route;
        e.polyline.material = new Cesium.ColorMaterialProperty(on && route !== null ? ROUTE_COLOUR : ROUTE_COLOUR.withAlpha(route === null ? 0.55 : 0.15));
        e.polyline.width = on && route !== null ? 6 : 3;
      }
    }
    this._applyRouteFilter();
    if (fly && route !== null && this.routeEntities.has(route)) {
      this.viewer.flyTo(this.routeEntities.get(route), {
        duration: 1.2, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(this.mode === "3D" ? -45 : -90), 0),
      });
    }
    this.viewer.scene.requestRender();
  }

  _applyRouteFilter() {
    for (const e of this.buses.entities.values) {
      const p = e.properties && e.properties.route ? e.properties.route.getValue() : null;
      e.show = this.selectedRoute === null || p === this.selectedRoute;
    }
  }

  // ---- clicks and visibility

  _click(position) {
    const picked = this.viewer.scene.pick(position);
    const e = picked && picked.id;
    const kind = e && e.properties && e.properties.kind ? e.properties.kind.getValue() : null;
    if (kind === "bus") {
      const p = e.properties.getValue(this.viewer.clock.currentTime);
      this.selectBus(p.vehicle_asset_id);
      this.onSelect({ type: "bus", props: this.busProps.get(p.vehicle_asset_id) || p });
    } else if (kind === "route") {
      const r = e.properties.route.getValue();
      this.selectRoute(r);
      this.onSelect({ type: "route", route: r, route_name: e.properties.route_name.getValue() });
    } else {
      this.selectBus(null);
      this.selectRoute(null);
      this.onSelect(null);
    }
  }

  setVisible(layer, visible) {
    const ds = layer === "buses" ? this.buses : this.routes;
    if (ds) ds.show = visible;
    this.viewer.scene.requestRender();
  }
}
