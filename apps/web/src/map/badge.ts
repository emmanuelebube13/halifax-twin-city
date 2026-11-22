// The 3D-only badge, kept out of the 2D bundle: it loads with the 3D view.
import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";
import { COLOURS, STATUS_FILL, canvas, drawBase, roundRect } from "./pins";

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

