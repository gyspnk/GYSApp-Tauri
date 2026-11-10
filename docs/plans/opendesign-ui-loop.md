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
