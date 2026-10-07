# Clean-room provenance

Reviewed 2026-10-07 against checked generated files.

| Role                          | Source                     | Immutable revision                                                   |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Functional source / KR master | `ThenGB/GYSAPP-Fork`       | `4f0d39b`                                                            |
| Canonical music/chord assets  | `gyspnk/gyschordweb`       | `e8e7efe1189b5746a2bb542348e221844091c8d1`                           |
| e-GYS v2 discovery only       | `Gereja-Yesus-Sejati/egys` | `a64b3ba1aa2bf01ed3363a061fc0ebf737a248a7`                           |
| Active account service        | Official `e.gys.or.id`     | Runtime live v1; do not infer service behavior from the v2 snapshot. |

Source checkouts are read-only discovery inputs. The repository has no copied
upstream history and does not use `ThenGB/gysapp` as a source seed. Application
runtime imports clean-room domain/contracts/adapters, not ignored checkouts.

`generate-music-lock.mjs`, `generate-chord-manifest.mjs` and
`generate-hymn-catalog.mjs` derive the 1,229-entry lock, 161-entry chord manifest
and 533-entry catalog. The TB/Fork generators derive the Bible reader and KR
master map. `verify:generated` checks source/count/byte/hash relationships;
strict chord audit confirms 3,738 positions without orphan/invalid mappings.
A source-data change needs reviewed generation/provenance, not prose-only
editing of machine-owned JSON. Any permitted delivery path still requires
review of the resulting lock diff.

The KR master has 649 pages, 4,770,376 bytes and SHA-256
`5ea1d857cac8a8d52600052ef3a7b22214919ffaefe4f0f97c71d6f57f5f8805`.
It is independent of the canonical per-hymn scores. Its primary proxy/fallback
and signed-package decoding use that source identity rather than chord-file
coordinates from another score.

Faith booklets were copied unchanged from official TJC URLs on 2026-10-06;
`assets/faith/manifest.json` records ten sources/sizes/hashes. Fonts, logo,
SoundFont and FluidSynth notices remain beside their assets.

Local `sync-egys.mjs` maintains v2 discovery metadata from the authenticated
maintainer checkout. Commit/push hooks and GitHub Actions do not silently clone
or sync the private repository. Neither v2 discovery nor mocked provider tests
prove successful live v1 account login. Dated audits retain the revision and
measurements they originally exercised.
