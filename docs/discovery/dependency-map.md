# Dependency map

| Layer     | Locked tools                                                           |
| --------- | ---------------------------------------------------------------------- |
| Workspace | pnpm 11, TypeScript 7 strict                                           |
| Web       | React 19.2, Vite 8, React Router 7, TanStack Query 5 for JSON BFF only |
| Native    | Tauri 2.11                                                             |
| BFF       | Hono Worker, Zod 4                                                     |
| Media     | PDF.js 6, js-synthesizer/FluidSynth local                              |
| QA        | Vitest 4, Playwright 1.62                                              |

Runtime CDN dependencies are prohibited. Worker/WASM and fonts/assets are
vendored or served from the controlled deployment.
