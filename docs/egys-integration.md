# e-GYS account integration

GYSApp uses one production policy: installed Tauri builds integrate with the
live e-GYS v1 service; web/PWA builds only open the official
[`https://e.gys.or.id/login`](https://e.gys.or.id/login) page. The e-GYS v2
repository and generated contract are discovery evidence only. No v2 provider
SDK, polling flow, or exchange route is shipped at runtime.

## Native v1 flow

1. Tauri opens the official login page in an origin-allowlisted WebView.
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

The account screen contains one action: **Buka login e-GYS resmi**. It opens the
official v1 page in a new browser tab and explains that profile synchronization
is available only in the installed application. The web build does not call
`/auth/providers`, `/auth/exchange/*`, or the WhatsApp start/state routes.

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
