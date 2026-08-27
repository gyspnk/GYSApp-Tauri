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
  let refreshing = false;
  const reloadForUpdate = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
  const checkForSwUpdate = async (
    registration: ServiceWorkerRegistration | undefined,
  ) => {
    if (!registration || typeof registration.update !== "function") return;
    try {
      await registration.update();
    } catch {
      // update is best-effort
    }
  };
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        // GitHub Pages caches sw.js with a long max-age; bypassing the HTTP
        // cache for update checks keeps deploys from lagging behind.
        updateViaCache: "none",
      })
      .then(async (registration) => {
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

        // Auto-activate waiting worker and reload so users see new parsing
        // / styling without hard refresh or "hapus data site"
        const promptUpdate = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        };
        if (registration.waiting) promptUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          promptUpdate(worker);
        });

        // Periodic + visibility-based update check (every 10m / on focus)
        const scheduleUpdateCheck = () => void checkForSwUpdate(registration);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") scheduleUpdateCheck();
        });
        window.addEventListener("focus", scheduleUpdateCheck);
        window.setInterval(scheduleUpdateCheck, 10 * 60 * 1000);
      })
      .catch((error: unknown) => {
        recordDiagnostic("warn", "service-worker.register", error);
        console.warn("GYS service worker registration unavailable", error);
      });
  });
  // Fallback: if a new SW was already waiting before this script ran (e.g. after hard reload)
  void navigator.serviceWorker.ready.then((reg) => {
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
  });
}
