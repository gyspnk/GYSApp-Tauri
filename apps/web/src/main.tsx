import App from "./App.js";
import { installImmersiveInteractions } from "./immersive-interactions.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauriShell } from "./native-platform.js";
import { installGlobalDiagnostics, recordDiagnostic } from "./diagnostics.js";
import { loadLocaleMessages } from "./i18n.js";
import { getShellSettingsStorage, readShellSettings } from "./settings.js";
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
import "./calm-liturgical.css";
import "./persistent-media.css";
import "./app-design.css";
import "./kidung-responsive.css";
import "./menu-motion.css";
import "./midi-player.css";

runStorageMigrations();
initializeUiPreferences();
document.documentElement.classList.toggle(
  "has-view-transitions",
  typeof document.startViewTransition === "function",
);
installImmersiveInteractions();
void import("./control-motion.js").then(({ installControlMotion }) => {
  const dispose = installControlMotion();
  import.meta.hot?.dispose(dispose);
});
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

/** The shell must never appear mid-swap: keep the boot splash until the two
 * reading faces are resolved, then reveal the already-painted app. */
const BOOT_FONT_TIMEOUT_MS = 1200;
const CRITICAL_FONT_FACES = [
  '400 1em "GYS Reading Sans"',
  '400 1em "Source Serif 4"',
];

function releaseBootSplash() {
  const root = document.documentElement;
  if (root.dataset.boot === "ready") return;
  root.dataset.boot = "ready";
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.setAttribute("aria-hidden", "true");
  window.setTimeout(() => splash.remove(), 260);
}

async function waitForBootFonts(): Promise<void> {
  if (typeof document.fonts === "undefined") return;
  const fontsLoaded = Promise.all(
    CRITICAL_FONT_FACES.map((font) => document.fonts.load(font)),
  )
    .then(() => document.fonts.ready)
    .catch(() => undefined);
  await Promise.race([
    fontsLoaded,
    new Promise((resolve) => window.setTimeout(resolve, BOOT_FONT_TIMEOUT_MS)),
  ]);
}

async function boot(): Promise<void> {
  // A stored English or Chinese locale loads its table before the shell renders;
  // the default Indonesian table is already in the initial chunk.
  const storage = getShellSettingsStorage();
  const locale = storage ? readShellSettings(storage).locale : "id";
  await loadLocaleMessages(locale).catch(() => undefined);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  void waitForBootFonts().then(() => {
    // One frame resolves the fonts, the second settles layout before revealing.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        releaseBootSplash();
        performance.mark("gys-shell-visible");
      }),
    );
  });
}
void boot();
installRouteSectionDeepLinks();

if (import.meta.env.PROD && !isTauriShell() && "serviceWorker" in navigator) {
  void import("./service-worker-updates.js").then(
    ({ installServiceWorkerUpdates }) => {
      const dispose = installServiceWorkerUpdates();
      import.meta.hot?.dispose(dispose);
    },
  );
}
