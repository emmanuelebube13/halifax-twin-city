// Halifax Twin demo page: map, panels, search, list view, replay, analytics, system check.
import { HalifaxMap, LIVE_LAG_S } from "./map.js";

const timeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Halifax", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const number = new Intl.NumberFormat("en-CA");
const $ = (id) => document.getElementById(id);
const text = (id, value) => { $(id).textContent = value; };
const halifaxTime = (iso) => (iso ? timeFormat.format(new Date(iso)) : "unknown");
const STATUS_WORDS = { "on time": "on time", late: "running late", early: "running early", unknown: "status not known yet" };

let map = null;
let lastBuses = null;
let replayTimer = null;

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
}

function setCheck(id, value, ok) {
  const el = $(id);
  el.textContent = value;
  el.className = ok === undefined ? "" : ok ? "ok" : "fail";
}

function showMessage(msg) {
  $("map-message").textContent = msg;
  $("map-message").hidden = !msg;
}

function describeDelay(s) {
  if (s === null || s === undefined) return "No stop reached yet on this trip";
  if (Math.abs(s) < 60) return `${Math.abs(s)} s ${s < 0 ? "early" : "late"}`;
  return `${Math.round(Math.abs(s) / 60)} min ${s < 0 ? "early" : "late"}`;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onclick") e.addEventListener("click", v); else if (k === "class") e.className = v; else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

// ---------------------------------------------------------------- panels

function showPanel(name) {
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `panel-${name}`;
  $("btn-list").classList.toggle("active", name === "list");
  if (name === "overview" && map) {
    map.viewer.trackedEntity = undefined;
  }
}

function closePanel() {
  if (map) { map.selectBus(null); map.selectRoute(null); map.viewer.trackedEntity = undefined; }
  showPanel(currentLens === "analytics" ? "analytics" : "overview");
}

function busRow(p) {
  const status = p.status in STATUS_WORDS ? p.status : "unknown";
  return el("li", {},
    el("button", { type: "button", class: "row", onclick: () => openBus(p.vehicle_asset_id, true) },
      el("i", { class: `dot ${status.replace(" ", "-")}` }),
      el("span", { class: "row-main" }, p.route ? `Route ${p.route}` : "Not on a trip", el("small", {}, ` Bus ${p.label}`)),
      el("span", { class: "row-side" }, p.delay_seconds === null || p.delay_seconds === undefined ? "–" : describeDelay(p.delay_seconds))));
}

function openBus(id, fly = false) {
  if (!map) return;
  map.selectRoute(null);
  map.selectBus(id, { fly });
  const p = map.busProps.get(id);
  if (!p) return;
  text("sel-title", `Bus ${p.label}`);
  text("sel-answer", p.route ? `Route ${p.route} is ${STATUS_WORDS[p.status] || STATUS_WORDS.unknown}.` : "Not on a trip right now.");
  const routeBtn = $("sel-route");
  routeBtn.textContent = p.route ? `${p.route} ${p.route_name || ""}` : "–";
  routeBtn.disabled = !p.route;
  routeBtn.onclick = () => openRoute(p.route, true);
  text("sel-stop", p.last_stop ? `${p.last_stop} at ${halifaxTime(p.last_stop_ts)}` : "–");
  text("sel-delay", describeDelay(p.delay_seconds));
  text("sel-speed", p.speed_kmh === null || p.speed_kmh === undefined ? "–" : `${p.speed_kmh} km/h`);
  text("sel-ts", `${halifaxTime(p.position_ts)} Halifax time`);
  $("sel-follow").textContent = "Follow this bus";
  $("sel-follow").onclick = () => {
    const e = map.buses.entities.getById(`bus-${id}`);
    const following = map.viewer.trackedEntity === e;
    map.viewer.trackedEntity = following ? undefined : e;
    $("sel-follow").textContent = following ? "Follow this bus" : "Stop following";
  };
  showPanel("bus");
}

function openRoute(route, fly = false) {
  if (!map || !route) return;
  map.selectBus(null);
  map.selectRoute(route, { fly });
  const info = map.routeList().find((r) => r.route === route);
  const buses = map.busList().filter((p) => p.route === route);
  const late = buses.filter((p) => p.status === "late").length;
  text("route-title", `Route ${route}`);
  text("route-answer", `${info ? info.route_name + ". " : ""}${buses.length} bus${buses.length === 1 ? "" : "es"} on the road now` +
    (buses.length ? `, ${late} late.` : "."));
  const ul = $("route-buses");
  ul.replaceChildren(...(buses.length ? buses.map(busRow) : [el("li", { class: "empty" }, "No bus on this route right now.")]));
  showPanel("route");
}

function renderList() {
  const order = { late: 0, early: 1, "on time": 2, unknown: 3 };
  const buses = map ? map.busList().sort((a, b) => (order[a.status] - order[b.status]) ||
    String(a.route).localeCompare(String(b.route), "en", { numeric: true })) : [];
  text("list-lede", `${buses.length} buses, late first. Select one to fly to it.`);
  $("list-rows").replaceChildren(...buses.map(busRow));
}

// ---------------------------------------------------------------- overview numbers

async function checkHealth() {
  try {
    const h = await getJson("/api/health");
    setCheck("chk-api", `Running, version ${h.app_version}`, true);
    text("attribution", h.attribution);
    const db = h.database;
    if (db.reachable) setCheck("chk-db", `${db.database}: ${db.silver_table_count} silver tables, PostGIS ${db.postgis_version}`, true);
    else setCheck("chk-db", db.configured ? "Not reachable. " + db.message : "Not configured yet", false);
  } catch (e) {
    setCheck("chk-api", "Not reachable", false);
  }
}

async function loadNow() {
  try {
    const n = await getJson("/api/now");
    const t = n.transportation;
    text("now-pwk", n.public_works.message);
    text("now-hre", n.housing.message);
    if (!t.available) {
      text("now-lede", "Live numbers are not available.");
      text("now-trn", "No data");
      text("trn-trust", t.message);
      return;
    }
    text("now-lede", `${number.format(t.buses_live)} buses on the road right now.`);
    text("now-trn", `${number.format(t.buses_live)} live`);
    text("trn-buses", number.format(t.buses_live));
    text("trn-ontime", t.on_time_percent === null ? "No arrivals in the last 30 min"
      : `${t.on_time_percent}% (${number.format(t.on_time)} of ${number.format(t.arrivals_last_30_min)} arrivals, last 30 min)`);
    text("trn-late", `${number.format(t.late)} late, ${number.format(t.early)} early`);
    text("trn-alerts", number.format(t.alerts_active));
    text("trn-trips", number.format(t.trips_planned_today));
    text("trn-trust", `On time = ${t.on_time_rule}. Source: Halifax Transit GTFS Realtime and schedule. ` +
      `As of ${halifaxTime(t.as_of)} Halifax time. Reliability: ${t.reliability_tier}.`);
  } catch (e) {
    text("now-lede", "Live numbers are not available.");
  }
}

// ---------------------------------------------------------------- analytics

async function loadAnalytics() {
  try {
    const a = await getJson("/api/analytics/transportation");
    text("an-answer", a.on_time_percent_today === null ? "No arrivals recorded today yet."
      : `${a.on_time_percent_today}% of ${number.format(a.arrivals_today)} arrivals today were on time.`);
    const max = Math.max(1, ...a.hours.map((h) => h.arrivals));
    $("an-hours").replaceChildren(...a.hours.map((h) => el("div", { class: "bar-row" },
      el("span", { class: "bar-label" }, `${String(h.hour).padStart(2, "0")}:00`),
      el("span", { class: "bar-track" }, Object.assign(el("span", { class: "bar-fill" }), {
        style: `width:${(100 * h.arrivals / max).toFixed(0)}%`,
      })),
      el("span", { class: "bar-value" }, h.on_time_percent === null ? "–" : `${h.on_time_percent}%`))));
    $("an-routes").replaceChildren(...a.routes.slice(0, 12).map((r) => el("li", {},
      el("button", { type: "button", class: "row", onclick: () => openRoute(r.route, true) },
        el("span", { class: "row-main" }, `Route ${r.route}`, el("small", {}, ` ${r.route_name || ""}`)),
        el("span", { class: "row-side" }, `${r.on_time_percent}% on time`,
          el("small", {}, ` ${r.late} late, ${r.early} early`))))));
    text("an-trust", `On time = ${a.on_time_rule}. Routes with at least 10 arrivals. Source: ${a.source}. ` +
      `As of ${halifaxTime(a.as_of)} Halifax time. Reliability: ${a.reliability_tier}.`);
  } catch (e) {
    text("an-answer", "Analytics are not available.");
  }
}

// ---------------------------------------------------------------- lens: live, replay, analytics

let currentLens = "live";

async function setLens(lens) {
  currentLens = lens;
  document.querySelectorAll(".lens button").forEach((b) => b.classList.toggle("active", b.dataset.lens === lens));
  $("replay-bar").hidden = lens !== "replay";
  if (!map) return;
  if (lens === "replay") {
    text("updated", "Loading the last 30 minutes");
    try {
      const trails = await getJson("/api/layers/transportation/trails?minutes=30");
      map.startReplay(trails, 30, Number($("replay-speed").value));
      $("replay-pause").textContent = "Pause";
    } catch (e) {
      showMessage("Replay is not available.");
    }
  } else {
    map.goLive();
    if (lastBuses) map.setBuses(lastBuses);
  }
  if (lens === "analytics") { loadAnalytics(); showPanel("analytics"); } else if (!$("panel-analytics").hidden) showPanel("overview");
}

function onTick(date, mode, speed) {
  if (mode === "replay") {
    text("replay-clock", `Replay ${timeFormat.format(date)}`);
    text("updated", `Replay of the last 30 min at ${speed}x`);
  }
}

// ---------------------------------------------------------------- search

function searchItems(q) {
  q = q.trim().toLowerCase();
  if (!q || !map) return [];
  const out = [];
  for (const r of map.routeList()) {
    if (String(r.route).toLowerCase().startsWith(q) || (r.route_name || "").toLowerCase().includes(q)) {
      out.push({ label: `Route ${r.route} ${r.route_name || ""}`, kind: "Route", go: () => openRoute(r.route, true) });
    }
  }
  for (const p of map.busList()) {
    if (String(p.label).toLowerCase().startsWith(q)) {
      out.push({ label: `Bus ${p.label}${p.route ? " on route " + p.route : ""}`, kind: "Bus", go: () => openBus(p.vehicle_asset_id, true) });
    }
  }
  const sectors = { transportation: "Transportation", "public works": "Public Works", housing: "Housing" };
  for (const [key, name] of Object.entries(sectors)) {
    if (key.startsWith(q)) out.push({ label: name, kind: "Sector", go: () => selectSector(key.replace(" ", "_")) });
  }
  return out.slice(0, 10);
}

function renderSearch() {
  const items = searchItems($("search").value);
  const ul = $("search-results");
  ul.hidden = items.length === 0;
  ul.replaceChildren(...items.map((it) => el("li", {},
    el("button", { type: "button", onclick: () => { ul.hidden = true; $("search").value = ""; it.go(); } },
      el("small", {}, it.kind), it.label))));
}

// ---------------------------------------------------------------- sectors

const SECTOR_NOTICE = {
  public_works: "Public Works layers (311, work orders, parks, trees, flood extents) arrive with task D06.",
  housing: "Housing layers (permits, zoning, buildings, rentals) arrive with task D07.",
  sources: "Sources: Halifax Transit GTFS Realtime (SRC-001 to SRC-003) and GTFS schedule (SRC-004), " +
           "Open Government Licence – Halifax. More sources arrive with D04 to D07.",
};

function selectSector(sector) {
  document.querySelectorAll(".sector").forEach((b) => b.classList.toggle("active", b.dataset.sector === sector));
  const notice = SECTOR_NOTICE[sector];
  $("sector-notice").hidden = !notice;
  if (notice) text("sector-notice", notice);
  const transit = ["city", "transportation", "all", "sources"].includes(sector);
  if (map) {
    map.setVisible("buses", transit && $("layer-buses").checked);
    map.setVisible("routes", transit && $("layer-routes").checked);
  }
  showPanel("overview");
}

// ---------------------------------------------------------------- start

async function loadBuses() {
  if (!map) return;
  try {
    const b = await getJson("/api/layers/transportation/buses");
    lastBuses = b;
    await map.setBuses(b);
    if (currentLens !== "replay") {
      text("updated", `Live · ${b.count} buses · positions ${LIVE_LAG_S} s behind, as of ${halifaxTime(b.as_of)}`);
    }
    if (!$("panel-list").hidden) renderList();
  } catch (e) {
    text("updated", "Live buses not available");
  }
}

async function init() {
  checkHealth();
  loadNow();
  setInterval(checkHealth, 30000);
  setInterval(loadNow, 15000);

  let config = {};
  try { config = await getJson("/api/config"); } catch (e) { /* 2D still works */ }
  const has3D = Boolean(config.three_d_available);
  $("btn-3d").disabled = !has3D;
  $("btn-3d").title = has3D ? "Photorealistic 3D" : "Needs a Cesium ion token";
  setCheck("chk-3d", has3D ? "Token found: photorealistic 3D available" : "No token: 2D only", has3D);

  // controls that work without the map
  $("search").addEventListener("input", renderSearch);
  $("search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("search-results").querySelector("button"); if (first) first.click(); }
    if (e.key === "Escape") $("search-results").hidden = true;
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) $("search-results").hidden = true; });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanel));
  document.querySelectorAll("[data-sector]").forEach((b) => b.addEventListener("click", () => selectSector(b.dataset.sector)));
  document.querySelectorAll(".lens button").forEach((b) => b.addEventListener("click", () => setLens(b.dataset.lens)));
  $("btn-list").addEventListener("click", () => {
    if (!$("panel-list").hidden) { showPanel("overview"); return; }
    renderList(); showPanel("list");
  });
  document.querySelector("[data-question='TRN-Q01']").addEventListener("click", () => setLens("analytics"));

  if (!window.Cesium) {
    showMessage("The map library could not load. Check the internet connection.");
    return;
  }
  map = new HalifaxMap($("map"), config, {
    onSelect: (sel) => {
      if (!sel) { if (currentLens !== "analytics") showPanel("overview"); return; }
      if (sel.type === "bus") openBus(sel.props.vehicle_asset_id);
      if (sel.type === "route") openRoute(sel.route);
    },
    onModeChange: (mode) => {
      $("btn-2d").classList.toggle("active", mode === "2D");
      $("btn-3d").classList.toggle("active", mode === "3D");
    },
    onError: showMessage,
    onTick,
  });
  window.halifaxMap = map;   // for inspection from the browser console

  $("btn-2d").addEventListener("click", () => { showMessage(""); map.show2D(); });
  $("btn-3d").addEventListener("click", () => { showMessage(""); map.show3D(); });
  $("zoom-in").addEventListener("click", () => map.zoom(1));
  $("zoom-out").addEventListener("click", () => map.zoom(-1));
  $("reset-view").addEventListener("click", () => { map.viewer.trackedEntity = undefined; map.resetNorth(); });
  $("layer-buses").addEventListener("change", (e) => map.setVisible("buses", e.target.checked));
  $("layer-routes").addEventListener("change", (e) => map.setVisible("routes", e.target.checked));
  $("replay-speed").addEventListener("change", (e) => { map.viewer.clock.multiplier = Number(e.target.value); });
  $("replay-pause").addEventListener("click", () => {
    const c = map.viewer.clock;
    c.shouldAnimate = !c.shouldAnimate;
    $("replay-pause").textContent = c.shouldAnimate ? "Pause" : "Play";
  });

  if (has3D) await map.show3D(); else map.show2D();

  // a few minutes of history first, so buses start driving straight away
  try { map.addTrails(await getJson("/api/layers/transportation/trails?minutes=3")); } catch (e) { /* live points still come */ }
  await loadBuses();
  setInterval(loadBuses, 15000);
  try {
    await map.setRoutes(await getJson("/api/layers/transportation/routes"));
    map.setVisible("routes", $("layer-routes").checked);
  } catch (e) { /* routes are optional */ }
}

init();
