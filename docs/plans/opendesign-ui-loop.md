# Loop desain UI OpenDesign

Pemilik (10 Nov): **seluruh desain UI** dipegang OpenDesign dan diperbaiki terus-menerus di dalam workflow otonom ini, bukan hanya animasi. Setiap putaran mengambil satu permukaan dari rotasi di bawah, menjalankan OpenDesign, menerapkan hasilnya, memverifikasi hosted, lalu mencatatnya di sini.

## Aturan

- Satu permukaan per putaran (boleh lebih bila run-nya cepat).
- Desain harus mengikuti sistem yang sudah ada: radius 6/8/10/12/16/24/999, 13 langkah tipe, spacing 2 px, empat tema (light/dark/sepia/amoled), token gerak 120/180/260 ms, target 44 px, kontras ≥ 4,5:1, `prefers-reduced-motion`.
- Tidak menambah font/aset baru tanpa ukur; tanpa menambah bundle tanpa alasan.
- Bukti: screenshot QA hosted (320/390/768/1440, empat tema) + spec Actions; baseline adopsi hanya dari artefak CI.
- Setelah putaran penuh (delapan permukaan), rotasi diulang dengan fokus yang lebih halus.

## Rotasi dan status

| #   | Permukaan                                                   | Status                | Run OpenDesign        | Bukti                                       |
| --- | ----------------------------------------------------------- | --------------------- | --------------------- | ------------------------------------------- |
| 1   | Beranda (hero Sauh, aksi cepat, ayat, rak literatur, suara) | berjalan              | `ui-loop` run beranda | —                                           |
| 2   | Kidung (katalog + pembaca + dock MIDI)                      | sebagian              | —                     | —                                           |
| 3   | Alkitab (pemilih kitab, pembaca, catatan)                   | sebagian (03, 05, 06) | —                     | —                                           |
| 4   | Iman (teks, PDF, tindakan)                                  | artefak tidak cocok   | —                     | lihat catatan “Iman — artefak tidak cocok”  |
| 5   | Literatur (hero, rak terbaru, dua kolom, pembaca)           | belum                 | —                     | —                                           |
| 6   | Suara (hero, rak kartu, pembaca)                            | belum                 | —                     | —                                           |
| 7   | Lainnya/pengaturan (kategori, baris, dialog)                | sebagian (02, 06, 08) | `60a5d60`             | `apps/web/e2e/more-settings-groups.spec.ts` |
| 8   | Dialog/sheet bersama (pemilih, popover, panel)              | belum                 | —                     | —                                           |

## Catatan

- Sistem gerak: `gysapp-motion-system-f189` (artefak `index.html`, pratinjau `http://127.0.0.1:7456/api/projects/gysapp-motion-system-f189/raw/index.html`), sudah diterapkan sebagian (token, baris katalog, rak Suara, umpan balik tekan, menu).
- Putaran 224: menunggu run desain Beranda.

## Beranda — hasil desain putaran 224

Pratinjau: `http://127.0.0.1:7456/api/projects/gysapp-ui-loop/raw/index.html` (dua bingkai 390 px dan dua bingkai 1440 px: “Saat ini” vs “Usulan”, empat tema, saklar kurangi gerak, anotasi gerak, panel 12 perubahan).

Dua belas usulan yang akan diterapkan bertahap:

1. Hierarki tiga lapis: sapaan kecil, judul serif besar, baru isi.
2. Ritme jarak 32–40 px antar bagian, 10–18 px dalam kartu; bingkai hanya saat memisahkan.
3. Sauh menjadi satu-satunya hero (bayangan + media lebar), bagian lain turun satu tingkat.
4. Tiga aksi cepat tanpa bingkai: ikon dalam lingkaran tipis + label + kata kerja kecil.
5. Panel ayat dibalik menjadi permukaan gelap untuk jeda visual (kontras tetap ≥4,5:1).
6. Rak literatur tanpa panel berbingkai; sampul 2:3 dengan intipan tepi mengundang geser.
7. Sampul punya wajah: judul dan penulis di bawah sampul.
8. Suara Sejati 16:9 dengan tombol putar dan durasi menempel di media.
9. Serif untuk judul/ayat, sans untuk navigasi/tombol/meta.
10. Topbar ponsel dua baris: merek + alat, lalu pencarian penuh; target ≥44 px.
11. Navigasi mengikuti lebar: bottom-nav lima item di ponsel, sidebar lega di desktop.
12. Gerak hanya untuk menjelaskan: hover/tekan 120 ms, fokus/tema 180 ms, kartu masuk 260 ms dengan stagger 40 ms.

Yang sengaja tidak diubah: lima tujuan navigasi dan urutannya, empat tema dan token, struktur konten, bahasa, target 44 px, tanpa fitur baru.
Risiko: metrik serif berbeda per perangkat (uji fallback), bingkai desktop berskala, dan penerapan bertahap harus menjaga baseline CI tetap stabil.

### Implementasi batch 1 (putaran 225)

- **Aksi cepat jadi “pintu” tenang** (`6fb4c9e`): tiga kartu berbingkai diganti ikon dalam lingkaran tipis + label di bawahnya; target tetap ≥44 px (lingkaran 44 px), fokus/tekan memakai `--motion-fast`, dan tidak ada kotak yang bersaing dengan konten. Di 1440 pintu-pintu diletakkan di bawah judul (`68cf4be`), bukan di pojok kanan atas.
- **Hierarki judul dan ritme** (`8154186`, koreksi `dc09c7a`): `h1` beranda memakai `clamp(1.75rem, 5.4vw, 2.25rem)` dengan line-height 1.05 dan tracking −0,02em; jarak antar bagian 32 px di desktop (22 px di ponsel) dan padding atas **28 px** — percobaan 26 px ditolak `spacing-scale.test.ts` karena nilai di atas 24 px harus kelipatan 4.
- **Baseline** `home-390`, `home-768`, `home-1440` diperbarui dari artefak full sweep `42775595640` (semua job hijau) — bukan dari mesin lokal.
- Bukti QA: `42772803521`, `42773760076`, `42774784985` (390/1440, terang/gelap).
- **Kontrak Sauh diperbaiki** (`26fb347`): `ui-polish.spec.ts` menuntut media
  setinggi panel di semua lebar, padahal dari 720 px media memang absolut dan
  di bawahnya pita tipis; sekarang diukur per breakpoint. Seleksi e2e untuk
  `app-design.css` juga ikut memilih `ui-polish` dan `home-resilience`.
- **Rak literatur jadi baris sampul** (`cc721f9`): kartu literatur berhenti jadi kartu berbingkai 190 px; sampul 2:3 di alur normal, judul tiga baris di bawahnya, sampul berikutnya mengintip di tepi kanan, dan tidak ada scrim/blur karena teks tidak lagi menumpuk di atas gambar. Kontraknya di `apps/web/e2e/ui-polish.spec.ts` "home literature covers stand at 2:3 with the title underneath" (rasio ±4%, tanpa border, judul di bawah sampul, sampul kedua di dalam 390 px).
- Sisa batch dan alasannya:
  - **Panel ayat jadi permukaan gelap** — belum: panel itu butuh empat token per tema (`--verse-bg`, `--verse-ink`, `--verse-line`, `--verse-accent`) supaya tema gelap/amoled tidak jatuh di bawah 4,5:1. Token hidup di `apps/web/src/styles/00-tokens.css`, berkas yang sedang dipindahkan sesi editorial (`f1ed51e`, `docs/plans/2026-11-10-editorial-redesign.md`); menambah token di sana sekarang akan bertabrakan. Dikerjakan setelah palet editorial mendarat.
  - **Tombol putar + durasi di kartu Suara** — ditolak: `packages/contracts/src/index.ts:312-321` (`SuaraSejatiPostSchema`) hanya punya id/title/excerpt/url/imageUrl/publishedAt/source. Tidak ada audio maupun durasi, jadi tombol putar akan berbohong. Butuh data baru dulu, bukan CSS.
  - **Kartu Suara 16:9** — belum: tanpa media yang bisa diputar, memotong foto kesaksian ke 16:9 hanya memperkecil gambarnya. Tunggu data audio.
  - **“Sampul punya wajah: judul dan penulis”** — sebagian: judul sudah di bawah sampul sejak batch 1; tidak ada bidang penulis di `apps/web/public/offline/literature.json` (hanya category/title/publishedAt/source), jadi yang ditampilkan tetap kategori + tanggal.

## Literatur (rotasi berikutnya)

Sistem UI (`gysapp-ui-system`, bagian “Literatur · usulan perubahan”, 7 butir).
Status per 10 Nov:

| #   | Usulan                                          | Status                                                                       |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| 01  | Sampul tipografis, bukan thumbnail gambar       | sudah: `.literature-cover` bertipografi; gambar hanya bila `imageUrl` ada    |
| 02  | Satu baris memuat jenis, halaman, ukuran berkas | sebagian: jenis + tanggal ada; halaman/ukuran tidak ada di `literature.json` |
| 03  | Status “Tersimpan” sebagai badge berteks        | belum: belum ada konsep “tersimpan” di data, hanya `progress`                |
| 04  | Aksi unduh jadi ikon 44 px di ujung baris       | belum: unduhan PDF terjadi di pembaca, bukan di baris                        |
| 05  | Filter jenis memakai chip                       | **diterapkan** `c1b044d` — chip 44 px menggantikan dropdown kategori         |
| 06  | Sisa ruang penyimpanan sebagai hint             | belum: butuh `navigator.storage.estimate()` dan tidak ada teks resmi         |
| 07  | Katalog desktop jadi grid tiga kolom            | **diterapkan** `c1b044d` — 3 kolom di ≥1200 px, 2 kolom di 1100–1199 px      |

Kontrak: `apps/web/e2e/literature-catalog.spec.ts` (chip 44 px + `aria-pressed`,
tiga kolom terukur pada 1440 px). Bukti hosted: `42848919162` (verify, unit,
e2e-selective hijau) dan Pages `42848919268`. Gerbang `accessibility.spec.ts`
ikut diperbarui: dulu ia menuntut `combobox` bernama “Category”/“分类”, kini
grup chip dengan status `aria-pressed`. Butir 02/03/04/06 menunggu data, bukan CSS.

## Lainnya (rotasi berikutnya)

Artefak: `docs/design/gysapp-ui-system/index.html` bagian "Lainnya & pengaturan"
dan "Lainnya · usulan perubahan" (8 butir).

| Butir                                                      | Status                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 01 Profil dipisah dari daftar pengaturan                   | cocok — kartu akun adalah baris pertama, terpisah dari preferensi             |
| 02 Pengaturan dikelompokkan (Tampilan, Konten, Tentang)    | diterapkan — tiga judul grup di `more-settings-list`                          |
| 03 Setiap baris memuat judul, hint, dan nilai              | sebagian — judul + hint ada; nilai baru muncul setelah baris dibuka           |
| 04 Nilai rata kanan, chevron hanya bila ada layar lanjutan | sebagian — chevron benar (semua baris membuka isi); kolom nilai belum ada     |
| 05 "Keluar" diberi warna danger                            | cocok — `danger-button`                                                       |
| 06 Tinggi baris minimum 64 px                              | diterapkan — `.more-setting-section > .more-setting-row { min-height: 64px }` |
| 07 Versi aplikasi tampil sebagai nilai                     | terbuka — versi belum jadi nilai baris                                        |
| 08 Desktop dua kolom pengaturan                            | diterapkan — `min-width: 1200px` → dua kolom, judul grup merentang            |

Kontrak: `apps/web/e2e/more-settings-groups.spec.ts` (tiga judul grup, baris ≥64 px
di 390 px, dua kolom di 1440 px).

Butir 03/04/07 butuh satu sumber nilai per baris (tema, ukuran teks, gerak, bahasa,
jumlah unduhan, versi) supaya nilai tidak ditebak; itu pekerjaan terpisah agar
tidak menambah state baru tanpa pemilik.

## Iman — artefak tidak cocok dengan permukaan yang ada

`docs/design/gysapp-ui-system` bagian “Iman · usulan perubahan” menggambarkan
**renungan harian**: satu renungan utama bertanggal, daftar renungan dengan
durasi baca, ayat penutup, dan tautan arsip. Permukaan yang benar-benar dikirim
(`apps/web/src/faith.tsx`) adalah **Dasar Kepercayaan**: sepuluh pokok ajaran
bernomor, pencarian, catatan pribadi, aksi bagikan/salin, dan tombol PDF resmi
tjc.org per pokok.

Tujuh butir artefak itu karena itu tidak bisa diterapkan tanpa mengarang isi
renungan yang tidak ada di data. Keputusan putaran 3: **tidak diubah**; yang
dibutuhkan adalah run OpenDesign baru untuk permukaan Dasar Kepercayaan
(daftar pokok + pembaca PDF), bukan penerapan paksa artefak renungan. Sampai
run itu ada, rotasi lanjut supaya tidak memblokir pekerjaan lain.

## Alkitab (rotasi berikutnya)

Sistem UI (`gysapp-ui-system`, bagian “Alkitab · usulan perubahan”, 10 butir).
Status per 10 Nov:

| #   | Usulan                                                     | Status                                                                                         |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 01  | Versi tampil sebagai badge, bukan dropdown di tengah teks  | belum — menyentuh header pembaca dan memori versi                                              |
| 02  | Pemilih kitab dan pasal dibuka dari satu tombol yang jelas | sudah ada tombol `.picker-book-title`; grid baru menyusul                                      |
| 03  | Nomor ayat 12 px tabular, muted                            | **diterapkan** — `font-variant-numeric: tabular-nums` (ukuran 0,66 em dan `--muted` sudah ada) |
| 04  | Teks ayat serif 17–18 px, tinggi baris 1,72–1,75           | sudah sesuai (`--font-reading`, 1.125rem, 1,72)                                                |
| 05  | Lebar baca 60–68 karakter                                  | **diterapkan** — `max-width: 64ch` pada `.verse-content`                                       |
| 06  | Navigasi pasal di kaki teks, 44 px, dua arah               | **diterapkan** — `.bible-chapter-nav`, dua tombol 44 px, nonaktif di ujung kitab               |
| 07  | Pemilih grid kitab 3 kolom, pasal 6 kolom                  | belum — butuh rework `bible-picker.tsx` (814 baris) + kontraknya                               |
| 08  | Pencarian kitab di atas grid                               | belum — ikut rework pemilih                                                                    |
| 09  | Panel pemilih berdampingan di desktop                      | belum — ikut rework pemilih                                                                    |
| 10  | Keadaan aktif biru penuh + teks on-accent                  | perlu ukur kontras per tema sebelum menyentuh `is-selected`                                    |

Kontrak baru: `apps/web/e2e/bible-chapter-nav.spec.ts` — dua pintu 44 px, bolak-balik
antar pasal (judul berubah lalu kembali), tumpuk vertikal di 390 px, angka tabular,
dan lebar baris ≤ 66 `ch` di 1440 px.

## Indeks proyek OpenDesign (sumber desain resmi)

| Proyek                      | Isi                                                                                                                                                                                                                                        | Status                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `gysapp-motion-system-f189` | Sistem gerak: token 120/180/260, entrance 220, stagger 40, enam demo, resep CSS, daftar “jangan dianimasikan”                                                                                                                              | selesai, dipakai bertahap                           |
| `gysapp-ui-loop`            | Desain Beranda (“Saat ini” vs “Usulan”, 390 + 1440, empat tema) dengan 12 usulan                                                                                                                                                           | batch 1 diterapkan                                  |
| `gysapp-ui-system`          | **Sistem UI lengkap**: fondasi (tema, tipe, spacing, radius, elevasi, ikon, gerak), komponen + semua keadaan, dan seluruh permukaan (Beranda, Kidung katalog & pembaca, Alkitab, Iman, Literatur, Suara, Lainnya, dialog/sheet) 390 + 1440 | run produksi `3c4a1565-3be9-42e6-9b49-1dbfc3a75359` |

Aturan baru (goal revisi 66): permukaan yang belum punya artefak di `gysapp-ui-system` (atau proyek turunannya) **belum boleh diimplementasikan**; desain dulu, baru kode.

## Penerapan dari sistem UI

Sistem UI (`gysapp-ui-system`) memberi 8 usulan untuk Beranda. Status:

| #   | Usulan                                         | Status                                                                                         |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 01  | Satu kartu renungan, satu aksi “Baca renungan” | belum — perubahan struktur                                                                     |
| 02  | Judul layar pindah ke baris kedua top bar      | belum — menyentuh shell + kontrak topbar                                                       |
| 03  | Ayat harian jadi blok sendiri                  | belum — perubahan struktur                                                                     |
| 04  | “Lihat semua” jadi tombol quiet 44 px          | **diterapkan** `24b410d` (QA `42796811391`)                                                    |
| 05  | Metadata 12–13 px muted                        | sudah sesuai (`.date-line` 12 px, `--muted`)                                                   |
| 06  | Satu keluarga ikon 18/16                       | sudah sesuai (token `--icon-*`)                                                                |
| 07  | Jarak antarbagian 24 px                        | sebagian: beranda memakai 32 px dari desain `gysapp-ui-loop`; perlu keputusan mana yang menang |
| 08  | Kartu hairline + shadow-xs                     | belum — perlu ukur dampak visual                                                               |

Catatan: dua dokumen OpenDesign sempat berbeda soal ritme (32 px vs 24 px). Keputusan sementara: pertahankan 32 px di beranda sampai sistem UI dipakai untuk mengukur ulang, karena baseline sudah memakai 32 px dan mengganti angka hanya menambah churn tanpa bukti lebih baik.

## Kidung (rotasi berikutnya)

Sistem UI (`gysapp-ui-system`, bagian “Kidung · usulan perubahan”, 12 butir). Status:

| #   | Usulan                                                            | Status                                                                                    |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3   | Nomor kidung memakai angka tabular berlebar tetap                 | **diterapkan** `6436e25` — `font-variant-numeric: tabular-nums`                           |
| 4   | Tinggi baris minimum 64 px, enam baris per layar                  | **diterapkan** `6436e25` — baris 60 → 64 px; QA `42800227937` menampilkan 10 baris di 390 |
| 1   | Pencarian selalu terlihat, bukan di balik ikon                    | **diterapkan** `33e15aa`                                                                  |
| 2   | Kategori jadi chip 44 px, bukan dropdown                          | **diterapkan** `3d46f1b` — chip 44 px, satu koleksi tetap jadi satu chip                  |
| 5   | Teks kidung 17 px serif, tinggi baris 1,75, ukuran 34–40 karakter | perlu ukur dulu di pembaca (autofit)                                                      |
| 6   | Bait dipisah ruang 20 px tanpa garis                              | perlu cek markup bait                                                                     |
| 7   | Tombol sebelumnya/berikutnya 44 px di kedua ujung                 | sudah 44 px, perlu verifikasi posisi                                                      |
| 8   | Pemutar audio turun ke dock                                       | sudah: dock bawaan                                                                        |
| 9   | Katalog dan pembaca berdampingan di desktop                       | **diterapkan** `2e6af9c` — rail indeks 280–340 px menempel di kiri pembaca (≥1200 px)     |
| 10  | Penanda “Baru” sebagai badge                                      | belum ada konsep “baru” di data                                                           |

### Kidung — status penerapan (10 Nov, putaran 228)

| #   | Usulan                                                       | Status                                                                                                                          |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pencarian selalu terlihat di ponsel                          | **diterapkan** `33e15aa` — baris pencarian 48 px di bawah kontrol                                                               |
| 2   | Kategori sebagai chip 44 px                                  | **diterapkan** `3d46f1b`; kontrak tes ikut pindah `47f36c1`, `7581b52`                                                          |
| 3   | Nomor lagu angka tabular                                     | diterapkan `6436e25`                                                                                                            |
| 4   | Baris ≥64 px                                                 | diterapkan `6436e25`                                                                                                            |
| 5   | Pembaca 17 px serif, line-height 1.75, ukuran 34–40 karakter | **sebagian** `9ec2139` — line-height 1.75; ukuran 17 px sudah ada, takaran 34–40 karakter sudah terpenuhi di 390 (≈35 karakter) |
| 6   | Bait dipisah 20 px tanpa garis                               | diterapkan `9ec2139`                                                                                                            |
| 7   | Tombol sebelumnya/berikutnya 44 px di kedua ujung            | sudah ada                                                                                                                       |
| 8   | Audio di dock                                                | sudah ada                                                                                                                       |
| 9   | Katalog + pembaca berdampingan di desktop                    | **diterapkan** `2e6af9c` — rail indeks `sticky`, baris 44 px, chip koleksi di atasnya                                           |
| 10  | “Baru” sebagai badge                                         | belum ada datanya                                                                                                               |

Catatan: kontrak `kidung-usability` yang membandingkan metrik judul sebelum/sesudah `document.fonts.ready` disesuaikan (`b28287e`) — baris pencarian baru membuat baris katalog pertama jatuh di bawah lipatan, sehingga sampel “sebelum” bisa terambil saat font masih bertukar. Kontrak yang dijaga sekarang: setelah font siap, judul tidak bergeser lagi.
