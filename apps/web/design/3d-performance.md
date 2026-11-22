# 3D performance

22 Nov 2026. Workstream E, card T27. Targets were written before any measurement; results are added below them.

## How it is measured

`scripts/perf-3d.mjs` opens the app in Chromium (Playwright, real GPU through ANGLE and Direct3D 11) with the 3D view and Google Photorealistic 3D Tiles, one page load per run, each counted against the ion budget. For each run it records:

- **First 3D frame:** from the 3D view starting to Cesium's `initialTilesLoaded` (the first complete view of the tiles), in seconds.
- **Panning:** frames rendered per second during 5 s of continuous mouse dragging (the app renders on demand, so this is the rate it can sustain).
- **Following:** frames per second during 5 s of following a bus (the follow clock asks for 30 frames a second, 20 on low, so 30 is the ceiling by design).
- **JS heap:** `performance.memory.usedJSHeapSize` at the end of the run.
- **Tiles loaded:** tiles Cesium loaded during the run.

Three conditions: the workstation as it is; the workstation with Chrome's CPU slowed four times (`Emulation.setCPUThrottlingRate`); and a phone viewport (390 by 844, pixel ratio 3, touch). Each profile is forced through the app's own 3D detail setting.

## Targets (set before measuring)

| Measure | High | Medium | Low |
| :---- | :---- | :---- | :---- |
| First 3D frame, workstation | 10 s or less | 8 s or less | 6 s or less |
| First 3D frame, CPU slowed 4 times | 20 s or less | 15 s or less | 12 s or less |
| First 3D frame, phone viewport | not a phone profile | not a phone profile | 8 s or less |
| Panning, workstation | 50 fps or more | 50 fps or more | 50 fps or more |
| Panning, CPU slowed 4 times | 20 fps or more | 25 fps or more | 30 fps or more |
| Panning, phone viewport | – | – | 30 fps or more |
| Following a bus | 25 fps or more | 25 fps or more | 18 fps or more |
| JS heap | 500 MB or less | 350 MB or less | 250 MB or less |
| Tiles loaded | more than medium | more than low | fewest |

Why these: the plan's speed rules say the first map shows in under 3 seconds and nothing waits on 3D (2D and the answer appear first; the realistic view sharpens behind them). 3D is an extra, so its first frame may take longer, but a user should never wait more than about 10 seconds on a good machine. 30 fps keeps panning smooth on a phone; 50 fps on a workstation.

## Results

Filled in by `scripts/perf-3d.mjs`; see the table below.

Measured 22 Nov 2026, about 11:50 Halifax time, on the build machine (NVIDIA GeForce RTX 5070 through ANGLE and Direct3D 11; Chromium from Playwright 1.65), against the live API (84 buses), story TRN-Q01, opening view over downtown Halifax. One run per cell, so treat single numbers as indicative.

| Profile | Condition | First 3D frame | Panning | Following | JS heap | Tiles loaded |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| High | Workstation | 6.4 s (met) | 51 fps (met) | 59 fps (met) | 433 MB (met) | 1,592 |
| Medium | Workstation | 2.4 s (met) | 50 fps (met) | 58 fps (met) | 272 MB (met) | 517 |
| Low | Workstation | 1.9 s (met) | 46 fps (not met, target 50) | 42 fps (met) | 177 MB (met) | 311 |
| High | CPU slowed 4 times | 14.3 s (met) | 15 fps (not met, target 20) | 12 fps (not met, target 25) | 424 MB (met) | 1,662 |
| Medium | CPU slowed 4 times | 6.8 s (met) | 27 fps (met) | 40 fps (met) | 256 MB (met) | 508 |
| Low | CPU slowed 4 times | 5.7 s (met) | 27 fps (not met, target 30) | 36 fps (met) | 170 MB (met) | 320 |
| Low | Phone viewport (390 by 844, 3x) | 2.2 s (met) | 45 fps (met) | 42 fps (met) | 162 MB (met) | 233 |

Tiles loaded fall from high to medium to low, as intended: low loads about a fifth of what high loads.

### Reading the results

- **The profiles do their job.** Medium and low reach a first 3D frame in about 2 s on the workstation, against 6.4 s on high, with a third to a fifth of the tiles and half the memory or less.
- **High is a workstation-only profile.** With the CPU slowed four times it drops to 15 fps while panning. The automatic choice gives high only to a discrete GPU with 8 or more cores and 8 GB or more, so a slower machine starts on medium or low.
- **Panning on low (46 fps on the workstation) is limited by the test, not the GPU.** The script drags the mouse 25 times a second and Cesium renders on demand, so all three profiles land near 50 fps. A user dragging faster gets more frames. With the CPU slowed four times, low and medium both reach 27 fps. The cost there is the CPU walking the tile tree, which the GPU cannot help with.
- **Following runs above its 30 fps clock** because the camera move itself asks Cesium for frames as well.
- **Not measured:** a real phone, and a real integrated GPU. The phone row is a phone-sized viewport on the workstation's GPU. A real mid-range phone will be slower. The low profile exists for that case.

### Ion use for these measurements

Seven page loads (one per row), counted in `.ion-tally.json`. A single load fetched about 740 Google tile requests on the high profile in the first 15 s (see `scripts/check-3d.mjs`).

### Re-check after design review round 2 (22 Nov 2026, about 13:00)

Round 2 changed what is drawn: one badge per bus at every distance, one count disc across layers, a steeper opening view (more of the city in frame), and the low profile's pixel cap raised from 1 to 1.5 for sharper phones. Three ion loads and two plain-globe runs (no ion):

| Profile | Condition | First 3D frame | Panning | Following | JS heap | Tiles loaded |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Medium | Workstation | 3.5 s and 4.0 s (met) | 37 and 38 fps (not met, target 50) | 42 fps (met) | 356 MB, then 208 MB (met on the second run) | 357 to 376 |
| Low | Phone viewport (390 by 844, 3x) | 1.6 s (met) | 30 fps (met) | 28 fps (met) | 311 MB (not met, target 250) | 139 |
| Medium | Workstation, plain globe (no tiles) | 0.3 s | 44 fps | 34 fps | 204 MB | 0 |
| Low | Workstation, plain globe (no tiles) | 0.3 s | 46 fps | 36 fps | 206 MB | 0 |

What this says:

- **The machine was busier.** The architect was using it at the time, with about 44 browser processes open. Even with no tiles at all, panning reached only 44 to 46 fps, against 50 to 51 with tiles in the first run. Treat the drop to about 38 fps as mostly the machine, partly the extra work per camera move (grouping every pin on screen into count discs).
- **The phone viewport pays for sharpness.** Raising low's pixel cap to 1.5 draws 2.25 times the pixels on a 3x phone. Panning stays at the 30 fps target, but memory rose. If real phones struggle, setting `maxPixelRatio` back to 1 in `src/lib/profile.ts` is the one-line trade: back to softer edges.
- **First frames stay fast** (1.6 to 4 s), well inside the targets.
