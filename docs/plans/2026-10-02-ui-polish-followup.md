# PR #9 — audit dan perbaikan UI lanjutan

> Historical plan/audit/receipt. Its dates, measurements and acceptance scope
> remain attached to the original revision. Current behavior and outstanding
> delivery gates were reviewed on 2026-10-07; use the [documentation index](../README.md)
> and [current feature matrix](../discovery/feature-parity-matrix.md) for the present implementation.

Tanggal: 2 Oktober 2026. Basis kerja: PR #9, branch
`codex/gysapp-loading-debug-efficiency`, commit `8d81e6e`.
Main ditarik dengan fast-forward sebelum berpindah ke branch PR. Screenshot
lokal yang sudah ada sebelum pekerjaan tetap dipertahankan.

## Cakupan evaluasi

Audit mencakup shell/navigasi, Beranda, Alkitab dan pencarian/catatan,
Kidung (katalog, lirik, PDF, playlist, pengaturan), Dasar Kepercayaan dan
overlay PDF, Literatur dan pembaca langsung, Suara, Sauh, serta Lainnya
dengan pengaturan terbuka. Screenshot baru mencakup 11 permukaan pada
390 dan 1440px; matriks visual yang sudah tersedia mencakup 320–1920px.
Uji interaksi juga meliputi bahasa ID/EN/ZH, tema, pembesaran teks 200%,
keyboard/fokus, offline, media persisten, dan siklus hidup PDF.

| Temuan                                                                                   | Perbaikan                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Preview renungan gagal meninggalkan bidang gambar besar dan kosong                       | Fallback menjadi label 72px; tombol baca tetap tersedia                          |
| Caption Suara mewarisi lapisan buram, selector judul lama tidak mengenai elemen `strong` | Caption bersih dan tipografi mengikuti UI                                        |
| Heading dan kontrol katalog Kidung kurang sejajar                                        | Kontrol rata bawah, padding heading seluler dan ukuran judul konsisten           |
| Panel pengaturan Kidung desktop memanjang mengikuti panel tertinggi                      | Grid meratakan panel ke atas sesuai tinggi kontennya                             |
| Filter Literatur seluler terlalu panjang dan judul pilihan terpotong                     | Pencarian satu baris penuh, kategori/urutan berdampingan, judul dapat membungkus |
| Animasi route meninggalkan transform pada induk dialog fixed                             | Navigasi memakai fade tanpa transform sehingga backdrop menutup viewport         |
| Disclosure dan menu pengaturan belum memiliki transisi konsisten                         | Transisi disclosure native CSS dan fade menu, tanpa dependensi baru              |
| Reduced motion tidak menjangkau seluruh animasi feature                                  | Kebijakan CSS bersama mematikan animasi, transisi, dan smooth scroll             |

Ruang pembaca lirik yang sengaja memenuhi viewport tetap digunakan untuk
bernyanyi; artwork yang tidak tersedia tetap ditampilkan sebagai fallback,
tanpa membuat sampul tiruan. Menu pengaturan dibuka secara manual pada build
akhir untuk memastikan disclosure tidak memotong menu tema.

Run lengkap juga menemukan scale animasi dialog masuk yang mengecilkan target
tombol tutup di bawah 44px. Keyframe bersama kini memakai slide/fade tanpa
scale. Regresi baru membekukan frame awal dan mengukur ukuran target serta
memeriksa Escape dan pemulihan fokus.

## Bukti visual

Inventaris motion mencakup navigasi/fade halaman, portal Beranda, hover/fokus
kontrol, selector dan drawer, toolbar/catatan/toast Alkitab, pergantian bait
Kidung, player persisten, overlay/scroll PDF, serta indikator loading gambar
dan konten. Motion yang sudah ada dipertahankan; disclosure dan menu pengaturan
dilengkapi. Pemindaian kode memastikan satu penggunaan Web Animations API pada
media surface sudah memeriksa reduced motion, begitu juga scroll PDF.
Kebijakan CSS bersama mencakup keyframe feature yang sebelumnya luput dari
aturan reduced motion lokal.

Screenshot berikut berasal dari build produksi lokal dengan fixture deterministik.

| Permukaan | Seluler                                                 | Desktop                                                   |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Beranda   | [390px](../ui/2026-10-02-polish/home-390x900.png)       | [1440px](../ui/2026-10-02-polish/home-1440x900.png)       |
| Literatur | [390px](../ui/2026-10-02-polish/literature-390x844.png) | [1440px](../ui/2026-10-02-polish/literature-1440x900.png) |

## Verifikasi

[Pengaturan Kidung desktop](../ui/2026-10-02-polish/kidung-settings-1440x900.png)
menunjukkan panel mengikuti tinggi kontennya, tanpa kolom kosong yang dipanjangkan.

- Typecheck, lint, unit/policy/script tests, dan production build lulus.
  Unit web: 363; contracts: 17; domain: 33; testkit: 2; BFF: 51.
- Bundle awal tetap 177.2 KiB gzip, di bawah batas 180 KiB.
- Generated provenance dan native assets lulus; 22 aset native,
  32,607,926 byte. Pemeriksaan aset bukan eksekusi aplikasi Tauri.
- Regresi baru menguji fallback gambar pada empat lebar, posisi dialog fixed
  dengan animasi aktif, reduced motion, overflow, dan page errors.
- Run awal lengkap: 448 lulus, 3 skip, 57 gagal. Satu assertion lama
  membandingkan sisi atas kontrol Kidung; sekarang menguji alignment bawah
  yang disengaja. Sebanyak 56 lainnya adalah perbandingan screenshot Windows
  yang tertinggal dari desain PR #9, termasuk permukaan yang tidak diubah
  oleh pekerjaan ini. Gambar actual/expected/diff ditinjau sebelum baseline
  Windows diperbarui; threshold pixel dan baseline Linux tetap sama.
- Regenerasi dan pemeriksaan visual: 57/57 lulus. Run lengkap kedua tanpa
  retries: 504 lulus, 3 skip, satu gagal karena target dialog yang menyusut
  selama animasi masuk (43.9604px). Scale dihapus dari keyframe bersama,
  tanpa melonggarkan ambang 44px. Pada build final, seluruh 97 pemeriksaan
  ulang lulus tanpa retry: ui-elements, ui-polish, accessibility,
  reading-family-usability, visual, dan visual-reading. Regresi frame awal
  membuktikan target tetap 44px selama animasi. Suite lengkap tidak diulang
  ketiga kali; pemeriksaan ulang mencakup perubahan keyframe terakhir.
- Tiga skip berasal dari integrasi unduhan Bible yang membutuhkan BFF
  terkonfigurasi pada preview statis; bukan kegagalan yang disembunyikan.
- Preview final menerima HTTP 200 dan merender Beranda dengan konten nyata:
  `http://127.0.0.1:5173/GYSApp-Tauri/`. Perubahan berada di working tree lokal;
  tidak ada push atau deployment pada pekerjaan ini.

Verifikasi ini berlaku untuk Chromium desktop Windows dengan viewport responsif.
Perangkat fisik, packaged Tauri, audio perangkat nyata, provider eksternal, dan
deployment tidak dibuktikan oleh audit browser ini.
