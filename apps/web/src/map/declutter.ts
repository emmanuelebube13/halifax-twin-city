// Screen-space grouping for pins: a point joins the first group whose anchor lies within `radius` pixels,
// otherwise it starts a new group. Unlike a fixed grid, two neighbours on either side of a cell line still merge,
// so groups never sit on top of each other. Used by the 3D view; 2D uses MapLibre's own clustering.

export interface ScreenPoint {
  id: number;
  x: number;
  y: number;
}

export function clusterScreenPoints<T extends ScreenPoint>(points: T[], radius: number): { ids: number[]; x: number; y: number }[] {
  const groups: { ids: number[]; ax: number; ay: number; sx: number; sy: number }[] = [];
  const r2 = radius * radius;
  for (const p of points) {
    let g = groups.find((q) => (q.ax - p.x) ** 2 + (q.ay - p.y) ** 2 <= r2);
    if (!g) {
      g = { ids: [], ax: p.x, ay: p.y, sx: 0, sy: 0 };
      groups.push(g);
    }
    g.ids.push(p.id);
    g.sx += p.x;
    g.sy += p.y;
  }
  return groups.map((g) => ({ ids: g.ids, x: g.sx / g.ids.length, y: g.sy / g.ids.length }));
}
