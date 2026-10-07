# ADR 0001 — Locked stack

Status: accepted

Use a pnpm TypeScript monorepo with React/Vite web, Hono Worker BFF, and Tauri
native shell. Version pins are recorded in package manifests. The boundary lets
domain contracts and adapters share tests while keeping platform APIs out of
feature logic.

## Implementation review — 2026-10-07

Node ≥24, pnpm 11.21.0 and TypeScript 7.0.2 are the workspace baseline.
React 19.2.8/Vite 8.2.1/Router 7.18.2 and PDF.js 6.2.108 remain pinned;
requested provider SDKs are distinct from locally bundled fonts/PDF/audio.
[Dependency map](../discovery/dependency-map.md) owns current version details.
No stack replacement is part of this UI/loading delivery.
