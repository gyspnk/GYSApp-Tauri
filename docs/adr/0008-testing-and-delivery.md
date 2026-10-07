# ADR 0008 — Testing and delivery

Status: accepted

Every package exposes explicit format/lint/typecheck/test/build scripts. CI
fails when no selected package is built. Preview/Beta/GA delivery targets
GitHub Pages and Cloudflare Worker; signing and store credentials are protected
secrets. Coverage targets domain/contracts ≥90% branch and feature logic ≥75%.

## Implementation review — 2026-10-07

Pre-commit reads the index and checks formatting/relevant docs/provenance;
pre-push runs deterministic format/docs/provenance/type/unit gates without
private-upstream synchronization. `verify:release` retains the full explicit
source/native/browser plan. CI reuses one verified build; affected tests can
run against a prebuilt production preview with bounded workers. Never rebuild
under active browser tests. Main pushes trigger separate CI/Pages and applicable
Worker workflows; remote SHA equality is not a deployment receipt. See
[testing](../testing-and-maintenance.md) and [operations](../operations.md).
