import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { installGlobalDiagnostics, recordDiagnostic } from "./diagnostics.js";
import { runStorageMigrations } from "./storage.js";
import "./styles.css";

runStorageMigrations();
installGlobalDiagnostics();

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    const reloaded = window.sessionStorage.getItem("gys_chunk_reload");
    if (!reloaded) {
      window.sessionStorage.setItem("gys_chunk_reload", "1");
      const cachesObj = (window as unknown as { caches?: CacheStorage }).caches;
      if (cachesObj) {
        void cachesObj
          .keys()
          .then((keys) => Promise.all(keys.map((k) => cachesObj.delete(k))))
          .then(() => {
            window.location.reload();
          });
      } else {
        window.location.reload();
      }
    }
  });
}

const routeParams = new URLSearchParams(window.location.search);
const restoredPath = routeParams.get("p");
if (restoredPath) {
  const restoredQuery = routeParams.get("q");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = restoredPath.startsWith("/") ? restoredPath : `/${restoredPath}`;
  window.history.replaceState(
    null,
    "",
    `${base}${path}${restoredQuery ? `?${restoredQuery}` : ""}${window.location.hash}`,
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(async (registration) => {
        // Some embedded/webview implementations expose `register()` but
        // return a reduced registration object without the optional update
        // method.  A missing method must not become an uncaught production
        // error that masks the otherwise usable application shell.
        if (typeof registration?.update === "function")
          await registration.update();
        const connection = (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection;
        if (connection?.saveData || connection?.effectiveType === "2g") return;
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "gys-cache-optional" });
      })
      .catch((error: unknown) => {
        // Offline/PWA support is progressive enhancement.  Registration
        // failure should be observable, but never block or crash the shell.
        recordDiagnostic("warn", "service-worker.register", error);
        console.warn("GYS service worker registration unavailable", error);
      });
  });
}
