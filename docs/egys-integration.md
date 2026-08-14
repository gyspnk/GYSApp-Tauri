# e-GYS account integration

GYSApp never sends an e-GYS token directly to the browser storage. The web client calls the versioned GYS BFF routes and the Worker forwards the request to e-GYS with the upstream `gys_session` cookie.

## Runtime flow

1. The identity provider SDK obtains a short-lived Google or Apple `idToken` in the client.
2. The client posts `{ "idToken": "…" }` to `/api/v1/auth/exchange/google` or `/api/v1/auth/exchange/apple`.
3. The Worker forwards the token to e-GYS `/api/v1/auth/{provider}` and rewrites the upstream `Set-Cookie` domain to the BFF origin.
4. `/api/v1/account/profile` and `/api/v1/auth/session` forward the HttpOnly cookie to e-GYS `/api/v1/auth/me`.
5. Logout forwards to `/api/v1/auth/signout` and clears the local cookie.

The upstream e-GYS repository is private and does not expose a public production base URL. Configure it only as a Cloudflare Worker secret:

```sh
wrangler secret put EGYS_API_BASE_URL --config apps/bff/wrangler.toml
```

The value must be the e-GYS backend origin (for example `https://egys.example.org`), without `/api/v1`. Google/Apple client IDs and redirect configuration remain protected identity-provider settings; no client secret is committed to this repository.

When the secret is absent, the BFF returns a typed `UPSTREAM_UNAVAILABLE` response and the UI keeps the user in a safe signed-out state. This makes Pages preview builds deterministic while preserving the production integration boundary.
