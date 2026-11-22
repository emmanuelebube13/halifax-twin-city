// Pins, drawn once into images the map reuses. Every pin stands on a base whose shape carries the status
// (disc on time, diamond late, ring early, square for no schedule), so colour never carries meaning alone.
// Buses use the architect's own render (img/bus-side.png). Images are drawn at 2x for sharp screens.

import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";

export const PIXEL_RATIO = 2;

export const COLOURS = {
  ink: "#1b1f24",
  late: "#a8430a",
  early: "#ffffff",
  unknown: "#6b7580",
  plate: "#ffffff",
  selected: "#0b5ea8",
  selectedFill: "#e3edf7",
  closure: "#7a3e00",
  permit: "#4b3a8c",
  generic: "#2f5d50",
  route: "#0b5ea8",
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

/** Bus pin: plate with the bus render, status base under it. Anchor at the bottom centre. */
export function drawBusPin(img: HTMLImageElement | null, status: BusStatus, facingWest: boolean, selected: boolean): HTMLCanvasElement {
  const W = 64;
  const plateH = 24;
  const baseW = 26;
  const pad = 3;
  const H = plateH + 4 + 14;
  const [c, g] = canvas(W, H);
  const x = 2;
  const y = 2;
  const pw = W - 4;
  roundRect(g, x, y, pw, plateH, 6);
  g.fillStyle = selected ? COLOURS.selectedFill : COLOURS.plate;
  g.fill();
  g.lineWidth = selected ? 3 : 1.5;
  g.strokeStyle = selected ? COLOURS.selected : COLOURS.ink;
  g.stroke();
  const iw = pw - 2 * pad - 2;
  const ih = iw * (53 / 192);
  const iy = y + (plateH - ih) / 2;
  if (img && img.complete && img.naturalWidth) {
    g.save();
    if (facingWest) {
      g.translate(x + pad + 1 + iw, iy);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0, iw, ih);
    } else {
      g.drawImage(img, x + pad + 1, iy, iw, ih);
    }
    g.restore();
  } else {
    g.fillStyle = COLOURS.ink;
    g.fillRect(x + pad + 1, iy, iw, ih);
  }
  drawBase(g, STATUS_SHAPE[status], W / 2, plateH + 4 + 6, baseW, STATUS_FILL[status]);
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
export function drawCluster(count: number, label: string): HTMLCanvasElement {
  const text = count > 999 ? `${Math.round(count / 100) / 10}k` : String(count);
  const W = Math.max(36, 16 + text.length * 10);
  const H = 36;
  const [c, g] = canvas(W, H);
  roundRect(g, 1.5, 1.5, W - 3, H - 3, H / 2 - 1.5);
  g.fillStyle = COLOURS.ink;
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

export function busImageId(status: BusStatus, facingWest: boolean, selected: boolean): string {
  return `bus-${status}-${facingWest ? "w" : "e"}${selected ? "-sel" : ""}`;
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
