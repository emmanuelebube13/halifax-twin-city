# Learning note: t27, the 3D view and the bus pins

22 Nov 2026. Cards T27 (3D view), T29 (3D key) and T30 (pins). For the architect.

## What was built and why

- **Realistic 3D, loaded only when asked for.** CesiumJS and Google Photorealistic 3D Tiles load when you press 3D. The 3D code is a separate chunk (about 8 kB gzipped). CesiumJS (5.5 MB, 1.6 MB gzipped) loads from its own file. The 2D start-up is unchanged, except for about 1 kB of new 2D features.
- **Speed first.**
  - The 3D view draws a frame only when something changed: the camera moved, data arrived or a bus is gliding (Cesium's `requestRenderMode`).
  - Three device profiles (high, medium and low) set how detailed the tiles are, the pixel ratio, the tile cache, preloading and anti-aliasing. The app picks one from your GPU, memory, cores and screen, and you can override it with the "3D detail" switch.
  - On the build machine the first 3D frame takes 6.4 s on high and 1.9 s on low. Results are in `apps/web/design/3d-performance.md`.
- **The same place in 2D and 3D.** Switching keeps the centre, the zoom (converted to camera distance), the bearing and the tilt. A flat 2D view opens 3D tilted at 40 degrees so the buildings stand up. The camera cannot leave Halifax, go underground or fly to space.
- **The token stays safe.**
  - The API hands the Cesium ion token only to callers on this computer. The app keeps it in memory: never stored, logged, put in a URL or cached.
  - A unit test scans the code for storage or logging near the word "token".
  - The 3D check script looks for the token in storage, cookies, the URL, the cache and the console, and reports only yes or no.
- **Never worse than 2D.** No WebGL, a refused token, failing tiles or a 45-second wait all return you to 2D, with a short note on the 3D button.
- **Bus pins from your renders.**
  - `assets/pins/build-bus.mjs` builds two models (80 kB and 10 kB) from `bus-side.png`, `bus-front.png` and `bus-rear.png` with free npm tools, no Blender.
  - Up close you see the textured bus, and at the distance of a neighbourhood a textured box.
  - At every distance a badge floats above the bus, in the same grammar as the 2D pin: the route number on an ink tab, then the status shape.
  - Ground height is sampled once per GPS report, never every frame.
  - Buses that overlap on screen merge into a count, as in 2D, and route lines are draped on the tiles.
- **The 2D pin now shows the route number.** It stays readable when the bus render is too small to see.

## How to run it

```powershell
cd apps\web
npm run dev                                   # 2D and 3D against the API (3D needs the token in the API's environment)
$env:VITE_3D_NO_ION="1"; npm run dev          # 3D on Cesium's plain globe: no Google tiles, no ion use
node scripts\ion-tally.mjs                    # how many 3D page loads this work has used
node scripts\perf-3d.mjs http://127.0.0.1:5173 low:desk   # one measured run (costs one ion load)
cd ..\..\assets\pins; npm install; npm run build              # rebuild the bus models
```

## One hands-on exercise

Change how far the near bus model is drawn, and watch the trade-off.

1. Open `apps/web/src/lib/profile.ts` and find `nearModelMetres` in the medium profile (400).
2. Run the app on the plain globe (`$env:VITE_3D_NO_ION="1"; npm run dev`), open `?story=TRN-Q01&view=3d`, and set "3D detail" to Medium.
3. Zoom towards a bus with the + button and note the distance at which the box turns into the full bus with wheels.
4. Change 400 to 150, save, and repeat. The full model now appears only very close, so fewer models are drawn. That is the trade-off between detail and speed that the three profiles make.

Then answer: why does the floating badge stay visible through buildings while the model does not? (Hint: `disableDepthTestDistance` in `Globe3D.tsx`.)

## Maps to

3D geospatial visualisation with OGC 3D Tiles (the same standard Esri's I3S and ArcGIS scenes interoperate with), level-of-detail and draw-call budgeting (game engine and GIS performance practice), and web performance budgets (Core Web Vitals).
