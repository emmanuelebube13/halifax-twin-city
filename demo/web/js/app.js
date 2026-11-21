// Halifax Twin demo page: map, live transportation numbers, bus selection, system check.
import { HalifaxMap } from "./map.js";

const timeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Halifax", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const number = new Intl.NumberFormat("en-CA");
const $ = (id) => document.getElementById(id);
const text = (id, value) => { $(id).textContent = value; };
const halifaxTime = (iso) => (iso ? timeFormat.format(new Date(iso)) : "unknown");

function setCheck(id, value, ok) {
  const el = $(id);
  el.textContent = value;
  el.className = ok === undefined ? "" : ok ? "ok" : "fail";
}

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
}

function showMessage(msg) {
  const el = $("map-message");
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------------------------------------------------------------- side panel

async function checkHealth() {
  try {
    const h = await getJson("/api/health");
    setCheck("chk-api", `Running, version ${h.app_version}`, true);
    text("attribution", h.attribution);
    const db = h.database;
    if (db.reachable) {
      setCheck("chk-db", `${db.database}: ${db.silver_table_count} silver tables, PostGIS ${db.postgis_version}`, true);
    } else {
      setCheck("chk-db", db.configured ? "Not reachable. " + db.message : "Not configured yet", false);
    }
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

function describeDelay(s) {
  if (s === null || s === undefined) return "No stop reached yet on this trip";
  const m = Math.round(Math.abs(s) / 60);
  if (Math.abs(s) < 60) return `${Math.abs(s)} s ${s < 0 ? "early" : "late"}`;
  return `${m} min ${s < 0 ? "early" : "late"}`;
}

function showSelected(p) {
  if (!p) { $("selected").hidden = true; $("overview").hidden = false; return; }
  $("overview").hidden = true;
  $("selected").hidden = false;
  text("sel-title", `Bus ${p.label}`);
  const status = { "on time": "on time", late: "running late", early: "running early", unknown: "status not known yet" }[p.status];
  text("sel-answer", p.route ? `Route ${p.route} is ${status}.` : `Not on a trip right now.`);
  text("sel-route", p.route ? `${p.route} ${p.route_name || ""}` : "–");
  text("sel-stop", p.last_stop ? `${p.last_stop} at ${halifaxTime(p.last_stop_ts)}` : "–");
  text("sel-delay", describeDelay(p.delay_seconds));
  text("sel-speed", p.speed_kmh === null || p.speed_kmh === undefined ? "–" : `${p.speed_kmh} km/h`);
  text("sel-ts", `${halifaxTime(p.position_ts)} Halifax time`);
  text("sel-trust", "Source: Halifax Transit GTFS Realtime (SRC-001, SRC-002). Reliability: Tier 1 – Official. " +
    "On time = 60 s early to 300 s late.");
}

// ---------------------------------------------------------------- map

let map = null;

async function loadBuses() {
  if (!map) return;
  try {
    const b = await getJson("/api/layers/transportation/buses");
    map.setBuses(b);
    text("updated", `Updated ${halifaxTime(b.as_of)} Halifax time · ${b.count} buses`);
  } catch (e) {
    text("updated", "Live buses not available");
  }
}

async function loadRoutes() {
  try {
    await map.setRoutes(await getJson("/api/layers/transportation/routes"));
    map.setVisible("routes", $("layer-routes").checked);
  } catch (e) { /* routes are optional */ }
}

function setModeButtons(mode) {
  $("btn-2d").classList.toggle("active", mode === "2D");
  $("btn-3d").classList.toggle("active", mode === "3D");
}

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
  showSelected(null);
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

  if (!window.Cesium) {
    showMessage("The map library could not load. Check the internet connection.");
    return;
  }
  map = new HalifaxMap($("map"), config, {
    onSelect: showSelected,
    onModeChange: setModeButtons,
    onError: showMessage,
  });
  window.halifaxMap = map;   // for inspection from the browser console
  if (has3D) await map.show3D(); else map.show2D();

  $("btn-2d").addEventListener("click", () => { showMessage(""); map.show2D(); });
  $("btn-3d").addEventListener("click", () => { showMessage(""); map.show3D(); });
  $("zoom-in").addEventListener("click", () => map.zoom(1));
  $("zoom-out").addEventListener("click", () => map.zoom(-1));
  $("reset-view").addEventListener("click", () => map.resetNorth());
  $("sel-close").addEventListener("click", () => showSelected(null));
  $("layer-buses").addEventListener("change", (e) => map.setVisible("buses", e.target.checked));
  $("layer-routes").addEventListener("change", (e) => map.setVisible("routes", e.target.checked));
  document.querySelectorAll(".sector").forEach((b) => b.addEventListener("click", () => selectSector(b.dataset.sector)));

  await loadBuses();
  setInterval(loadBuses, 15000);
  loadRoutes();
}

init();
