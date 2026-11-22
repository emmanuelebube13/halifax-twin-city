// Pins, drawn once into images the map reuses. Every pin stands on a base whose shape carries the status
// (disc on time, diamond late, ring early, square for no schedule), so colour never carries meaning alone.
// Buses use the architect's own render (img/bus-side.png). Images are drawn at 2x for sharp screens.

import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";

export const PIXEL_RATIO = 2;

export const COLOURS = {
  ink: "#13232e",
  late: "#b3410e",
  early: "#ffffff",
  unknown: "#6b7580",
  plate: "#ffffff",
  selected: "#0d5466",
  selectedFill: "#d9e7ec",
  closure: "#8a3a0c",
  permit: "#4b3a8c",
  generic: "#2f5d50",
  route: "#0d5466",
};

export const STATUS_FILL: Record<BusStatus, string> = {
  on_time: COLOURS.ink,
  late: COLOURS.late,
  early: COLOURS.early,
  unknown: COLOURS.unknown,
};

type Shape = "disc" | "diamond" | "ring" | "square";

/** Draws a status base centred at (cx, cy), w wide, in CSS pixels on an already-scaled context. */
export function drawBase(g: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, w: number, fill: string): void {
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = COLOURS.ink;
  g.fillStyle = fill;
  const h = w * 0.42;
  switch (shape) {
    case "disc":
      g.beginPath();
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "ring":
      g.beginPath();
      g.ellipse(cx, cy, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = 2.5;
      g.stroke();
      break;
    case "diamond":
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
      break;
    case "square":
      g.fillRect(cx - h / 2 - 1, cy - h / 2 - 1, h + 2, h + 2);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.strokeRect(cx - h / 2 - 1, cy - h / 2 - 1, h + 2, h + 2);
      break;
  }
  g.restore();
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.round(w * PIXEL_RATIO);
  c.height = Math.round(h * PIXEL_RATIO);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.scale(PIXEL_RATIO, PIXEL_RATIO);
  return [c, g];
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export interface PinImage {
  id: string;
  data: ImageData;
  canvas: HTMLCanvasElement;
}

function toPin(id: string, c: HTMLCanvasElement): PinImage {
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  return { id, canvas: c, data: g.getImageData(0, 0, c.width, c.height) };
}

/**
 * Bus pin (2D, and the far level in 3D): a white plate with an ink border; on the left the route number on an
 * ink badge, on the right the architect's render facing the way the bus travels; the status base (disc, diamond,
 * ring, square) is joined under the plate on a white backing. Selected: harbour border, tinted plate and an
 * amber halo. The route number keeps the pin legible when the render is too small to read. Anchor: bottom centre.
 */
export function drawBusPin(img: HTMLImageElement | null, status: BusStatus, facingWest: boolean, selected: boolean, route?: string | null): HTMLCanvasElement {
  const label = (route ?? "").slice(0, 4);
  const badgeW = label ? Math.max(24, 9 + label.length * 9) : 0;
  const imgW = 46;
  const plateH = 24;
  const plateW = 6 + badgeW + (label ? 4 : 0) + imgW + 6;
  const W = plateW + 12;
  const top = 6;
  const baseW = 28;
  const H = top + plateH + 16;
  const [c, g] = canvas(W, H);
  const x = (W - plateW) / 2;
  if (selected) {
    roundRect(g, x - 4, top - 4, plateW + 8, plateH + 8, 11);
    g.fillStyle = "rgba(245, 181, 68, 0.95)";
    g.fill();
  }
  g.save();
  g.shadowColor = "rgba(19, 35, 46, 0.35)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  roundRect(g, x, top, plateW, plateH, 7);
  g.fillStyle = selected ? COLOURS.selectedFill : COLOURS.plate;
  g.fill();
  g.restore();
  roundRect(g, x, top, plateW, plateH, 7);
  g.lineWidth = selected ? 3 : 2;
  g.strokeStyle = selected ? COLOURS.selected : COLOURS.ink;
  g.stroke();
  let ix = x + 6;
  if (label) {
    roundRect(g, x + 4, top + 4, badgeW, plateH - 8, 4);
    g.fillStyle = COLOURS.ink;
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = "600 13px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, x + 4 + badgeW / 2, top + plateH / 2 + 0.5);
    ix = x + 4 + badgeW + 4;
  }
  const ih = imgW * (53 / 192);
  const iy = top + (plateH - ih) / 2;
  if (img && img.complete && img.naturalWidth) {
    g.save();
    if (facingWest) {
      g.translate(ix + imgW, iy);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0, imgW, ih);
    } else {
      g.drawImage(img, ix, iy, imgW, ih);
    }
    g.restore();
  } else {
    g.fillStyle = COLOURS.ink;
    g.fillRect(ix, iy, imgW, ih);
  }
  const by = top + plateH + 6;
  g.save();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(W / 2, by, baseW / 2 + 3, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  drawBase(g, STATUS_SHAPE[status], W / 2, by, baseW, STATUS_FILL[status]);
  return c;
}

/**
 * The 3D badge that floats above a bus model: the status shape and the route number on a white plate, so status
 * reads by shape and colour over photo buildings as it does in 2D. Anchor: bottom centre.
 */
export function drawBusBadge(status: BusStatus, route: string | null | undefined, selected: boolean): HTMLCanvasElement {
  const label = (route ?? "").slice(0, 4);
  const W = 34 + (label ? 8 + label.length * 9 : 0);
  const H = 30;
  const [c, g] = canvas(W + 8, H + 8);
  const x = 4;
  const y = 4;
  if (selected) {
    roundRect(g, x - 3, y - 3, W + 6, H + 6, 11);
    g.fillStyle = "rgba(245, 181, 68, 0.95)";
    g.fill();
  }
  g.save();
  g.shadowColor = "rgba(19, 35, 46, 0.4)";
  g.shadowBlur = 5;
  g.shadowOffsetY = 2;
  roundRect(g, x, y, W, H, 8);
  g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
  g.fill();
  g.restore();
  roundRect(g, x, y, W, H, 8);
  g.lineWidth = selected ? 3 : 2;
  g.strokeStyle = selected ? COLOURS.selected : COLOURS.ink;
  g.stroke();
  drawBase(g, STATUS_SHAPE[status], x + 17, y + H / 2, 24, STATUS_FILL[status]);
  if (label) {
    g.fillStyle = COLOURS.ink;
    g.font = "600 15px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(label, x + 32, y + H / 2 + 0.5);
  }
  return c;
}

/** Simple glyph pins for event and location kinds (closure triangle, permit house, generic square). */
export function drawGlyphPin(glyph: "triangle" | "house" | "square" | "stop", colour: string, selected: boolean): HTMLCanvasElement {
  const W = 30;
  const H = 38;
  const [c, g] = canvas(W, H);
  // base disc (no status for these kinds: a plain base keeps the pin readable on photos)
  g.fillStyle = COLOURS.ink;
  g.beginPath();
  g.ellipse(W / 2, H - 5, 10, 4, 0, 0, Math.PI * 2);
  g.fill();
  roundRect(g, 3, 2, W - 6, W - 6, 6);
  g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
  g.fill();
  g.lineWidth = selected ? 3 : 1.5;
  g.strokeStyle = selected ? COLOURS.selected : colour;
  g.stroke();
  g.fillStyle = colour;
  g.strokeStyle = colour;
  g.lineWidth = 2;
  const cx = W / 2;
  const cy = 2 + (W - 6) / 2;
  g.beginPath();
  if (glyph === "triangle") {
    g.moveTo(cx, cy - 8);
    g.lineTo(cx + 8, cy + 6);
    g.lineTo(cx - 8, cy + 6);
    g.closePath();
    g.stroke();
    g.fillRect(cx - 1, cy - 3, 2, 5);
    g.fillRect(cx - 1, cy + 3, 2, 2);
  } else if (glyph === "house") {
    g.moveTo(cx - 8, cy);
    g.lineTo(cx, cy - 8);
    g.lineTo(cx + 8, cy);
    g.lineTo(cx + 8, cy + 8);
    g.lineTo(cx - 8, cy + 8);
    g.closePath();
    g.stroke();
  } else if (glyph === "stop") {
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fill();
  } else {
    g.rect(cx - 6, cy - 6, 12, 12);
    g.fill();
  }
  return c;
}

/** Cluster pin: a count on a plate. Drawn on demand, so counts need no map fonts. */
export function drawCluster(count: number, label: string, colour: string = COLOURS.ink): HTMLCanvasElement {
  const text = count > 999 ? `${Math.round(count / 100) / 10}k` : String(count);
  const W = Math.max(36, 16 + text.length * 10);
  const H = 36;
  const [c, g] = canvas(W, H);
  roundRect(g, 1.5, 1.5, W - 3, H - 3, H / 2 - 1.5);
  g.fillStyle = colour;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "600 15px 'IBM Plex Sans', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2, H / 2 + 1);
  void label;
  return c;
}

export function busImageId(status: BusStatus, facingWest: boolean, selected: boolean, route?: string | null): string {
  const r = (route ?? "").slice(0, 4).replace(/[^A-Za-z0-9]/g, "");
  return `bus-${status}-${facingWest ? "w" : "e"}${selected ? "-sel" : ""}${r ? `-r-${r}` : ""}`;
}

/** Reads a bus image id back, so the map can draw route pins on demand. */
export function parseBusImageId(id: string): { status: BusStatus; facingWest: boolean; selected: boolean; route: string | null } | null {
  const m = /^bus-(on_time|late|early|unknown)-(e|w)(-sel)?(?:-r-([A-Za-z0-9]{1,4}))?$/.exec(id);
  if (!m) return null;
  return { status: m[1] as BusStatus, facingWest: m[2] === "w", selected: !!m[3], route: m[4] ?? null };
}

let busRender: HTMLImageElement | null = null;
/** The bus render, once loaded (for pins drawn on demand). */
export function busRenderImage(): HTMLImageElement | null {
  return busRender;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Every pin image the 2D and 3D views use, built once. */
export async function buildPinImages(): Promise<PinImage[]> {
  const bus = await loadImage(`${import.meta.env.BASE_URL}img/bus-side.png`);
  busRender = bus;
  try {
    await document.fonts?.load("600 13px 'IBM Plex Sans'");
  } catch {
    // the pins fall back to the system font
  }
  const out: PinImage[] = [];
  for (const status of ["on_time", "late", "early", "unknown"] as BusStatus[]) {
    for (const west of [false, true]) {
      for (const sel of [false, true]) {
        out.push(toPin(busImageId(status, west, sel), drawBusPin(bus, status, west, sel)));
      }
    }
  }
  for (const sel of [false, true]) {
    const s = sel ? "-sel" : "";
    out.push(toPin(`glyph-triangle${s}`, drawGlyphPin("triangle", COLOURS.closure, sel)));
    out.push(toPin(`glyph-house${s}`, drawGlyphPin("house", COLOURS.permit, sel)));
    out.push(toPin(`glyph-square${s}`, drawGlyphPin("square", COLOURS.generic, sel)));
  }
  return out;
}
