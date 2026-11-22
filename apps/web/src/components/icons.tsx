// The project's own icon set: simple strokes, 24 px grid, always paired with a text label or a spoken name.

import type { BusStatus } from "../api/types";
import { STATUS_SHAPE } from "../lib/status";

type IconProps = { size?: number; className?: string };

const base = (size = 24, className = "icon") => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  className,
});

export function Mark({ size = 28 }: IconProps) {
  // the brand mark: a harbour light (Georges Island) over two lines of water
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brand-mark">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8" fill="var(--night)" />
      <path d="M13 22l1.4-11h3.2L19 22z" fill="var(--buoy)" />
      <path d="M12.5 10.5h7l-3.5-3z" fill="var(--on-night)" />
      <path d="M6 24.5c2.5-1.4 4.5-1.4 7 0s4.5 1.4 7 0 4.5-1.4 6 0" stroke="var(--harbour-on-ink)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M8 27.5c2-1 3.8-1 5.6 0s3.7 1 5.6 0 3.6-1 4.8 0" stroke="var(--harbour-on-ink)" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function SectorIcon({ id, size = 24 }: { id: string } & IconProps) {
  const p = base(size);
  switch (id) {
    case "city":
      return (
        <svg {...p}>
          <path d="M3 20h18M5 20V10l4-2v12M9 20V5h5v15M14 20v-8h5v8" />
          <path d="M11 8h1M11 11h1M11 14h1" />
        </svg>
      );
    case "S04":
      return (
        <svg {...p}>
          <rect x="5" y="3.5" width="14" height="15" rx="3" />
          <path d="M5 12h14M8 18.5V21M16 18.5V21M9 15.5h.01M15 15.5h.01M8.5 7h7" />
        </svg>
      );
    case "S05":
      return (
        <svg {...p}>
          <path d="M9.5 4h5l4 15h-13z" />
          <path d="M7.6 11h8.8M6.7 15h10.6M3 20h18" />
        </svg>
      );
    case "S09":
      return (
        <svg {...p}>
          <path d="M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "all":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" strokeDasharray="2 2" />
        </svg>
      );
    case "sources":
      return (
        <svg {...p}>
          <ellipse cx="12" cy="6" rx="7" ry="2.5" />
          <path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.5v7M8.5 12h7" />
        </svg>
      );
  }
}

export function Icon({ name, size = 20 }: { name: "search" | "list" | "map" | "close" | "back" | "play" | "pause" | "follow" | "chevron" | "warning" | "external" } & IconProps) {
  const p = base(size);
  switch (name) {
    case "search":
      return (<svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>);
    case "list":
      return (<svg {...p}><path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" /></svg>);
    case "map":
      return (<svg {...p}><path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5zM9 4v13.5M15 6.5V20" /></svg>);
    case "close":
      return (<svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
    case "back":
      return (<svg {...p}><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>);
    case "play":
      return (<svg {...p}><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>);
    case "pause":
      return (<svg {...p}><path d="M8 5.5v13M16 5.5v13" strokeWidth="2.4" /></svg>);
    case "follow":
      return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>);
    case "chevron":
      return (<svg {...p}><path d="M9 5.5l6.5 6.5L9 18.5" /></svg>);
    case "warning":
      return (<svg {...p}><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.5M12 17h.01" /></svg>);
    case "external":
      return (<svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></svg>);
  }
}

/** The status shape, drawn inline beside its word. Shape plus colour plus word: never colour alone. */
export function StatusMark({ status, size = 18 }: { status: BusStatus; size?: number }) {
  const shape = STATUS_SHAPE[status];
  const w = size;
  const h = Math.round(size * 0.62);
  return (
    <svg width={w} height={h} viewBox="0 0 18 11" aria-hidden="true" focusable="false" className={`status-mark status-${status}`}>
      {shape === "disc" && <ellipse cx="9" cy="5.5" rx="8" ry="4.5" fill="var(--status-on-time)" />}
      {shape === "diamond" && <path d="M1 5.5L9 0.5l8 5-8 5z" fill="var(--status-late)" />}
      {shape === "ring" && <ellipse cx="9" cy="5.5" rx="7.2" ry="3.8" fill="var(--surface)" stroke="var(--status-on-time)" strokeWidth="1.8" />}
      {shape === "square" && <rect x="5" y="1.5" width="8" height="8" fill="var(--status-unknown)" />}
    </svg>
  );
}

/** Legend mark for a non-status layer: its pin glyph or its line. */
export function LayerMark({ look }: { look: { kind: string; glyph: string; colour: string; dashed: boolean } }) {
  if (look.kind === "route") {
    return (<svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"><path d="M1 5h20" stroke={look.colour} strokeWidth="3" strokeLinecap="round" /></svg>);
  }
  if (look.kind === "stop") {
    return (<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" /></svg>);
  }
  if (look.kind === "bus") {
    return (<svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><rect x="1" y="1" width="20" height="12" rx="3" fill="#fff" stroke="var(--status-on-time)" strokeWidth="1.5" /><path d="M5 5h12" stroke="var(--status-on-time)" strokeWidth="1.5" /></svg>);
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="16" height="16" rx="4" fill="#fff" stroke={look.colour} strokeWidth="1.6" />
      {look.glyph === "triangle" && <path d="M9 4.5l4.5 8h-9z" fill="none" stroke={look.colour} strokeWidth="1.5" strokeLinejoin="round" />}
      {look.glyph === "house" && <path d="M4.5 9L9 5l4.5 4v4.5h-9z" fill="none" stroke={look.colour} strokeWidth="1.5" strokeLinejoin="round" />}
      {look.glyph === "square" && <rect x="6" y="6" width="6" height="6" fill={look.colour} />}
    </svg>
  );
}
