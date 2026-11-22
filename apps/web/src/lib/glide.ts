// Buses glide between GPS reports instead of jumping. The map clock runs LIVE_LAG_MS behind real time, so at
// any moment each bus sits on the straight line between two reports it has already sent (idea kept from the
// 20 Nov demo). Pure functions and a small store, so it can be tested without a map.

export const LIVE_LAG_MS = 60_000;
const KEEP_MS = 5 * 60_000;

export interface Sample {
  t: number; // epoch ms of the GPS report
  lon: number;
  lat: number;
}

/** Position at time `t` on a track of samples sorted by time. Holds the ends; null for an empty track. */
export function positionAt(samples: Sample[], t: number): { lon: number; lat: number } | null {
  if (samples.length === 0) return null;
  if (t <= samples[0].t) return { lon: samples[0].lon, lat: samples[0].lat };
  const last = samples[samples.length - 1];
  if (t >= last.t) return { lon: last.lon, lat: last.lat };
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (t <= b.t) {
      const a = samples[i - 1];
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f };
    }
  }
  return { lon: last.lon, lat: last.lat };
}

/** Compass bearing in degrees from a to b (0 north, 90 east). */
export function bearingBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
  const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
}

/** Keeps a short track of reports per vehicle. */
export class TrackStore {
  private tracks = new Map<number, Sample[]>();

  /** Adds a report; ignores repeats of the same report time. */
  add(id: number, s: Sample): void {
    const track = this.tracks.get(id) ?? [];
    const last = track[track.length - 1];
    if (last && s.t <= last.t) {
      if (s.t === last.t) return;
      // late arrival: insert in order
      track.push(s);
      track.sort((x, y) => x.t - y.t);
    } else {
      track.push(s);
    }
    const cutoff = s.t - KEEP_MS;
    while (track.length > 2 && track[0].t < cutoff) track.shift();
    this.tracks.set(id, track);
  }

  /** Drops vehicles not in the latest set. */
  retain(ids: Set<number>): void {
    for (const id of this.tracks.keys()) if (!ids.has(id)) this.tracks.delete(id);
  }

  get(id: number): Sample[] {
    return this.tracks.get(id) ?? [];
  }

  /**
   * Where to draw the vehicle at real time `now`. With glide on, LIVE_LAG_MS behind real time; if the
   * vehicle has only reports newer than the lagged clock (it just appeared), it waits at its first report.
   * With glide off (reduced motion), the latest report.
   */
  displayPosition(id: number, now: number, glide: boolean): { lon: number; lat: number } | null {
    const track = this.get(id);
    if (!glide) {
      const last = track[track.length - 1];
      return last ? { lon: last.lon, lat: last.lat } : null;
    }
    return positionAt(track, now - LIVE_LAG_MS);
  }

  ids(): number[] {
    return [...this.tracks.keys()];
  }
}
