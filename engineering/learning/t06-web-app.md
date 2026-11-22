# Learning note: t06, the web application

22 Nov 2026. Workstream E. For the architect.

## What was built and why

The map application in `apps/web`, rebuilt from the six wireframes rather than from the demo page.

- **One shell, stories as configuration.** The app holds no story-specific code. It asks the API for the story register (`/v1/stories`), each story's configuration (`/v1/stories/{id}`), and the layers and numbers a story names. Thirteen stories arrive; four or five answer now, the rest show their status ("Collecting data", "Source incomplete") and the API's one-sentence note, never a number.
- **The conformed core on the map.** Layers are drawn by a register (`src/map/registry.ts`): a layer name maps to a pin kind. A new sector adds a register entry, not new drawing code; an unknown layer still draws with a generic pin.
- **Trust on screen.** Every answer shows its source, data age and reliability tier from the response envelope. A live layer older than 2 minutes greys out with "Stale since 19:42"; a failed layer keeps its last good data, dimmed, while the others carry on.
- **Status by shape.** Disc on time, diamond late, ring early, square for no schedule: on the pins, in the legend, the tiles and the list.
- **Buses glide.** Each bus keeps a short track of its GPS reports; the map clock runs 60 s behind real time, so a bus always moves on the line between two reports it has already sent. With reduced motion, buses snap to their latest report.
- **Phone first.** On a phone, search and chips float over the map and the answer lives in a sheet with three heights.
- **Visual identity.** "Harbour chart": a basemap styled like a nautical chart from a local Protomaps extract, a dark "pier" rail, and the answer on a night-harbour plate with amber numbers. See `apps/web/design/direction.md`.

## How to run it

See `apps/web/README.md`. In short: `npm install`, then `npm run dev` (API on port 8010) or `npm run dev:mock` (no API), `npm test`, `npm run build`.

## One hands-on exercise

Add a story layer without writing drawing code.

1. Open `apps/web/src/map/registry.ts` and add an entry, for example `"parks": { kind: "event", glyph: "square", colour: "#2f5d50", cluster: true }`.
2. Add `"layer.parks": "Parks"` to `src/i18n/en.ts`.
3. In mock mode, copy `src/mocks/fixtures/layers-building-permits.json` to `layers-parks.json`, and in a copy of `story-TRN-Q01.json` named `story-PWK-Q07.json` change the first evidence layer to `{"layer": "parks", "path": "layers", "legend": []}`.
4. Run `npm run dev:mock` and open `http://127.0.0.1:5173/?story=PWK-Q07`. The map draws the new layer with its pin and clusters; the list view lists it. Nothing else changed.

Then answer: why does the city view count your new layer, but not routes? (Hint: `context` in the register.)

## Maps to

REST API consumption against an OpenAPI contract (contract-first front end), and WCAG 2.2 AA (the IAAP WAS certification covers the accessibility side).
