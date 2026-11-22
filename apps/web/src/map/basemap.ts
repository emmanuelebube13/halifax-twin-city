// "Harbour chart" basemap: Protomaps layer logic with our own colours (design/direction.md, section 4),
// read from a local PMTiles extract served at /tiles. No POI icons, so no sprite is needed.
// If the extract is missing, a plain fallback (fog background only) keeps the data layers readable.

import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const TILES_BASE = `${location.origin}/tiles`;
export const PMTILES_URL = `${TILES_BASE}/halifax.pmtiles`;

const LIGHT: Partial<Flavor> = {
  background: "#e9ebe5",
  earth: "#eceee8",
  park_a: "#e1e6da",
  park_b: "#dce2d4",
  wood_a: "#dfe4d8",
  wood_b: "#d9dfd2",
  scrub_a: "#e1e6da",
  scrub_b: "#dbe2d3",
  hospital: "#ece6e4",
  industrial: "#e5e6e2",
  school: "#ebe7df",
  pedestrian: "#e9eae4",
  glacier: "#f3f4f1",
  sand: "#ece6d6",
  beach: "#ece6d6",
  aerodrome: "#e4e6e1",
  runway: "#d9dcd5",
  zoo: "#dfe6d8",
  military: "#e4e5e0",
  water: "#8fb9c4",
  pier: "#d9dbd4",
  buildings: "#dcdfd8",
  other: "#f7f7f3",
  minor_service: "#f7f7f3",
  minor_a: "#fbfbf8",
  minor_b: "#fbfbf8",
  link: "#f4ecd9",
  major: "#fdfcf8",
  highway: "#f1e8d4",
  minor_service_casing: "#d5d8d1",
  minor_casing: "#d5d8d1",
  link_casing: "#d2c9b4",
  major_casing_early: "#cfd2cb",
  major_casing_late: "#cfd2cb",
  highway_casing_early: "#cdbf9f",
  highway_casing_late: "#cdbf9f",
  tunnel_other: "#eeeee9",
  tunnel_minor: "#eeeee9",
  tunnel_link: "#eee7d7",
  tunnel_major: "#f1f1ec",
  tunnel_highway: "#ebe0c7",
  tunnel_other_casing: "#d8dad3",
  tunnel_minor_casing: "#d8dad3",
  tunnel_link_casing: "#d8dad3",
  tunnel_major_casing: "#d8dad3",
  tunnel_highway_casing: "#d8dad3",
  bridges_other: "#f7f7f3",
  bridges_minor: "#fbfbf8",
  bridges_link: "#f4ecd9",
  bridges_major: "#fdfcf8",
  bridges_highway: "#f1e8d4",
  bridges_other_casing: "#b9beb6",
  bridges_minor_casing: "#b9beb6",
  bridges_link_casing: "#b9beb6",
  bridges_major_casing: "#b9beb6",
  bridges_highway_casing: "#b3a888",
  railway: "#b8bcb5",
  boundaries: "#a9b0aa",
  roads_label_minor: "#5d6a72",
  roads_label_minor_halo: "#f7f7f3",
  roads_label_major: "#4f5d66",
  roads_label_major_halo: "#f7f7f3",
  ocean_label: "#2f5f6c",
  subplace_label: "#4f5d66",
  subplace_label_halo: "#eceee8",
  city_label: "#13232e",
  city_label_halo: "#eceee8",
  state_label: "#6b7580",
  state_label_halo: "#eceee8",
  country_label: "#6b7580",
  address_label: "#6b7580",
  address_label_halo: "#eceee8",
};

const DARK: Partial<Flavor> = {
  background: "#0f1d24",
  earth: "#13232b",
  park_a: "#152a2b",
  park_b: "#172d2d",
  wood_a: "#152a2a",
  wood_b: "#172d2c",
  scrub_a: "#14272a",
  scrub_b: "#15292b",
  hospital: "#1a2529",
  industrial: "#16242a",
  school: "#18252a",
  pedestrian: "#17262d",
  glacier: "#1b2a31",
  sand: "#1d2a2c",
  beach: "#1d2a2c",
  aerodrome: "#16252c",
  runway: "#22323a",
  zoo: "#152a2b",
  military: "#16252b",
  water: "#0a3442",
  pier: "#1e2e36",
  buildings: "#1b2c35",
  other: "#22343e",
  minor_service: "#22343e",
  minor_a: "#273a44",
  minor_b: "#273a44",
  link: "#3a3a2e",
  major: "#2e434e",
  highway: "#4a4532",
  minor_service_casing: "#13232b",
  minor_casing: "#13232b",
  link_casing: "#13232b",
  major_casing_early: "#13232b",
  major_casing_late: "#13232b",
  highway_casing_early: "#13232b",
  highway_casing_late: "#13232b",
  tunnel_other: "#1d2d35",
  tunnel_minor: "#1d2d35",
  tunnel_link: "#1d2d35",
  tunnel_major: "#1d2d35",
  tunnel_highway: "#2a2b25",
  tunnel_other_casing: "#13232b",
  tunnel_minor_casing: "#13232b",
  tunnel_link_casing: "#13232b",
  tunnel_major_casing: "#13232b",
  tunnel_highway_casing: "#13232b",
  bridges_other: "#22343e",
  bridges_minor: "#273a44",
  bridges_link: "#3a3a2e",
  bridges_major: "#2e434e",
  bridges_highway: "#4a4532",
  bridges_other_casing: "#0b1b23",
  bridges_minor_casing: "#0b1b23",
  bridges_link_casing: "#0b1b23",
  bridges_major_casing: "#0b1b23",
  bridges_highway_casing: "#0b1b23",
  railway: "#33464f",
  boundaries: "#3b4e57",
  roads_label_minor: "#9fb0b8",
  roads_label_minor_halo: "#13232b",
  roads_label_major: "#b8c6cc",
  roads_label_major_halo: "#13232b",
  ocean_label: "#8fd3e0",
  subplace_label: "#b8c6cc",
  subplace_label_halo: "#13232b",
  city_label: "#e8edf0",
  city_label_halo: "#13232b",
  state_label: "#9fb0b8",
  state_label_halo: "#13232b",
  country_label: "#9fb0b8",
  address_label: "#9fb0b8",
  address_label_halo: "#13232b",
};

export function harbourFlavor(dark: boolean): Flavor {
  const base = namedFlavor(dark ? "dark" : "light");
  return {
    ...base,
    ...(dark ? DARK : LIGHT),
    regular: "Noto Sans Regular",
    bold: "Noto Sans Medium",
    italic: "Noto Sans Italic",
    pois: undefined,
  };
}

export function harbourStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    glyphs: `${TILES_BASE}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${TILES_BASE}/sprites/v4/${dark ? "dark" : "light"}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: "© OpenStreetMap contributors, Protomaps",
      },
    },
    layers: sentenceCase(layers("protomaps", harbourFlavor(dark), { lang: "en" }) as StyleSpecification["layers"]),
  };
}

/** The interface rules forbid all-capital labels: drop the basemap's uppercase transforms. */
function sentenceCase(list: StyleSpecification["layers"]): StyleSpecification["layers"] {
  return list.map((l0) => {
    let l = l0;
    if (/roads_labels_minor/.test(l.id)) l = { ...l, minzoom: Math.max((l as { minzoom?: number }).minzoom ?? 0, 15.5) } as typeof l;
    const layout = (l as { layout?: Record<string, unknown> }).layout;
    if (layout && "text-transform" in layout) {
      const { ["text-transform"]: _drop, ...rest } = layout;
      void _drop;
      return { ...l, layout: rest } as typeof l;
    }
    return l;
  });
}

/** No basemap file: fog background only. The data layers carry the map. */
export function fallbackStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": dark ? "#13232b" : "#eceee8" } }],
  };
}

/** Is the local extract there? A HEAD-like range request for its first bytes. */
export async function basemapAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PMTILES_URL, { headers: { Range: "bytes=0-15" } });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}
