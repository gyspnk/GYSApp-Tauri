import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/GYSApp-Tauri/" : "/",
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
});
