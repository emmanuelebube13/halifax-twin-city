// Screen-space grouping for pins: a point joins the first group whose anchor lies within `radius` pixels,
// otherwise it starts a new group. Unlike a fixed grid, two neighbours on either side of a cell line still merge,
// so groups never sit on top of each other. Used by the 3D view; 2D uses MapLibre's own clustering.

export interface ScreenPoint {
  id: number;
  x: number;
  y: number;
}

export function clusterScreenPoints<T extends ScreenPoint>(points: T[], radius: number): { ids: number[]; x: number; y: number }[] {
  if (points.length === 0) return [];
  const groups: { ids: number[]; ax: number; ay: number; sx: number; sy: number }[] = [];
  const r2 = radius * radius;
  const cellSize = radius;
  // Spatial hash: bucket group indices by grid cell for O(N) clustering
  const grid = new Map<string, number[]>();

  for (const p of points) {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    let matchedGroup: { ids: number[]; ax: number; ay: number; sx: number; sy: number } | null = null;

    neighborLoop:
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cellGroups = grid.get(`${cx + dx},${cy + dy}`);
        if (cellGroups) {
          for (const gIdx of cellGroups) {
            const candidate = groups[gIdx];
            if ((candidate.ax - p.x) ** 2 + (candidate.ay - p.y) ** 2 <= r2) {
              matchedGroup = candidate;
              break neighborLoop;
            }
          }
        }
      }
    }

    if (matchedGroup) {
      matchedGroup.ids.push(p.id);
      matchedGroup.sx += p.x;
      matchedGroup.sy += p.y;
    } else {
      const gIdx = groups.length;
      const g = { ids: [p.id], ax: p.x, ay: p.y, sx: p.x, sy: p.y };
      groups.push(g);
      const cellKey = `${cx},${cy}`;
      let cell = grid.get(cellKey);
      if (!cell) {
        cell = [];
        grid.set(cellKey, cell);
      }
      cell.push(gIdx);
    }
  }

  return groups.map((g) => ({ ids: g.ids, x: g.sx / g.ids.length, y: g.sy / g.ids.length }));
}

/** Drops consecutive vertices closer than `minStepDeg` degrees while always keeping both endpoints. */
export function decimateLine(line: number[][], minStepDeg = 0.0001): number[][] {
  if (line.length <= 2) return line;
  const minSq = minStepDeg * minStepDeg;
  const out: number[][] = [line[0]];
  let prev = line[0];
  for (let i = 1; i < line.length - 1; i++) {
    const pt = line[i];
    const dx = pt[0] - prev[0];
    const dy = pt[1] - prev[1];
    if (dx * dx + dy * dy >= minSq) {
      out.push(pt);
      prev = pt;
    }
  }
  out.push(line[line.length - 1]);
  return out;
}
