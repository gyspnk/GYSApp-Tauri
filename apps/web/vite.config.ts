import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error plain ESM helper shared with the unit tests
import { coreIntegrityFrom, corePathsFromSw } from "./scripts/sw-core.mjs";

const ALLOWED_PROXY_HOSTS = new Set([
  "tjc.org",
  "www.tjc.org",
  "tjcorguploads.s3.amazonaws.com",
]);

function buildTjcCandidates(targetUrl: string): string[] | null {
  const parsed = new URL(targetUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_PROXY_HOSTS.has(hostname)) return null;
  const candidates = [targetUrl];
  if (
    hostname.includes("tjc.org") &&
    parsed.pathname.includes("wp-content/uploads/")
  ) {
    const stripped = parsed.pathname.replace(/^\/id/, "");
    candidates.push(
      `https://tjcorguploads.s3.amazonaws.com/tjcorg${stripped}`,
      `https://tjcorguploads.s3.amazonaws.com${stripped}`,
    );
  } else if (hostname === "tjcorguploads.s3.amazonaws.com") {
    candidates.push(
      `https://tjc.org/id${parsed.pathname.replace(/^\/tjcorg/, "")}`,
    );
  }
  return candidates;
}

function offlineBuildAssetsPlugin(): Plugin {
  let buildId = "";
  return {
    name: "offline-build-assets",
    apply: "build",
    async generateBundle(_options, bundle) {
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
      const corePaths = corePathsFromSw(
        await readFile(resolve("public/sw.js"), "utf8"),
      );
      manifest.coreIntegrity = await coreIntegrityFrom({
        packItems: pack.items
          .filter((item: { path: string }) => !item.path.endsWith(".db"))
          .map((item: { path: string; sha256: string }) => ({
            path: item.path,
            sha256: Buffer.from(item.sha256, "hex").toString("base64"),
          })),
        corePaths,
        digestFile: async (path: string) => {
          const bytes = await readFile(resolve(directory, path));
          const payload = path.endsWith(".gz") ? gunzipSync(bytes) : bytes;
          return createHash("sha256").update(payload).digest("base64");
        },
      });
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
        const isImage = req.url?.startsWith("/api/v1/content/image");
        const isPdf = req.url?.startsWith("/api/v1/content/pdf?");
        if (!isImage && !isPdf) return next();

        const targetUrl = new URL(req.url!, "http://localhost:5173").searchParams.get("url");
        if (!targetUrl) {
          res.statusCode = 400;
          return res.end("Missing url");
        }
        try {
          const candidates = buildTjcCandidates(targetUrl);
          if (!candidates) {
            res.statusCode = 403;
            return res.end("Forbidden");
          }
          const signal = isImage ? AbortSignal.timeout(3_000) : undefined;
          const range = isPdf ? req.headers.range : undefined;
          for (const candidate of candidates) {
            try {
              const upstream = await fetch(candidate, {
                ...(signal ? { signal } : {}),
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  Accept: isImage
                    ? "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    : "application/pdf,*/*",
                  Referer: "https://tjc.org/",
                  ...(range ? { Range: range } : {}),
                },
              });
              if (upstream.ok || (isPdf && upstream.status === 206)) {
                res.statusCode = upstream.status;
                res.setHeader(
                  "Content-Type",
                  upstream.headers.get("content-type") ||
                    (isImage ? "image/jpeg" : "application/pdf"),
                );
                res.setHeader(
                  "Cache-Control",
                  isImage ? "public, max-age=604800" : "public, max-age=86400",
                );
                res.setHeader("Access-Control-Allow-Origin", "*");
                if (isPdf) {
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
                }
                const arrayBuffer = await upstream.arrayBuffer();
                return res.end(Buffer.from(arrayBuffer));
              }
            } catch {
              // try next mirror
            }
          }
          res.statusCode = 404;
          return res.end(isImage ? "Not found" : "Upstream error");
        } catch {
          res.statusCode = 500;
          return res.end("Proxy error");
        }
      });
    },
  };
}

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
    watch: {
      ignored: ["**/*.tmpdir/**"],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    manifest: true,
    modulePreload: false,
    sourcemap: process.env.VITE_SOURCE_MAPS === "true",
    reportCompressedSize: Boolean(process.env.CI),
  },
});
