// The 3D-only badge, kept out of the 2D bundle: it loads with the 3D view.
import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";
import { COLOURS, STATUS_FILL, canvas, drawBase, roundRect } from "./pins";

/**
 * The 3D badge that floats above a bus model: the status shape and the route number on a white plate, so status
 * reads by shape and colour over photo buildings as it does in 2D. Anchor: bottom centre.
 */
export function drawBusBadge(status: BusStatus, route: string | null | undefined, selected: boolean): HTMLCanvasElement {
  // the same grammar as the 2D pin: an ink tab with the route number, then the status shape on white
  const label = (route ?? "").slice(0, 4);
  const tabW = label ? Math.max(26, 10 + label.length * 9.5) : 0;
  const shapeW = 34;
  const W = 4 + tabW + (label ? 4 : 0) + shapeW;
  const H = 30;
  const pad = 6;
  const [c, g] = canvas(W + pad * 2, H + pad * 2);
  const x = pad;
  const y = pad;
  if (selected) {
    roundRect(g, x - 5, y - 5, W + 10, H + 10, 12);
    g.fillStyle = "rgba(245, 181, 68, 1)";
    g.fill();
  }
  g.save();
  g.shadowColor = "rgba(19, 35, 46, 0.45)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  roundRect(g, x, y, W, H, 8);
  g.fillStyle = selected ? COLOURS.selectedFill : "#ffffff";
  g.fill();
  g.restore();
  roundRect(g, x, y, W, H, 8);
  g.lineWidth = selected ? 3 : 2;
  g.strokeStyle = selected ? COLOURS.selected : COLOURS.ink;
  g.stroke();
  if (label) {
    roundRect(g, x + 4, y + 4, tabW, H - 8, 5);
    g.fillStyle = COLOURS.ink;
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = "600 15px 'IBM Plex Sans', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, x + 4 + tabW / 2, y + H / 2 + 0.5);
  }
  drawBase(g, STATUS_SHAPE[status], x + W - 4 - shapeW / 2, y + H / 2, 28, STATUS_FILL[status]);
  return c;
}
