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

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = Math.round(w * PIXEL_RATIO);
  c.height = Math.round(h * PIXEL_RATIO);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.scale(PIXEL_RATIO, PIXEL_RATIO);
  return [c, g];
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

export type Glyph = "triangle" | "house" | "square" | "dot" | "stop" | "station" | "bunching" | "clock";

/**
 * Crisp Halifax Transit bus side silhouette used as a fallback before img/bus-side.png loads (or in tests):
 * white/silver upper body, harbour-teal lower stripe, dark window band, amber headlamp and two wheels.
 */
export function drawStylizedHalifaxBus(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  facingWest: boolean,
): void {
  g.save();
  if (facingWest) {
    g.translate(x + w, y);
    g.scale(-1, 1);
  } else {
    g.translate(x, y);
  }
  const wheelR = Math.max(1.5, h * 0.2);
  const bodyH = Math.max(4, h - wheelR * 0.65);
  const r = Math.min(2.4, bodyH * 0.22);

  // upper body (white/silver) with subtle dark outline
  roundRect(g, 0, 0, w, bodyH, r);
  g.fillStyle = "#f2f5f7";
  g.fill();
  g.lineWidth = 0.85;
  g.strokeStyle = COLOURS.ink;
  g.stroke();

  // lower harbour-teal stripe
  const stripeY = bodyH * 0.56;
  g.save();
  roundRect(g, 0.4, 0.4, w - 0.8, bodyH - 0.8, Math.max(1, r - 0.3));
  g.clip();
  g.fillStyle = COLOURS.selected;
  g.fillRect(0, stripeY, w, bodyH - stripeY);

  // dark window band with slightly deeper front windshield
  const winY = bodyH * 0.16;
  const winH = bodyH * 0.34;
  g.fillStyle = COLOURS.ink;
  g.fillRect(w * 0.06, winY, w * 0.72, winH);
  g.fillRect(w * 0.81, winY, w * 0.14, winH * 1.12);

  // amber front headlamp dot
  g.fillStyle = "#f5b544";
  g.beginPath();
  g.arc(w * 0.93, bodyH * 0.76, Math.max(0.9, h * 0.095), 0, Math.PI * 2);
  g.fill();
  g.restore();

  // two wheels
  const wheelY = h - wheelR;
  for (const wx of [w * 0.23, w * 0.77]) {
    g.beginPath();
    g.arc(wx, wheelY, wheelR, 0, Math.PI * 2);
    g.fillStyle = COLOURS.ink;
    g.fill();
    g.beginPath();
    g.arc(wx, wheelY, wheelR * 0.44, 0, Math.PI * 2);
    g.fillStyle = COLOURS.selectedFill;
    g.fill();
  }
  g.restore();
}

/** Draws the Halifax Transit bus side render when loaded, or the stylized silhouette fallback. */
export function drawBusSide(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  facingWest: boolean,
): void {
  if (img && img.complete && img.naturalWidth) {
    g.save();
    if (facingWest) {
      g.translate(x + w, y);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0, w, h);
    } else {
      g.drawImage(img, x, y, w, h);
    }
    g.restore();
  } else {
    drawStylizedHalifaxBus(g, x, y, w, h, facingWest);
  }
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
  drawBusSide(g, img, ix, iy, imgW, ih, facingWest);
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

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(19, 35, 46, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Distinct glyph pins for event, stop/station, and analytics layers. Anchor: bottom centre. */
export function drawGlyphPin(glyph: Glyph, colour: string, selected: boolean): HTMLCanvasElement {
  if (glyph === "stop") {
    const W = 22;
    const H = 26;
    const [c, g] = canvas(W, H);
    const cx = W / 2;
    const cy = 10.5;
    const ringColour = selected ? COLOURS.selected : colour;
    // tiny stem and anchor dot at bottom centre
    g.fillStyle = COLOURS.ink;
    g.beginPath();
    g.ellipse(cx, H - 2.5, 4.5, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ringColour;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy + 7.5);
    g.lineTo(cx, H - 2.5);
    g.stroke();

    if (selected) {
      g.beginPath();
      g.arc(cx, cy, 9.5, 0, Math.PI * 2);
      g.fillStyle = "rgba(245, 181, 68, 0.95)";
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy, 7.5, 0, Math.PI * 2);
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fill();
    g.lineWidth = selected ? 2.6 : 2.2;
    g.strokeStyle = ringColour;
    g.stroke();

    // crisp transit stop T-bar + dot inside the ring
    g.fillStyle = colour;
    g.fillRect(cx - 3.5, cy - 3.2, 7, 1.8);
    g.beginPath();
    g.arc(cx, cy + 1.4, 2.1, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  const W = 30;
  const H = 38;
  const [c, g] = canvas(W, H);
  // base disc (no status for these kinds: a plain base keeps the pin readable on photos)
  g.fillStyle = COLOURS.ink;
  g.beginPath();
  g.ellipse(W / 2, H - 5, 10, 4, 0, 0, Math.PI * 2);
  g.fill();

  const cx = W / 2;
  const cy = 2 + (W - 6) / 2;
  const borderColour = selected ? COLOURS.selected : colour;
  const isRound = glyph === "bunching" || glyph === "clock";

  if (selected) {
    if (isRound) {
      g.beginPath();
      g.arc(cx, cy, 14, 0, Math.PI * 2);
      g.fillStyle = "rgba(245, 181, 68, 0.95)";
      g.fill();
    } else {
      roundRect(g, 0.5, 0, W - 1, W - 1, 8.5);
      g.fillStyle = "rgba(245, 181, 68, 0.95)";
      g.fill();
    }
  }

  if (isRound) {
    g.beginPath();
    g.arc(cx, cy, 12, 0, Math.PI * 2);
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fill();
    g.lineWidth = selected ? 3 : 2;
    g.strokeStyle = borderColour;
    g.stroke();
  } else {
    roundRect(g, 3, 2, W - 6, W - 6, glyph === "station" ? 8 : 6);
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fill();
    g.lineWidth = selected ? 3 : 1.75;
    g.strokeStyle = borderColour;
    g.stroke();
  }

  g.fillStyle = colour;
  g.strokeStyle = colour;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.lineJoin = "round";

  if (glyph === "triangle") {
    g.beginPath();
    g.moveTo(cx, cy - 8);
    g.lineTo(cx + 8, cy + 6);
    g.lineTo(cx - 8, cy + 6);
    g.closePath();
    g.stroke();
    g.fillRect(cx - 1, cy - 3, 2, 5);
    g.fillRect(cx - 1, cy + 3, 2, 2);
  } else if (glyph === "house") {
    g.beginPath();
    g.moveTo(cx - 8, cy);
    g.lineTo(cx, cy - 8);
    g.lineTo(cx + 8, cy);
    g.lineTo(cx + 8, cy + 8);
    g.lineTo(cx - 8, cy + 8);
    g.closePath();
    g.stroke();
  } else if (glyph === "station") {
    // pitched shelter roof canopy
    g.beginPath();
    g.moveTo(cx - 8, cy - 3.5);
    g.lineTo(cx, cy - 8.5);
    g.lineTo(cx + 8, cy - 3.5);
    g.stroke();
    // mini bus front below canopy
    roundRect(g, cx - 5, cy - 1, 10, 9.5, 2.2);
    g.fill();
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fillRect(cx - 3.2, cy + 0.8, 6.4, 3.2);
    g.fillRect(cx - 3.2, cy + 5.6, 1.8, 1.5);
    g.fillRect(cx + 1.4, cy + 5.6, 1.8, 1.5);
  } else if (glyph === "bunching") {
    // two overlapping bus silhouettes showing bunched vehicles
    roundRect(g, cx - 7, cy - 6, 9, 7.5, 2);
    g.fill();
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fillRect(cx - 5.4, cy - 4.4, 5.8, 2.6);
    // white gap behind foreground bus
    roundRect(g, cx - 2.5, cy - 2, 10, 8.5, 2.4);
    g.fill();
    g.fillStyle = colour;
    roundRect(g, cx - 1.5, cy - 1, 8.5, 7, 2);
    g.fill();
    g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
    g.fillRect(cx, cy + 0.5, 5.5, 2.5);
  } else if (glyph === "clock") {
    // crisp clock face + hands (12 to 3 o'clock)
    g.lineWidth = 1.7;
    g.beginPath();
    g.arc(cx, cy, 7.5, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.9;
    g.beginPath();
    g.moveTo(cx, cy - 4.8);
    g.lineTo(cx, cy);
    g.lineTo(cx + 4.2, cy);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 1.3, 0, Math.PI * 2);
    g.fill();
  } else if (glyph === "dot") {
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillRect(cx - 6, cy - 6, 12, 12);
  }
  return c;
}

/** Cluster pin: a soft outer halo + crisp white-bordered capsule with count (and mini bus icon for bus clusters). */
export function drawCluster(count: number, label: string, colour: string = COLOURS.ink): HTMLCanvasElement {
  const text = count > 999 ? `${Math.round(count / 100) / 10}k` : String(count);
  const isBus = label === "bus";
  const pillH = 30;
  const pad = 4;
  const busIconW = isBus ? 14 : 0;
  const pillW = isBus
    ? Math.max(48, 10 + busIconW + 5 + text.length * 9.5 + 10)
    : Math.max(32, 14 + text.length * 9.5);
  const W = pillW + pad * 2;
  const H = pillH + pad * 2;
  const [c, g] = canvas(W, H);

  // soft outer halo ring (22% alpha)
  roundRect(g, 1, 1, W - 2, H - 2, H / 2 - 1);
  g.fillStyle = hexToRgba(colour, 0.22);
  g.fill();

  // crisp white-bordered capsule
  roundRect(g, pad, pad, pillW, pillH, pillH / 2);
  g.fillStyle = colour;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#ffffff";
  g.stroke();

  if (isBus) {
    const ix = pad + 10;
    const iy = pad + (pillH - 12) / 2;
    g.fillStyle = "#ffffff";
    roundRect(g, ix, iy, 12, 10.5, 2.5);
    g.fill();
    g.fillStyle = colour;
    g.fillRect(ix + 2, iy + 2, 8, 3.8);
    g.fillRect(ix + 2.2, iy + 7.4, 2, 1.6);
    g.fillRect(ix + 7.8, iy + 7.4, 2, 1.6);
    // wheels
    g.fillStyle = "#ffffff";
    g.fillRect(ix + 2, iy + 10.5, 2.2, 1.4);
    g.fillRect(ix + 7.8, iy + 10.5, 2.2, 1.4);

    g.fillStyle = "#ffffff";
    g.font = "600 14px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const textAreaLeft = ix + busIconW + 2;
    const textAreaRight = pad + pillW - 7;
    g.fillText(text, (textAreaLeft + textAreaRight) / 2, H / 2 + 0.5);
  } else {
    g.fillStyle = "#ffffff";
    g.font = "600 14px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, W / 2, H / 2 + 0.5);
  }
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
    out.push(toPin(`glyph-dot${s}`, drawGlyphPin("dot", COLOURS.generic, sel)));
  }
  return out;
}
