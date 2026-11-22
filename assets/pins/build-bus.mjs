// Builds the 3D bus pin from the architect's renders (src/bus-side.png, bus-front.png, bus-rear.png), with
// free npm tools only (gltf-transform and pngjs): no Blender.
//
// Output, in apps/web/public/models/ (committed, so the app runs without this step):
//   bus-near.glb  : textured body plus four wheels (about 270 triangles), for the street view
//   bus-mid.glb   : textured box (10 triangles) with a smaller texture, for the neighbourhood view
// The far level is not a model: the app draws the same 2D pin image as a billboard.
//
// Conventions: metres, origin on the ground at the centre of the bus, +X forward (the front), +Y up, +Z to the
// bus's left. A Halifax Transit 40-foot bus is about 12.2 m long, 2.55 m wide and 3.2 m tall.

import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { PNG } from "pngjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "apps", "web", "public", "models");
mkdirSync(outDir, { recursive: true });

const L = 12.2;
const W = 2.55;
const H = 3.2;
const CLEAR = 0.32; // ground clearance under the body
const WHEEL_R = 0.5;

// ---------------------------------------------------------------- texture atlas

function readPng(name) {
  return PNG.sync.read(readFileSync(join(here, "src", name)));
}

/** Area-average (box filter) resample of a crop of src into dst at (dx, dy, dw, dh). */
function blit(src, crop, dst, dx, dy, dw, dh, mirror = false) {
  const [cx, cy, cw, ch] = crop;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx0 = cx + (x * cw) / dw;
      const sx1 = cx + ((x + 1) * cw) / dw;
      const sy0 = cy + (y * ch) / dh;
      const sy1 = cy + ((y + 1) * ch) / dh;
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); sx++) {
          const i = (Math.min(sy, src.height - 1) * src.width + Math.min(sx, src.width - 1)) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      const tx = mirror ? dx + dw - 1 - x : dx + x;
      const o = ((dy + y) * dst.width + tx) * 4;
      dst.data[o] = r / n;
      dst.data[o + 1] = g / n;
      dst.data[o + 2] = b / n;
      dst.data[o + 3] = 255;
    }
  }
}

function fill(dst, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * dst.width + x) * 4;
      dst.data[o] = r;
      dst.data[o + 1] = g;
      dst.data[o + 2] = b;
      dst.data[o + 3] = 255;
    }
  }
}

/**
 * Atlas layout (fractions of the width and height, so one layout serves both sizes):
 *   top half      : the side render (front of the bus to the right)
 *   bottom left   : front face, cropped from the three-quarter render
 *   bottom middle : rear face, cropped the same way
 *   bottom right  : roof grey
 */
function atlas(width, height) {
  const side = readPng("bus-side.png");
  const front = readPng("bus-front.png");
  const rear = readPng("bus-rear.png");
  const dst = new PNG({ width, height });
  const half = height / 2;
  blit(side, [0, 0, side.width, side.height], dst, 0, 0, width, half);
  const q = Math.round(width * 0.4);
  blit(front, [335, 50, 125, 185], dst, 0, half, q, half);
  blit(rear, [355, 65, 115, 180], dst, q, half, q, half);
  fill(dst, 2 * q, half, width - 2 * q, half, [216, 220, 223]);
  return { png: PNG.sync.write(dst, { colorType: 2 }), uv: { half: 0.5, q: q / width } };
}

// ---------------------------------------------------------------- geometry

/** One quad as two triangles; corners in order bottom-left, bottom-right, top-right, top-left (seen from outside). */
function quad(acc, corners, normal, uvs) {
  const base = acc.pos.length / 3;
  for (let i = 0; i < 4; i++) {
    acc.pos.push(...corners[i]);
    acc.nrm.push(...normal);
    acc.uv.push(...uvs[i]);
  }
  acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function body(uvLayout) {
  const acc = { pos: [], nrm: [], uv: [], idx: [] };
  const x0 = -L / 2, x1 = L / 2, y0 = CLEAR, y1 = H, z0 = -W / 2, z1 = W / 2;
  const { half, q } = uvLayout;
  // glTF texture v runs downward from the top of the image
  const side = [[0, half], [1, half], [1, 0], [0, 0]];
  const sideMirror = [[1, half], [0, half], [0, 0], [1, 0]];
  // +Z (bus's left side, seen with the front to the right): the render as drawn
  quad(acc, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side);
  // -Z (right side, seen with the front to the left): mirrored
  quad(acc, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], sideMirror);
  // +X front
  quad(acc, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[0, 1], [q, 1], [q, half], [0, half]]);
  // -X rear
  quad(acc, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[q, 1], [2 * q, 1], [2 * q, half], [q, half]]);
  // roof
  const r0 = 2 * q + 0.02, r1 = 0.98;
  quad(acc, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[r0, 0.98], [r1, 0.98], [r1, 0.52], [r0, 0.52]]);
  return acc;
}

function wheels(segments = 16) {
  const acc = { pos: [], nrm: [], uv: [], idx: [] };
  const width = 0.32;
  for (const cx of [-L / 2 + 2.6, L / 2 - 2.4]) {
    for (const side of [-1, 1]) {
      const zIn = side * (W / 2 - width + 0.04);
      const zOut = side * (W / 2 + 0.04);
      const ring = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * WHEEL_R, WHEEL_R + Math.sin(a) * WHEEL_R]);
      }
      // tread
      for (let i = 0; i < segments; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % segments];
        const mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - WHEEL_R;
        const len = Math.hypot(mx, my) || 1;
        const n = [mx / len, my / len, 0];
        const corners = side > 0
          ? [[ax, ay, zIn], [bx, by, zIn], [bx, by, zOut], [ax, ay, zOut]]
          : [[bx, by, zIn], [ax, ay, zIn], [ax, ay, zOut], [bx, by, zOut]];
        quad(acc, corners, n, [[0, 0], [0, 0], [0, 0], [0, 0]]);
      }
      // outer face as a fan
      const base = acc.pos.length / 3;
      acc.pos.push(cx, WHEEL_R, zOut);
      acc.nrm.push(0, 0, side);
      acc.uv.push(0, 0);
      for (const [x, y] of ring) {
        acc.pos.push(x, y, zOut);
        acc.nrm.push(0, 0, side);
        acc.uv.push(0, 0);
      }
      for (let i = 0; i < segments; i++) {
        const a = base + 1 + i, b = base + 1 + ((i + 1) % segments);
        if (side > 0) acc.idx.push(base, a, b);
        else acc.idx.push(base, b, a);
      }
    }
  }
  return acc;
}

// ---------------------------------------------------------------- documents

function addMesh(doc, buffer, acc, material) {
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(acc.pos)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(acc.nrm)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(acc.uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(acc.idx)).setBuffer(buffer))
    .setMaterial(material);
  return prim;
}

async function build(name, texSize, withWheels) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = "halifax-twin assets/pins/build-bus.mjs";
  const buffer = doc.createBuffer();
  const { png, uv } = atlas(texSize[0], texSize[1]);
  const texture = doc.createTexture("bus").setImage(new Uint8Array(png)).setMimeType("image/png");
  const paint = doc.createMaterial("bus").setBaseColorTexture(texture).setRoughnessFactor(0.6).setMetallicFactor(0);
  const mesh = doc.createMesh("bus");
  mesh.addPrimitive(addMesh(doc, buffer, body(uv), paint));
  let tris = body(uv).idx.length / 3;
  if (withWheels) {
    const rubber = doc.createMaterial("tyre").setBaseColorFactor([0.09, 0.1, 0.11, 1]).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
    const w = wheels();
    mesh.addPrimitive(addMesh(doc, buffer, w, rubber));
    tris += w.idx.length / 3;
  }
  const scene = doc.createScene("bus");
  scene.addChild(doc.createNode("bus").setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);
  const path = join(outDir, `${name}.glb`);
  writeFileSync(path, await new NodeIO().writeBinary(doc));
  const size = statSync(path).size;
  console.log(`${name}.glb: ${tris} triangles, ${(size / 1024).toFixed(1)} kB`);
  if (size > 100 * 1024) throw new Error(`${name}.glb is over 100 kB`);
}

await build("bus-near", [512, 256], true);
await build("bus-mid", [128, 64], false);
