# Rilis APK Android tiap 25 putaran

Aturan pemilik (10 Nov 2026): **setiap 25 putaran goal, build APK Android dan changelog-nya, lalu rilis di GitHub Releases.** Build pertama jatuh pada putaran berikutnya setelah aturan ini dicatat (putaran 226), lalu 251, 276, dan seterusnya. APK dibangun **hanya di GitHub Actions**, bukan di device.

## Berkas kendali

| Berkas                                  | Isi                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `.github/release-cadence.json`          | `intervalTurns` (25), `lastTurn`, `lastTag`, `nextDueTurn`, `history[]`                                                      |
| `.github/workflows/android-release.yml` | Dispatch: menghitung tag + changelog, membuat release draft, memanggil `native-android.yml`, memverifikasi aset, menerbitkan |
| `.github/workflows/native-android.yml`  | Membangun APK arm64 (preview, signing debug), mengunggah APK + checksum + provenance ke release                              |
| `scripts/release-notes.mjs`             | Membuat tag `v0.1.0-preview.<YYYYMMDD>.<n>` dan changelog dari `git log` sejak rilis terakhir                                |
| `scripts/release-gate.mjs`              | Menolak dispatch sebelum `nextDueTurn` (kecuali `-f force=true`) dan mencetak basis changelog dari `lastTag`                 |
| `scripts/release-cadence-write.mjs`     | Menulis `lastTurn`, `lastTag`, `nextDueTurn`, dan riwayat setelah rilis hijau; menolak entri yang tidak lengkap              |
| `scripts/android-version-code.mjs`      | Menaikkan `versionCode` jadi `1000 + putaran` di `gen/android/app/tauri.properties` sebelum build                            |
| `scripts/release-asset-name.mjs`        | Menurunkan nama APK dari `version` di `tauri.conf.json`, supaya naik versi tidak mematahkan workflow                         |
| `scripts/release-preflight.mjs`         | Satu perintah read-only yang memeriksa versi, nama aset, kadensi, tag basis, dan aset rilis sebelum dispatch                 |
| `scripts/release-history-row.mjs`       | Menambah atau mengganti baris `Riwayat rilis` setelah APK terbit; dipanggil otomatis oleh workflow rilis                     |
| `scripts/release-notes.test.mjs`        | Unit test generator (dijalankan hosted lewat `pnpm test:scripts`)                                                            |

## Prosedur tiap putaran

1. Baca `.github/release-cadence.json`. Bila `putaran goal saat ini >= nextDueTurn`, saatnya rilis.
2. Dispatch:

   ```bash
   gh workflow run android-release.yml --ref main -f turn=276
   ```

   `-f turn` **wajib** dalam praktik: tanpa angka putaran, gerbang kadensi tidak
   memeriksa apa pun dan rilis bisa terbit terlalu awal. Opsional: `-f tag=<tag>`
   untuk tag tetap, `-f draft=true` bila ingin diperiksa dulu, dan `-f force=true`
   hanya bila sengaja rilis lebih awal.

   Gerbang dan basis changelog memakai berkas kadensi, bukan rilis terbaru: tag
   `lastTag` adalah titik awal `git log`, sehingga commit yang sudah terkirim tidak
   pernah muncul dua kali walau nomor rilis sempat meleset.

3. Jangan menahan foreground dan jangan pakai `gh run watch` (di mesin ini sering
   `unexpected EOF`). Polling:

   ```bash
   gh api repos/gyspnk/GYSApp-Tauri/actions/runs/<run-id> --jq '.status+" "+.conclusion'
   gh api repos/gyspnk/GYSApp-Tauri/actions/runs/<run-id>/jobs --jq '.jobs[]|"\(.name):\(.conclusion)"'
   ```

4. Langkah "Record the cadence" menarik `main` lebih dulu, lalu menulis
   `.github/release-cadence.json` otomatis lewat `scripts/release-cadence-write.mjs`
   (`turn`, `tag`, `commit`, `apkBytes`, `run`, `url`, `signing`), commit, dan push
   `chore(release): record the turn-<N> cadence`; `nextDueTurn` dihitung
   `turn + intervalTurns`. Langkah ini dilewati saat `-f draft=true`.
   Skrip menolak entri yang tidak lengkap, tag tanpa awalan `v`, angka bukan
   bilangan bulat positif, dan `turn` yang tidak lebih besar dari `lastTurn`.
5. Laporkan ke pemilik: tag, tautan release, ukuran APK, dan catatan bahwa APK bertanda tangan debug (hanya untuk pemasangan manual).

## Riwayat rilis

| Putaran | Tag                         | Run           | APK (byte) | Commit     | Catatan                               |
| ------- | --------------------------- | ------------- | ---------- | ---------- | ------------------------------------- |
| 226     | `v0.1.0-preview.20261110.1` | `42782473369` | 36 118 859 | `c6979668` | rilis pertama, signing debug          |
| 251     | `v0.1.0-preview.20261110.2` | `42910081054` | 36 120 363 | `5e5ebdfc` | 104 commit sejak rilis pertama, arm64 |

Putaran 251 juga membuktikan jalur build native (`42910123438` "Native Android APK") hijau
sebelum rilis diterbitkan, dan APK hanya berbeda 1 504 byte dari rilis sebelumnya meski
104 commit masuk — tanda tidak ada aset besar yang tidak sengaja ikut terpaket.

## Isi release

- `GYSApp-<version>-android-arm64-preview.apk` — APK arm64, profil release, signing
  debug. Nama berkas diturunkan dari `version` di `apps/native/src-tauri/tauri.conf.json`
  (saat ini `0.1.0`), bukan ditulis manual di workflow.
- `SHA256SUMS-android.txt`, `native-provenance-android.json` — checksum dan asal commit (diverifikasi ulang sebelum rilis diterbitkan).
- `CHANGELOG-<tag>.md` — changelog lengkap, dikelompokkan per jenis commit (fitur, perbaikan, performa, pengujian, dokumentasi, ci, tampilan, perawatan, lainnya), plus catatan artefak.

## Batasan yang harus disebut jujur

- **Signing debug**: APK tidak bisa dipakai untuk pembaruan Play Store; butuh keystore stabil milik pemilik. Selama itu, rilis diberi label **pre-release** dan catatan signing ditulis di changelog.
- **Rilis Windows** memakai alur terpisah (`native-windows.yml` / `release-request.yml`) dan tidak termasuk dalam kadensi ini kecuali diminta. Berkas `.github/release-request.json` adalah pemicu satu kali: menyentuhnya (termasuk menghapusnya) menjalankan `release-request.yml` dengan tag yang tertulis di dalamnya, jadi jangan diedit sebagai bagian dari rilis Android.
- Jalur `release-request.yml` tidak lagi melewati kadensi: ia membaca `nextDueTurn` dari
  `.github/release-cadence.json`, meneruskan angka itu sebagai `turn` ke `native-android.yml`,
  dan menjadi no-op bila tag yang diminta sudah terbit atau tidak lebih baru dari `lastTag`.
- APK hanya arm64 (perangkat Android modern). Bila perlu armv7/x86_64, itu keputusan terpisah dengan biaya build lebih besar.
- Kadensi mengikuti **putaran goal**, bukan tanggal: bila goal berhenti, tidak ada rilis baru sampai goal aktif lagi.

## Dokumentasi wajib ikut di setiap perubahan dan rilis

Permintaan pemilik (11 Nov): dokumentasi tidak boleh tertinggal.

- Setiap perubahan kode memperbarui dokumen yang menyebutnya: `docs/plans/ui-spec-loop.md`
  (status permukaan + kontrak), `docs/plans/agent-brain.md` (aturan otak/delegasi),
  `docs/plans/HANDOFF-2026-11-10.md` (§7 catatan putaran + §8 jebakan baru), dan berkas
  ini untuk hal rilis.
- `pnpm verify:docs` di CI menolak dokumen yang tidak sinkron; jangan mengandalkan itu
  saja — tulis catatan di commit yang sama.
- Rilis tidak boleh diterbitkan tanpa: entri `history` baru, `nextDueTurn` diperbarui,
  baris tabel riwayat, dan changelog yang menyebut signing debug.
- Bila ada keputusan yang belum dieksekusi (mis. signing stabil dari pemilik), catat
  sebagai issue, bukan sebagai catatan lisan.

## Kalau build gagal

1. Baca job yang merah; kegagalan umum: SDK/NDK tidak terpasang, `tauri android init` gagal, verifikasi APK (`verify-android-apk.py`), atau aset tidak terunggah.
2. Perbaiki di `main`, push, lalu dispatch ulang dengan tag baru (generator menaikkan nomor urut harian).
3. Jangan menerbitkan release yang asetnya tidak lengkap; workflow sudah menolak (`Missing asset`).

## versionCode

Android menolak memasang APK dengan `versionCode` yang tidak lebih besar. Kode diturunkan dari putaran rilis (`1000 + turn`) oleh `scripts/android-version-code.mjs` di `native-android.yml`, sehingga setiap rilis preview bisa dipasang menimpa yang lama tanpa langkah manual. Skrip menolak properties tanpa baris `versionCode` dan menolak kode yang mundur.

## Jebakan yang sudah diperbaiki (11 Nov)

- `versionCode` ada di kunci `tauri.android.versionCode=…` (Tauri 2.x), bukan `versionCode=…`. Skrip kini membaca/menulis kunci aslinya dan menolak berkas yang tidak punya baris itu; unit test memakai bentuk nyata plus bentuk lama.
- `android-release.yml` membuat tag di server lewat `gh release create`, sedangkan `git fetch` terakhir terjadi sebelumnya — verifikasi provenance kini menjalankan `git fetch --quiet --tags --force origin` sebelum `git rev-list`.
- Input `turn` wajib (`required: true`): tanpa angka putaran, gerbang kadensi tidak bisa memeriksa apa pun dan `versionCode` tetap 1.
- Langkah menunggu APK memakai polling `gh api …/actions/runs/<id>` seperti aturan handoff, bukan `gh run watch`.

Putaran rilis kini memverifikasi `versionCode` **di dalam APK**, bukan hanya di `tauri.properties`: setelah `aapt dump badging`, langkah "Verify and collect APK" menolak build yang tidak memuat `versionCode='<1000+putaran>'` (memakai `codeForTurn` dari `scripts/android-version-code.mjs`, satu sumber angka). Tanpa ini, APK dengan kode 1 bisa lolos hijau bila Gradle mengabaikan properti.

### Gladi kering putaran 276 (11 Nov, HEAD `4cac0cd7`)

`node scripts/release-preflight.mjs --turn 276` → 5/5 ok (versi `0.1.0`, nama APK `GYSApp-0.1.0-android-arm64-preview.apk` dipakai tiga workflow, kadensi lulus, base `v0.1.0-preview.20261110.2`, dua aset checksum/provenance ada). Changelog yang akan dibangun: tag `v0.1.0-preview.20261111.1`, **117 commit**, 141 baris, 7 475 byte (feat 19, fix 30, test 32, docs 28, refactor 2, style 3, build 1, chore 1, other 1). Simulasi kadensi: `lastTurn 276`, `nextDueTurn 301`, history 2→3, baris riwayat enam kolom cocok header.

Rilis ini mengunggah **empat** aset (APK, `SHA256SUMS-android.txt`, `native-provenance-android.json`, `CHANGELOG-*.md`), bukan delapan — jalur Windows tidak dipanggil `android-release.yml`.

Perintah: `gh workflow run android-release.yml --ref main -f turn=276`, lalu poll `gh api …/actions/runs/<id>`. Sesudah rilis: cek log `APK versionCode 1276 verified`, rilis bukan draft, empat aset lengkap, `lastTurn/nextDueTurn` = 276/301, baris 276 ada di tabel ini, tutup #14.

Risiko yang tetap terbuka: tag/draft dibuat sebelum build (build gagal meninggalkan draft + tag, run ulang memakai `.2`), langkah kadensi berjalan sesudah rilis publik sehingga bisa kalah balapan dengan proteksi branch, dan prefiks `v0.1.0-preview.` masih hardcoded di `scripts/release-notes.mjs:133`.
