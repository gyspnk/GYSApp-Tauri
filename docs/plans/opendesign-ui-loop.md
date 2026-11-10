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
