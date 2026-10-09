# Navigasi bagian Kidung — 9 Oktober 2026

Katalog, Playlist, dan Pengaturan berbagi aturan radius, padding, tinggi tombol,
ukuran ikon, latar permukaan, badge jumlah playlist, serta indikator aktif.
Lebar tetap mengikuti ruang yang tersedia: katalog berbagi bar dengan kategori
serta mode; halaman alat memakai satu bar navigasi ringkas.

View Transitions memberi nama terpisah pada navigasi dan indikator agar perubahan
posisi/ukuran serta pilihan aktif bergerak, tanpa ikut menghilang bersama isi
halaman. Link memanaskan kode tujuan lewat pointer/fokus dan memiliki handler
navigasi smooth sendiri jika handler shell belum aktif. Handler menghormati
modifier, klik biasa, dan tautan yang sudah ditangani shell agar transisi tidak
dipicu dua kali. Preferensi reduced motion tetap dihormati.

Verifikasi: lima tes navigasi pada 390/768/1440 piksel, fallback tanpa View
Transitions, serta reduced motion; sepuluh tes field/scroll responsif sebelumnya.
Tes membandingkan computed style lintas bagian, memastikan empat perpindahan
memakai tepat empat transisi, dan memeriksa fallback benar-benar memulai animasi.
Screenshot membandingkan ketiga bagian pada ketiga ukuran layar.

Perubahan telah di-push ke main dalam commit 7444569 untuk rilis preview 9 Oktober 2026.
