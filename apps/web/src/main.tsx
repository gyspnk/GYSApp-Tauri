import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { installGlobalDiagnostics } from "./diagnostics.js";
import { runStorageMigrations } from "./storage.js";
import "./styles.css";

runStorageMigrations();
installGlobalDiagnostics();

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
        await registration.update();
        const connection = (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection;
        if (connection?.saveData || connection?.effectiveType === "2g") return;
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "gys-cache-optional" });
      });
  });
}
