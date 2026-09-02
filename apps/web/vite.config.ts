import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

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

            for (const cand of candidates) {
              try {
                const upstream = await fetch(cand, {
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
        if (req.url && req.url.startsWith("/api/v1/content/pdf")) {
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
            const upstream = await fetch(targetUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/pdf,*/*",
                Referer: "https://tjc.org/",
              },
            });
            if (upstream.ok) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader("Cache-Control", "public, max-age=86400");
              res.setHeader("Access-Control-Allow-Origin", "*");
              const arrayBuffer = await upstream.arrayBuffer();
              return res.end(Buffer.from(arrayBuffer));
            }
            res.statusCode = upstream.status || 502;
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
  plugins: [react(), devImageProxyPlugin()],
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
    // Source maps are useful for local diagnostics, but shipping them to
    // Pages adds several megabytes to the deploy without improving runtime.
    sourcemap: process.env.VITE_SOURCE_MAPS === "true",
    reportCompressedSize: true,
  },
});
