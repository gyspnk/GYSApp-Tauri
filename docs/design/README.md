# Desain dari OpenDesign

Folder ini menyimpan ekspor **satu file** dari proyek OpenDesign supaya desainnya
ikut pindah mesin bersama repo (tanpa perlu daemon OpenDesign yang sama).

| File | Proyek OpenDesign | Isi |
| --- | --- | --- |
| `gysapp-motion-system-f189/index.html` | `gysapp-motion-system-f189` | Sistem gerak: token durasi/easing, lima prinsip, six before/after demo, resep CSS siap tempel, daftar “jangan dianimasikan”. |
| `gysapp-ui-loop/index.html` | `gysapp-ui-loop` | Desain Beranda: “Saat ini” vs “Usulan” 390/1440, empat tema, 12 usulan beralasan. |
| `gysapp-ui-system/index.html` | `gysapp-ui-system` | **Sistem UI lengkap**: fondasi (tema + kontras, skala tipe 13 langkah, spacing 2 px, radius 6–999, elevasi, ikon, gerak), 20 komponen dengan 5 keadaan, 21 bingkai permukaan 390/1440, dan checklist implementasi. |

Cara membuka: buka file `index.html` di browser (tanpa build, tanpa server).
Semua halaman punya pengalih tema dan tombol reduced-motion sendiri.

Cara memperbarui: jalankan OpenDesign seperti biasa, lalu salin ulang
`index.html` proyek terkait ke folder ini dan perbarui tabel di atas serta
`docs/plans/opendesign-ui-loop.md`.

Catatan: file HTML ini **hanya dokumentasi desain**, tidak ikut build aplikasi
(`apps/web` tidak mengimpornya), jadi tidak menambah bundle.
