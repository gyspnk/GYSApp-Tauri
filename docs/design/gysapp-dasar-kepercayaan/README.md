# GYSApp — Iman / Dasar Kepercayaan

Buka `index.html` langsung di browser. Tidak ada build step, dependensi, font eksternal, atau aset gambar. CSS, JavaScript, dan dua dokumen contoh tertanam di satu file.

## Keputusan desain

- Dua contoh berdampingan: layar ponsel 390 × 844 dan desktop 1440 × 900. Bingkai diperkecil bersama untuk menyesuaikan lebar jendela; ukuran dokumen di dalamnya tetap. Gulir di dalam setiap contoh untuk membaca seluruh 10 pokok. Papan perbandingan memang mempertahankan kedua contoh berdampingan pada jendela sempit; gunakan jendela lebar untuk berinteraksi dengan nyaman.
- Arah visual yang dipilih: tenang, tipografi judul serif Georgia, isi system-ui 16 px, ruang putih, aksen biru GYS, dan garis pemisah tipis. Keputusan ini merupakan interpretasi desain, bukan panduan merek resmi yang disediakan pengguna.
- Setiap halaman contoh memiliki satu `h1` “Dasar Kepercayaan”. Nomor 01–10 memakai angka tabular; pernyataan ditampilkan utuh. Aksi PDF, catat, dan bagikan selalu memiliki ruang tetap, termasuk saat hover dan fokus.
- Pencarian mencocokkan nomor, judul topik, dan pernyataan tanpa membedakan kapital. “Catatan saya” menyaring pokok yang memiliki catatan. Hasil kosong menyediakan tombol untuk menghapus pencarian dan filter.
- Catatan dibuka sebagai sheet bawah di ponsel dan panel sisi kanan di desktop. Panel memiliki jebakan fokus, dukungan Escape, tombol batal, dan pengembalian fokus ke pemicu. Latar menjadi inert selama panel terbuka.
- Ukuran kontrol di halaman contoh minimal 44 px dan jarak antaraksi 8 px; fokus keyboard berupa outline 3 px. Teks utama dan pendukung menggunakan pasangan warna dengan kontras minimal 4,5:1. Mode reduced motion mematikan animasi dan transisi.

## Tema

Nilai dasar `:root` pada dokumen halaman tetap menggunakan tema light; override hanya berada pada `html[data-theme="…"]`. Setiap contoh memiliki `<html>` sendiri dan pemilih tema independen. Mengubah `data-theme` pada HTML terluar menerapkan tema tersebut ke kedua contoh. Nilai valid: `light`, `dark`, `sepia`, `amoled`.

| Token | light | dark | sepia | amoled |
| --- | --- | --- | --- | --- |
| `--brand` | `#00719c` | `#83d4f5` | `#70502b` | `#8bdaf8` |
| `--ink` | `#132018` | `#edf3f5` | `#30281f` | `#f1f5f7` |
| `--surface` | `#ffffff` | `#172127` | `#faf3e6` | `#000000` |
| `--line` | `#dce5ee` | `#3b4c55` | `#d6c8b2` | `#343d43` |
| `--muted` | `#52616b` | `#b4c3cc` | `#6b5945` | `#b8c3ca` |
| `--ground` | `#f5f8fa` | `#10191e` | `#f0e7d6` | `#000000` |
| `--tint` | `#eaf4f8` | `#223740` | `#eee1ca` | `#13272f` |
| `--focus` | `#00719c` | `#83d4f5` | `#70502b` | `#8bdaf8` |
| `--inverse` | `#ffffff` | `#10232b` | `#ffffff` | `#07191f` |

Palet hangat hanya dipakai di sepia. Warna garis berfungsi sebagai pemisah ringan; kontrol dan status tetap dikenali lewat teks, bentuk, serta outline fokus.

## Perbedaan dari permukaan lama

Desain disusun dari deskripsi pengguna; tidak ada sumber halaman lama yang disediakan. Sepuluh pokok tetap menjadi isi utama, bukan renungan harian. Judul topik pendek mempercepat pemindaian, sementara nomor dan pernyataan membentuk baris yang konsisten. Aksi tidak menyisipkan elemen baru saat pointer mendekat. Pencarian mendapat jumlah hasil dan keadaan kosong yang eksplisit. Catatan dipisahkan ke panel agar daftar tetap tenang, dengan penanda teks “Ada catatan pribadi” setelah disimpan.

## Catatan lokal dan bagikan

Catatan disimpan setelah menekan “Simpan catatan”, pada `localStorage` dengan kunci `gysapp.faith.notes.v1`; keduanya memakai data yang sama. Catatan tidak dikirim ke server. Penyimpanan bergantung pada izin browser dan konteks pembukaan file: jika diblokir, aplikasi memakai memori selama halaman terbuka dan memberi pemberitahuan. Mode privat, penghapusan data browser, dan perpindahan perangkat dapat menghilangkan atau memisahkan catatan.

Bagikan menggunakan menu berbagi browser jika tersedia. Jika tidak tersedia, panel teks menyediakan tombol salin dan opsi memilih teks untuk disalin manual bila clipboard diblokir. Catatan pribadi tidak ikut dibagikan. PDF resmi dibuka di tab baru dan membutuhkan koneksi internet; PDF tidak dibundel secara lokal.

## Konten dan sumber

Pernyataan adalah ringkasan/parafrasa untuk prototipe, bukan transkripsi naskah resmi. Tampilan menandainya sebagai “Ringkasan pokok iman”. Isi final dapat diganti pada array `items` di sumber dokumen tertanam. Sebelum dipakai sebagai publikasi resmi, gereja dapat mengganti ringkasan dengan redaksi yang disetujui.

Urutan pokok mengikuti sepuluh dasar iman: Yesus Kristus, Alkitab, Gereja, baptisan air, Roh Kudus, basuh kaki, Perjamuan Kudus, Sabat, keselamatan, dan kedatangan Kristus. Rujukan: [Sepuluh Dasar Iman Kepercayaan dalam literatur GYS](https://tjc.org/id/wp-content/uploads/sites/43/2020/04/Tempat-yang-Lebih-Tinggi.pdf).

Sumber halaman dan tautan PDF per topik diperoleh dari [direktori resmi Dasar Kepercayaan](https://tjc.org/id/literatur/dasar-kepercayaan/):

| Pokok | Halaman resmi |
| --- | --- |
| 01 Yesus Kristus | https://tjc.org/id/dasar-kepercayaan/dk-yesus-kristus/ |
| 02 Alkitab | https://tjc.org/id/dasar-kepercayaan/dk-alkitab/ |
| 03 Gereja | https://tjc.org/id/dasar-kepercayaan/dk-gereja/ |
| 04 Baptisan | https://tjc.org/id/dasar-kepercayaan/dk-baptisan/ |
| 05 Roh Kudus | https://tjc.org/id/dasar-kepercayaan/dk-rohkudus/ |
| 06 Basuh Kaki | https://tjc.org/id/dasar-kepercayaan/dk-basuhkaki/ |
| 07 Perjamuan Kudus | https://tjc.org/id/dasar-kepercayaan/dk-pk/ |
| 08 Sabat | https://tjc.org/id/dasar-kepercayaan/dk-sabat/ |
| 09 Keselamatan | https://tjc.org/id/dasar-kepercayaan/dk-keselamatan/ |
| 10 Kedatangan Kristus | https://tjc.org/id/dasar-kepercayaan/dk-kedatangan-kristus/ |

Bingkai ponsel berasal dari template neutral Open Design (Apache-2.0); keterangan sumber dipertahankan di sumber shell proyek. Tidak ada foto atau gambar pihak ketiga.
