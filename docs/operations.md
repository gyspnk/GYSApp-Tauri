# Operations and troubleshooting

Reviewed 2026-10-07. Web, Worker and native releases are separate artifacts.
A pushed commit proves source delivery; deployment success and live-account
acceptance must be checked separately.

## Build and runtime configuration

| Variable                                                       | Owner                                        | Purpose                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `VITE_BFF_BASE_URL`                                            | Public web build / Pages repository variable | BFF origin for account and content adapters; never a credential. Rebuild after changing it.      |
| `VITE_ASSET_MANIFEST_URL`                                      | Public web build                             | Optional independent HTTPS offline manifest; absent uses bundled manifest.                       |
| `VITE_EGYS_GOOGLE_CLIENT_ID`                                   | Public web build                             | Google client ID, matched to the configured official/deployed provider.                          |
| `VITE_EDGE_TTS_URL`, `VITE_EDGE_TTS_VOICES_URL`                | Public web build                             | Optional public speech gateway/catalog overrides; do not put secret gateway credentials in them. |
| `VITE_EDGE_TTS_DEFAULT_VOICE`                                  | Public web build                             | Optional transport default, not proof of an available voice catalog.                             |
| `ALLOWED_ORIGINS`                                              | Worker binding                               | Comma-separated exact allowed client origins, including deployed Pages/dev/native origins.       |
| `EGYS_API_BASE_URL`                                            | Protected Worker binding                     | Live v1 origin `https://e.gys.or.id`, without `/api/v1`.                                         |
| `EGYS_GOOGLE_CLIENT_ID`                                        | Worker binding                               | Google ID-token audience override; default matches the audited official v1 client.               |
| `EGYS_UPSTREAM_COMMIT`                                         | Worker binding                               | Reported discovery provenance; does not switch runtime authentication to v2.                     |
| `EDGE_TTS_URL`, `EDGE_TTS_VOICES_URL`                          | Protected Worker bindings                    | Vetted audio gateway and optional validated voice catalog.                                       |
| `SAUH_SOURCE_URL`, `SUARA_SOURCE_URL`, `LITERATURE_SOURCE_URL` | Worker bindings                              | Trusted publisher endpoints; URL validation still applies.                                       |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                | GitHub secrets                               | Worker workflow deployment credentials.                                                          |
| `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`   | GitHub secrets                               | Manual signed Windows installer workflow.                                                        |

Public PDF transport is implemented by `pdf-source.ts`: use the configured BFF,
the local development proxy, or the existing public Worker fallback
`https://gysapp-tauri-bff.pas-presensi.workers.dev`. The fallback applies to
trusted public content; it does not grant an unconfigured account session.
`wrangler.toml` holds public origins/source defaults, not secret values.

## Local workflow

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

Use `pnpm preview` for production behavior. The repository-managed server ports
are 5173 for HMR and 4173 for browser tests/preview. Stop the other test server
before switching dev/production test modes. Never regenerate `dist` while a
browser run is loading its hashed chunks.

Run the Worker locally from `apps/bff` with Wrangler after building
`@gys/contracts`. Configure a local development BFF URL/allowed origin when
exercising account and streamed-content routes. Provider-account success is
not available merely by mocking HTTP responses.

## Delivery

1. Verify formatting, docs/provenance, workspace types/units and build budgets.
2. Run affected production browser contracts with immutable local fixtures.
3. Commit the intended files. Pre-commit checks the index without rewriting it.
4. Push the authorized branch. Direct `main` delivery requires that instruction;
   do not force-push or discard unrelated remote work.
5. Verify the remote branch SHA matches the new local commit. Then inspect
   separate CI, Pages and Worker workflow outcomes.

Pages runs on pushes to `main`. CI runs on main or PR events and reuses its
verified build in browser jobs. Backend/contracts changes trigger the Worker
workflow, which builds contract exports before Wrangler and deploys only when
protected Cloudflare secrets exist. A skipped Worker means frontend PDF/auth
fixes may still be missing from the hosted API. The Pages workflow cannot update
a Worker by publishing JavaScript alone.

Windows packaging is manual; unsigned artifacts and a compiled executable are
not signed installation/upgrade evidence. Android/iOS require the relevant
platform runner, signing and device acceptance. Do not describe any unavailable
platform pipeline as completed.

## e-GYS diagnosis

| Symptom                              | Inspect / recovery                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp opens no send link          | Popup reservation must occur in the provider click. Check allowed popups, challenge fields, the start response and live v1 configuration; retry the same button.                                     |
| Prepared message sent but no account | Verify current Worker has `/auth/egys/whatsapp/track`, allowed client origin, reference HttpOnly cookie and official origin relay. Confirm using the sender phone from the event, not the bot phone. |
| Countdown expires                    | Attempt closes requests/tracking automatically; press WhatsApp again for a fresh reference. Old socket/profile events cannot complete a replacement attempt.                                         |
| Immediate provider failure           | Inspect typed BFF response and configuration, not browser token storage. Missing backend/invalid source must remain signed out.                                                                      |
| Apple fails on first click           | SDK load is bounded/shared/retryable. Check provider popup, registered service ID/callback and state matching; real origin/account acceptance remains necessary.                                     |
| Header shows no photo after login    | Check successful `/account/profile` normalization/refetch and available avatar URL. Do not infer login from the presence of a provider button.                                                       |
| Tauri login window rejects a message | Only the official origin and three allowlisted logged-in commands with an opaque valid token are accepted. Keyring errors do not fall back to localStorage.                                          |

Browser API tokens remain in HttpOnly cookies and native tokens in the OS
keyring. Keep logs redacted. Provider SDK scripts load only for that requested
provider; application fonts, PDF and audio engines remain locally bundled.

## Literature and PDF diagnosis

Official Warta Sejati/Pelita Kecil publications often resolve to
`tjcorguploads.s3.amazonaws.com`, which does not provide usable direct browser
CORS. The Worker must allow the validated source, stream it and expose
`Accept-Ranges`/`Content-Range` to PDF.js. HTTP 403 from an old deployed Worker is
a backend deployment failure even when the new frontend is installed.

`/api/v1/content/pdf-source?post=…` resolves trusted publisher metadata;
`/api/v1/content/pdf?url=…` streams the validated result and preserves Range.
Check the actual PDF signature/content type: a publisher HTML error page cannot
be passed to PDF.js as a document. Trusted mirror fallback is bounded.

Retry the current document after a failure. It cancels its pending task/lease
and retains the surrounding header/progress. Do not reset all caches or force
an app reload to retry a single publication. A large first request is still
subject to network/document structure; range loading cannot promise fixed
latency. If offline reopening fails, distinguish retained catalog metadata
from retained complete PDF bytes.

Faith booklets use local `assets/faith/` paths and a source/size/SHA manifest.
If those fail, inspect deployed base-path asset availability and the local
manifest rather than blaming publisher CORS. Hymn PDFs use their resolved
canonical/Fork/package identity; source switching must also switch the chord
geometry identity.

## Loading, cache and audio diagnosis

- An old shell uses the explicit update/activation path. Mixed-build/integrity
  failures retain the previous usable version. Native does not register the
  browser PWA worker and retires only its legacy owned registrations.
- A stale chord is checked against current manifest metadata. Repair only its
  missing/corrupt bytes; unchanged verified entries should not redownload.
- TimGM is bundled. No audio before Play is expected browser gesture policy,
  not a missing SoundFont. GeneralUser still needs an explicit install.
- PCM cache presence checks do not clone audio. Setting changes create a new
  render identity; pending old work cannot overwrite foreground playback.
- Enlarged PDF panning belongs to its page/stage; keyboard/page controls should
  remain accessible. A hidden menu must be inert during closing.
- Reset clears owned storage after pending writes are drained. Export relevant
  local notes/playlists first; partial failures remain actionable.

See [cache/preload](cache-and-preload.md) for ownership/bounds and
[testing](testing-and-maintenance.md) for reproducible regressions.
