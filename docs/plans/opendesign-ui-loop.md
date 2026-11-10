# Loop desain UI OpenDesign

Pemilik (10 Nov): **seluruh desain UI** dipegang OpenDesign dan diperbaiki terus-menerus di dalam workflow otonom ini, bukan hanya animasi. Setiap putaran mengambil satu permukaan dari rotasi di bawah, menjalankan OpenDesign, menerapkan hasilnya, memverifikasi hosted, lalu mencatatnya di sini.

## Aturan

- Satu permukaan per putaran (boleh lebih bila run-nya cepat).
- Desain harus mengikuti sistem yang sudah ada: radius 6/8/10/12/16/24/999, 13 langkah tipe, spacing 2 px, empat tema (light/dark/sepia/amoled), token gerak 120/180/260 ms, target 44 px, kontras ≥ 4,5:1, `prefers-reduced-motion`.
- Tidak menambah font/aset baru tanpa ukur; tanpa menambah bundle tanpa alasan.
- Bukti: screenshot QA hosted (320/390/768/1440, empat tema) + spec Actions; baseline adopsi hanya dari artefak CI.
- Setelah putaran penuh (delapan permukaan), rotasi diulang dengan fokus yang lebih halus.

## Rotasi dan status

| #   | Permukaan                                                   | Status   | Run OpenDesign        | Bukti |
| --- | ----------------------------------------------------------- | -------- | --------------------- | ----- |
| 1   | Beranda (hero Sauh, aksi cepat, ayat, rak literatur, suara) | berjalan | `ui-loop` run beranda | —     |
| 2   | Kidung (katalog + pembaca + dock MIDI)                      | belum    | —                     | —     |
| 3   | Alkitab (pemilih kitab, pembaca, catatan)                   | belum    | —                     | —     |
| 4   | Iman (teks, PDF, tindakan)                                  | belum    | —                     | —     |
| 5   | Literatur (hero, rak terbaru, dua kolom, pembaca)           | belum    | —                     | —     |
| 6   | Suara (hero, rak kartu, pembaca)                            | belum    | —                     | —     |
| 7   | Lainnya/pengaturan (kategori, baris, dialog)                | belum    | —                     | —     |
| 8   | Dialog/sheet bersama (pemilih, popover, panel)              | belum    | —                     | —     |

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
- Sisa batch: panel ayat dibalik jadi permukaan gelap, rak literatur tanpa wadah dengan sampul 2:3, dan kartu Suara 16:9 dengan tombol putar di media.

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
| 1   | Pencarian selalu terlihat, bukan di balik ikon                    | belum — perlu baris pencarian penuh di ponsel                                             |
| 2   | Kategori jadi chip 44 px, bukan dropdown                          | belum — menyentuh toolbar yang baru dirapikan                                             |
| 5   | Teks kidung 17 px serif, tinggi baris 1,75, ukuran 34–40 karakter | perlu ukur dulu di pembaca (autofit)                                                      |
| 6   | Bait dipisah ruang 20 px tanpa garis                              | perlu cek markup bait                                                                     |
| 7   | Tombol sebelumnya/berikutnya 44 px di kedua ujung                 | sudah 44 px, perlu verifikasi posisi                                                      |
| 8   | Pemutar audio turun ke dock                                       | sudah: dock bawaan                                                                        |
| 9   | Katalog dan pembaca berdampingan di desktop                       | belum — perubahan struktur besar                                                          |
| 10  | Penanda “Baru” sebagai badge                                      | belum ada konsep “baru” di data                                                           |
