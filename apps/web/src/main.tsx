import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { isTauriShell } from "./native-platform.js";
import { installGlobalDiagnostics, recordDiagnostic } from "./diagnostics.js";
import { installRouteSectionDeepLinks } from "./route-section-deeplink.js";
import { runStorageMigrations } from "./storage.js";
import { initializeUiPreferences } from "./ui-preferences.js";
import { clearStaleShellCaches } from "./chunk-recovery.js";
import "./styles.css";
import "./ui-hardening.css";
import "./ui-preferences.css";
import "./kidung-ux.css";
import "./direct-manipulation.css";
import "./kidung-touch-targets.css";
import "./reading-surfaces.css";
import "./kidung-responsive.css";
import "./calm-liturgical.css";
import "./persistent-media.css";

runStorageMigrations();
initializeUiPreferences();
installGlobalDiagnostics();

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (!navigator.onLine) {
      event.preventDefault();
      return;
    }
    const reloaded = window.sessionStorage.getItem("gys_chunk_reload");
    if (!reloaded) {
      window.sessionStorage.setItem("gys_chunk_reload", "1");
      const cachesObj = (window as unknown as { caches?: CacheStorage }).caches;
      if (cachesObj) {
        void clearStaleShellCaches(cachesObj)
          .catch((error: unknown) => {
            recordDiagnostic("warn", "chunk-recovery.cache", error);
          })
          .finally(() => {
            window.location.reload();
          });
      } else {
        window.location.reload();
      }
    }
  });
}

const routeParams = new URLSearchParams(window.location.search);
const appBase = import.meta.env.BASE_URL.replace(/\/$/, "");
const restoredPath =
  routeParams.get("p") ??
  (window.location.pathname === `${appBase}/index.html` ? "/" : null);
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
installRouteSectionDeepLinks();

if (import.meta.env.PROD && !isTauriShell() && "serviceWorker" in navigator) {
  void import("./service-worker-updates.js").then(
    ({ installServiceWorkerUpdates }) => {
      const dispose = installServiceWorkerUpdates();
      import.meta.hot?.dispose(dispose);
    },
  );
}
