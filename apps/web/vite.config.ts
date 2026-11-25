/// <reference types="vitest/config" />
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const TYPES: Record<string, string> = {
  ".pmtiles": "application/octet-stream",
  ".pbf": "application/x-protobuf",
  ".json": "application/json",
  ".png": "image/png",
};

/**
 * Serves the local basemap folder (halifax.pmtiles, fonts, sprites) at /tiles, with HTTP range requests,
 * which PMTiles needs. The folder lives outside the repository (C:\halifax-twin-data\tiles by default).
 */
function localTiles(dir: string): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);
    if (!url.startsWith("/tiles/")) return next();
    const file = normalize(join(dir, url.slice("/tiles/".length)));
    if (!file.startsWith(normalize(dir) + sep)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    let st;
    try {
      st = statSync(file);
    } catch {
      res.statusCode = 404;
      res.end();
      return;
    }
    if (!st.isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const size = st.size;
    const ext = extname(file);
    const etag = `W/"${st.size}-${Math.trunc(st.mtimeMs)}"`;
    const lastMod = st.mtime.toUTCString();
    const cacheControl =
      ext === ".pmtiles"
        ? "public, max-age=86400, stale-while-revalidate=604800"
        : url.startsWith("/tiles/fonts/") || url.startsWith("/tiles/sprites/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600";
    res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastMod);
    res.setHeader("Cache-Control", cacheControl);
    const rangeHeader = req.headers.range;
    if (!rangeHeader) {
      if (req.headers["if-none-match"] === etag) {
        res.statusCode = 304;
        res.end();
        return;
      }
      res.setHeader("Content-Length", String(size));
      createReadStream(file).pipe(res);
      return;
    }
    const ifRange = req.headers["if-range"];
    const rangeValid = !ifRange || ifRange === etag || ifRange === lastMod;
    const range = rangeValid ? /bytes=(\d+)-(\d*)/.exec(rangeHeader) : null;
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || end < start) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${size}`);
        res.end();
        return;
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(size));
    createReadStream(file).pipe(res);
  };
  return {
    name: "halifax-local-tiles",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tilesDir = env.HALIFAX_TWIN_TILES_DIR || "C:\\halifax-twin-data\\tiles";
  return {
    plugins: [react(), localTiles(tilesDir)],
    server: {
      host: env.VITE_HOST || "0.0.0.0",
      port: Number(env.VITE_PORT || 5173),
      strictPort: true,
      allowedHosts: ["scalable-brain.tailfc1c43.ts.net", "scalable-brain", ".ts.net"],
      // Optional: reach the API through this server (VITE_API_PROXY=1), for a second dev server on another port
      // that the API's CORS list does not name. Requests stay on this computer.
      proxy:
        env.VITE_API_PROXY === "1"
          ? {
              "/v1": {
                target: env.VITE_API_TARGET || "http://127.0.0.1:8010",
                configure: (proxy) =>
                  proxy.on("proxyReq", (req) => {
                    req.removeHeader("origin");
                    req.removeHeader("x-forwarded-for");
                  }),
              },
            }
          : undefined,
    },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            maplibre: ["maplibre-gl", "pmtiles", "@protomaps/basemaps"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  };
});
