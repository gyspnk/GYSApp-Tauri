# e-GYS account integration

Installed Tauri builds integrate with the live e-GYS v1 service. Web/PWA
builds support Google through the BFF and expose explicit Apple/WhatsApp
handoff actions to the official [`https://e.gys.or.id/login`](https://e.gys.or.id/login)
page. The e-GYS v2 repository and generated contract are discovery evidence
only; no v2 provider exchange or polling flow is shipped at runtime.

## Native v1 flow

1. The account card exposes Google, WhatsApp and Apple in one row.
   All three open the existing origin-allowlisted official login WebView; users
   select their provider there.
2. The bridge accepts only `googlelogged`, `applelogged`, or `whatsapplogged`
   messages from `e.gys.or.id` with a valid opaque token.
3. Tauri stores that token in the OS keyring. It is never placed in
   `localStorage`, a URL, a log, or a main-window event payload.
4. `GET /api/v1/account/profile` forwards the keyring-backed bearer token to
   live `GET /api/v1/users/profile` and normalizes the legacy response.
5. Logout clears the native secret and the normalized session state.

The WebView rejects any other origin, command, or malformed token and closes
after a successful login. A real-account Tauri smoke test remains a release
gate because it cannot be made truthful with a browser mock.

## Web/PWA flow

The account screen and login dialog both expose **WhatsApp** and **Apple**
actions. They open the complete official v1 login page in a new browser tab,
independently of Google SDK availability. Users choose the provider on that
page. These cross-site sessions synchronize with GYSApp only in the installed
application. Opening the portal does not sign the browser application in.

The local Google action is always visible, including offline, and opens the
Google dialog without loading an SDK on the account screen. Google sign-in
remains available in the dialog through Google Identity Services and
`POST /api/v1/auth/egys/google`. The BFF submits the credential to the existing
live v1 callback and stores the resulting session in an HttpOnly cookie.
The web build does not call `/auth/providers`, `/auth/exchange/*`, or the v2
WhatsApp start/state routes. Do not restore the old v2 endpoints against the
current live v1 host.

## Regression history

The old WhatsApp popup fixes (`30a8696`, `ded8214`) belonged to the v2 client.
Commit `50ab269` replaced the iframe with a Google-only browser dialog and left
Apple/WhatsApp as explanatory text. Explicit provider actions now preserve the
live v1 handoff, including when the Google script fails. Browser regression
tests cover 320px, 390px and desktop widths plus native command dispatch.

## Configuration

The BFF must receive the live origin as a protected secret:

```sh
wrangler secret put EGYS_API_BASE_URL --config apps/bff/wrangler.toml
```

Use `https://e.gys.or.id` without `/api/v1`. When the binding is absent or the
upstream response is invalid, the BFF returns a typed error and the native UI
remains safely signed out.

## Upstream audit

`scripts/sync-egys.mjs` maintains the pinned v2 discovery snapshot in
`apps/bff/src/egys-contract.ts` and `docs/discovery`. That snapshot is not a
runtime authentication contract. A future v2 migration requires a separate
review and explicit product decision; it must not silently re-enable the draft
browser flow.
