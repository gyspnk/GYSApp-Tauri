# Rilis APK Android tiap 25 putaran

Aturan pemilik (10 Nov 2026): **setiap 25 putaran goal, build APK Android dan changelog-nya, lalu rilis di GitHub Releases.** Build pertama jatuh pada putaran berikutnya setelah aturan ini dicatat (putaran 226), lalu 251, 276, dan seterusnya. APK dibangun **hanya di GitHub Actions**, bukan di device.

## Berkas kendali

| Berkas                                  | Isi                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.github/release-cadence.json`          | `intervalTurns` (25), `lastTurn`, `lastTag`, `nextDueTurn`, `history[]`                                                      |
| `.github/workflows/android-release.yml` | Dispatch: menghitung tag + changelog, membuat release draft, memanggil `native-android.yml`, memverifikasi aset, menerbitkan |
| `.github/workflows/native-android.yml`  | Membangun APK arm64 (preview, signing debug), mengunggah APK + checksum + provenance ke release                              |
| `scripts/release-notes.mjs`             | Membuat tag `v0.1.0-preview.<YYYYMMDD>.<n>` dan changelog dari `git log` sejak rilis terakhir                                |
| `scripts/release-notes.test.mjs`        | Unit test generator (dijalankan hosted lewat `pnpm test:scripts`)                                                            |

## Prosedur tiap putaran

1. Baca `.github/release-cadence.json`. Bila `putaran goal saat ini >= nextDueTurn`, saatnya rilis.
2. Dispatch:
   ```bash
   gh workflow run android-release.yml --ref main
   ```
   Opsional: `-f tag=v0.1.0-preview.20261110.1` untuk tag tetap, `-f draft=true` bila ingin diperiksa dulu.
3. Tunggu dengan `gh run watch <run-id>` (jangan menahan foreground; kerjakan item lain).
4. Setelah hijau, catat di `history` (`turn`, `tag`, `run`, `url`), set `lastTurn`, `lastTag`, dan `nextDueTurn = turn + 25`; commit + push.
5. Laporkan ke pemilik: tag, tautan release, ukuran APK, dan catatan bahwa APK bertanda tangan debug (hanya untuk pemasangan manual).

## Isi release

- `GYSApp-0.1.0-android-arm64-preview.apk` — APK arm64, profil release, signing debug.
- `SHA256SUMS-android.txt`, `native-provenance-android.json` — checksum dan asal commit (diverifikasi ulang sebelum rilis diterbitkan).
- `CHANGELOG-<tag>.md` — changelog lengkap, dikelompokkan per jenis commit (fitur, perbaikan, performa, pengujian, dokumentasi, ci, tampilan, perawatan, lainnya), plus catatan artefak.

## Batasan yang harus disebut jujur

- **Signing debug**: APK tidak bisa dipakai untuk pembaruan Play Store; butuh keystore stabil milik pemilik. Selama itu, rilis diberi label **pre-release** dan catatan signing ditulis di changelog.
- **Rilis Windows** memakai alur terpisah (`native-windows.yml` / `release-request.yml`) dan tidak termasuk dalam kadensi ini kecuali diminta.
- APK hanya arm64 (perangkat Android modern). Bila perlu armv7/x86_64, itu keputusan terpisah dengan biaya build lebih besar.
- Kadensi mengikuti **putaran goal**, bukan tanggal: bila goal berhenti, tidak ada rilis baru sampai goal aktif lagi.

## Kalau build gagal

1. Baca job yang merah; kegagalan umum: SDK/NDK tidak terpasang, `tauri android init` gagal, verifikasi APK (`verify-android-apk.py`), atau aset tidak terunggah.
2. Perbaiki di `main`, push, lalu dispatch ulang dengan tag baru (generator menaikkan nomor urut harian).
3. Jangan menerbitkan release yang asetnya tidak lengkap; workflow sudah menolak (`Missing asset`).

## Riwayat rilis

| Putaran | Tag                         | APK                                    | Run build     | Tautan                                                                        |
| ------- | --------------------------- | -------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| 226     | `v0.1.0-preview.20261110.1` | 36 118 859 byte (arm64, signing debug) | `42782473369` | https://github.com/gyspnk/GYSApp-Tauri/releases/tag/v0.1.0-preview.20261110.1 |

Rilis pertama dijalankan sebagai dry-run draft (`-f draft=true`) agar jalur build APK + unggah aset terbukti sebelum diterbitkan; setelah aset diverifikasi (APK, SHA256, provenance commit `c69796687aab`, changelog) release diterbitkan sebagai **pre-release**. Rilis berikutnya jatuh pada putaran **251**.
