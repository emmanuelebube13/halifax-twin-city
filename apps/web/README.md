# Halifax Twin web app

The map application for the Halifax Digital Twin (workstream E, release 1). React, TypeScript and Vite; MapLibre GL JS for 2D; CesiumJS with Google Photorealistic 3D Tiles for 3D when the API hands over a token. It reads only the serving API (contract v0, `engineering/contract/openapi.yaml`).

## Run it

```powershell
cd apps\web
npm install                 # also copies CesiumJS into public\cesium (git-ignored)
npm run dev                 # http://127.0.0.1:5173, against the API at http://127.0.0.1:8010
npm run dev:mock            # the same, from the contract's example responses: no API needed
npm test                    # unit tests (formatter, status rules, story rendering, URL, glide)
npm run build               # type check and production build into dist\
npm run fixtures            # re-copy the contract examples into src\mocks\fixtures
npm run screenshots         # with a dev server running: laptop and phone screenshots into screenshots\
npm run a11y                # with a dev server running: axe-core WCAG 2.2 AA scan of the main screens
```

Settings (copy `.env.example` to `.env.local`): `VITE_API_BASE`, `VITE_USE_MOCKS`, `HALIFAX_TWIN_TILES_DIR`. No key or token belongs in any of them: the Cesium ion token reaches the page only from the API's `/v1/client-config`, and only on this computer.

## Basemap

The "harbour chart" basemap is a local Protomaps extract (`halifax.pmtiles`, about 16 MB) plus fonts and sprites, kept in `C:\halifax-twin-data\tiles` and served at `/tiles` by the dev and preview servers. Build it with `scripts\make-basemap.ps1` (free, no account). Without it the app falls back to a plain background and says so in the credits. No OpenStreetMap tiles are hot-linked.

## Where things are

| Path | What |
| :---- | :---- |
| `design/direction.md` | Visual direction, colour tokens with contrast ratios, demo gap list |
| `src/App.tsx` | The shell: which layers to draw, layout for laptop and phone |
| `src/api/` | Contract types, client (with mock switch), pollers |
| `src/lib/format.ts` | The one shared number formatter |
| `src/lib/status.ts` | On-time rule, status shapes, layer freshness |
| `src/lib/story.ts` | Answer sentence rendering from a story's template |
| `src/lib/glide.ts` | Buses glide between GPS reports, 60 s behind real time |
| `src/i18n/en.ts` | Every word the interface shows (French-ready) |
| `src/map/` | MapLibre view, basemap style, pin drawing, pin register, 3D view |
| `src/components/` | Panels, overlays, chrome, icons |
| `src/styles/` | Design tokens and styles |
