# Sistem editorial — sumber implementasi

- Proyek aplikasi desain: `gysapp-editorial-production-d365`.
- Run: `1c61c4d0-75c4-4b65-8566-33914d9bed20`, succeeded.
- Workflow: `example-web-prototype-taste-editorial`, Local Codex.
- `index.html` dan `design-spec.md` diekspor tanpa perubahan dari get_artifact.

Desain dipakai sebagai arah visual, bukan pengganti fungsi aplikasi React.
Data SAMPLE, teks promosi baru, urutan navigasi yang berbeda, dan kontrol simulasi
tidak disalin ke produk. Navigasi produksi, pembaca PDF, MIDI, backup, akun dan
offline tetap menggunakan data serta layanan yang sudah ada. Font produksi yang
dibundel dipertahankan. Palet OKLCH dikonversi ke sRGB untuk konsistensi native.

Pemeriksaan render, keyboard, zoom dan kontras dilakukan melalui Actions. Status
run desain succeeded sendiri tidak membuktikan kualitas atau aksesibilitas.

## Ledger implementasi dan verifikasi

| Bagian | Perubahan | Bukti yang masih diperlukan |
| --- | --- | --- |
| Fondasi | Gading/hijau, empat tema, pilihan aksen tiga bahasa, tes kontras semantik | Unit hosted, axe, screenshot dan native |
| Shell dan kontrol | Sidebar/bottom nav berlabel, fokus dan sentuh, ritme editorial | Implementasi, perbandingan konsep dan QA hosted |
| Beranda | Sauh, panel ayat tenang, rak literatur 2:3, kartu Suara | Implementasi dan QA empat tema/breakpoint |
| Kidung | Pilihan koleksi 44 px, katalog/pembaca desktop, dock | Implementasi dan regresi fungsi/media |
| Alkitab/Iman | Bacaan serif, pemilih/catatan, PDF | Implementasi dan uji pembaca/aksesibilitas |
| Literatur/Suara | Rak dan pembaca publikasi | Implementasi dan uji navigasi/offline |
| Pengaturan/akun/dialog | Kelompok kontrol jelas, reflow | Implementasi dan uji backup/akun/dialog |

Baseline aplikasi sebelum perubahan: QA `42816530401`, empat tema dan empat
lebar, screenshot sudah diunduh. Belum ada klaim kesetiaan visual hasil akhir.
