# Progres loading PDF — 9 Oktober 2026

Viewer memakai byte `loaded / total` dari PDF.js tanpa persentase sintetis.
Bila total belum diketahui, bar tampil indeterminate, bukan perkiraan persen.
Setelah dokumen tersedia, label berubah menjadi menyiapkan halaman sampai canvas
selesai dirender. PDF range dapat dibuka sebelum seluruh dokumen selesai diunduh;
siap membaca tidak berarti seluruh PDF tersimpan offline.

Pemberitahuan jeda unduhan muncul sesudah 12 detik tanpa byte baru. Interval
kedatangan byte yang lambat memperpanjang toleransi hingga empat kali interval,
maksimum 30 detik. Kenaikan lebih kecil dari satu persen tetap dianggap aktivitas.
Pemberitahuan hilang saat byte berlanjut atau dokumen siap; tombol coba lagi tetap
manual agar koneksi lambat tidak terus dimulai ulang. Progres cache unduhan bersama
diteruskan ke viewer yang baru bergabung.

Verifikasi: unit test menghitung persen/total tidak diketahui, toleransi aktivitas,
dan replay progres; browser test pada 390, 768, dan 1440 piksel menguji tidak adanya
peringatan dini, batas notice, serta berhasil render setelah unduhan dilanjutkan.

Pemberitahuan serta lapisan loading memakai presence yang sama dengan menu aplikasi:
node tetap terpasang selama transisi keluar, menjadi inert selama menutup, dan
dilepas sesudah animasi selesai. Preferensi reduced motion tetap dihormati.
