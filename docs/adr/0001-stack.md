# ADR 0001 — Locked stack

Status: accepted

Use a pnpm TypeScript monorepo with React/Vite web, Hono Worker BFF, and Tauri
native shell. Version pins are recorded in package manifests. The boundary lets
domain contracts and adapters share tests while keeping platform APIs out of
feature logic.
