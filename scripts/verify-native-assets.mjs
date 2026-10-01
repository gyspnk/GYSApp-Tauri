import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/web/dist");
const tauriConfigPath = resolve(root, "apps/native/src-tauri/tauri.conf.json");

const required = [
  "offline/asset-manifest.json",
  "offline/pack-manifest.json",
  "offline/faith.json",
  "offline/sauh.json",
  "offline/suara-sejati.json",
  "offline/literature.json",
  "offline/hymn-catalog.json",
  "offline/hymn-metadata.json",
  "offline/music-lock.json",
  "offline/fork-hymnal-manifest.json",
  "offline/bible/manifest.json",
  "offline/bible/tb-reader.json",
  "offline/bible/b_tb.db",
  "vendor/midi-render-worker.js",
  "vendor/js-synthesizer/js-synthesizer.min.js",
  "vendor/js-synthesizer/libfluidsynth-2.4.6.js",
  "assets/gys-logo.png",
  "assets/gys-mark.svg",
];

try {
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));
  if (config?.build?.frontendDist !== "../../web/dist") {
    throw new Error(
      `Tauri frontendDist must be ../../web/dist (found ${String(config?.build?.frontendDist)})`,
    );
  }
  const csp = String(config?.app?.security?.csp ?? "");
  const directives = new Map(
    csp.split(";").map((entry) => {
      const [name, ...sources] = entry.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  for (const [directive, origin] of [
    ["connect-src", "https://tjc.org"],
    ["connect-src", "https://*.tjc.org"],
    ["connect-src", "https://raw.githubusercontent.com"],
    ["img-src", "https://tjcorguploads.s3.amazonaws.com"],
    ["style-src", "https://fonts.googleapis.com"],
    ["font-src", "https://fonts.gstatic.com"],
  ]) {
    if (!directives.get(directive)?.includes(origin))
      throw new Error(`Tauri CSP ${directive} must allow ${origin}`);
  }
} catch (error) {
  throw new Error(`Unable to validate Tauri packaging boundary: ${error}`);
}

let totalBytes = 0;
for (const relative of required) {
  const path = resolve(dist, relative);
  let file;
  try {
    file = await stat(path);
  } catch {
    throw new Error(`Native bundle is missing required asset: ${relative}`);
  }
  if (!file.isFile() || file.size === 0)
    throw new Error(`Native bundle asset is empty or not a file: ${relative}`);
  totalBytes += file.size;
}

console.log(
  `Native asset boundary verified: ${required.length} files, ${totalBytes} bytes of offline/core runtime assets`,
);
