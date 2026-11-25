/**
 * Clean 3D street engine prototype for Halifax Digital Twin.
 * Renders procedural Maritime pitched-roof houses, brick commercial blocks,
 * smooth asphalt streets with sidewalks/crosswalks/bus lanes, multi-lobe 3D trees,
 * 3D glass bus shelters, animated Halifax Transit buses, and Harbour-chart pins
 * using local CesiumJS with zero paid APIs or external CDN requests.
 */
(function () {
  "use strict";

  const Cesium = window.Cesium;
  if (!Cesium) {
    throw new Error("CesiumJS failed to load from ../cesium/Cesium.js");
  }

  window.CESIUM_BASE_URL = "../cesium/";

  const COLOURS = {
    ink: "#13232e",
    harbour: "#0d5466",
    harbourLight: "#1d6f82",
    buoy: "#f5b544",
    late: "#b3410e",
    early: "#ffffff",
    unknown: "#6b7580",
    closure: "#8a3a0c",
    permit: "#4b3a8c",
    selectedFill: "#d9e7ec",
    asphalt: "#384048",
    sidewalk: "#dbd8cf",
    grass: "#b4c6a3",
  };

  const STATUS_SHAPE = {
    on_time: "disc",
    late: "diamond",
    early: "ring",
    unknown: "square",
  };

  const STATUS_FILL = {
    on_time: COLOURS.ink,
    late: COLOURS.late,
    early: COLOURS.early,
    unknown: COLOURS.unknown,
  };

  const STATUS_LABEL = {
    on_time: "On time",
    late: "Late",
    early: "Early",
    unknown: "No schedule",
  };

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- Local tangent plane (ENU) projection ----------

  function createEnuProjector(centreLon, centreLat) {
    const origin = Cesium.Cartesian3.fromDegrees(centreLon, centreLat, 0);
    const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    const ecefToEnu = Cesium.Matrix4.inverse(enuToEcef, new Cesium.Matrix4());
    const scratchPt = new Cesium.Cartesian3();
    const scratchCarto = new Cesium.Cartographic();

    function toEnu(lon, lat) {
      const c = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      const local = Cesium.Matrix4.multiplyByPoint(ecefToEnu, c, new Cesium.Cartesian3());
      return { x: local.x, y: local.y };
    }

    function toCartesian(x, y, z) {
      scratchPt.x = x;
      scratchPt.y = y;
      scratchPt.z = 0;
      const ecef = Cesium.Matrix4.multiplyByPoint(enuToEcef, scratchPt, new Cesium.Cartesian3());
      const carto = Cesium.Cartographic.fromCartesian(ecef, Cesium.Ellipsoid.WGS84, scratchCarto);
      return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, z);
    }

    function toCartographicDegrees(x, y) {
      scratchPt.x = x;
      scratchPt.y = y;
      scratchPt.z = 0;
      const ecef = Cesium.Matrix4.multiplyByPoint(enuToEcef, scratchPt, new Cesium.Cartesian3());
      const carto = Cesium.Cartographic.fromCartesian(ecef, Cesium.Ellipsoid.WGS84, scratchCarto);
      return [deg(carto.longitude), deg(carto.latitude)];
    }

    function vectorEnuToEcef(vx, vy, vz) {
      const dir = Cesium.Matrix4.multiplyByPointAsVector(
        enuToEcef,
        new Cesium.Cartesian3(vx, vy, vz),
        new Cesium.Cartesian3()
      );
      return Cesium.Cartesian3.normalize(dir, dir);
    }

    return { toEnu, toCartesian, toCartographicDegrees, vectorEnuToEcef, enuToEcef };
  }

  // ---------- Geometry mesh builder (CCW outward normals) ----------

  class MeshBuilder {
    constructor(projector) {
      this.projector = projector;
      this.positions = [];
      this.normals = [];
      this.sts = [];
      this.indices = [];
    }

    _pushVertex(p, n, u, v) {
      const idx = this.positions.length / 3;
      const c = this.projector.toCartesian(p[0], p[1], p[2]);
      const nWorld = this.projector.vectorEnuToEcef(n[0], n[1], n[2]);
      this.positions.push(c.x, c.y, c.z);
      this.normals.push(nWorld.x, nWorld.y, nWorld.z);
      this.sts.push(u, v);
      return idx;
    }

    addTriangle(p0, p1, p2, outwardHint, uv0, uv1, uv2) {
      const ax = p1[0] - p0[0];
      const ay = p1[1] - p0[1];
      const az = p1[2] - p0[2];
      const bx = p2[0] - p0[0];
      const by = p2[1] - p0[1];
      const bz = p2[2] - p0[2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-8) return;
      nx /= len;
      ny /= len;
      nz /= len;

      let flip = false;
      if (outwardHint) {
        const dot = nx * outwardHint[0] + ny * outwardHint[1] + nz * outwardHint[2];
        if (dot < 0) {
          flip = true;
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
      }

      const n = [nx, ny, nz];
      const i0 = this._pushVertex(p0, n, uv0[0], uv0[1]);
      if (flip) {
        const i2 = this._pushVertex(p2, n, uv2[0], uv2[1]);
        const i1 = this._pushVertex(p1, n, uv1[0], uv1[1]);
        this.indices.push(i0, i2, i1);
      } else {
        const i1 = this._pushVertex(p1, n, uv1[0], uv1[1]);
        const i2 = this._pushVertex(p2, n, uv2[0], uv2[1]);
        this.indices.push(i0, i1, i2);
      }
    }

    addQuad(p0, p1, p2, p3, outwardHint, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
      this.addTriangle(p0, p1, p2, outwardHint, [u0, v0], [u1, v0], [u1, v1]);
      this.addTriangle(p0, p2, p3, outwardHint, [u0, v0], [u1, v1], [u0, v1]);
    }

    toGeometry() {
      if (this.indices.length === 0) return null;
      const posArr = new Float64Array(this.positions);
      const normArr = new Float32Array(this.normals);
      const stArr = new Float32Array(this.sts);
      const idxArr =
        this.positions.length / 3 > 65535
          ? new Uint32Array(this.indices)
          : new Uint16Array(this.indices);

      return new Cesium.Geometry({
        attributes: {
          position: new Cesium.GeometryAttribute({
            componentDatatype: Cesium.ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: posArr,
          }),
          normal: new Cesium.GeometryAttribute({
            componentDatatype: Cesium.ComponentDatatype.FLOAT,
            componentsPerAttribute: 3,
            values: normArr,
          }),
          st: new Cesium.GeometryAttribute({
            componentDatatype: Cesium.ComponentDatatype.FLOAT,
            componentsPerAttribute: 2,
            values: stArr,
          }),
        },
        indices: idxArr,
        primitiveType: Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(posArr),
      });
    }
  }

  // ---------- Procedural Canvas texture generators ----------

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")];
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function shadeHex(hex, delta) {
    const [r, g, b] = hexToRgb(hex);
    return `rgb(${clamp(r + delta, 0, 255)}, ${clamp(g + delta, 0, 255)}, ${clamp(b + delta, 0, 255)})`;
  }

  function createTextureLibrary() {
    const cache = new Map();
    const getOrCreate = (key, fn) => {
      if (!cache.has(key)) {
        cache.set(key, fn());
      }
      return cache.get(key);
    };

    const grass = () =>
      getOrCreate("grass", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = COLOURS.grass;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1800; i++) {
          const x = (i * 73) % 256;
          const y = (i * 137) % 256;
          g.fillStyle = i % 3 === 0 ? "rgba(86, 114, 68, 0.14)" : "rgba(220, 232, 198, 0.14)";
          g.fillRect(x, y, 2, 2);
        }
        return c.toDataURL("image/png");
      });

    const asphalt = () =>
      getOrCreate("asphalt", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = COLOURS.asphalt;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 2400; i++) {
          const x = (i * 53) % 256;
          const y = (i * 97) % 256;
          g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(10,14,18,0.08)";
          g.fillRect(x, y, 2, 2);
        }
        return c.toDataURL("image/png");
      });

    const sidewalk = () =>
      getOrCreate("sidewalk", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = COLOURS.sidewalk;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = i % 2 === 0 ? "rgba(19,35,46,0.035)" : "rgba(255,255,255,0.08)";
          g.fillRect((i * 89) % 256, (i * 41) % 256, 2, 2);
        }
        g.strokeStyle = "rgba(108, 112, 106, 0.38)";
        g.lineWidth = 2;
        for (let x = 0; x < 256; x += 64) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 256);
          g.stroke();
        }
        g.strokeStyle = "rgba(120, 124, 118, 0.25)";
        g.beginPath();
        g.moveTo(0, 8);
        g.lineTo(256, 8);
        g.stroke();
        return c.toDataURL("image/png");
      });

    const busLane = () =>
      getOrCreate("bus-lane", () => {
        const [c, g] = makeCanvas(256, 512);
        g.fillStyle = "#124c5c";
        g.fillRect(0, 0, 256, 512);
        for (let i = 0; i < 1200; i++) {
          g.fillStyle = "rgba(255,255,255,0.03)";
          g.fillRect((i * 61) % 256, (i * 113) % 512, 2, 2);
        }
        // Left & right crisp lane edge stripes
        g.fillStyle = "rgba(244, 243, 238, 0.9)";
        g.fillRect(8, 0, 8, 512);
        g.fillRect(240, 0, 8, 512);

        // Transit diamond
        g.strokeStyle = "#f4f3ee";
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(128, 72);
        g.lineTo(170, 148);
        g.lineTo(128, 224);
        g.lineTo(86, 148);
        g.closePath();
        g.stroke();

        // BUS ONLY stencil
        g.fillStyle = "#f4f3ee";
        g.font = "700 44px 'IBM Plex Sans', system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("BUS", 128, 330);
        g.fillText("ONLY", 128, 392);
        return c.toDataURL("image/png");
      });

    const crosswalk = () =>
      getOrCreate("crosswalk", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = COLOURS.asphalt;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "#f4f4ef";
        for (let x = 16; x < 248; x += 48) {
          g.fillRect(x, 12, 26, 232);
        }
        return c.toDataURL("image/png");
      });

    const yellowLine = () =>
      getOrCreate("yellow-line", () => {
        const [c, g] = makeCanvas(64, 128);
        g.fillStyle = COLOURS.asphalt;
        g.fillRect(0, 0, 64, 128);
        g.fillStyle = "#e3b23c";
        g.fillRect(18, 0, 10, 128);
        g.fillRect(36, 0, 10, 128);
        return c.toDataURL("image/png");
      });

    const workZone = () =>
      getOrCreate("work-zone", () => {
        const [c, g] = makeCanvas(256, 128);
        g.fillStyle = "#483a30";
        g.fillRect(0, 0, 256, 128);
        g.fillStyle = "#d96b1f";
        for (let x = -128; x < 384; x += 48) {
          g.beginPath();
          g.moveTo(x, 128);
          g.lineTo(x + 22, 128);
          g.lineTo(x + 86, 0);
          g.lineTo(x + 64, 0);
          g.closePath();
          g.fill();
        }
        g.strokeStyle = "#f5b544";
        g.lineWidth = 6;
        g.strokeRect(3, 3, 250, 122);
        return c.toDataURL("image/png");
      });

    const residentialWall = (hex) =>
      getOrCreate(`res-wall-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);

        // Horizontal Maritime clapboard siding courses
        const courses = 22;
        const ch = 256 / courses;
        for (let i = 0; i < courses; i++) {
          const y = i * ch;
          g.fillStyle = i % 2 === 0 ? shadeHex(hex, 6) : shadeHex(hex, -4);
          g.fillRect(0, y, 256, ch - 1.5);
          g.fillStyle = "rgba(19, 35, 46, 0.16)";
          g.fillRect(0, y + ch - 1.5, 256, 1.5);
        }

        // Foundation stone plinth along bottom 9%
        g.fillStyle = "#6c7175";
        g.fillRect(0, 234, 256, 22);
        g.fillStyle = "rgba(19, 35, 46, 0.25)";
        g.fillRect(0, 234, 256, 2);

        // Two-storey framed multi-pane windows (upper & lower rows)
        const drawWindow = (wx, wy, ww, wh, warm) => {
          // Outer cream trim
          g.fillStyle = "#f3f1ea";
          g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
          // Sill
          g.fillStyle = "#dedbd2";
          g.fillRect(wx - 6, wy + wh + 2, ww + 12, 5);
          // Glass pane
          const grad = g.createLinearGradient(wx, wy, wx, wy + wh);
          grad.addColorStop(0, "#243b4a");
          grad.addColorStop(0.65, "#335163");
          grad.addColorStop(1, warm ? "#7f6842" : "#446578");
          g.fillStyle = grad;
          g.fillRect(wx, wy, ww, wh);
          // Muntin bars
          g.fillStyle = "#eae6dc";
          g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          g.fillRect(wx, wy + wh * 0.48, ww, 2);
          // Subtle glass highlight
          g.fillStyle = "rgba(255, 255, 255, 0.16)";
          g.beginPath();
          g.moveTo(wx + 2, wy + 2);
          g.lineTo(wx + ww * 0.45, wy + 2);
          g.lineTo(wx + 2, wy + wh * 0.55);
          g.closePath();
          g.fill();
        };

        drawWindow(32, 34, 42, 60, false);
        drawWindow(107, 34, 42, 60, false);
        drawWindow(182, 34, 42, 60, false);

        drawWindow(32, 136, 42, 62, true);
        drawWindow(182, 136, 42, 62, true);

        // Lower-level heritage wooden front door in centre bay
        g.fillStyle = "#f3f1ea";
        g.fillRect(104, 138, 48, 96);
        g.fillStyle = "#2b424d";
        g.fillRect(109, 143, 38, 91);
        g.fillStyle = "#d9c99e";
        g.fillRect(116, 151, 24, 24);
        g.fillStyle = "#f5b544";
        g.beginPath();
        g.arc(141, 192, 2.5, 0, Math.PI * 2);
        g.fill();

        // Corner trim boards
        g.fillStyle = "#f3f1ea";
        g.fillRect(0, 0, 7, 234);
        g.fillRect(249, 0, 7, 234);

        return c.toDataURL("image/png");
      });

    const commercialWall = (hex) =>
      getOrCreate(`com-wall-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);

        // Subtle brick courses on upper facade
        for (let y = 0; y < 184; y += 8) {
          g.fillStyle = (y / 8) % 2 === 0 ? shadeHex(hex, 5) : shadeHex(hex, -6);
          g.fillRect(0, y, 256, 7);
          g.fillStyle = "rgba(235, 228, 218, 0.14)";
          g.fillRect(0, y + 7, 256, 1);
        }

        // Upper storey regular architectural windows (3 rows x 4 cols)
        const rows = [18, 72, 126];
        const cols = [20, 80, 140, 200];
        for (const wy of rows) {
          for (const wx of cols) {
            g.fillStyle = "#d9d4c9";
            g.fillRect(wx - 2, wy - 4, 40, 42);
            g.fillStyle = "#223846";
            g.fillRect(wx, wy, 36, 36);
            g.fillStyle = "rgba(180, 216, 232, 0.2)";
            g.fillRect(wx + 2, wy + 2, 14, 32);
            g.fillStyle = "#c9c3b6";
            g.fillRect(wx - 3, wy + 36, 42, 4);
          }
        }

        // Cornice band above ground-floor storefront
        g.fillStyle = "#1c2d38";
        g.fillRect(0, 178, 256, 10);
        g.fillStyle = "#d9d4c9";
        g.fillRect(0, 174, 256, 4);

        // Ground-floor retail glazing & dark mullions (bottom 28%)
        g.fillStyle = "#162630";
        g.fillRect(0, 188, 256, 68);
        const bays = [12, 74, 136, 198];
        for (const bx of bays) {
          const grad = g.createLinearGradient(bx, 194, bx, 252);
          grad.addColorStop(0, "#2f5164");
          grad.addColorStop(0.55, "#5c7b88");
          grad.addColorStop(1, "#cfa96c");
          g.fillStyle = grad;
          g.fillRect(bx, 194, 48, 56);
        }
        return c.toDataURL("image/png");
      });

    const shingleRoof = (hex) =>
      getOrCreate(`roof-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);
        const rowH = 16;
        for (let row = 0; row < 16; row++) {
          const y = row * rowH;
          const offset = (row % 2) * 16;
          for (let x = -16; x < 256; x += 32) {
            const delta = ((row * 7 + x) % 13) - 6;
            g.fillStyle = shadeHex(hex, delta);
            g.fillRect(x + offset, y, 31, rowH - 1.5);
          }
          g.fillStyle = "rgba(10, 14, 18, 0.35)";
          g.fillRect(0, y + rowH - 1.5, 256, 1.5);
        }
        return c.toDataURL("image/png");
      });

    const flatRoof = () =>
      getOrCreate("flat-roof", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = "#525960";
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1600; i++) {
          g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(15,20,25,0.08)";
          g.fillRect((i * 47) % 256, (i * 83) % 256, 2, 2);
        }
        return c.toDataURL("image/png");
      });

    const solarPanel = () =>
      getOrCreate("solar-panel", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = "#d0d8e0";
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "#162d4d";
        g.fillRect(8, 8, 240, 240);
        g.strokeStyle = "rgba(182, 206, 228, 0.55)";
        g.lineWidth = 2;
        for (let x = 8; x <= 248; x += 40) {
          g.beginPath();
          g.moveTo(x, 8);
          g.lineTo(x, 248);
          g.stroke();
        }
        for (let y = 8; y <= 248; y += 30) {
          g.beginPath();
          g.moveTo(8, y);
          g.lineTo(248, y);
          g.stroke();
        }
        return c.toDataURL("image/png");
      });

    return {
      grass,
      asphalt,
      sidewalk,
      busLane,
      crosswalk,
      yellowLine,
      workZone,
      residentialWall,
      commercialWall,
      shingleRoof,
      flatRoof,
      solarPanel,
    };
  }

  function makeImageMaterial(imageUrl, repeatX = 1, repeatY = 1) {
    return Cesium.Material.fromType("Image", {
      image: imageUrl,
      repeat: new Cesium.Cartesian2(repeatX, repeatY),
    });
  }

  function makeTexturedAppearance(imageUrl, repeatX = 1, repeatY = 1, translucent = false) {
    return new Cesium.MaterialAppearance({
      material: makeImageMaterial(imageUrl, repeatX, repeatY),
      vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      flat: false,
      translucent,
      closed: false,
      faceForward: false,
    });
  }

  // ---------- Street & sidewalk geometry with clean intersection clipping ----------

  function segIntersect2D(a0, a1, b0, b1) {
    const rX = a1.x - a0.x;
    const rY = a1.y - a0.y;
    const sX = b1.x - b0.x;
    const sY = b1.y - b0.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-6) return null;
    const qpx = b0.x - a0.x;
    const qpy = b0.y - a0.y;
    const t = (qpx * sY - qpy * sX) / denom;
    const u = (qpx * rY - qpy * rX) / denom;
    if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) {
      return { t: clamp(t, 0, 1), u: clamp(u, 0, 1), x: a0.x + t * rX, y: a0.y + t * rY };
    }
    return null;
  }

  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    intervals.sort((a, b) => a[0] - b[0]);
    const out = [intervals[0].slice()];
    for (let i = 1; i < intervals.length; i++) {
      const last = out[out.length - 1];
      if (intervals[i][0] <= last[1]) {
        last[1] = Math.max(last[1], intervals[i][1]);
      } else {
        out.push(intervals[i].slice());
      }
    }
    return out;
  }

  function subtractIntervals(start, end, cuts) {
    let spans = [[start, end]];
    for (const [c0, c1] of cuts) {
      const next = [];
      for (const [s0, s1] of spans) {
        if (c1 <= s0 || c0 >= s1) {
          next.push([s0, s1]);
        } else {
          if (c0 > s0 + 0.2) next.push([s0, c0]);
          if (c1 < s1 - 0.2) next.push([c1, s1]);
        }
      }
      spans = next;
    }
    return spans;
  }

  function buildStreetPrimitives(data, projector, textures) {
    const group = new Cesium.PrimitiveCollection();

    // 1. Clean neighbourhood turf/ground plane
    const groundMesh = new MeshBuilder(projector);
    groundMesh.addQuad(
      [-550, -550, 0.04],
      [550, -550, 0.04],
      [550, 550, 0.04],
      [-550, 550, 0.04],
      [0, 0, 1],
      0,
      44,
      0,
      44
    );
    group.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({ geometry: groundMesh.toGeometry() }),
        appearance: makeTexturedAppearance(textures.grass(), 1, 1, false),
        asynchronous: false,
      })
    );

    const asphaltMesh = new MeshBuilder(projector);
    const sidewalkMesh = new MeshBuilder(projector);
    const busLaneMesh = new MeshBuilder(projector);
    const yellowMesh = new MeshBuilder(projector);
    const crosswalkMesh = new MeshBuilder(projector);

    // Precompute street ENU endpoints & intersections
    const streetPolys = data.streets.map((st) => {
      const pts = st.centreline.map((c) => projector.toEnu(c[0], c[1]));
      return { st, pts };
    });

    const intersections = [];

    for (let i = 0; i < streetPolys.length; i++) {
      const { st, pts } = streetPolys[i];
      const halfW = (st.width_m || 11) / 2;
      const swW = st.sidewalk_width_m || 1.8;

      for (let segIdx = 0; segIdx < pts.length - 1; segIdx++) {
        const p0 = pts[segIdx];
        const p1 = pts[segIdx + 1];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        const ux = dx / len;
        const uy = dy / len;
        const rx = uy; // right-hand normal
        const ry = -ux;

        // Extend slightly by halfW at free endpoints so caps stay crisp
        const ext = 0.0;
        const a0x = p0.x - ux * ext;
        const a0y = p0.y - uy * ext;
        const a1x = p1.x + ux * ext;
        const a1y = p1.y + uy * ext;

        // Asphalt ribbon
        asphaltMesh.addQuad(
          [a0x - rx * halfW, a0y - ry * halfW, 0.1],
          [a0x + rx * halfW, a0y + ry * halfW, 0.1],
          [a1x + rx * halfW, a1y + ry * halfW, 0.1],
          [a1x - rx * halfW, a1y - ry * halfW, 0.1],
          [0, 0, 1],
          0,
          halfW / 4,
          0,
          len / 6
        );

        // Compute intersections along this segment for sidewalk & centreline clipping
        const cutsRoad = [];
        const cutsCross = [];
        for (let j = 0; j < streetPolys.length; j++) {
          if (i === j) continue;
          const other = streetPolys[j];
          const otherHalfW = (other.st.width_m || 11) / 2;
          const otherSw = other.st.sidewalk_width_m || 1.8;
          for (let k = 0; k < other.pts.length - 1; k++) {
            const hit = segIntersect2D(p0, p1, other.pts[k], other.pts[k + 1]);
            if (hit) {
              const dist = hit.t * len;
              cutsRoad.push([dist - otherHalfW - 0.15, dist + otherHalfW + 0.15]);
              cutsCross.push([dist - otherHalfW - otherSw - 2.6, dist + otherHalfW + otherSw + 2.6]);
              if (i < j) {
                intersections.push({
                  x: hit.x,
                  y: hit.y,
                  stA: st,
                  stB: other.st,
                  uA: { x: ux, y: uy },
                  uB: (() => {
                    const bx = other.pts[k + 1].x - other.pts[k].x;
                    const by = other.pts[k + 1].y - other.pts[k].y;
                    const bl = Math.hypot(bx, by) || 1;
                    return { x: bx / bl, y: by / bl };
                  })(),
                });
              }
            }
          }
        }

        const mergedRoadCuts = mergeIntervals(cutsRoad);
        const sidewalkSpans = subtractIntervals(0, len, mergedRoadCuts);

        // Raised 3D concrete sidewalks & vertical curbs on both sides
        for (const [s0, s1] of sidewalkSpans) {
          const spanLen = s1 - s0;
          if (spanLen < 0.8) continue;
          for (const side of [-1, 1]) {
            const innerOff = side * halfW;
            const outerOff = side * (halfW + swW);
            const x0 = p0.x + ux * s0;
            const y0 = p0.y + uy * s0;
            const x1 = p0.x + ux * s1;
            const y1 = p0.y + uy * s1;

            const i0 = [x0 + rx * innerOff, y0 + ry * innerOff, 0.24];
            const o0 = [x0 + rx * outerOff, y0 + ry * outerOff, 0.24];
            const o1 = [x1 + rx * outerOff, y1 + ry * outerOff, 0.24];
            const i1 = [x1 + rx * innerOff, y1 + ry * innerOff, 0.24];
            sidewalkMesh.addQuad(i0, o0, o1, i1, [0, 0, 1], 0, swW / 2, 0, spanLen / 3);

            // Vertical curb face facing the asphalt
            const b0 = [x0 + rx * innerOff, y0 + ry * innerOff, 0.08];
            const b1 = [x1 + rx * innerOff, y1 + ry * innerOff, 0.08];
            sidewalkMesh.addQuad(b0, b1, i1, i0, [-side * rx, -side * ry, 0], 0, spanLen / 3, 0, 0.2);
          }
        }

        // Yellow centreline markings (clipped inside intersections)
        const centreSpans = subtractIntervals(0, len, mergeIntervals(cutsCross));
        for (const [s0, s1] of centreSpans) {
          if (s1 - s0 < 2.0) continue;
          const x0 = p0.x + ux * s0;
          const y0 = p0.y + uy * s0;
          const x1 = p0.x + ux * s1;
          const y1 = p0.y + uy * s1;
          const lineHalf = st.transit_corridor ? 0.24 : 0.14;
          yellowMesh.addQuad(
            [x0 - rx * lineHalf, y0 - ry * lineHalf, 0.125],
            [x0 + rx * lineHalf, y0 + ry * lineHalf, 0.125],
            [x1 + rx * lineHalf, y1 + ry * lineHalf, 0.125],
            [x1 - rx * lineHalf, y1 - ry * lineHalf, 0.125],
            [0, 0, 1],
            0,
            1,
            0,
            1
          );
        }

        // Dedicated Harbour-teal bus-only lane along Gottingen Street
        if (st.bus_lane) {
          const laneW = 3.4;
          const laneInner = halfW - laneW - 0.15;
          const laneOuter = halfW - 0.15;
          const busSpans = subtractIntervals(0, len, mergeIntervals(cutsCross));
          for (const [s0, s1] of busSpans) {
            if (s1 - s0 < 4.0) continue;
            const x0 = p0.x + ux * s0;
            const y0 = p0.y + uy * s0;
            const x1 = p0.x + ux * s1;
            const y1 = p0.y + uy * s1;
            const repY = Math.max(1, Math.round((s1 - s0) / 14));
            busLaneMesh.addQuad(
              [x0 + rx * laneInner, y0 + ry * laneInner, 0.12],
              [x0 + rx * laneOuter, y0 + ry * laneOuter, 0.12],
              [x1 + rx * laneOuter, y1 + ry * laneOuter, 0.12],
              [x1 + rx * laneInner, y1 + ry * laneInner, 0.12],
              [0, 0, 1],
              0,
              1,
              0,
              repY
            );
          }
        }
      }
    }

    // Zebra crosswalks at North St & Gottingen St, Maynard St, and Agricola St
    for (const inter of intersections) {
      const isTransitJunction = inter.stA.transit_corridor || inter.stB.transit_corridor;
      if (!isTransitJunction) continue;

      const arms = [
        { dir: inter.uA, halfCross: (inter.stB.width_m || 12) / 2, halfArm: (inter.stA.width_m || 12) / 2 - 0.5 },
        { dir: { x: -inter.uA.x, y: -inter.uA.y }, halfCross: (inter.stB.width_m || 12) / 2, halfArm: (inter.stA.width_m || 12) / 2 - 0.5 },
        { dir: inter.uB, halfCross: (inter.stA.width_m || 12) / 2, halfArm: (inter.stB.width_m || 12) / 2 - 0.5 },
        { dir: { x: -inter.uB.x, y: -inter.uB.y }, halfCross: (inter.stA.width_m || 12) / 2, halfArm: (inter.stB.width_m || 12) / 2 - 0.5 },
      ];

      for (const arm of arms) {
        const ux = arm.dir.x;
        const uy = arm.dir.y;
        const rx = uy;
        const ry = -ux;
        const d0 = arm.halfCross + 0.4;
        const d1 = d0 + 2.6;
        const cx0 = inter.x + ux * d0;
        const cy0 = inter.y + uy * d0;
        const cx1 = inter.x + ux * d1;
        const cy1 = inter.y + uy * d1;
        crosswalkMesh.addQuad(
          [cx0 - rx * arm.halfArm, cy0 - ry * arm.halfArm, 0.135],
          [cx0 + rx * arm.halfArm, cy0 + ry * arm.halfArm, 0.135],
          [cx1 + rx * arm.halfArm, cy1 + ry * arm.halfArm, 0.135],
          [cx1 - rx * arm.halfArm, cy1 - ry * arm.halfArm, 0.135],
          [0, 0, 1],
          0,
          Math.max(1, Math.round(arm.halfArm / 2.2)),
          0,
          1
        );
      }
    }

    const addPart = (mesh, texUrl) => {
      const geom = mesh.toGeometry();
      if (!geom) return;
      group.add(
        new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({ geometry: geom }),
          appearance: makeTexturedAppearance(texUrl, 1, 1, false),
          asynchronous: false,
        })
      );
    };

    addPart(asphaltMesh, textures.asphalt());
    addPart(sidewalkMesh, textures.sidewalk());
    addPart(yellowMesh, textures.yellowLine());
    addPart(busLaneMesh, textures.busLane());
    addPart(crosswalkMesh, textures.crosswalk());

    return group;
  }

  // ---------- Pitched-roof residential & commercial buildings ----------

  function signedArea2D(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      a += p0.x * p1.y - p1.x * p0.y;
    }
    return a * 0.5;
  }

  function buildingAxesAndBounds(pts) {
    let bestLen = -1;
    let ux = 1;
    let uy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len > bestLen) {
        bestLen = len;
        ux = dx / len;
        uy = dy / len;
      }
    }
    const vx = -uy;
    const vy = ux;
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const p of pts) {
      const u = p.x * ux + p.y * uy;
      const v = p.x * vx + p.y * vy;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    return { ux, uy, vx, vy, uMin, uMax, vMin, vMax };
  }

  function buildBuildingPrimitives(buildings, projector, textures) {
    const group = new Cesium.PrimitiveCollection();
    const instancesByMat = new Map();

    const pushInstance = (matKey, texUrl, geom, bld) => {
      if (!geom) return;
      if (!instancesByMat.has(matKey)) {
        instancesByMat.set(matKey, { texUrl, instances: [] });
      }
      instancesByMat.get(matKey).instances.push(
        new Cesium.GeometryInstance({
          geometry: geom,
          id: { kind: "building", data: bld },
        })
      );
    };

    for (const b of buildings) {
      const raw = (b.footprint || []).map((c) => projector.toEnu(c[0], c[1]));
      if (raw.length > 1) {
        const first = raw[0];
        const last = raw[raw.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 0.05) raw.pop();
      }
      if (raw.length < 3) continue;
      if (signedArea2D(raw) < 0) raw.reverse();

      const isFlat = (b.roof_type || "flat") === "flat";
      const eaveH = b.eave_height_m || (isFlat ? b.height_m : (b.height_m || 10) * 0.7);
      const ridgeH = b.height_m || eaveH + 3.0;
      const wallHex = b.wall_colour || (isFlat ? "#9e5442" : "#efe9dc");
      const roofHex = b.roof_colour || (isFlat ? "#495057" : "#2f363e");

      const wallMesh = new MeshBuilder(projector);
      const wallH = isFlat ? ridgeH : eaveH;

      for (let i = 0; i < raw.length; i++) {
        const p0 = raw[i];
        const p1 = raw[(i + 1) % raw.length];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const edgeLen = Math.hypot(dx, dy);
        if (edgeLen < 0.2) continue;
        // Outward normal for CCW polygon
        const nx = dy / edgeLen;
        const ny = -dx / edgeLen;
        const uRep = Math.max(1, Math.round(edgeLen / 5.5));
        wallMesh.addQuad(
          [p0.x, p0.y, 0],
          [p1.x, p1.y, 0],
          [p1.x, p1.y, wallH],
          [p0.x, p0.y, wallH],
          [nx, ny, 0],
          0,
          uRep,
          0,
          1
        );
      }

      const axes = buildingAxesAndBounds(raw);
      const uvPt = (u, v, z) => [
        u * axes.ux + v * axes.vx,
        u * axes.uy + v * axes.vy,
        z,
      ];
      const uMid = (axes.uMin + axes.uMax) * 0.5;
      const vMid = (axes.vMin + axes.vMax) * 0.5;

      const roofMesh = new MeshBuilder(projector);

      if (isFlat) {
        const parapetH = 0.42;
        const inset = 0.35;
        // Recessed membrane deck
        roofMesh.addQuad(
          uvPt(axes.uMin + inset, axes.vMin + inset, ridgeH - 0.25),
          uvPt(axes.uMax - inset, axes.vMin + inset, ridgeH - 0.25),
          uvPt(axes.uMax - inset, axes.vMax - inset, ridgeH - 0.25),
          uvPt(axes.uMin + inset, axes.vMax - inset, ridgeH - 0.25),
          [0, 0, 1],
          0,
          3,
          0,
          3
        );
        // Parapet rim
        const pEdges = [
          [axes.uMin, axes.vMin, axes.uMax, axes.vMin + inset],
          [axes.uMin, axes.vMax - inset, axes.uMax, axes.vMax],
          [axes.uMin, axes.vMin + inset, axes.uMin + inset, axes.vMax - inset],
          [axes.uMax - inset, axes.vMin + inset, axes.uMax, axes.vMax - inset],
        ];
        for (const [ua, va, ub, vb] of pEdges) {
          roofMesh.addQuad(
            uvPt(ua, va, ridgeH + parapetH),
            uvPt(ub, va, ridgeH + parapetH),
            uvPt(ub, vb, ridgeH + parapetH),
            uvPt(ua, vb, ridgeH + parapetH),
            [0, 0, 1],
            0,
            2,
            0,
            0.25
          );
        }
        // Subtle rooftop HVAC box
        const hx0 = uMid - 1.3;
        const hx1 = uMid + 1.3;
        const hy0 = vMid - 0.9;
        const hy1 = vMid + 0.9;
        const hz0 = ridgeH - 0.25;
        const hz1 = ridgeH + 0.7;
        roofMesh.addQuad(uvPt(hx0, hy0, hz1), uvPt(hx1, hy0, hz1), uvPt(hx1, hy1, hz1), uvPt(hx0, hy1, hz1), [0, 0, 1]);
        roofMesh.addQuad(uvPt(hx0, hy0, hz0), uvPt(hx1, hy0, hz0), uvPt(hx1, hy0, hz1), uvPt(hx0, hy0, hz1), [-axes.vx, -axes.vy, 0]);
        roofMesh.addQuad(uvPt(hx1, hy1, hz0), uvPt(hx0, hy1, hz0), uvPt(hx0, hy1, hz1), uvPt(hx1, hy1, hz1), [axes.vx, axes.vy, 0]);
        roofMesh.addQuad(uvPt(hx1, hy0, hz0), uvPt(hx1, hy1, hz0), uvPt(hx1, hy1, hz1), uvPt(hx1, hy0, hz1), [axes.ux, axes.uy, 0]);
        roofMesh.addQuad(uvPt(hx0, hy1, hz0), uvPt(hx0, hy0, hz0), uvPt(hx0, hy0, hz1), uvPt(hx0, hy1, hz1), [-axes.ux, -axes.uy, 0]);

        pushInstance(`com-wall-${wallHex}`, textures.commercialWall(wallHex), wallMesh.toGeometry(), b);
        pushInstance("flat-roof", textures.flatRoof(), roofMesh.toGeometry(), b);
      } else {
        const overhang = 0.35;
        const eaveDrop = 0.14;
        const u0 = axes.uMin - overhang;
        const u1 = axes.uMax + overhang;
        const v0 = axes.vMin - overhang;
        const v1 = axes.vMax + overhang;
        const zEave = eaveH - eaveDrop;
        const spanU = u1 - u0;
        const spanV = (v1 - v0) * 0.5;

        if (b.roof_type === "hip") {
          const halfU = (axes.uMax - axes.uMin) * 0.5;
          const halfV = (axes.vMax - axes.vMin) * 0.5;
          const inset = Math.min(halfV * 0.85, halfU * 0.52);
          const ur0 = axes.uMin + inset;
          const ur1 = axes.uMax - inset;

          const r0 = uvPt(ur0, vMid, ridgeH);
          const r1 = uvPt(ur1, vMid, ridgeH);
          const c00 = uvPt(u0, v0, zEave);
          const c10 = uvPt(u1, v0, zEave);
          const c11 = uvPt(u1, v1, zEave);
          const c01 = uvPt(u0, v1, zEave);

          // Two main trapezoidal slopes
          roofMesh.addQuad(c00, c10, r1, r0, [-axes.vx, -axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
          roofMesh.addQuad(c11, c01, r0, r1, [axes.vx, axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
          // Two triangular hip end slopes
          roofMesh.addTriangle(c01, c00, r0, [-axes.ux, -axes.uy, 0.7], [0, 0], [spanV / 2, 0], [spanV / 4, spanV / 2]);
          roofMesh.addTriangle(c10, c11, r1, [axes.ux, axes.uy, 0.7], [0, 0], [spanV / 2, 0], [spanV / 4, spanV / 2]);
        } else {
          // Gable roof + triangular gable end walls matching clapboard siding
          const r0 = uvPt(u0, vMid, ridgeH);
          const r1 = uvPt(u1, vMid, ridgeH);
          const c00 = uvPt(u0, v0, zEave);
          const c10 = uvPt(u1, v0, zEave);
          const c11 = uvPt(u1, v1, zEave);
          const c01 = uvPt(u0, v1, zEave);

          // Roof top slopes
          roofMesh.addQuad(c00, c10, r1, r0, [-axes.vx, -axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
          roofMesh.addQuad(c11, c01, r0, r1, [axes.vx, axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);

          // Gable end triangles on wall mesh
          const g0a = uvPt(axes.uMin, axes.vMin, eaveH);
          const g0b = uvPt(axes.uMin, axes.vMax, eaveH);
          const g0r = uvPt(axes.uMin, vMid, ridgeH);
          wallMesh.addTriangle(g0b, g0a, g0r, [-axes.ux, -axes.uy, 0], [0, 0], [1, 0], [0.5, 0.4]);

          const g1a = uvPt(axes.uMax, axes.vMin, eaveH);
          const g1b = uvPt(axes.uMax, axes.vMax, eaveH);
          const g1r = uvPt(axes.uMax, vMid, ridgeH);
          wallMesh.addTriangle(g1a, g1b, g1r, [axes.ux, axes.uy, 0], [0, 0], [1, 0], [0.5, 0.4]);
        }

        // Soffit closure under eaves so street-level views never see hollow roofs
        roofMesh.addQuad(
          uvPt(u0, v0, zEave),
          uvPt(u0, v1, zEave),
          uvPt(u1, v1, zEave),
          uvPt(u1, v0, zEave),
          [0, 0, -1],
          0,
          1,
          0,
          1
        );

        pushInstance(`res-wall-${wallHex}`, textures.residentialWall(wallHex), wallMesh.toGeometry(), b);
        pushInstance(`roof-${roofHex}`, textures.shingleRoof(roofHex), roofMesh.toGeometry(), b);

        // Rooftop solar panel array on houses with solar_kw > 0
        if (b.solar_kw && b.solar_kw > 0) {
          const solarMesh = new MeshBuilder(projector);
          const slopeDrop = ridgeH - zEave;
          const halfSpanV = (v1 - v0) * 0.5;
          const slopeLen = Math.hypot(halfSpanV, slopeDrop);
          // South-facing roof slope (v0..vMid) normal
          const nSlope = [
            (-axes.vx * slopeDrop) / slopeLen,
            (-axes.vy * slopeDrop) / slopeLen,
            halfSpanV / slopeLen,
          ];
          const lift = 0.09;
          const pu0 = uMid - 2.3;
          const pu1 = uMid + 2.3;
          const f0 = 0.22;
          const f1 = 0.82;
          const ptOnSlope = (u, frac) => {
            const base = uvPt(u, v0 + (vMid - v0) * frac, zEave + slopeDrop * frac);
            return [base[0] + nSlope[0] * lift, base[1] + nSlope[1] * lift, base[2] + nSlope[2] * lift];
          };
          solarMesh.addQuad(
            ptOnSlope(pu0, f0),
            ptOnSlope(pu1, f0),
            ptOnSlope(pu1, f1),
            ptOnSlope(pu0, f1),
            nSlope,
            0,
            1,
            0,
            1
          );
          pushInstance("solar-panel", textures.solarPanel(), solarMesh.toGeometry(), b);
        }
      }
    }

    for (const [, entry] of instancesByMat) {
      if (!entry.instances.length) continue;
      group.add(
        new Cesium.Primitive({
          geometryInstances: entry.instances,
          appearance: makeTexturedAppearance(entry.texUrl, 1, 1, false),
          asynchronous: false,
        })
      );
    }

    return group;
  }

  // ---------- Clean multi-lobe 3D trees ----------

  function buildTreePrimitives(trees, projector) {
    const group = new Cesium.PrimitiveCollection();
    const trunkInstances = [];
    const canopyInstances = [];
    const shadowInstances = [];

    const unitCyl = Cesium.CylinderGeometry.createGeometry(
      new Cesium.CylinderGeometry({
        length: 1.0,
        topRadius: 0.7,
        bottomRadius: 1.0,
        slices: 8,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );
    const unitSphere = Cesium.EllipsoidGeometry.createGeometry(
      new Cesium.EllipsoidGeometry({
        radii: new Cesium.Cartesian3(1, 1, 1),
        stackPartitions: 10,
        slicePartitions: 12,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );
    const unitCone = Cesium.CylinderGeometry.createGeometry(
      new Cesium.CylinderGeometry({
        length: 1.0,
        topRadius: 0.05,
        bottomRadius: 1.0,
        slices: 10,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );
    const unitShadow = Cesium.CylinderGeometry.createGeometry(
      new Cesium.CylinderGeometry({
        length: 0.03,
        topRadius: 1.0,
        bottomRadius: 1.0,
        slices: 14,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );

    const scratchScale = new Cesium.Cartesian3();
    const scratchTrans = new Cesium.Cartesian3();
    const makeLocalMatrix = (x, y, z, sx, sy, sz) => {
      const origin = projector.toCartesian(x, y, z);
      const frame = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
      Cesium.Matrix4.multiplyByScale(frame, Cesium.Cartesian3.fromElements(sx, sy, sz, scratchScale), frame);
      return frame;
    };

    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const p = projector.toEnu(t.lon, t.lat);
      const h = t.height_m || 10.5;
      const r = t.crown_radius_m || 3.6;
      const isSpruce = (t.species || "").toLowerCase().includes("spruce");
      const baseHex = t.foliage_tone || "#4f6b3a";
      const baseCol = Cesium.Color.fromCssColorString(baseHex);
      const darkCol = Cesium.Color.multiplyByScalar(baseCol, 0.86, new Cesium.Color());
      darkCol.alpha = 1.0;
      const lightCol = Cesium.Color.lerp(baseCol, Cesium.Color.WHITE, 0.1, new Cesium.Color());
      lightCol.alpha = 1.0;

      // Ground contact shadow disc
      shadowInstances.push(
        new Cesium.GeometryInstance({
          geometry: unitShadow,
          modelMatrix: makeLocalMatrix(p.x, p.y, 0.25, r * 0.85, r * 0.85, 1.0),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(0.07, 0.14, 0.18, 0.24)),
          },
        })
      );

      // Trunk cylinder
      const trunkH = isSpruce ? h * 0.26 : h * 0.42;
      const trunkR = clamp(r * 0.08, 0.16, 0.3);
      trunkInstances.push(
        new Cesium.GeometryInstance({
          geometry: unitCyl,
          modelMatrix: makeLocalMatrix(p.x, p.y, 0.2 + trunkH * 0.5, trunkR, trunkR, trunkH),
          id: { kind: "tree", data: t },
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#5c4636")),
          },
        })
      );

      if (isSpruce) {
        // 3 crisp tiered conifer cones
        const tiers = [
          { z: h * 0.42, radScale: 1.0, tierH: h * 0.42, col: darkCol },
          { z: h * 0.64, radScale: 0.78, tierH: h * 0.36, col: baseCol },
          { z: h * 0.83, radScale: 0.52, tierH: h * 0.3, col: lightCol },
        ];
        for (const tier of tiers) {
          canopyInstances.push(
            new Cesium.GeometryInstance({
              geometry: unitCone,
              modelMatrix: makeLocalMatrix(p.x, p.y, tier.z, r * tier.radScale, r * tier.radScale, tier.tierH),
              id: { kind: "tree", data: t },
              attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(tier.col),
              },
            })
          );
        }
      } else {
        // 3 clustered smooth canopy lobes for deciduous Halifax street trees
        const angle = (i * 2.1) % (Math.PI * 2);
        const lobes = [
          { dx: 0, dy: 0, dz: h * 0.68, sx: r * 0.86, sy: r * 0.86, sz: h * 0.28, col: baseCol },
          {
            dx: Math.cos(angle) * r * 0.38,
            dy: Math.sin(angle) * r * 0.38,
            dz: h * 0.6,
            sx: r * 0.66,
            sy: r * 0.66,
            sz: h * 0.24,
            col: darkCol,
          },
          {
            dx: Math.cos(angle + 2.3) * r * 0.34,
            dy: Math.sin(angle + 2.3) * r * 0.34,
            dz: h * 0.73,
            sx: r * 0.62,
            sy: r * 0.62,
            sz: h * 0.22,
            col: lightCol,
          },
        ];
        for (const lobe of lobes) {
          canopyInstances.push(
            new Cesium.GeometryInstance({
              geometry: unitSphere,
              modelMatrix: makeLocalMatrix(p.x + lobe.dx, p.y + lobe.dy, lobe.dz, lobe.sx, lobe.sy, lobe.sz),
              id: { kind: "tree", data: t },
              attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(lobe.col),
              },
            })
          );
        }
      }
      void scratchTrans;
    }

    const solidAppear = new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false });
    const shadowAppear = new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true });

    if (shadowInstances.length) {
      group.add(new Cesium.Primitive({ geometryInstances: shadowInstances, appearance: shadowAppear, asynchronous: false }));
    }
    if (trunkInstances.length) {
      group.add(new Cesium.Primitive({ geometryInstances: trunkInstances, appearance: solidAppear, asynchronous: false }));
    }
    if (canopyInstances.length) {
      group.add(new Cesium.Primitive({ geometryInstances: canopyInstances, appearance: solidAppear, asynchronous: false }));
    }

    return group;
  }

  // ---------- 3D glass bus shelters & stop poles ----------

  function buildShelterPrimitives(stops, projector) {
    const group = new Cesium.PrimitiveCollection();
    const solidInstances = [];
    const glassInstances = [];

    const unitBox = Cesium.BoxGeometry.createGeometry(
      new Cesium.BoxGeometry({
        minimum: new Cesium.Cartesian3(-0.5, -0.5, -0.5),
        maximum: new Cesium.Cartesian3(0.5, 0.5, 0.5),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );

    const makeOrientedBox = (x, y, z, headingDeg, sx, sy, sz) => {
      const origin = projector.toCartesian(x, y, z);
      const hpr = new Cesium.HeadingPitchRoll(rad(headingDeg), 0, 0);
      const frame = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
      Cesium.Matrix4.multiplyByScale(frame, new Cesium.Cartesian3(sx, sy, sz), frame);
      return frame;
    };

    const inkAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(COLOURS.ink));
    const padAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#cfc9be"));
    const benchAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#9c7853"));
    const totemAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(COLOURS.harbour));
    const glassAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(
      Cesium.Color.fromCssColorString("#79b2c4").withAlpha(0.42)
    );

    for (const stop of stops) {
      const p = projector.toEnu(stop.lon, stop.lat);
      const heading = stop.bearing_deg || 0;
      const hRad = rad(heading);
      // Forward along bus travel & right-hand away from curb
      const fx = Math.sin(hRad);
      const fy = Math.cos(hRad);
      const rx = Math.cos(hRad);
      const ry = -Math.sin(hRad);

      const offsetBox = (fwd, right, z, sx, sy, sz, attr, target) => {
        target.push(
          new Cesium.GeometryInstance({
            geometry: unitBox,
            modelMatrix: makeOrientedBox(p.x + fx * fwd + rx * right, p.y + fy * fwd + ry * right, z, heading, sx, sy, sz),
            id: { kind: "stop", data: stop },
            attributes: { color: attr },
          })
        );
      };

      // Concrete boarding pad
      offsetBox(0, 0, 0.25, 2.0, 4.4, 0.08, padAttr, solidInstances);

      // Transit stop totem pole near front of pad
      offsetBox(1.85, -0.55, 1.45, 0.12, 0.12, 2.4, inkAttr, solidInstances);
      offsetBox(1.85, -0.55, 2.45, 0.08, 0.42, 0.56, totemAttr, solidInstances);

      if (stop.shelter) {
        // 4 dark steel posts
        for (const [df, dr] of [
          [-1.55, -0.62],
          [1.45, -0.62],
          [-1.55, 0.62],
          [1.45, 0.62],
        ]) {
          offsetBox(df, dr, 1.42, 0.09, 0.09, 2.35, inkAttr, solidInstances);
        }
        // Shelter roof canopy
        offsetBox(-0.05, 0.0, 2.62, 1.55, 3.45, 0.1, inkAttr, solidInstances);
        // Translucent glass back & windbreak panels
        offsetBox(-0.05, 0.62, 1.45, 0.04, 2.95, 2.05, glassAttr, glassInstances);
        offsetBox(-1.55, 0.0, 1.45, 1.18, 0.04, 2.05, glassAttr, glassInstances);
        // Cedar bench inside shelter
        offsetBox(-0.05, 0.25, 0.72, 0.45, 1.9, 0.1, benchAttr, solidInstances);
      }
    }

    group.add(
      new Cesium.Primitive({
        geometryInstances: solidInstances,
        appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
        asynchronous: false,
      })
    );
    if (glassInstances.length) {
      group.add(
        new Cesium.Primitive({
          geometryInstances: glassInstances,
          appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: true }),
          asynchronous: false,
        })
      );
    }

    return group;
  }

  // ---------- Work-zone geometry (dashed lane + 3D cones) ----------

  function buildEventOverlayPrimitives(events, projector, textures) {
    const group = new Cesium.PrimitiveCollection();
    const coneInstances = [];
    const bandMesh = new MeshBuilder(projector);

    const coneGeom = Cesium.CylinderGeometry.createGeometry(
      new Cesium.CylinderGeometry({
        length: 0.72,
        topRadius: 0.05,
        bottomRadius: 0.22,
        slices: 10,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );

    const coneAttr = Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#e85d1a"));

    for (const ev of events) {
      if (ev.kind !== "closure" || !Array.isArray(ev.coordinates) || ev.coordinates.length < 2) continue;
      const p0 = projector.toEnu(ev.coordinates[0][0], ev.coordinates[0][1]);
      const p1 = projector.toEnu(ev.coordinates[1][0], ev.coordinates[1][1]);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const rx = uy;
      const ry = -ux;
      const hw = 1.65;

      bandMesh.addQuad(
        [p0.x - rx * hw, p0.y - ry * hw, 0.145],
        [p0.x + rx * hw, p0.y + ry * hw, 0.145],
        [p1.x + rx * hw, p1.y + ry * hw, 0.145],
        [p1.x - rx * hw, p1.y - ry * hw, 0.145],
        [0, 0, 1],
        0,
        1,
        0,
        Math.max(1, Math.round(len / 5))
      );

      // Line of 3D safety cones along outer lane edge
      const count = 6;
      for (let i = 0; i < count; i++) {
        const f = i / (count - 1);
        const cx = p0.x + dx * f - rx * (hw - 0.15);
        const cy = p0.y + dy * f - ry * (hw - 0.15);
        const origin = projector.toCartesian(cx, cy, 0.48);
        coneInstances.push(
          new Cesium.GeometryInstance({
            geometry: coneGeom,
            modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
            id: { kind: "event", data: ev },
            attributes: { color: coneAttr },
          })
        );
      }
    }

    const geom = bandMesh.toGeometry();
    if (geom) {
      group.add(
        new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({ geometry: geom, id: { kind: "event", data: events.find((e) => e.kind === "closure") } }),
          appearance: makeTexturedAppearance(textures.workZone(), 1, 1, false),
          asynchronous: false,
        })
      );
    }
    if (coneInstances.length) {
      group.add(
        new Cesium.Primitive({
          geometryInstances: coneInstances,
          appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
          asynchronous: false,
        })
      );
    }

    return group;
  }

  // ---------- Harbour-chart Canvas Pin & Bus Badge Renderers ----------

  const PR = 2;
  function pinCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.round(w * PR);
    c.height = Math.round(h * PR);
    const g = c.getContext("2d");
    g.scale(PR, PR);
    return [c, g];
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawStatusShape(g, shape, cx, cy, w, fill) {
    g.save();
    g.lineWidth = 2;
    g.strokeStyle = COLOURS.ink;
    g.fillStyle = fill;
    const h = w * 0.42;
    if (shape === "disc") {
      g.beginPath();
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
    } else if (shape === "ring") {
      g.beginPath();
      g.ellipse(cx, cy, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = 2.5;
      g.stroke();
    } else if (shape === "diamond") {
      g.beginPath();
      g.moveTo(cx - w / 2, cy);
      g.lineTo(cx, cy - h * 0.75);
      g.lineTo(cx + w / 2, cy);
      g.lineTo(cx, cy + h * 0.75);
      g.closePath();
      g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.stroke();
    } else {
      g.fillRect(cx - h / 2 - 1, cy - h / 2 - 1, h + 2, h + 2);
    }
    g.restore();
  }

  function drawBusBadge(busImg, status, route, facingWest, selected) {
    const label = String(route || "").slice(0, 4);
    const tabW = label ? Math.max(26, 10 + label.length * 9.5) : 0;
    const busW = busImg ? 36 : 0;
    const shapeW = 30;
    const W = 6 + tabW + (label ? 4 : 0) + (busW ? busW + 4 : 0) + shapeW;
    const H = 30;
    const pad = 6;
    const [c, g] = pinCanvas(W + pad * 2, H + pad * 2);
    const x = pad;
    const y = pad;

    if (selected) {
      roundRect(g, x - 4, y - 4, W + 8, H + 8, 11);
      g.fillStyle = COLOURS.buoy;
      g.fill();
    }

    g.save();
    g.shadowColor = "rgba(19, 35, 46, 0.42)";
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    roundRect(g, x, y, W, H, 8);
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fill();
    g.restore();

    roundRect(g, x, y, W, H, 8);
    g.lineWidth = selected ? 3 : 2;
    g.strokeStyle = selected ? COLOURS.harbour : COLOURS.ink;
    g.stroke();

    let cx = x + 4;
    if (label) {
      roundRect(g, cx, y + 4, tabW, H - 8, 5);
      g.fillStyle = COLOURS.ink;
      g.fill();
      g.fillStyle = "#ffffff";
      g.font = "600 14px 'IBM Plex Sans', system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, cx + tabW / 2, y + H / 2 + 0.5);
      cx += tabW + 4;
    }

    if (busImg && busImg.complete && busImg.naturalWidth) {
      const ih = busW * (53 / 192);
      const iy = y + (H - ih) / 2;
      g.save();
      if (facingWest) {
        g.translate(cx + busW, iy);
        g.scale(-1, 1);
        g.drawImage(busImg, 0, 0, busW, ih);
      } else {
        g.drawImage(busImg, cx, iy, busW, ih);
      }
      g.restore();
      cx += busW + 4;
    }

    drawStatusShape(g, STATUS_SHAPE[status] || "disc", cx + shapeW / 2 - 2, y + H / 2, 24, STATUS_FILL[status] || COLOURS.ink);
    return c;
  }

  function drawGlyphPin(glyph, colour, caption, selected) {
    const W = caption ? Math.max(46, 26 + caption.length * 6.5) : 34;
    const H = 40;
    const [c, g] = pinCanvas(W, H);
    const cx = W / 2;

    if (selected) {
      roundRect(g, 1, 1, W - 2, 28, 8);
      g.fillStyle = COLOURS.buoy;
      g.fill();
    }

    roundRect(g, 3, 3, W - 6, 24, 6);
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fill();
    g.lineWidth = selected ? 2.5 : 1.75;
    g.strokeStyle = selected ? COLOURS.harbour : colour;
    g.stroke();

    g.fillStyle = colour;
    g.strokeStyle = colour;
    g.lineWidth = 1.8;

    const gx = caption ? 15 : cx;
    const gy = 15;
    g.beginPath();
    if (glyph === "triangle") {
      g.moveTo(gx, gy - 6);
      g.lineTo(gx + 6, gy + 5);
      g.lineTo(gx - 6, gy + 5);
      g.closePath();
      g.stroke();
      g.fillRect(gx - 0.8, gy - 2, 1.6, 3.6);
      g.fillRect(gx - 0.8, gy + 2.4, 1.6, 1.5);
    } else if (glyph === "house") {
      g.moveTo(gx - 6, gy);
      g.lineTo(gx, gy - 6);
      g.lineTo(gx + 6, gy);
      g.lineTo(gx + 6, gy + 6);
      g.lineTo(gx - 6, gy + 6);
      g.closePath();
      g.stroke();
    } else {
      g.arc(gx, gy, 5, 0, Math.PI * 2);
      g.fill();
    }

    if (caption) {
      g.fillStyle = COLOURS.ink;
      g.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(caption, 24, 15.5);
    }

    // Ground anchor dot
    g.fillStyle = colour;
    g.beginPath();
    g.arc(cx, H - 5, 3, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // ---------- Animated bus path sampler ----------

  function compileRouteSampler(coords, projector) {
    const pts = coords.map((c) => projector.toEnu(c[0], c[1]));
    const cumLen = [0];
    for (let i = 1; i < pts.length; i++) {
      cumLen.push(cumLen[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = cumLen[cumLen.length - 1] || 1;

    function sampleAtDist(dist) {
      const d = ((dist % total) + total) % total;
      let seg = 0;
      while (seg < cumLen.length - 2 && cumLen[seg + 1] < d) seg++;
      const d0 = cumLen[seg];
      const d1 = cumLen[seg + 1];
      const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
      const p0 = pts[seg];
      const p1 = pts[seg + 1];
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      const bearing = (deg(Math.atan2(p1.x - p0.x, p1.y - p0.y)) + 360) % 360;
      return { x, y, bearing };
    }

    function projectStopDist(stopLonLat) {
      const sp = projector.toEnu(stopLonLat[0], stopLonLat[1]);
      let bestDist = 0;
      let bestErr = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy || 1;
        const t = clamp(((sp.x - a.x) * dx + (sp.y - a.y) * dy) / l2, 0, 1);
        const px = a.x + t * dx;
        const py = a.y + t * dy;
        const err = Math.hypot(sp.x - px, sp.y - py);
        if (err < bestErr) {
          bestErr = err;
          bestDist = cumLen[i] + t * Math.sqrt(l2);
        }
      }
      return bestDist;
    }

    return { total, sampleAtDist, projectStopDist };
  }

  // ---------- Inspector UI ----------

  function formatKvRows(rows) {
    const kv = document.getElementById("inspector-kv");
    kv.innerHTML = "";
    for (const [k, v, mono] of rows) {
      const kEl = document.createElement("div");
      kEl.className = "kv-key";
      kEl.textContent = k;
      const vEl = document.createElement("div");
      vEl.className = mono ? "kv-val kv-mono" : "kv-val";
      vEl.textContent = v;
      kv.appendChild(kEl);
      kv.appendChild(vEl);
    }
  }

  function showInspector(picked) {
    const kindEl = document.getElementById("inspector-kind");
    const titleEl = document.getElementById("inspector-title");
    const emptyEl = document.getElementById("inspector-empty");
    const kvEl = document.getElementById("inspector-kv");
    const closeBtn = document.getElementById("inspector-close");

    if (!picked) {
      kindEl.textContent = "Street engine";
      titleEl.textContent = "Inspect neighbourhood objects";
      emptyEl.hidden = false;
      kvEl.hidden = true;
      closeBtn.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    kvEl.hidden = false;
    closeBtn.hidden = false;

    const d = picked.data;
    if (picked.kind === "building") {
      kindEl.textContent = d.roof_type === "flat" ? "Commercial / mixed-use" : "Maritime residential";
      titleEl.textContent = d.civic_address || d.id;
      const rows = [
        ["Building ID", d.id, true],
        ["Primary use", d.use || "Residential", false],
        ["Storeys", String(d.storeys || "-"), true],
        ["Eave / ridge height", `${(d.eave_height_m || d.height_m).toFixed(1)} m / ${d.height_m.toFixed(1)} m`, true],
        ["Roof geometry", d.roof_type, false],
        ["Assessed band", d.assessed_band || d.assessed_Band || "-", true],
      ];
      if (d.solar_kw && d.solar_kw > 0) {
        rows.push(["Rooftop solar", `${d.solar_kw.toFixed(1)} kW PV array`, true]);
      }
      formatKvRows(rows);
    } else if (picked.kind === "tree") {
      kindEl.textContent = "Urban forestry (SRC-051)";
      titleEl.textContent = d.species;
      formatKvRows([
        ["Tree ID", d.id, true],
        ["Height", `${d.height_m.toFixed(1)} m`, true],
        ["Crown radius", `${d.crown_radius_m.toFixed(1)} m`, true],
      ]);
    } else if (picked.kind === "stop") {
      kindEl.textContent = "Halifax Transit stop (SRC-005)";
      titleEl.textContent = d.stop_name;
      formatKvRows([
        ["Stop code", d.stop_code, true],
        ["Routes", (d.routes || []).join(", "), true],
        ["Shelter", d.shelter ? "3D glass shelter" : "Pole stop only", false],
        ["Bunching events (7 d)", String(d.bunching_count ?? 0), true],
        ["Excess wait", `${d.excess_wait_seconds ?? 0} s`, true],
      ]);
    } else if (picked.kind === "bus") {
      kindEl.textContent = "Transit vehicle (simulated)";
      titleEl.textContent = d.headsign || d.vehicle_label;
      const delayStr =
        d.delay_seconds > 60
          ? `+${Math.round(d.delay_seconds / 60)} min late`
          : d.delay_seconds < -60
            ? `${Math.round(d.delay_seconds / 60)} min early`
            : "Within 1 min of schedule";
      formatKvRows([
        ["Vehicle", d.vehicle_label, true],
        ["Route", d.route_short_name, true],
        ["Schedule status", `${STATUS_LABEL[d.status] || "Unknown"} (${delayStr})`, false],
        ["Active state", d.isDwelling ? "Dwelling at shelter" : `${d.speed_mps.toFixed(1)} m/s`, true],
      ]);
    } else if (picked.kind === "event") {
      kindEl.textContent = d.kind === "closure" ? `Public Works (${d.subsector_id})` : `Building permit (${d.subsector_id})`;
      titleEl.textContent = d.title;
      if (d.kind === "closure") {
        formatKvRows([
          ["Event ID", d.id, true],
          ["Type", `${d.closure_type} (${d.closure_reason})`, false],
          ["Status", d.status, false],
          ["Advisory", d.detour, false],
        ]);
      } else {
        formatKvRows([
          ["Permit number", d.permit_number, true],
          ["Civic address", d.civic_address, false],
          ["Scope", d.work_description, false],
          ["Units created", String(d.units_created), true],
          ["Estimated value", d.estimated_value, true],
        ]);
      }
    }
  }

  // ---------- Main initialization ----------

  async function init() {
    const resp = await fetch("./sample-north-gottingen.json");
    if (!resp.ok) {
      throw new Error(`Failed to fetch sample-north-gottingen.json (${resp.status})`);
    }
    const data = await resp.json();
    const [centreLon, centreLat] = data.meta.centre;
    const projector = createEnuProjector(centreLon, centreLat);
    const textures = createTextureLibrary();

    const viewer = new Cesium.Viewer("cesium-container", {
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
      shadows: true,
      terrainShadows: Cesium.ShadowMode.ENABLED,
      msaaSamples: 4,
      creditContainer: document.getElementById("cesium-credits"),
    });

    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#c7dce8");
    if (scene.skyBox) scene.skyBox.show = false;
    if (scene.moon) scene.moon.show = false;
    if (scene.globe) {
      scene.globe.baseColor = Cesium.Color.fromCssColorString("#c9d3c3");
      scene.globe.showGroundAtmosphere = false;
      scene.globe.enableLighting = false;
    }
    scene.fog.enabled = true;
    scene.fog.density = 0.00028;
    scene.fog.minimumBrightness = 0.72;

    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 2048;
    scene.shadowMap.softShadows = true;
    scene.shadowMap.darkness = 0.36;
    scene.shadowMap.maximumDistance = 650.0;

    // Camera mouse controls matching Halifax Twin
    const sscc = scene.screenSpaceCameraController;
    sscc.minimumZoomDistance = 12;
    sscc.maximumZoomDistance = 1400;
    sscc.tiltEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.PINCH,
      { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
    ];

    // Directional sun light controlled by Halifax 24-hour clock slider
    const sunLight = new Cesium.DirectionalLight({
      direction: projector.vectorEnuToEcef(-0.4, 0.55, -0.73),
      color: Cesium.Color.fromCssColorString("#fff9ed"),
      intensity: 2.1,
    });
    scene.light = sunLight;

    function updateSunFromMinutes(mins) {
      const hour = mins / 60;
      const frac = clamp((hour - 7) / 12, 0, 1);
      const sunAz = rad(95 + frac * 170);
      const sunEl = rad(15 + Math.sin(frac * Math.PI) * 39);
      const toSunX = Math.cos(sunEl) * Math.sin(sunAz);
      const toSunY = Math.cos(sunEl) * Math.cos(sunAz);
      const toSunZ = Math.sin(sunEl);
      sunLight.direction = projector.vectorEnuToEcef(-toSunX, -toSunY, -toSunZ);

      // Warm morning/late afternoon tint vs crisp midday light
      const warmth = 1 - Math.sin(frac * Math.PI);
      sunLight.color = Cesium.Color.lerp(
        Cesium.Color.fromCssColorString("#fffcf4"),
        Cesium.Color.fromCssColorString("#ffd8ab"),
        warmth * 0.65,
        new Cesium.Color()
      );
      sunLight.intensity = 1.65 + Math.sin(frac * Math.PI) * 0.55;

      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      document.getElementById("sun-time-readout").textContent = `${hh}:${mm}`;
    }
    updateSunFromMinutes(870);

    // Build clean layer primitives
    const streetsGroup = scene.primitives.add(buildStreetPrimitives(data, projector, textures));
    const buildingsGroup = scene.primitives.add(buildBuildingPrimitives(data.buildings, projector, textures));
    const treesGroup = scene.primitives.add(buildTreePrimitives(data.trees, projector));
    const transitGroup = scene.primitives.add(new Cesium.PrimitiveCollection());
    const sheltersGroup = transitGroup.add(buildShelterPrimitives(data.stops, projector));
    void sheltersGroup;

    // Route lines subtly drawn above road surface for clear transit legibility
    const routeLines = transitGroup.add(new Cesium.PolylineCollection());
    for (const r of data.routes) {
      routeLines.add({
        positions: r.coordinates.map((c) => {
          const ep = projector.toEnu(c[0], c[1]);
          return projector.toCartesian(ep.x, ep.y, 0.16);
        }),
        width: 3,
        material: Cesium.Material.fromType("Color", {
          color: Cesium.Color.fromCssColorString(r.colour || COLOURS.harbour).withAlpha(0.55),
        }),
      });
    }

    // Work zone overlay + safety cones
    const pinsGroup = scene.primitives.add(new Cesium.PrimitiveCollection());
    pinsGroup.add(buildEventOverlayPrimitives(data.events, projector, textures));

    // Billboards & stem lines for stops, events, and moving buses
    const busImg = await loadImage("../img/bus-side.png");
    const pinBillboards = pinsGroup.add(new Cesium.BillboardCollection({ scene }));
    const pinStems = pinsGroup.add(new Cesium.PolylineCollection());
    const busBadges = transitGroup.add(new Cesium.BillboardCollection({ scene }));
    const busStems = transitGroup.add(new Cesium.PolylineCollection());

    const stemMat = (hex) =>
      Cesium.Material.fromType("Color", {
        color: Cesium.Color.fromCssColorString(hex).withAlpha(0.75),
      });

    // Static stop pins
    for (const stop of data.stops) {
      const ep = projector.toEnu(stop.lon, stop.lat);
      const basePos = projector.toCartesian(ep.x, ep.y, 2.75);
      const topPos = projector.toCartesian(ep.x, ep.y, 5.1);
      pinStems.add({ positions: [basePos, topPos], width: 1.5, material: stemMat(COLOURS.harbour) });
      pinBillboards.add({
        position: topPos,
        image: drawGlyphPin("stop", COLOURS.harbour, stop.stop_code, false),
        scale: 1 / PR,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: { kind: "stop", data: stop },
      });
    }

    // Static event pins (PWK-03 work zone + HRE-09 solar permits)
    for (const ev of data.events) {
      const coord = ev.kind === "closure" ? ev.midpoint : ev.coordinates;
      const ep = projector.toEnu(coord[0], coord[1]);
      const baseZ = ev.kind === "closure" ? 0.6 : 11.4;
      const topZ = ev.kind === "closure" ? 4.4 : 15.2;
      const colour = ev.kind === "closure" ? COLOURS.closure : COLOURS.permit;
      const glyph = ev.kind === "closure" ? "triangle" : "house";
      const basePos = projector.toCartesian(ep.x, ep.y, baseZ);
      const topPos = projector.toCartesian(ep.x, ep.y, topZ);

      pinStems.add({ positions: [basePos, topPos], width: 1.5, material: stemMat(colour) });
      pinBillboards.add({
        position: topPos,
        image: drawGlyphPin(glyph, colour, ev.subsector_id, false),
        scale: 1 / PR,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: { kind: "event", data: ev },
      });
    }

    // Animated buses (bus-near.glb + procedural fallback)
    const routeById = new Map(data.routes.map((r) => [r.id, compileRouteSampler(r.coordinates, projector)]));
    const stopById = new Map(data.stops.map((s) => [s.id, s]));

    const fallbackBusGeom = Cesium.BoxGeometry.createGeometry(
      new Cesium.BoxGeometry({
        minimum: new Cesium.Cartesian3(-5.8, -1.25, 0.25),
        maximum: new Cesium.Cartesian3(5.8, 1.25, 3.15),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      })
    );

    const busStates = [];
    const scratchHpr = new Cesium.HeadingPitchRoll();

    for (const bus of data.buses) {
      const sampler = routeById.get(bus.route_id);
      if (!sampler) continue;

      const dwellDists = (bus.dwell_stops || [])
        .map((sid) => stopById.get(sid))
        .filter(Boolean)
        .map((s) => ({ id: s.id, dist: sampler.projectStopDist([s.lon, s.lat]) }));

      const state = {
        bus,
        sampler,
        dist: bus.start_progress * sampler.total,
        dwellDists,
        dwellRemaining: 0,
        lastDwellStop: null,
        isDwelling: false,
        model: null,
        fallbackPrim: null,
        badge: busBadges.add({
          position: projector.toCartesian(0, 0, 5),
          image: drawBusBadge(busImg, bus.status, bus.route_short_name, false, false),
          scale: 1 / PR,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id: { kind: "bus", data: bus },
        }),
        stem: busStems.add({
          positions: [projector.toCartesian(0, 0, 3.2), projector.toCartesian(0, 0, 5.2)],
          width: 1.5,
          material: stemMat(COLOURS.ink),
        }),
        facingWest: false,
      };
      busStates.push(state);

      // Load local glTF bus model
      Cesium.Model.fromGltfAsync({
        url: "../models/bus-near.glb",
        id: { kind: "bus", data: bus },
        forwardAxis: Cesium.Axis.X,
        shadows: Cesium.ShadowMode.ENABLED,
        incrementallyLoadTextures: false,
      })
        .then((m) => {
          state.model = m;
          transitGroup.add(m);
        })
        .catch(() => {
          // Procedural fallback Halifax Transit bus box if glTF unavailable
          const prim = new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({
              geometry: fallbackBusGeom,
              id: { kind: "bus", data: bus },
              attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(COLOURS.harbour)),
              },
            }),
            appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
            asynchronous: false,
          });
          state.fallbackPrim = prim;
          transitGroup.add(prim);
        });
    }

    // Frame-by-frame smooth bus glide + shelter dwell
    let lastTickMs = performance.now();
    scene.preUpdate.addEventListener(() => {
      const nowMs = performance.now();
      const dt = Math.min(0.1, (nowMs - lastTickMs) / 1000);
      lastTickMs = nowMs;

      for (const st of busStates) {
        if (st.dwellRemaining > 0) {
          st.dwellRemaining -= dt;
          st.isDwelling = true;
        } else {
          st.isDwelling = false;
          let speed = st.bus.speed_mps || 9.0;
          // Smooth deceleration approaching shelter
          for (const dw of st.dwellDists) {
            const gap = dw.dist - st.dist;
            if (gap > 0 && gap < 16 && st.lastDwellStop !== dw.id) {
              speed = Math.max(2.2, speed * (gap / 16));
            }
            if (Math.abs(st.dist - dw.dist) < 1.2 && st.lastDwellStop !== dw.id) {
              st.dwellRemaining = 2.6;
              st.lastDwellStop = dw.id;
              st.isDwelling = true;
              break;
            }
          }
          if (!st.isDwelling) {
            const nextDist = st.dist + speed * dt;
            if (nextDist >= st.sampler.total) {
              st.dist = nextDist % st.sampler.total;
              st.lastDwellStop = null;
            } else {
              st.dist = nextDist;
            }
          }
        }
        st.bus.isDwelling = st.isDwelling;

        const pose = st.sampler.sampleAtDist(st.dist);
        const groundPos = projector.toCartesian(pose.x, pose.y, 0.12);
        scratchHpr.heading = rad(pose.bearing - 90);
        scratchHpr.pitch = 0;
        scratchHpr.roll = 0;
        const frame = Cesium.Transforms.headingPitchRollToFixedFrame(groundPos, scratchHpr);

        if (st.model) {
          st.model.modelMatrix = frame;
        } else if (st.fallbackPrim) {
          st.fallbackPrim.modelMatrix = frame;
        }

        const roofPos = projector.toCartesian(pose.x, pose.y, 3.25);
        const badgePos = projector.toCartesian(pose.x, pose.y, 5.25);
        st.badge.position = badgePos;
        st.stem.positions = [roofPos, badgePos];

        const west = pose.bearing > 180;
        if (west !== st.facingWest) {
          st.facingWest = west;
          st.badge.setImage(
            `bus-${st.bus.id}-${west ? "w" : "e"}`,
            drawBusBadge(busImg, st.bus.status, st.bus.route_short_name, west, false)
          );
        }
      }
    });

    // Camera presets
    function flyToPreset(name, instant = false) {
      let targetEnu = { x: -62, y: 12 };
      let headingDeg = 340;
      let pitchDeg = -14;
      let range = 62;

      if (name === "residential") {
        // Looking north-west along Fuller Terrace at Maritime pitched-roof houses, trees & solar home
        const focus = projector.toEnu(-63.59268, 44.66045);
        targetEnu = { x: focus.x, y: focus.y };
        headingDeg = 336;
        pitchDeg = -15;
        range = 64;
      } else if (name === "intersection") {
        // North St & Gottingen St intersection with teal bus lane, crosswalks, shelters & turning bus
        const focus = projector.toEnu(-63.5904, 44.66068);
        targetEnu = { x: focus.x, y: focus.y };
        headingDeg = 28;
        pitchDeg = -22;
        range = 104;
      } else if (name === "street-bus") {
        // Street-level view along North St looking east toward Gottingen St
        const focus = projector.toEnu(-63.5916, 44.66022);
        targetEnu = { x: focus.x, y: focus.y };
        headingDeg = 66;
        pitchDeg = -8;
        range = 58;
      } else if (name === "overview") {
        targetEnu = { x: 15, y: 20 };
        headingDeg = 18;
        pitchDeg = -36;
        range = 350;
      }

      const targetPos = projector.toCartesian(targetEnu.x, targetEnu.y, 4.0);
      const sphere = new Cesium.BoundingSphere(targetPos, 1.0);
      const offset = new Cesium.HeadingPitchRange(rad(headingDeg), rad(pitchDeg), range);
      if (instant) {
        scene.camera.viewBoundingSphere(sphere, offset);
        scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } else {
        scene.camera.flyToBoundingSphere(sphere, {
          offset,
          duration: 0.9,
          complete: () => scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY),
        });
      }
    }

    flyToPreset("residential", true);

    // Preset buttons
    const presetButtons = Array.from(document.querySelectorAll(".preset-btn"));
    for (const btn of presetButtons) {
      btn.addEventListener("click", () => {
        for (const b of presetButtons) b.classList.remove("is-active");
        btn.classList.add("is-active");
        flyToPreset(btn.dataset.preset, false);
      });
    }

    // Layer checkboxes
    document.getElementById("toggle-buildings").addEventListener("change", (e) => {
      buildingsGroup.show = e.target.checked;
    });
    document.getElementById("toggle-streets").addEventListener("change", (e) => {
      streetsGroup.show = e.target.checked;
    });
    document.getElementById("toggle-trees").addEventListener("change", (e) => {
      treesGroup.show = e.target.checked;
    });
    document.getElementById("toggle-transit").addEventListener("change", (e) => {
      transitGroup.show = e.target.checked;
    });
    document.getElementById("toggle-pins").addEventListener("change", (e) => {
      pinsGroup.show = e.target.checked;
    });

    // Sun angle slider
    document.getElementById("sun-slider").addEventListener("input", (e) => {
      updateSunFromMinutes(Number(e.target.value));
    });

    // Picking handler
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((movement) => {
      const picked = scene.pick(movement.position);
      const id = picked && picked.id;
      if (id && id.kind && id.data) {
        showInspector(id);
      } else {
        showInspector(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement) => {
      const picked = scene.pick(movement.endPosition);
      const id = picked && picked.id;
      scene.canvas.style.cursor = id && id.kind ? "pointer" : "";
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    document.getElementById("inspector-close").addEventListener("click", () => showInspector(null));

    document.getElementById("scene-stats").textContent =
      `${data.buildings.length} buildings · ${data.trees.length} trees · ${data.stops.length} stops · ${data.buses.length} buses`;
  }

  init().catch((err) => {
    const stats = document.getElementById("scene-stats");
    if (stats) stats.textContent = `Engine error: ${err.message}`;
    console.error(err);
  });
})();
