import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
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
