import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function offlineBuildAssetsPlugin(): Plugin {
  let buildId = "";
  return {
    name: "offline-build-assets",
    apply: "build",
    async generateBundle(_options, bundle) {
      // Fetch code into CacheStorage without importing or executing lazy views.
      // Public music binaries remain verified, explicit asset downloads.
      const assets = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((file) => /^assets\/.*\.(?:js|mjs|css|wasm|woff2)$/.test(file))
        .sort();
      buildId = createHash("sha256")
        .update(assets.join("\n"))
        .update(await readFile(resolve("public/sw.js")))
        .update(await readFile(resolve("public/offline/pack-manifest.json")))
        .digest("hex")
        .slice(0, 16);
      const integrity = Object.fromEntries(
        assets.map((path) => {
          const entry = bundle[path]!;
          const bytes = entry.type === "chunk" ? entry.code : entry.source;
          return [
            path,
            `sha256-${createHash("sha256").update(bytes).digest("base64")}`,
          ];
        }),
      );
      this.emitFile({
        type: "asset",
        fileName: "offline-shell-assets.json",
        source: JSON.stringify({ version: 1, buildId, assets, integrity }),
      });
    },
    async writeBundle(options) {
      // Vite can still rewrite chunks after generateBundle. Hash the exact
      // emitted bytes consumed by the service worker, not intermediate code.
      const directory = options.dir ?? "dist";
      const manifestPath = resolve(directory, "offline-shell-assets.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.integrity = Object.fromEntries(
        await Promise.all(
          manifest.assets.map(async (asset: string) => [
            asset,
            `sha256-${createHash("sha256")
              .update(await readFile(resolve(directory, asset)))
              .digest("base64")}`,
          ]),
        ),
      );
      buildId = createHash("sha256")
        .update(buildId)
        .update(JSON.stringify(manifest.integrity))
        .update(await readFile(resolve(directory, "startup.js")))
        .digest("hex")
        .slice(0, 16);
      manifest.buildId = buildId;
      const packBytes = await readFile(
        resolve("public/offline/pack-manifest.json"),
      );
      const pack = JSON.parse(packBytes.toString("utf8"));
      manifest.coreIntegrity = Object.fromEntries(
        pack.items
          .filter((item: { path: string }) => !item.path.endsWith(".db"))
          .map((item: { path: string; sha256: string }) => [
            item.path,
            `sha256-${Buffer.from(item.sha256, "hex").toString("base64")}`,
          ]),
      );
      manifest.coreIntegrity["offline/pack-manifest.json"] =
        `sha256-${createHash("sha256").update(packBytes).digest("base64")}`;
      manifest.coreIntegrity["startup.js"] = `sha256-${createHash("sha256")
        .update(await readFile(resolve(directory, "startup.js")))
        .digest("base64")}`;
      await writeFile(manifestPath, JSON.stringify(manifest));
      const indexPath = resolve(directory, "index.html");
      await writeFile(
        indexPath,
        (await readFile(indexPath, "utf8")).replace(
          "</head>",
          `<meta name="gys-build-id" content="${buildId}" /></head>`,
        ),
      );
      const path = resolve(options.dir ?? "dist", "sw.js");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          'const CACHE = "gysapp-shell-v25";',
          `const CACHE = "gysapp-shell-v25-${buildId}";`,
        ),
      );
    },
  };
}

function devImageProxyPlugin(): Plugin {
  return {
    name: "dev-image-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/v1/content/image")) {
          const parsed = new URL(req.url, "http://localhost:5173");
          const targetUrl = parsed.searchParams.get("url");
          if (!targetUrl) {
            res.statusCode = 400;
            return res.end("Missing url");
          }
          try {
            const parsedTarget = new URL(targetUrl);
            const hostname = parsedTarget.hostname.toLowerCase();
            if (
              ![
                "tjc.org",
                "www.tjc.org",
                "tjcorguploads.s3.amazonaws.com",
              ].includes(hostname)
            ) {
              res.statusCode = 403;
              return res.end("Forbidden");
            }
            const candidates = [targetUrl];
            if (
              hostname.includes("tjc.org") &&
              parsedTarget.pathname.includes("wp-content/uploads/")
            ) {
              candidates.push(
                `https://tjcorguploads.s3.amazonaws.com/tjcorg${parsedTarget.pathname.replace(/^\/id/, "")}`,
              );
              candidates.push(
                `https://tjcorguploads.s3.amazonaws.com${parsedTarget.pathname.replace(/^\/id/, "")}`,
              );
            } else if (hostname.includes("amazonaws.com")) {
              candidates.push(
                `https://tjc.org/id${parsedTarget.pathname.replace(/^\/tjcorg/, "")}`,
              );
            }

            // A dead publisher must not occupy the browser's local-origin
            // connections and delay lazy route modules during development.
            const imageRequestSignal = AbortSignal.timeout(3_000);
            for (const cand of candidates) {
              try {
                const upstream = await fetch(cand, {
                  signal: imageRequestSignal,
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Accept:
                      "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    Referer: "https://tjc.org/",
                  },
                });
                if (upstream.ok) {
                  res.statusCode = 200;
                  res.setHeader(
                    "Content-Type",
                    upstream.headers.get("content-type") || "image/jpeg",
                  );
                  res.setHeader("Cache-Control", "public, max-age=604800");
                  res.setHeader("Access-Control-Allow-Origin", "*");
                  const arrayBuffer = await upstream.arrayBuffer();
                  return res.end(Buffer.from(arrayBuffer));
                }
              } catch {
                // try next
              }
            }
            res.statusCode = 404;
            return res.end("Not found");
          } catch {
            res.statusCode = 500;
            return res.end("Proxy error");
          }
        }
        if (req.url && req.url.startsWith("/api/v1/content/pdf?")) {
          const parsed = new URL(req.url, "http://localhost:5173");
          const targetUrl = parsed.searchParams.get("url");
          if (!targetUrl) {
            res.statusCode = 400;
            return res.end("Missing url");
          }
          try {
            const parsedTarget = new URL(targetUrl);
            const hostname = parsedTarget.hostname.toLowerCase();
            if (
              ![
                "tjc.org",
                "www.tjc.org",
                "tjcorguploads.s3.amazonaws.com",
              ].includes(hostname)
            ) {
              res.statusCode = 403;
              return res.end("Forbidden");
            }
            const candidates = [targetUrl];
            if (
              hostname.includes("tjc.org") &&
              parsedTarget.pathname.includes("wp-content/uploads/")
            ) {
              candidates.push(
                `https://tjcorguploads.s3.amazonaws.com/tjcorg${parsedTarget.pathname.replace(/^\/id/, "")}`,
                `https://tjcorguploads.s3.amazonaws.com${parsedTarget.pathname.replace(/^\/id/, "")}`,
              );
            } else if (hostname === "tjcorguploads.s3.amazonaws.com") {
              candidates.push(
                `https://tjc.org/id${parsedTarget.pathname.replace(/^\/tjcorg/, "")}`,
              );
            }

            for (const candidate of candidates) {
              try {
                const range = req.headers.range;
                const upstream = await fetch(candidate, {
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Accept: "application/pdf,*/*",
                    Referer: "https://tjc.org/",
                    ...(range ? { Range: range } : {}),
                  },
                });
                if (upstream.ok || upstream.status === 206) {
                  res.statusCode = upstream.status;
                  res.setHeader(
                    "Content-Type",
                    upstream.headers.get("content-type") || "application/pdf",
                  );
                  res.setHeader("Cache-Control", "public, max-age=86400");
                  res.setHeader("Access-Control-Allow-Origin", "*");
                  res.setHeader(
                    "Access-Control-Expose-Headers",
                    "Accept-Ranges, Content-Length, Content-Range",
                  );
                  for (const header of [
                    "accept-ranges",
                    "content-length",
                    "content-range",
                    "etag",
                    "last-modified",
                  ]) {
                    const value = upstream.headers.get(header);
                    if (value) res.setHeader(header, value);
                  }
                  const arrayBuffer = await upstream.arrayBuffer();
                  return res.end(Buffer.from(arrayBuffer));
                }
              } catch {
                // try the publisher's mirrored host
              }
            }
            res.statusCode = 404;
            return res.end("Upstream error");
          } catch {
            res.statusCode = 500;
            return res.end("Proxy error");
          }
        }
        next();
      });
    },
  };
}

// GitHub Pages serves the app below `/GYSApp-Tauri/`, while a Tauri bundle
// serves the same dist directory from its WebView root. Tauri exposes the
// target to hook commands through `TAURI_ENV_PLATFORM`; using that signal
// avoids shipping Pages-prefixed asset URLs inside the native executable.
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  base:
    process.env.NODE_ENV === "production" && !isTauriBuild
      ? "/GYSApp-Tauri/"
      : "/",
  plugins: [react(), devImageProxyPlugin(), offlineBuildAssetsPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    manifest: true,
    // The shell Service Worker owns the same module requests. Vite's
    // modulepreload links then trigger Chromium cross-world mismatch warnings
    // without improving the offline cache path.
    modulePreload: false,
    // Source maps are useful for local diagnostics, but shipping them to
    // Pages adds several megabytes to the deploy without improving runtime.
    sourcemap: process.env.VITE_SOURCE_MAPS === "true",
    reportCompressedSize: true,
  },
});
