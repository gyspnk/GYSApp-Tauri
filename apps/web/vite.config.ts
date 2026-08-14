import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/GYSApp-Tauri/" : "/",
  plugins: [react()],
  build: {
    target: "es2022",
    // Source maps are useful for local diagnostics, but shipping them to
    // Pages adds several megabytes to the deploy without improving runtime.
    sourcemap: process.env.VITE_SOURCE_MAPS === "true",
    reportCompressedSize: true,
  },
});
