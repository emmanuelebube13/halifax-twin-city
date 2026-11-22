// Screen-space grouping for pins: points that fall in the same grid cell of `cell` pixels merge into one group.
// Used by the 3D view; the 2D map uses MapLibre's own clustering with the same idea and a similar radius.

export interface ScreenPoint {
  id: number;
  x: number;
  y: number;
}

export function clusterScreenPoints<T extends ScreenPoint>(points: T[], cell: number): { ids: number[]; x: number; y: number }[] {
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const list = cells.get(k);
    if (list) list.push(p);
    else cells.set(k, [p]);
  }
  return [...cells.values()].map((list) => ({
    ids: list.map((p) => p.id),
    x: list.reduce((s, p) => s + p.x, 0) / list.length,
    y: list.reduce((s, p) => s + p.y, 0) / list.length,
  }));
}
