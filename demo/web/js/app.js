// Halifax Twin demo shell (task D01): checks the API, the database and whether 3D is available.

const timeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Halifax", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function setCheck(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = ok === undefined ? "" : ok ? "ok" : "fail";
}

async function getJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
}

async function checkHealth() {
  try {
    const h = await getJson("/api/health");
    setCheck("chk-api", `Running, version ${h.app_version}`, true);
    document.getElementById("as-of").textContent = timeFormat.format(new Date(h.as_of)) + " Halifax time";
    document.getElementById("attribution").textContent = h.attribution;
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

async function checkConfig() {
  try {
    const c = await getJson("/api/config");
    const btn = document.getElementById("btn-3d");
    btn.disabled = !c.three_d_available;
    btn.title = c.three_d_available ? "3D arrives in task D09" : "Needs a Cesium ion token";
    setCheck("chk-3d", c.three_d_available ? "Token found (view arrives in D09)" : "No token: 2D only", c.three_d_available);
  } catch (e) {
    setCheck("chk-3d", "Unknown", false);
  }
}

checkHealth();
checkConfig();
setInterval(checkHealth, 30000);
