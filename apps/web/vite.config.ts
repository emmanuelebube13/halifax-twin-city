/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from "node:fs";
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
    if (!file.startsWith(normalize(dir) + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const size = statSync(file).size;
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache");
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
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
      host: "127.0.0.1",
      port: Number(env.VITE_PORT || 5173),
      strictPort: true,
      // Optional: reach the API through this server (VITE_API_PROXY=1), for a second dev server on another port
      // that the API's CORS list does not name. Requests stay on this computer.
      proxy:
        env.VITE_API_PROXY === "1"
          ? {
              "/v1": {
                target: env.VITE_API_TARGET || "http://127.0.0.1:8010",
                configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
              },
            }
          : undefined,
    },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 1500,
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  };
});
