# Visual direction: "Harbour chart"

21 Nov 2026. Workstream E (web application). For the architect's review.

The wireframes fix the structure (top bar, sector rail, map, story panel, phone sheet). They are grey boxes and say nothing about identity. This note sets the identity. It is rooted in Halifax as seen from the water: a nautical chart of the harbour, fog over the Narrows, low Atlantic light, the working waterfront of piers, cranes, buoys and the Georges Island light.

## 1. The idea in one line

The map is a harbour chart; the interface is the chart table around it; the answer is the instrument readout.

- **The chart.** The basemap is drawn like a modern nautical chart: pale fog land, harbour water as the one strong colour, thin ink roads, no shops or icons. The city's data (buses, closures, permits) is the only thing that speaks loudly on it.
- **The chart table.** The interface is warm fog paper with deep harbour ink. The sector rail is a dark pier running down the left edge, the way the waterfront boardwalk runs down the harbour.
- **The readout.** The answer sentence sits on a dark "night harbour" plate, like a ship's instrument panel: fog-white words, numbers in amber Plex Mono, the colour of a channel buoy light at dusk. It is the brightest, largest thing in the panel, on every screen.

What it is not: a grey admin dashboard, a default OpenStreetMap look, or a glass-morphism template.

## 2. Colour tokens

All text pairs meet WCAG 2.2 AA (4.5 to 1 body, 3 to 1 for large text and controls). Ratios below were computed, not guessed.

### Light (default)

| Token | Value | Use | Contrast |
| :---- | :---- | :---- | :---- |
| `--paper` | `#f4f3ee` | Fog paper: panels, top bar | |
| `--surface` | `#ffffff` | Cards, plates on the map | |
| `--ink` | `#13232e` | Body text, the pier (rail), the answer plate | 14.5 on paper |
| `--ink-soft` | `#4f5d66` | Secondary text | 6.1 on paper |
| `--line` | `#d6dad3` | Hairlines (decorative only) | |
| `--line-strong` | `#8a979e` | Control borders | 3.0 on white |
| `--harbour` | `#0d5466` | Primary action, selection, routes | 7.6 on paper; white on it 8.5 |
| `--harbour-tint` | `#d9e7ec` | Selected rows and chips | ink on it 13+ |
| `--buoy` | `#f5b544` | Numbers on the answer plate, selected-pin halo | 8.9 on ink |
| `--late` | `#b3410e` | Late (always with the diamond) | 5.1 on paper |
| `--fog-text` | `#e8edf0` | Text on ink | 14.9 on ink |

### Dark (night harbour, `prefers-color-scheme: dark`)

| Token | Value | Contrast |
| :---- | :---- | :---- |
| `--paper` | `#0b1b23` | |
| `--surface` | `#12252f` | |
| `--ink` | `#e8edf0` | 14.9 on paper |
| `--ink-soft` | `#9fb0b8` | 7.8 on paper |
| `--harbour` | `#8fd3e0` | 10.5 on paper |
| `--buoy` | `#f5b544` | 9.7 on paper |
| `--late` | `#ff8a50` | 7.5 on paper |

### Status (one meaning per story, always shape plus colour plus word)

| Status | Shape under the pin | Fill |
| :---- | :---- | :---- |
| On time | Disc | Ink |
| Late | Diamond | `--late` |
| Early | Ring (white centre, ink outline) | White |
| No schedule | Small square | Grey `#6b7580` |

## 3. Type

- IBM Plex Sans for words, IBM Plex Mono for numbers (tabular, so live values never jitter). Both self-hosted from the `@fontsource` packages (no Google Fonts call). Three weights: 400, 500, 600.
- Scale (laptop, phone in brackets): answer 26/32 (24/30) semibold; panel title 20/26; question 18/24 medium; body 14/20 (16/22); small 12/16 (nothing smaller). Story ids (TRN-Q01) in Plex Mono 12 with letter spacing, the chart's "grid reference".
- Map labels use Noto Sans glyphs served locally with the basemap (MapLibre needs glyph files; Plex is not available as glyphs).

## 4. Basemap style ("harbour chart")

Built with `@protomaps/basemaps` layer logic and our own colour flavour, from the local PMTiles extract (`C:\halifax-twin-data\tiles\halifax.pmtiles`, 16 MB, not committed). No POI icons, so no sprite is needed.

- Water: harbour teal `#9ec3cc` (light) / `#0e3442` (dark), the strongest colour on the map.
- Land: fog `#eceee8`; parks and woods a faint sage, never saturated green.
- Roads: thin, near-white with a hairline casing; highways warm sand `#e9dcc0`. Roads recede; data leads.
- Buildings: a shade darker than land, so downtown has texture without noise.
- Labels: ink with a fog halo; neighbourhood names in italics like chart place names.
- If the extract is missing, a plain fallback (fog background, routes and data only) loads, and the credits say so.

## 5. Pins

- **Buses** use the architect's render (`bus-side.png`) on a white plate, flipped to face the direction of travel, standing on the status base (disc, diamond, ring, square). Selected: harbour outline, tinted plate, and 25% larger, with an amber halo.
- **Road closures:** a warning triangle plate in rust; closure lines drawn as a dashed rust line.
- **Building permits:** a house plate in slate violet `#4b3a8c`.
- **Crowds become counts:** buses and permits cluster into an ink capsule with the count (drawn as an image, so it needs no map fonts). Clicking a cluster zooms in.
- Minimum 24 px on screen, 44 px touch area (hit-testing pads the pin).

## 6. Motion

- Buses glide between GPS reports on a clock 60 s behind real time; they never jump.
- Panels and the phone sheet move in 180 ms with a gentle ease; the answer number cross-fades when it changes.
- The Live lens shows a slow "sonar" ring while data is fresh; it stops when the layer is stale.
- With `prefers-reduced-motion`, all of the above is off: buses snap to their latest report, panels appear without movement, no camera flights.

## 7. Composition

- Laptop: dark pier rail (88 px) left; fog top bar; the map; the story panel (400 px) right. Lens switch and legend sit on fog plates at the map's left edge; zoom and north at the right; data age and credits at the bottom right.
- Phone: search and chips float over the map on fog plates; the answer sheet has three heights (peek shows question, answer plate and lens switch; half adds counts; full adds chart and trust).
- The answer plate is the only dark block in the panel. Everything else is quiet.

## 7b. The 3D view (added 22 Nov 2026, card T27)

The photo tiles are busy and full of colour, so in 3D the chart table is quieter and the data louder.

- **Chrome over photos.** Every control sits on a fog plate (`--plate`, 94% opaque) with a hairline and a soft shadow, as in 2D; nothing is placed bare on the imagery. The 3D detail switch (Automatic, High, Medium, Low) sits under the zoom buttons.
- **Credits.** Google's logo and data credits and the Cesium ion logo sit on their own night plate at the bottom centre (on a phone, under the chips, because the sheet covers the bottom). The footer cards step up in 3D so nothing covers them.
- **Bus pins over buildings.** Up close, the textured bus model sits on the ground at its real size. A badge floats above it: a white plate, a 2 px ink border, a shadow, the status shape and the route number. It is drawn over buildings (no depth test), so a bus behind a tower is never lost. Far away, the 2D pin replaces the model. Selected: amber halo on the badge, amber outline on the model.
- **Crowds.** Pins that overlap on screen merge into an ink count disc, as in 2D; selecting one zooms in.
- **Routes.** Drawn on the ground and the buildings' footprints in harbour blue at 70%; the selected bus's route is solid and wider.
- **Day and night.** The tiles are photographs with their own daylight; the chrome follows the system's light or dark setting.
- **Motion.** Buses glide as in 2D; following a bus moves the camera with it at 30 frames a second (20 on low). With reduced motion: no glide, and the camera jumps instead of flying.

## 8. Gap list: the 20 Nov demo against the wireframes and interface rules

| Area | Demo | Release 1 |
| :---- | :---- | :---- |
| Layout | Fixed three-column body grid; no phone layout at all | Laptop grid plus a phone layout with chips and a three-height sheet |
| Hierarchy | Answer is a plain paragraph among others; no visual lead | Answer plate is the hero on every screen |
| Sector navigation | Hard-coded four buttons; "All sectors" only shows a notice | Rail and chips from the sector register; pins (max 5); grouped, searchable browser of 17 sectors |
| Story panel | Five separate hand-written panels (bus, route, list, analytics, overview) | One story panel driven by story configuration: question, answer, evidence legend, context chart, trust |
| Legend and status | Coloured dots only | Shape plus colour plus word, in the legend, the tiles and the list |
| Crowding | Every bus drawn; pins pile up downtown | Clustering with counts |
| List view | A side panel of buses only, hidden on phones | Full list equal to the map (every drawn layer), on laptop and phone |
| Search | Routes, buses and sectors; hidden on phones | Questions, sectors, routes, stops and buses; always on top |
| Stops and alerts | Not shown | Stops layer at street zoom; source-down states |
| Refresh | Panels loaded once | Every panel polls on its own clock and shows its age |
| Trust | Footnotes typed by hand | From the envelope: source, as-of, tier, licence on every story |
| Third parties | Google Fonts and Cesium from CDNs; OpenStreetMap tiles hot-linked | Fonts and Cesium self-hosted; local Protomaps extract |
| Accessibility | Small targets, no focus styles, no reduced motion | 44 px targets, visible focus, reduced motion, list view |

## 9. Open points for the architect

1. Is "Harbour chart" the right identity, or would you rather the interface lead with something else from Halifax (for example the Citadel, or the transit livery)?
2. Should the rail be dark (pier) as proposed, or light to match the wireframes more literally?
