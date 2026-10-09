# e-GYS account integration

Runtime review: **2026-10-07**. Provider tests prove the application protocol
with mocked provider responses; real-account acceptance and the deployed
Worker version remain separate requirements. See [operations](operations.md)
for bindings, deployment and symptom-based troubleshooting.

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

```mermaid
sequenceDiagram
  participant UI as Account button
  participant BFF as Worker
  participant WA as WhatsApp
  participant V1 as Official e-GYS v1
  UI->>UI: Reserve messaging tab; start 120-second attempt
  UI->>BFF: POST whatsapp/start
  BFF->>V1: Create reference
  BFF-->>UI: Prepared message and bot phone; HttpOnly reference cookie
  UI->>WA: Open prepared send link
  UI->>BFF: Open whatsapp/track
  BFF->>V1: Relay WebSocket using official origin
  WA->>V1: Send message with internal reference
  V1-->>UI: Sender phone and internal confirmation code through relay
  UI->>BFF: POST whatsapp/confirm
  BFF->>V1: Confirm sender and reference
  BFF-->>UI: HttpOnly session; ok only
  UI->>BFF: Refresh account/profile
  BFF-->>UI: Normalized member and avatar
```

The account screen keeps all three provider buttons in one row. WhatsApp
starts an inline login request with `POST /api/v1/auth/egys/whatsapp/start`;
the BFF calls live v1 `/login/whatsapp-login-request` and binds the reference
to a ten-minute HttpOnly cookie. HTTPS reference and session cookies are Secure, SameSite=None, and Partitioned so browser third-party-cookie restrictions do not discard the app-bound session. Android WebViews explicitly accept cookies for the cross-site BFF authentication path. The user sends the prepared message through
WhatsApp; the official `wss://e.gys.or.id/wa-login/:ref` channel tracks the
message and supplies an internal confirmation code automatically. There is no
OTP input or manual confirmation in the application. The provider click reserves
a messaging tab synchronously to avoid popup blocking; it navigates directly to
the prepared WhatsApp send URL once the tracking WebSocket opens. This subscribes before the user can send a message, without adding a second send button. Both camelCase and lowercase response fields are supported. The button shows a small trailing countdown, with a 120-second deadline covering setup and verification. Expiry aborts requests, closes tracking and removes the badge; a pending blank tab is closed. Clicking WhatsApp again replaces the attempt, resets the countdown and opens a new prepared message. Old socket events and profile results are ignored after cancellation. Because the service rejects
foreign browser origins, the Worker relays `/api/v1/auth/egys/whatsapp/track`
to the official WebSocket using its required origin. The relay requires an
allowed client origin and the HttpOnly reference cookie; clients cannot choose
an upstream URL or send arbitrary upstream messages. Confirmation uses the sender's
`mobilePhone` from the tracking event; the start response's `mobilephone` belongs
to the bot and must only be used in the send link. A transient socket disconnect
reconnects the same reference with bounded backoff within the existing deadline,
without sending another WhatsApp message or creating a second challenge. Duplicate
confirmation events are ignored. Confirmation calls `/login/whatsapp-login-confirm` through
the BFF. Canceling closes the socket and aborts outstanding requests.

Apple uses the official Apple SDK, existing service ID `id.or.gys.e.client`,
registered callback `https://e.gys.or.id/login`, popup authorization and a
random state validated before exchange. `POST /api/v1/auth/egys/apple` calls
live v1 `/auth/apple/callback` with `ismobile: 1`. Apple may require its own
provider authorization window; GYSApp does not embed or open the e-GYS portal.
Deployment origin compatibility still requires a real Apple account smoke test.
The SDK loader resolves on script load, shares concurrent requests and can retry
after failure or timeout. The service ID, redirect and callback were checked
against the live official login page on 2026-10-06.

Both callbacks store the upstream token in the same HttpOnly cookie as Google,
return only `{ ok: true }`, then refresh `/api/v1/account/profile` so the header
and account panel detect the member. Tokens are never stored in browser storage.
Google Identity Services renders its dynamic button directly in the provider
row. It can display personalized account information when Google permits it;
compact layouts use Google's icon button rather than clipping a wide label.
Authorization starts from that button without an application login dialog.
The SDK loader shares requests, times out after ten seconds and retries in the
same row after failure. Unmounted controls ignore late SDK/credential callbacks.
The existing Google BFF exchange and profile detection remain unchanged.
The web build does not call draft v2 `/auth/providers`, `/auth/exchange/*`,
or `/api/v1/auth/whatsapp/start` routes.

### Public application endpoints

All paths below are relative to the configured BFF origin. The upstream
reference and credential are distinct from the returned normalized profile.

| Method / path                             | Contract                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/egys/google`           | Verify GIS credential/audience and establish the live v1 session.                                                                    |
| `POST /api/v1/auth/egys/whatsapp/start`   | Create one official reference, set its HttpOnly cookie and return the prepared messaging fields.                                     |
| `GET /api/v1/auth/egys/whatsapp/track`    | Cookie/origin-bound WebSocket upgrade; reconnect the same reference until its deadline.                                              |
| `POST /api/v1/auth/egys/whatsapp/confirm` | Exchange the tracking event's sender phone and internal code using the cookie-bound reference; the client ignores superseded events. |
| `POST /api/v1/auth/egys/apple`            | Exchange the official Apple authorization with live v1; frontend validates random state before submission.                           |
| `GET /api/v1/account/profile`             | Normalize the authenticated member; the header consumes this state for the avatar.                                                   |
| `POST /api/v1/auth/logout`                | Clear the browser session cookie; native logout also clears its keyring token. Challenge cancellation has a separate owner.          |

Provider buttons remain responsive within a single row, including when the
account disclosure is collapsed and reopened. Google stays visible when the
network/backend is unavailable; visibility does not imply an authenticated
session. WhatsApp uses only the inline trailing countdown/status, with no app
login overlay, OTP field or separate send action.

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

### Compact account surfaces

The Settings profile disclosure starts closed. The header avatar opens an animated
account popover with name, branch/email, account settings, e-GYS portal and sign-out.
Google authentication runs directly inside the popover; WhatsApp/Apple use the
existing provider row at `/lainnya?section=account`. This deep link reveals the
profile once per navigation and still permits manual collapse. Profile change
events update the header and Settings together.
