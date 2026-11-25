// The 3D-only badge, kept out of the 2D bundle: it loads with the 3D view.
import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";
import { COLOURS, STATUS_FILL, busRenderImage, canvas, drawBase, drawBusSide, roundRect } from "./pins";

/**
 * The 3D badge that floats above a bus model: route tab, Halifax Transit bus side render facing the travel
 * direction, and the status shape anchored under the bottom centre, matching the 2D bus pin vocabulary.
 */
export function drawBusBadge(
  status: BusStatus,
  route: string | null | undefined,
  selected: boolean,
  facingWest = false,
  compact = false,
  img: HTMLImageElement | null = busRenderImage(),
): HTMLCanvasElement {
  const label = (route ?? "").slice(0, 4);
  const tabW = label ? Math.max(compact ? 22 : 24, 9 + label.length * (compact ? 8.5 : 9)) : 0;
  const imgW = compact ? 34 : 46;
  const plateH = compact ? 22 : 24;
  const plateW = 6 + tabW + (label ? 4 : 0) + imgW + 6;
  const W = plateW + 12;
  const top = 6;
  const baseW = compact ? 24 : 28;
  const H = top + plateH + 16;
  const [c, g] = canvas(W, H);
  const x = (W - plateW) / 2;

  if (selected) {
    roundRect(g, x - 4, top - 4, plateW + 8, plateH + 8, 11);
    g.fillStyle = "rgba(245, 181, 68, 0.95)";
    g.fill();
  }

  g.save();
  g.shadowColor = "rgba(19, 35, 46, 0.45)";
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
    roundRect(g, x + 4, top + 4, tabW, plateH - 8, 4);
    g.fillStyle = COLOURS.ink;
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = compact ? "600 12px 'IBM Plex Sans', system-ui, sans-serif" : "600 13px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, x + 4 + tabW / 2, top + plateH / 2 + 0.5);
    ix = x + 4 + tabW + 4;
  }

  const ih = imgW * (53 / 192);
  const iy = top + (plateH - ih) / 2;
  drawBusSide(g, img, ix, iy, imgW, ih, facingWest);

  // short crisp stem + status shape anchored under bottom centre
  const by = top + plateH + 6;
  g.save();
  g.strokeStyle = selected ? COLOURS.selected : COLOURS.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W / 2, top + plateH);
  g.lineTo(W / 2, by);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(W / 2, by, baseW / 2 + 3, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  drawBase(g, STATUS_SHAPE[status], W / 2, by, baseW, STATUS_FILL[status]);
  return c;
}
