# Bus pins

The 3D bus pin, built from the architect's renders with free npm tools (gltf-transform and pngjs). No Blender.

## Build

```powershell
cd assets\pins
npm install
npm run build
```

`build-bus.mjs` writes two models to `apps/web/public/models/`. The outputs are committed, so the app runs without this step; rebuild after changing a render or the script.

| Level | File | Shown | Geometry | Size |
| :---- | :---- | :---- | :---- | :---- |
| Near | `bus-near.glb` | Street view (up to 250 to 600 m away, by device profile) | Textured body and four wheels, 202 triangles, 512 by 256 texture | 80 kB |
| Middle | `bus-mid.glb` | Neighbourhood view (up to 1.2 to 3 km) | Textured box, 10 triangles, 128 by 64 texture | 10 kB |
| Far | none | Beyond that | The 2D pin image as a billboard (drawn in `apps/web/src/map/pins.ts`) | – |

## How the texture is made

One atlas per model, resampled with a box filter:

- top half: `src/bus-side.png`, the side render (front of the bus to the right), mirrored for the other side;
- bottom left: the front face, cropped from the three-quarter render `src/bus-front.png` (x 335 to 460, y 50 to 235);
- bottom middle: the rear face, cropped from `src/bus-rear.png` (x 355 to 470, y 65 to 245);
- bottom right: roof grey.

The renders come from `origin/d08a-live-summary:demo/web/img/`.

## Conventions

Metres; origin on the ground at the centre of the bus; +X forward (the front), +Y up. The app loads the models with `forwardAxis: Axis.X`, so a heading of the bearing minus 90 degrees points the bus along its direction of travel. A 40-foot Halifax Transit bus is about 12.2 m long, 2.55 m wide and 3.2 m tall.

## Status

Status is not part of the model. A badge floats above each bus with the status shape (disc on time, diamond late, ring early, square no arrival yet) and the route number, drawn by the same code as the 2D pins, so 2D and 3D read the same way.

## Limits

The front and rear faces are cropped from three-quarter renders, so they are slightly skewed. A Blender model with real front and rear views would improve the near level; the pipeline would stay the same (export GLB, keep it under 100 kB).
