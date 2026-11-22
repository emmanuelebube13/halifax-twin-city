// The view lives in the URL so any view can be shared or bookmarked:
// ?story=TRN-Q01&lens=live&sel=asset:812&route=1&sector=S04&panel=list&view=3d

import type { Kind, Lens } from "../api/types";

export type Panel = "none" | "list" | "sectors" | "sources" | "detail";

export interface Selection {
  kind: Kind;
  id: number;
}

export interface ViewState {
  story: string | null;
  lens: Lens;
  sel: Selection | null;
  route: string | null;
  sector: string | null;
  panel: Panel;
  view: "2d" | "3d";
}

export const DEFAULT_VIEW: ViewState = {
  story: null,
  lens: "live",
  sel: null,
  route: null,
  sector: null,
  panel: "none",
  view: "2d",
};

const LENSES: Lens[] = ["live", "replay", "analytics"];
const PANELS: Panel[] = ["none", "list", "sectors", "sources", "detail"];
const KINDS: Kind[] = ["location", "asset", "event"];

export function parseView(search: string): ViewState {
  const q = new URLSearchParams(search);
  const story = q.get("story");
  const lens = q.get("lens") as Lens | null;
  const panel = q.get("panel") as Panel | null;
  const selRaw = q.get("sel");
  let sel: Selection | null = null;
  if (selRaw) {
    const [kind, id] = selRaw.split(":");
    const n = Number(id);
    if (KINDS.includes(kind as Kind) && Number.isInteger(n) && n > 0) sel = { kind: kind as Kind, id: n };
  }
  return {
    story: story && /^[A-Z]{3}-Q[0-9]{2}$/.test(story) ? story : null,
    lens: lens && LENSES.includes(lens) ? lens : "live",
    sel,
    route: q.get("route") || null,
    sector: q.get("sector") && /^S[0-9]{2}$/.test(q.get("sector") as string) ? q.get("sector") : null,
    panel: panel && PANELS.includes(panel) ? panel : "none",
    view: q.get("view") === "3d" ? "3d" : "2d",
  };
}

export function serializeView(v: ViewState): string {
  const q = new URLSearchParams();
  if (v.story) q.set("story", v.story);
  // with a story open the lens is always written, so a switch between 2D and 3D (or a shared link) keeps it
  if (v.story || v.lens !== "live") q.set("lens", v.lens);
  if (v.sel) q.set("sel", `${v.sel.kind}:${v.sel.id}`);
  if (v.route) q.set("route", v.route);
  if (v.sector) q.set("sector", v.sector);
  if (v.panel !== "none") q.set("panel", v.panel);
  if (v.view !== "2d") q.set("view", v.view);
  const s = q.toString();
  return s ? `?${s}` : "";
}
