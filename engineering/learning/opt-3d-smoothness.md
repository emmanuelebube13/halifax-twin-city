# Learning note: smooth 3D view (`opt-3d-smoothness`)

25 Nov 2026 · Prepared for Emmanuel Mbachu · Builds on `opt-phase1-performance`

## What changed and why

Measured on the production build, RTX 5070 laptop screen (1440 x 900), story TRN-Q01:

| Measure | Before | After |
| :---- | ----: | ----: |
| 3D settled (tiles loaded) | 9.2 s | 5.4 s |
| First Google tiles on screen (dev build) | 12.5 s | 5.6 s |
| Redraws while sitting still, per 4 s | 45 | 16, falling to 5 once tiles settle |
| Memory | 521 MB | 140-180 MB |
| Slowest click in 3D | 592 ms | 80 ms |
| Switch 3D back to 2D (click to answer) | 408 ms | 32 ms |

1. **Redraw only when a bus visibly moves** (`src/map/Globe3D.tsx`, the bus draw loop). The glide clock ticks 10 times a second. Each tick used to ask Cesium for a full frame, and a frame of Google tiles walks every loaded tile (tens of milliseconds). Now a tick converts each on-screen bus's movement into screen pixels (metres moved divided by distance, times pixels per radian of the camera's field of view). It asks for a frame only past a threshold: 0.4 px on high, 0.75 on medium, 1.5 on low. A frame is also drawn when buses appear or disappear, a badge changes, the camera follows a bus, or once a second at most so a bus gliding in from off screen still shows up.
2. **Coarser tiles on strong computers** (`src/lib/profile.ts`). The high profile's `maximumScreenSpaceError` went from 4 to 8. This number is how many pixels of error a tile may show before Cesium fetches a finer one. Halving the detail needs about a third of the tiles, which means fewer downloads, less memory, and less work every frame and when 3D closes.
3. **One anti-aliasing pass, not two.** Anti-aliasing smooths jagged edges. High already uses MSAA (4 samples per pixel), so FXAA, a second full-screen pass, is now off there. A new test makes sure no profile runs both.
4. **Brightness through CSS.** The "lift the shadows" brightness used to be a Cesium post-process stage, which is one more full-screen WebGL pass each frame. Now it is `filter: brightness(1.08)` on the canvas, which the browser's compositor does for almost nothing.
5. **Warm the picking shaders.** Cesium works out what you clicked by drawing the scene once in hidden colours. The first time, it compiles those shaders, which froze the first click. One throwaway pick at idle time, after the first tiles load, now pays that cost before you click.
6. **Close 3D in the background.** Destroying the viewer frees thousands of tile objects (about 0.3-0.5 s). The view now stops drawing straight away and destroys the viewer when the browser is next idle, after 2D has painted.

## How I verified

- `npx tsc --noEmit` clean. `npx vitest run`: 111 tests pass (one new).
- Production build, served with `vite preview`, driven by Playwright with the GPU on. Event Timing gives click durations, the Long Tasks API catches freezes, `requestAnimationFrame` gives frame times, and a CPU profile shows where time went. The scripts are in the session scratch folder and not committed yet.
- Simulated mid-range phone (4x slower processor): the slowest click stays at 72 ms. The phone's longest freeze while 3D first loads (about 0.9 s, Cesium starting up) is unchanged and is the next thing to fix.

## Not done here

- Cesium's 4 MB script still takes about 0.5 s on desktop (0.9 s on a slow phone) to start when you first open 3D. The next step is to load it in the background while 2D is showing.
- An automated speed check that fails a pull request when a click goes over 100 ms.

## Hands-on exercise

Open the app in 3D, press F12 and run `setInterval(() => console.log(window.__globe3d.frames), 1000)` in the console. Leave the map still and watch the count: it should grow by only a few a second. Now pick a bus and choose Follow, and watch it jump to about 30 a second. That is the camera moving, so every frame is needed. Run `clearInterval(<the number it printed>)` to stop.
