# Verifikasi tracking WhatsApp — 9 Oktober 2026

## Reproduksi produksi

Worker produksi menerima request WhatsApp dan mengirim event `info` lewat relay
WebSocket dengan cookie browser normal. Saat Chrome CDP mengaktifkan pembatasan
cookie pihak ketiga (`Network.setCookieControls`, heuristik dan metadata exemption
nonaktif), start tetap HTTP 200 tetapi cookie referensi tidak tersimpan. Upgrade
WebSocket kemudian gagal autentikasi. Ini membuktikan kegagalan transport sesi,
bukan kewajiban memasukkan OTP WhatsApp secara manual.

## Perubahan

- Cookie referensi dan sesi HTTPS memakai Secure, HttpOnly, SameSite=None dan
  Partitioned. Cookie tetap terikat ke situs aplikasi dan tidak dapat dibaca JS.
- WebView Android mengaktifkan penerimaan cookie, termasuk cookie lintas situs
  untuk jalur autentikasi BFF. Jalur login native resmi tetap dipertahankan.
- Jalur web berlangganan tracking sebelum mengarahkan tab yang sudah disiapkan ke
  WhatsApp. Reconnect tidak membuka tab atau membuat request kedua.
- Diagnostik mencatat kegagalan/disconnect tanpa menyimpan referensi, OTP,
  nomor telepon, token, atau isi pesan WebSocket.

## Verifikasi dan batasnya

68 tes backend, 9 tes unit progres/cache PDF, 38 tes browser provider/loading,
dan 12 tes ulang WhatsApp/cookie lolos. Tes cookie memakai pembatasan pihak ketiga
Chrome yang sama dengan reproduksi. Test presence memeriksa notice masuk ke state
menutup sebelum dilepas. Typecheck web/BFF dan compile Kotlin ARM64 release lolos.

Bridge native yang sebenarnya diekstrak dari Rust dan dijalankan pada halaman
login e-GYS produksi di Chromium dengan IPC native dimock: event tracking `info`
dan perintah handoff `whatsappopen` berhasil. Ini tidak membuktikan siklus penuh
pada perangkat Android, pengiriman pesan oleh akun nyata, atau konfirmasi akun.
Tidak ada kode akun pengguna atau token yang dicetak dalam hasil probe.

Perubahan telah di-push ke main dalam commit 7444569. Worker terbaru berhasil
deploy melalui Actions run 37872219262. Probe produksi dengan pembatasan cookie
pihak ketiga aktif kini menerima event `info` dan cookie referensi terpartisi.
Perubahan WebView Android tetap membutuhkan instal APK rilis baru. Konfirmasi
login lengkap dengan pesan dari akun pengguna belum diuji pada perangkat nyata.
