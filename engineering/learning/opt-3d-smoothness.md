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

## Part 2: no freeze when 3D opens

The freeze when 3D first opened turned out not to be Cesium's script starting up. It was the graphics driver compiling shaders, the small programs on the graphics card that draw each kind of thing (photo tiles, bus badges, route lines). Cesium compiles each shader the first time it draws with it, then asks straight away "did that work?". The page has to wait for the answer. On Windows, where Chrome draws through Direct3D, that came to 1.74 s across 21 shaders, in two chunks of about 0.6 s.

| Opening 3D from 2D (laptop) | Before | After |
| :---- | ----: | ----: |
| Time spent waiting for shaders | 1,744 ms | 27 ms |
| Longest freeze | 615 ms | 59 ms |
| Same, simulated slow phone | 941 ms | 281 ms |

1. **Compile in the background** (`src/map/asyncShaders.ts`). Browsers can compile shaders without making the page wait (the WebGL extension `KHR_parallel_shader_compile`), but Cesium does not use it. Our code wraps Cesium's draw call. The first time a normal frame is about to draw with a shader that is not ready, it compiles an identical copy in the background and skips that draw. Each later frame asks whether the copy is finished, and asking never waits. Once it is, Cesium compiles its own, and the browser serves it from its shader cache, which is keyed by the shader's source text, in a few milliseconds. Things appear a frame or two later, which you cannot see while tiles stream in anyway. Clicks (picking) and height sampling never skip, so they always give a real answer. Without the extension, Cesium works exactly as before.
2. **Warm-up passes that do not freeze either.** The throwaway pick from part 1, and a new throwaway height sample, now run in "warm-only" mode: their shaders compile in the background too, and their answers are thrown away. Buses and pins are placed on the ground once those shaders are ready.
3. **Place buses on the ground in slices.** Every height sample draws the scene once more out of sight, and up to 120 buses at once froze the page for 0.17 s. Bus and pin heights now work in slices of about 8 ms and carry on after the next frame.

What is left, and outside our code: Cesium spends about 0.3 s, spread over many frames, building and parsing the Google tile web addresses. On a slow phone, opening the site straight into 3D (a `?view=3d` link) still has a 0.96 s freeze while the page itself starts up. That has not been profiled yet.

## How I verified

- `npx tsc --noEmit` clean. `npx vitest run`: 117 tests pass (seven new, six for background compiling using a stand-in WebGL).
- Production build, served with `vite preview`, driven by Playwright with the GPU on. Event Timing gives click durations, the Long Tasks API catches freezes, `requestAnimationFrame` gives frame times, and a CPU profile shows where time went. The scripts are in the session scratch folder and not committed yet.
- Simulated mid-range phone (4x slower processor): the slowest click stays under 90 ms.
- Shader timing: a script wraps WebGL's `getProgramParameter` and times each wait for a link result while 3D opens.

## Not done here

- The 0.96 s freeze when a slow phone opens a `?view=3d` link directly.
- An automated speed check that fails a pull request when a click goes over 100 ms.

## Hands-on exercise

Open the app in 3D, press F12 and run `setInterval(() => console.log(window.__globe3d.frames), 1000)` in the console. Leave the map still and watch the count: it should grow by only a few a second. Now pick a bus and choose Follow, and watch it jump to about 30 a second. That is the camera moving, so every frame is needed. Run `clearInterval(<the number it printed>)` to stop.
