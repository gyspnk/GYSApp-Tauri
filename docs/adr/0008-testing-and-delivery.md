# ADR 0008 — Testing and delivery

Status: accepted

Every package exposes explicit format/lint/typecheck/test/build scripts. CI
fails when no selected package is built. Preview/Beta/GA delivery targets
GitHub Pages and Cloudflare Worker; signing and store credentials are protected
secrets. Coverage targets domain/contracts ≥90% branch and feature logic ≥75%.
