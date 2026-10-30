# Rencana induk pengembangan otonom — GYSApp-Tauri

**Tanggal rencana:** 30 Oktober 2026
**Status:** hidup; diperbarui pada setiap siklus eksekusi.
**Repo:** https://github.com/gyspnk/GYSApp-Tauri — branch `main`.
**HEAD saat rencana ini dimulai:** `37ffbd03869447d583771a0a045c0badeb14e2ca`
(identik dengan snapshot handoff 30 Oktober 2026).
**Branch kerja sesi ini:** `codex/autonomous-hardening-20261030` (lokal, belum
di-push; `main` tidak disentuh).

Dokumen ini adalah **satu-satunya** catatan status, keputusan dan antrean kerja
otonom untuk pengembangan lanjutan. Rencana historis di `docs/plans/`,
`docs/superpowers/` dan audit bertanggal tetap menjadi bukti pada revisinya
masing-masing; jangan menambah rencana induk baru.

Semua angka di bawah berasal dari eksekusi nyata pada mesin ini. Bedakan selalu:
tes unit, tes browser lokal, preview produksi, hosted CI, perangkat fisik dan
installer bertanda tangan. Yang belum dijalankan ditulis **NOT RUN**.

## 1. Status eksekusi

| Bidang                     | Status pada 30 Oktober 2026 (sesi ini)                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git/worktree               | `main` pada `37ffbd0`, `git fetch origin --prune` tanpa perubahan remote, worktree bersih saat mulai. Satu branch lokal lama (`codex/compact-responsive-ui`) dan 12 branch remote lama ada; tidak disentuh. |
| Toolchain                  | Node `v24.18.0`, pnpm `11.21.0`, corepack `0.35.0`, `node_modules` sudah terpasang.                                                                                                                         |
| Dev server 5173            | **AKTIF dan terverifikasi** (`HTTP 200`, `data-boot="ready"`, HMR menyajikan `src/main.tsx`). Sempat mati karena bug watcher Windows (B-02) dan sudah diperbaiki.                                           |
| Preview produksi 4173      | **AKTIF dan terverifikasi** di `http://127.0.0.1:4173/GYSApp-Tauri/`; dipakai untuk seluruh e2e sesi ini.                                                                                                   |
| `pnpm typecheck`           | **PASS** (5 paket).                                                                                                                                                                                         |
| `pnpm test`                | **FAIL → PASS**. Awal: 6 tes gagal pada checkout dengan `apps/web/.env.local` (B-01, B-04). Sekarang contracts 20, domain 45, testkit 2, bff 74, web 511, plus policy/script — semua lulus.                 |
| `pnpm build`               | **PASS** (dijalankan 4×; build terakhir memuat seluruh perubahan sesi ini).                                                                                                                                 |
| `pnpm verify:bundle`       | **PASS**. Initial JS gzip **172,0 KiB** dari 24 modul + `startup.js` (batas 180 KiB); chunk `index-*.js` **84,5 KiB** gzip (batas 250 KiB).                                                                 |
| `pnpm verify:generated`    | **PASS**.                                                                                                                                                                                                   |
| `pnpm verify:docs`         | **PASS**.                                                                                                                                                                                                   |
| `pnpm format:check`        | **FAIL → PASS**. Awal gagal pada 4 berkas di `.superpowers/sdd/` (workspace lokal yang meng-ignore dirinya sendiri; B-03).                                                                                  |
| `pnpm test:e2e` (egys-v1)  | **FAIL 8 → PASS 20** (Chromium, preview produksi, `--workers=2 --retries=0`). Kedelapan kegagalan sudah ada di HEAD (dibuktikan dengan uji A/B), bukan akibat perubahan sesi ini; lihat B-12 dan B-13.      |
| `pnpm verify:prepush`      | NOT RUN (dijalankan menjelang commit slice berikutnya).                                                                                                                                                     |
| Audit UI browser lokal     | **PASS dasar**: 8 route × 4 viewport (320/390/768/1440) = 32 render, semua `200`, `boot=ready`, tanpa page error, tanpa gambar rusak, tanpa overflow horizontal.                                            |
| Baseline performa pengguna | SEBAGIAN: bundle terukur; hero Beranda cold-start terukur ~7 s (B-05). Belum ada median/p95 startup berulang seperti audit 2026-10-11.                                                                      |
| Perbaikan dalam sesi ini   | 2 commit slice: (1) determinisme tes unit, watcher Windows, gate formatting, kunci i18n mati; (2) toleransi + diagnostik tracking WhatsApp, kontrak e2e e-GYS yang basi, clipping tombol provider 320 px.   |
| Blocker eksternal          | Konfirmasi pesan WhatsApp nyata, langkah kredensial Apple, akun e-GYS nyata, deploy Worker, signing, perangkat fisik — **BELUM diverifikasi**; rincian bukti di 2.4.                                        |

## 2. Baseline terukur (30 Oktober 2026)

**Lingkungan:** Windows 11, Node 24.18.0, pnpm 11.21.0, Chromium yang dibundel
Playwright 1.62.1, viewport 320×640 / 390×844 / 768×1024 / 1440×900, DPR 1,
locale `id-ID`, service worker diblokir pada probe UI, dev server Vite 8.2.1.
Jaringan: koneksi rumah Indonesia ke Cloudflare Worker `gysapp-tauri-bff` dan
`tjcorguploads.s3.amazonaws.com`. Ini **bukan** benchmark CI dan bukan bukti
performa hosted.

### 2.1 Gate yang benar-benar dijalankan

| Perintah                  | Hasil awal sesi                    | Hasil setelah perbaikan | Catatan                                          |
| ------------------------- | ---------------------------------- | ----------------------- | ------------------------------------------------ |
| `pnpm typecheck`          | PASS                               | PASS                    | 5 paket workspace                                |
| `pnpm test`               | FAIL (6 tes)                       | PASS                    | lihat B-01 dan B-04                              |
| `pnpm build`              | PASS                               | PASS                    | `dist` web dibangun ulang                        |
| `pnpm verify:bundle`      | PASS                               | PASS                    | 172,0 KiB / 180 KiB                              |
| `pnpm verify:generated`   | PASS                               | PASS                    |                                                  |
| `pnpm verify:docs`        | PASS                               | PASS                    |                                                  |
| `pnpm format:check`       | FAIL (4 berkas `.superpowers/sdd`) | PASS                    | lihat B-03                                       |
| `pnpm dev` + HTTP probe   | HTTP 200                           | HTTP 200                | sempat crash `EBUSY`; lihat B-02                 |
| `pnpm preview` (4173)     | NOT RUN                            | HTTP 200                | dipakai seluruh e2e                              |
| `pnpm test:e2e egys-v1`   | FAIL 8 / 20                        | PASS 20 / 20            | lihat B-12, B-13                                 |
| `pnpm test:e2e` (lainnya) | NOT RUN                            | NOT RUN                 | belum dijalankan; jangan klaim suite penuh hijau |
| `pnpm test:performance`   | NOT RUN                            | NOT RUN                 | butuh build stabil terpisah                      |
| `pnpm native:check`       | NOT RUN                            | NOT RUN                 | toolchain Rust/Android tidak diverifikasi        |

### 2.2 Bundle (gzip, `dist` lokal)

- Initial JS: **172,0 KiB** pada 24 modul + `startup.js` → 8,0 KiB di bawah batas.
- Chunk utama `index-*.js`: **84,5 KiB** (271,9 KiB mentah) → jauh di bawah batas 250 KiB.
- Runtime besar tetap lazy: `pdf.worker.min` 365,3 KiB, `pdf-document-cache` 123,6 KiB, `bible-search-worker` 23,0 KiB.
- Kesimpulan: budget tidak dilanggar; tidak ada pekerjaan optimisasi mendesak dari angka ini.

### 2.3 Matriks route (render lokal, 4 viewport)

| Route        | Render | h1                | Overflow horizontal | Page error | Catatan                                                   |
| ------------ | ------ | ----------------- | ------------------- | ---------- | --------------------------------------------------------- |
| `/`          | PASS   | Bacaan & nyanyian | tidak               | tidak      | hero Sauh butuh jaringan (B-05)                           |
| `/sauh`      | PASS   | Sauh Bagi Jiwa    | tidak               | tidak      | tautan kembali 18–20 px (B-06)                            |
| `/suara`     | PASS   | Suara Sejati      | tidak               | tidak      | 165 gambar, render 4,1–7,6 s (keluarga B-05)              |
| `/bible`     | PASS   | Alkitab           | tidak               | tidak      | Kejadian 1 tampil; crossref 40×40 via pseudo-element (OK) |
| `/kidung`    | PASS   | Kidung            | tidak               | tidak      | 533 tombol lagu; klik mengubah URL ke `/kidung/hymn-001`  |
| `/iman`      | PASS   | Dasar Kepercayaan | tidak               | tidak      | 10 pokok iman                                             |
| `/literatur` | PASS   | Literatur         | tidak               | tidak      | 306 tautan katalog, detail terbuka dengan h1              |
| `/lainnya`   | PASS   | Lainnya           | tidak               | tidak      | 401 profil akun = sesi anonim (wajar), 403 GIS = origin   |

Temuan konsol yang **bukan** bug produk: `401 /api/v1/account/profile` (belum
login), `403 accounts.google.com/gsi/button` (origin localhost tidak diizinkan
untuk client ID tersebut). Tidak ada `pageerror` di seluruh 32 render.

### 2.4 Bukti login e-GYS (permintaan pemilik, 30 Oktober 2026)

Diuji terhadap **Worker hosted** yang dikonfigurasi `apps/web/.env.local`
(`gysapp-tauri-bff.pas-presensi.workers.dev`), bukan mock, dan bukan akun nyata.

| Langkah                                  | Bukti                                                                                                                                                                                    | Status  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `POST /api/v1/auth/egys/whatsapp/start`  | `200` dalam 1,1 s; `referenceid`, `mobilephone` bot `6285176756451`, `content` berisi "No. Ref"; cookie `egys_wa_reference` HttpOnly/Partitioned                                         | PASS    |
| Tab WhatsApp direservasi & dibuka        | popup `about:blank` → `https://api.whatsapp.com/send?phone=…&text=…Ref…`; `window.opener === null`                                                                                       | PASS    |
| `WS /api/v1/auth/egys/whatsapp/track`    | upgrade sukses; frame `{"type":"connected"}` dan `{"type":"info","message":"Success open socket in server"}`; badge "Menunggu pesan WhatsApp"                                            | PASS    |
| `POST …/whatsapp/confirm` (kode salah)   | `400 VALIDATION_ERROR` — rute sehat, menolak kode tidak valid                                                                                                                            | PASS    |
| Konfirmasi pesan nyata (kirim WhatsApp)  | butuh ponsel pemilik; tidak dapat dijalankan agent                                                                                                                                       | BLOCKED |
| `POST /api/v1/auth/egys/google` (kosong) | `400 VALIDATION_ERROR` — rute sehat                                                                                                                                                      | PASS    |
| Apple: SDK + authorize popup             | SDK `appleid.auth.js` `200`; popup resmi terbuka dengan `client_id=id.or.gys.e.client`, `redirect_uri=https://e.gys.or.id/login`, `state` acak; halaman Apple berbahasa Indonesia tampil | PASS    |
| Apple: langkah kredensial                | butuh Apple ID nyata; tidak dapat dijalankan agent                                                                                                                                       | BLOCKED |

Kesimpulan jujur: **plumbing WhatsApp dan inisialisasi Apple terbukti bekerja
terhadap layanan nyata**, tetapi konfirmasi pesan WhatsApp yang dilaporkan gagal
belum dapat direproduksi tanpa ponsel/akun pemilik. Yang diperbaiki di sesi ini
adalah bagian yang bisa salah secara diam-diam: pembacaan frame tracking dan
diagnostiknya (B-14), bukan klaim bahwa penyebabnya sudah ditemukan.

## 3. Backlog aktif

| ID   | Prioritas | Temuan / sasaran                                                                                             | Bukti                                                                                                  | Status  | NEXT spesifik                                                                 |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| B-01 | P1        | `pnpm test` merah pada checkout dengan `apps/web/.env.local` (variabel BFF ikut masuk tes unit)              | 6 tes gagal: `online-article` 2, `lazy-image` 2, `music-assets` 1, `i18n` 1                            | DONE    | —                                                                             |
| B-02 | P1        | `pnpm dev` mati `EBUSY` di Windows saat tes berjalan (watcher memantau tmpdir konfigurasi Vitest)            | stack trace `FSWatcher … .vitest.config.ts.<pid>.<uuid>.tmpdir` di log job dev                         | DONE    | —                                                                             |
| B-03 | P2        | `pnpm format:check` gagal karena Prettier memindai `.superpowers/sdd/**` (di-ignore Git)                     | 4 berkas `[warn]` lalu `ELIFECYCLE`                                                                    | DONE    | —                                                                             |
| B-04 | P2        | Kunci i18n mati `home.directSource` tertinggal setelah commit `6a85347`                                      | tes penjaga i18n: `id has keys no component uses`                                                      | DONE    | —                                                                             |
| B-05 | P1        | Beranda cold-start: konten Sauh 2,0 s + ilustrasi PNG 692 KB → hero kosong ~7 s                              | konten BFF 1.994 ms/2.525 B; PNG 708.825 B (3,3 s langsung, 0,8 s lewat proxy)                         | NEXT    | Ukur ulang dengan cache hangat + SW aktif, lalu perkecil muatan hero          |
| B-06 | P2        | Tautan kembali `a.text-button` di Sauh/Suara hanya 18–20 px tinggi (di bawah minimum 24 px)                  | probe target-size: `a.text-button 55x18 "← Beranda"` di `/sauh`, `/suara`, detail Suara                | NEXT    | Perluas area klik tanpa menggeser layout; verifikasi keyboard/touch           |
| B-07 | —         | `span.bible-crossref-inline` 8×25 px ternyata **bukan** cacat (area klik 40×40 via `::before`)               | `apps/web/src/ui-hardening.css` aturan `.bible-crossref-inline::before`                                | CLOSED  | —                                                                             |
| B-08 | P2        | Tombol Google Identity Services setinggi 18 px di `/lainnya` (1440)                                          | probe: `div.nsm7Bb… 174x18 "Login dengan Google"`                                                      | TODO    | Cek apakah tinggi dibatasi container kita; kalau SDK, catat sebagai eksternal |
| B-09 | P3        | Alias route bahasa Indonesia tidak ada: `/alkitab` → 404, hanya `/bible`                                     | probe: `h1=Halaman tidak ditemukan` untuk `/alkitab`                                                   | TODO    | Pertimbangkan redirect `/alkitab` → `/bible`                                  |
| B-10 | P2        | Snapshot `offline/sauh.json` berhenti di 2026-09-28 (32 hari)                                                | item terbaru `sbj260928` pada `apps/web/public/offline/sauh.json`                                      | TODO    | Cek generator; tentukan apakah snapshot memang hanya 6 item                   |
| B-11 | BLOCKED   | Deploy Worker/akun nyata/signing/perangkat fisik                                                             | butuh kredensial & perangkat pemilik                                                                   | BLOCKED | Jangan diklaim; uji hanya yang lokal                                          |
| B-12 | P2        | Label "WhatsApp" terpotong 2 px di layar 320 px (tombol provider overflow)                                   | e2e `egys-v1` 320 px: `scrollWidth 74 > clientWidth 72`; probe mengukur `overflow: 2`                  | DONE    | — (ikon-saja ≤280 px container, aria-label tetap)                             |
| B-13 | P1        | Dua kontrak e2e e-GYS basi membuat suite merah di HEAD (geometri baris provider & badge akun bergantung env) | uji A/B: 7 gagal di HEAD; sesudah perbaikan 0 gagal                                                    | DONE    | —                                                                             |
| B-14 | P1        | Tracking WhatsApp hanya menerima satu bentuk field dan gagal senyap bila payload berbeda                     | parser lama: `message.refid === reference` + `mobilePhone` + `otp` saja; kini ada unit test 20 kasus   | DONE    | Pantau diagnosa `egys.whatsapp.tracking.event` pada percobaan pemilik         |
| B-15 | P2        | Konfirmasi WhatsApp nyata belum terbukti; kegagalan tidak terlihat di UI                                     | 2.4: semua langkah sebelum pesan nyata PASS; Diagnostik kini mencatat frame & field yang tidak lengkap | NEXT    | Minta pemilik mengirim pesan lalu membaca entri `egys.whatsapp.*`             |
| B-16 | P2        | Apple belum diuji sampai kredensial                                                                          | popup resmi Apple tampil; langkah kredensial butuh Apple ID                                            | BLOCKED | Uji di origin terdaftar dengan akun nyata                                     |

## 4. Log siklus

```text
Cycle: 1 | 2026-10-30 09:32–10:05 WIB | main @ 37ffbd0
Issue & priority: gate tes lokal merah (P1), dev server mati saat tes (P1),
  format gate salah gagal (P2), kunci i18n mati (P2).
Reproduction / baseline:
  - `pnpm test` → 6 gagal; `apps/web/.env.local` berisi VITE_BFF_BASE_URL
    (milik pemilik, 2026-08-18), sehingga tes "Worker absen", jalur gambar
    proxy dan sumber MIDI raw-CDN tidak deterministik.
  - `pnpm dev` + `npx vitest run` → dev server exit 1 dengan EBUSY pada
    `.vitest.config.ts.15164.…tmpdir/vitest.config.ts.tmp`.
  - `pnpm format:check` → 4 berkas `.superpowers/sdd/**` (di-ignore Git oleh
    `.superpowers/sdd/.gitignore` berisi `*`).
  - tes i18n → `home.directSource` tidak dipakai komponen mana pun.
Root cause: (a) tes unit mewarisi env deployment lokal; (b) watcher dev
  memantau direktori sementara Vitest; (c) .prettierignore tidak memuat
  workspace lokal yang meng-ignore dirinya; (d) sisa kunci setelah commit
  "drop the Sauh eyebrow".
File dan perubahan:
  apps/web/vitest.config.ts       — pin env VITE_* ke kosong untuk tes unit.
  apps/web/vite.config.ts         — server.watch.ignored: ["**/*.tmpdir/**"].
  apps/web/src/i18n.ts            — hapus home.directSource (id/en/zh).
  .prettierignore                 — tambah .superpowers/.
Verifikasi: PASS — `pnpm typecheck`, `pnpm test` (web 491 + paket lain),
  `pnpm build`, `pnpm verify:bundle` (172,0/180 KiB), `pnpm verify:generated`,
  `pnpm verify:docs`, `pnpm format:check`. Dev server tetap HTTP 200 setelah
  tes penuh dijalankan bersamaan.
UX dan performa sebelum -> sesudah: tidak ada perubahan UI; initial JS tetap
  172,0 KiB; dev server tidak lagi mati saat pengujian.
Screenshot/log/commit/PR: commit 2d0b226; log di D:\GYSApp-audit\*.log.
Risiko/regresi, blocker, rollback: perubahan konfigurasi saja; rollback =
  kembalikan 4 berkas.
Status: DONE
NEXT: audit login e-GYS (permintaan pemilik) + perbaiki kontrak e2e e-GYS.
```

```text
Cycle: 2 | 2026-10-30 10:05–10:20 WIB | codex/autonomous-hardening-20261030
Issue & priority: login WhatsApp dilaporkan masih gagal (P1, permintaan
  pemilik) dan Apple belum terbukti; suite e2e e-GYS merah di HEAD (P1).
Reproduction / baseline:
  - Klik WhatsApp di preview produksi: start 200, popup wa.me, WS track
    terbuka dan menerima `connected` + `info`; badge hitung mundur berjalan.
  - `egys-v1.spec.ts` di HEAD: 8 gagal / 20 (6 viewport geometri baris
    provider, 1 badge akun, 1 alur WhatsApp). Uji A/B dengan komponen HEAD
    membuktikan kegagalan bukan berasal dari perubahan sesi ini.
  - 320 px: tombol "WhatsApp" overflow 2 px (scrollWidth 74 vs clientWidth 72).
  - Badge akun gagal karena tes tidak menyatakan precondition sesi: aplikasi
    menerima 401 dari Worker lokal lalu (benar) menghapus profil cache.
  - Geometri baris provider: kartu `.egys-login-box` kini punya padding 14 px
    + border, jadi asersi lama (border box) tidak lagi menggambarkan desain.
Root cause: (a) parser tracking hanya menerima satu varian nama field dan tidak
  meninggalkan jejak saat payload tidak lengkap; (b) dua asersi e2e mengunci
  geometri/env lama; (c) label provider tidak muat di 320 px.
File dan perubahan:
  apps/web/src/egys-whatsapp-tracking.ts (+ .test.ts) — normalisasi refid
    string/angka, alias otp/sender, validasi tetap ketat, 20 unit test.
  apps/web/src/egys-whatsapp.tsx — pakai parser; diagnosa
    egys.whatsapp.start/tracking/tracking.error/tracking.event/tracking.confirm;
    kode dan alasan penutupan socket dicatat.
  apps/web/e2e/egys-v1.spec.ts — bandingkan lebar content-box kartu; nyatakan
    precondition profil lewat route /api/v1/account/profile.
  apps/web/src/styles/02-bible-and-settings.css — @container ≤280px: label
    provider ikon-saja agar tidak terpotong (aria-label tetap).
Verifikasi: PASS — `pnpm typecheck`; `npx vitest run` untuk
  `egys-whatsapp-tracking` + `egys` (22 tes); `pnpm build`;
  `pnpm verify:bundle` 172,0 KiB / 180 KiB; `GYS_E2E_PREBUILT=1
  pnpm test:e2e egys-v1.spec.ts --workers=2 --retries=0` → 20/20 lulus.
UX dan performa sebelum -> sesudah: label provider tidak lagi terpotong di
  320 px; tidak ada perubahan ukuran bundle; tidak ada perubahan alur sukses.
Screenshot/log/commit/PR: D:\GYSApp-audit\e2e-egys3.log,
  out9/wa-click.png, out11/provider-320.png, out12/apple-popup.png.
Risiko/regresi, blocker, rollback: parser hanya menerima lebih banyak bentuk
  field, validasi referensi/kode/nomor tetap; konfirmasi nyata tetap BLOCKED.
  Rollback = kembalikan 5 berkas.
Status: DONE (dengan B-15/B-16 tetap terbuka)
NEXT: B-05 (hero Beranda) atau B-06 (target sentuh tautan kembali), lalu
  jalankan `pnpm test:e2e:smoke` pada build final.
```

## 5. Risiko dan batasan bukti

- Angka latensi berasal dari satu jaringan rumah, bukan CI. Jangan membandingkannya
  dengan audit 2026-10-11 tanpa metode identik.
- Service worker diblokir pada probe UI sehingga cache offline tidak diuji di sesi
  ini. Semua klaim offline perlu tes tersendiri (`runtime-health.spec.ts`,
  `service-worker-upgrade.spec.ts`).
- Worker hosted adalah artefak terpisah: hasil 2.4 adalah performa dan perilaku
  deployment saat ini, bukan kode repo ini. Perubahan `apps/bff` **belum** dideploy.
- `apps/web/.env.local` adalah konfigurasi lokal pemilik (2026-08-18). Perbaikan
  B-01 menyesuaikan tes, bukan menghapus konfigurasi tersebut.
- Konfirmasi WhatsApp dan langkah kredensial Apple tidak dapat dijalankan tanpa
  ponsel/akun pemilik. Jangan menandainya selesai.
- e2e hanya `egys-v1.spec.ts` yang dijalankan di sesi ini. Suite penuh, visual,
  dan performance **NOT RUN**.

## 6. NEXT yang dapat langsung dikerjakan

1. **B-15** — Minta pemilik menekan WhatsApp, mengirim pesan yang disiapkan, lalu
   membuka Diagnostik: entri `egys.whatsapp.*` menunjukkan apakah frame tracking
   datang dan field mana yang kurang. Tanpa data ini, penyebab tidak boleh diklaim.
2. **B-05** — Ukur hero Beranda dengan cache hangat + service worker aktif,
   bandingkan dengan cold start, lalu putuskan apakah 692 KB perlu diganti varian
   pratinjau atau prioritas fetch diturunkan.
3. **B-06** — Perluas area klik tautan kembali Sauh/Suara minimal 40 px tanpa
   menggeser layout yang sudah diuji.
4. **B-08/B-09/B-10** — Verifikasi tinggi tombol Google, alias `/alkitab`, dan
   kesegaran snapshot Sauh sebelum menyentuh kode.
5. Jalankan `pnpm test:e2e:smoke` dan `pnpm test:e2e:changed` pada build final
   sebelum mengubah baseline visual.
