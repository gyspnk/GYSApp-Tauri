# e-GYS account integration

Installed Tauri builds integrate with the live e-GYS v1 service. Web/PWA
builds support Google, Apple and WhatsApp directly through the BFF. The e-GYS v2 repository and generated contract are discovery evidence
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

The account screen keeps all three provider buttons in one row. WhatsApp
starts an inline login request with `POST /api/v1/auth/egys/whatsapp/start`;
the BFF calls live v1 `/login/whatsapp-login-request` and binds the reference
to a ten-minute HttpOnly cookie. The user sends the prepared message through
WhatsApp; the official `wss://e.gys.or.id/wa-login/:ref` channel tracks the
message and supplies an internal confirmation code automatically. There is no
OTP input or manual confirmation in the application. The provider click reserves
a messaging tab synchronously to avoid popup blocking; it navigates directly to
the prepared WhatsApp send URL immediately after the start response, without waiting for a tracking readiness event or a second send button. Both camelCase and lowercase response fields are supported. The button shows a small trailing countdown, with a 120-second deadline covering setup and verification. Expiry aborts requests, closes tracking and removes the badge; a pending blank tab is closed. Clicking WhatsApp again replaces the attempt, resets the countdown and opens a new prepared message. Old socket events and profile results are ignored after cancellation. Because the service rejects
foreign browser origins, the Worker relays `/api/v1/auth/egys/whatsapp/track`
to the official WebSocket using its required origin. The relay requires an
allowed client origin and the HttpOnly reference cookie; clients cannot choose
an upstream URL or send arbitrary upstream messages. Confirmation calls `/login/whatsapp-login-confirm` through
the BFF. Canceling closes the socket and aborts outstanding requests.

Apple uses the official Apple SDK, existing service ID `id.or.gys.e.client`,
registered callback `https://e.gys.or.id/login`, popup authorization and a
random state validated before exchange. `POST /api/v1/auth/egys/apple` calls
live v1 `/auth/apple/callback` with `ismobile: 1`. Apple may require its own
provider authorization window; GYSApp does not embed or open the e-GYS portal.
Deployment origin compatibility still requires a real Apple account smoke test.

Both callbacks store the upstream token in the same HttpOnly cookie as Google,
return only `{ ok: true }`, then refresh `/api/v1/account/profile` so the header
and account panel detect the member. Tokens are never stored in browser storage.
Google retains its working Google Identity Services flow and BFF callback.
The web build does not call draft v2 `/auth/providers`, `/auth/exchange/*`,
or `/api/v1/auth/whatsapp/start` routes.

## Regression history

The old WhatsApp popup fixes (`30a8696`, `ded8214`) used draft v2 endpoints.
Commit `50ab269` replaced the iframe with a Google-only browser dialog, and
`ed4c6ee` exposed Apple/WhatsApp as portal links. The current implementation
restores direct provider login using the active v1 endpoints instead of
restoring either the draft v2 endpoints or a cross-origin login iframe.
Browser tests verify inline account detection, absence of portal navigation,
responsive controls and native command dispatch. Provider verification is
mocked in automated tests; real-account authentication remains a smoke test.

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

The Worker deployment workflow also runs when backend files change on main. Deploying Pages alone does not update provider endpoints; a missing `/api/v1/auth/egys/whatsapp/track` route requires deploying the current Worker with the existing protected credentials.
