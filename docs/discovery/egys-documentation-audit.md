# eGYS documentation audit

**Checked:** 2026-08-17
**Source checkout:** `D:/GitHub Repo/gysapp-tauri/.tmp-egys-cdfc3d1`
**Source commit:** `a7a25e8c752b5d5cdc566beb44c60f51075f7267`

## Executive finding

The repository is **eGYS v2**, not the currently live login implementation. Its README says v2 is still in development, while v1 remains the live system and is reference-only (`.tmp-egys-cdfc3d1/README.md:1-5`). The public GitHub page was not anonymously readable from this environment, but the workspace contains a synchronized checkout from `Gereja-Yesus-Sejati/egys`.

This explains the login mismatch: `https://e.gys.or.id/login` exposes the v1 web flow, while the repository documents and implements the v2 API contract. The two contracts must not be mixed.

## Authentication contract documented by eGYS v2

- There is no password flow. Google SSO, Apple SSO, and WhatsApp are the supported routes (`docs/features/authentication.md:1-5`).
- A verified provider identity is matched to a provisioned account. An unknown identity returns `403 not_registered`; eGYS does not self-register (`docs/features/authentication.md:45-54`).
- Google and Apple receive an ID token at the backend routes `/api/v1/auth/google` and `/api/v1/auth/apple`. The frontend source calls the provider-relative routes `/auth/{provider}` through its API base (`frontend/src/api/auth.ts:130-150`; `backend/src/main/java/id/gys/egys/auth/web/AuthController.java:120-158`).
- Successful sign-in sets a server-side HttpOnly session cookie. The frontend treats `/auth/me` as the source of truth rather than storing a token in JavaScript (`docs/features/authentication.md:78-84`; `frontend/src/api/auth.ts:110-140`).
- The session is intended to expire after 30 days and be revocable; the cookie is HttpOnly, SameSite=Lax, and Secure outside local development (`docs/features/authentication.md:78-84`; `backend/src/main/java/id/gys/egys/auth/web/AuthController.java:326-348`).

## WhatsApp difference

The v2 flow is message-based: the user sends a prefilled message to the church number, and the browser polls while waiting. No OTP is typed (`docs/features/authentication.md:88-98`). The reference in the WhatsApp message and the browser-only poll token are deliberately separate (`docs/features/authentication.md:100-111`).

The v2 API exposes:

- `POST /api/v1/auth/whatsapp/start`
- `GET /api/v1/auth/whatsapp/state?token=...`
- `POST /api/v1/webhooks/whatsapp` for Meta Cloud API
- `POST /api/v1/webhooks/whatsapp/bot` for the existing bot

These routes and their public/session classification are present in the generated contract (`apps/bff/src/egys-contract.ts:4-9`, `63-103`, `238-255`). The backend also confirms that the session cookie is issued when the poll reaches READY (`AuthController.java:161-209`).

Therefore the live v1 endpoints such as `/login/whatsapp-login-request`, OTP confirmation, and the v1 WebSocket should not be copied into the v2 adapter. They represent a different contract and security model.

## Provider configuration gates

- Google production must override `GOOGLE_CLIENT_ID`; the committed value is explicitly a development fallback (`backend/src/main/resources/application.yml:66-76`).
- Apple is intentionally disabled until `APPLE_CLIENT_ID` is supplied; the Apple document marks the code as written and tested but switched off pending credentials (`docs/features/apple-sign-in.md:1-5`, `24-26`, `72-78`).
- WhatsApp requires the church number and webhook/bot secrets. An unset delivery secret is designed to reject deliveries (`backend/src/main/resources/application.yml:84-102`; `docs/features/authentication.md:121-139`).

## Consequence for GYSApp-Tauri

The v2 contract above is retained only as pinned discovery evidence. Runtime
authentication deliberately does not expose its provider, exchange, or
WhatsApp polling routes. Tauri uses the isolated live-v1 WebView/keyring bridge;
web/PWA opens the official v1 login page without receiving a token. A future v2
migration requires a new explicit decision and production-service verification.
