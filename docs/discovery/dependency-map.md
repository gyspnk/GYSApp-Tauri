# Dependency map

Reviewed 2026-10-07; `package.json` and `pnpm-lock.yaml` are authoritative.

| Layer         | Current tools                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Workspace     | Node ≥24, pnpm 11.21.0, TypeScript 7.0.2, Prettier.                                             |
| Web           | React 19.2.8, Vite 8.2.1, React Router 7.18.2.                                                  |
| JSON queries  | TanStack Query 5.101.4 for applicable BFF/JSON boundaries; not a second binary/PCM cache.       |
| Native        | Tauri 2.11 API/CLI boundary with constrained plugins and Rust commands.                         |
| BFF/contracts | Hono Worker and Zod 4; shared generated exports must be built before Wrangler.                  |
| Documents     | PDF.js 6.2.108, locally bundled worker; SQL.js 1.14.2 for installed Bible database access.      |
| Audio         | Vendored js-synthesizer and FluidSynth 2.4.6 worker/glue, packaged TimGM; optional GeneralUser. |
| QA            | Vitest 4.1.10, Playwright 1.62.1, Axe, Node script/policy tests and Rust gates.                 |

Application fonts, PDF worker and synthesis runtime do not require runtime CDN
imports. Requested Google/Apple authentication uses the official provider SDKs;
this is distinct from bundling the application UI/audio engine. Raw content may
come from validated TJC/immutable GitHub sources through controlled proxies.

Lazy boundaries include PDF.js, SQL/WASM, Bible search, synthesis, route modules
and optional menus. Initial JS is budgeted separately from installed assets.
See [cache/preload](../cache-and-preload.md).
