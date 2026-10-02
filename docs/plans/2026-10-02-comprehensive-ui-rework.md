# Rencana rework UI menyeluruh — 2 Oktober 2026

Basis: working tree PR #9. Perubahan thumbnail/pembaruan dan screenshot pengguna
sebelumnya dipertahankan. Goal ini lebih luas daripada polish sebelumnya;
build hijau saja bukan bukti bahwa desain seluruh aplikasi telah selesai.

## Masalah desain yang harus diselesaikan

1. Penemuan koleksi: Literatur, Suara, dan Sauh berada di route terpisah tetapi
   tidak muncul sebagai tujuan langsung di Lainnya. Pengguna harus kembali ke
   Beranda lalu menemukan link dalam rak.
2. Hierarki shell: bidang sidebar biru penuh mendominasi hampir setiap layar
   desktop; tema sidebar dan permukaan halaman terasa terpisah.
3. Pengaturan: daftar disclosure datar terlalu mirip daftar navigasi; koleksi,
   akun, preferensi, dan alat perangkat perlu batas visual yang jelas.
4. Beranda: tindakan utama, lanjutkan membaca, dan konten harian harus membentuk
   satu urutan yang disengaja pada mobile, tablet, dan desktop, termasuk saat
   sumber gagal atau tidak ada riwayat bacaan.
5. Pembaca: toolbar Alkitab, Kidung, PDF, catatan, dan media perlu konsistensi
   posisi tindakan utama/sekunder. Ukuran bacaan dan preferensi harus bertahan.
6. Sistem visual: jarak, border, radius, hierarki tipe, fokus, menu, dan status
   perlu aturan bersama. Hindari penambahan lapisan override tanpa menata
   aturan yang sudah ada.

## Urutan pelaksanaan dan bukti penerimaan

| Tahap                      | Hasil yang diminta                                                                                               | Bukti penerimaan                                                                        | Status                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Shell dan pusat koleksi | Sidebar menyatu dengan tema; Lainnya menyediakan akses langsung tiga koleksi; pengaturan terbingkai dan terpisah | Screenshot 320/390/768/1440, ID/EN/ZH, keyboard/link, axe, deep link disclosure         | Selesai, bukti tercatat            |
| 2. Beranda dan katalog     | Urutan harian/lanjutkan/koleksi jelas; judul panjang, filter, hasil kosong dan fallback konsisten                | Data nyata + fixture gagal, semua rak dan pencarian, responsive sampai 1920             | Selesai, bukti tercatat            |
| 3. Pembaca dan media       | Kontrol utama konsisten, menu sekunder jelas, dock tidak menutup bacaan, catatan aman                            | Alkitab/Kidung/Iman/Literatur/Sauh/Suara, PDF/teks, keyboard, audio, online/offline     | Selesai, bukti tercatat            |
| 4. Bahasa visual bersama   | Aturan tipe/spacing/status/motion disatukan dari hasil tahap sebelumnya, override duplikat disederhanakan        | Review CSS aktual, semua tema, 200% teks, reduced motion dan target sentuh              | Selesai, bukti tercatat            |
| 5. Audit akhir             | Semua route/state penting diperiksa dalam aplikasi yang dibangun                                                 | Suite penuh, review screenshot aktual, preview build terakhir, laporan batas verifikasi | Selesai, batas verifikasi tercatat |

## Ketentuan desain

- Pertahankan identitas biru GYS sebagai aksen; gunakan permukaan tema untuk
  bingkai aplikasi agar perhatian jatuh pada bacaan.
- Pisahkan penemuan konten dari pengaturan dan operasi perangkat.
- Tampilkan tujuan, deskripsi pendek, dan affordance navigasi pada kartu koleksi;
  jangan sembunyikan tujuan inti dalam accordion pengaturan.
- Gunakan CSS dan komponen yang sudah ada, tanpa dependency desain tambahan.
- Hormati pilihan font, tema, locale, ukuran teks, reduced motion, dan fokus.
- Jangan mengubah pixel threshold untuk meloloskan baseline baru. Perubahan
  referensi hanya setelah gambar aktual diperiksa dan memang sesuai desain.
- Jangan menganggap gambar fallback sebagai sampul resmi atau mengklaim
  perangkat/native/provider/BFF telah diuji dari bukti browser statis.
- Jangan push atau deploy dari goal ini tanpa instruksi pengguna.

## Bukti pekerjaan tahap 1

Sidebar desktop memakai token surface/ink/blue-soft dari tema yang sama dengan
konten. Lainnya kini memiliki tiga kartu tujuan berdeskripsi dalam ID/EN/ZH,
diikuti heading pengaturan dan panel disclosure terbingkai. Layout kartu menjadi
satu kolom pada tablet/mobile untuk menjaga deskripsi dan touch target.
Production build lulus. Hasil browser dan artefak visual dicatat setelah selesai.
Goal menyeluruh tetap aktif sampai tahap 2–5 memiliki bukti penerimaan.

## Verifikasi awal yang selesai

- Build produksi dan typecheck lulus; initial JS 177.5 KiB gzip / batas 180 KiB.
- Run awal 35 kasus: 34 lulus, satu assertion lama tentang semua pengaturan
  harus berada di viewport tanpa scroll. Kriteria baru memeriksa keterjangkauan
  setiap summary melalui scroll native, dengan seluruh detail tetap tertutup.
- Setelah perubahan Beranda: 34/35 lulus; satu assertion lama mengharuskan panel
  kosong berada di kanan fitur harian. Layout kunjungan pertama kini sengaja
  memakai fitur harian penuh dan undangan bacaan di bawahnya.
- Build terkini: 36/36 lulus tanpa retry, satu worker. Mencakup 11 route/state
  pada 390/1440, kartu koleksi pada 320/768/1440 dalam ID/EN/ZH, semua tema
  pengaturan, deep link dan reduced motion. Regresi baru membuka Alkitab dari
  tombol Mulai membaca dan memverifikasi ayat benar-benar tampil.
- [Pusat koleksi mobile](../ui/2026-10-02-comprehensive/collection-hub-mobile.png)
- [Pusat koleksi desktop](../ui/2026-10-02-comprehensive/collection-hub-desktop.png)
- [Beranda kunjungan pertama, sumber gagal](../ui/2026-10-02-comprehensive/home-new-reader.png)

Tahap 1 terverifikasi pada lingkup di atas. Tahap 2 telah dimulai: tata letak
kunjungan pertama dan judul Suara yang mengikuti locale. Audit katalog/pembaca,
200% teks, baseline visual final dan suite penuh baru belum selesai. Referensi
visual lama belum diperbarui untuk rework ini; jangan klaim gate visual final hijau.

## Verifikasi katalog, pembaca dan sistem visual

- Suara kini dapat dicari melalui judul/ringkasan, dengan jumlah hasil dan
  pemulihan hasil kosong. Reset filter mengembalikan fokus ke pencarian.
  Literatur memakai status hasil dan tindakan reset yang sama.
- Ketika artikel lengkap gagal dimuat, pembaca menyebutkan bahwa yang tampil
  adalah ringkasan, menyediakan retry dan sumber resmi, serta kembali ke koleksi.
  Ilustrasi pengganti diperkecil agar tidak mengalahkan bacaan.
- Katalog dan pembaca berlangganan event metadata Suara yang sudah tersedia.
  Metadata/sampul yang pulih tampil tanpa reload dan tanpa menghapus pencarian.
  Metadata terbaru juga diambil kembali setelah pemuatan artikel untuk menutup
  race selama status loading. Isi artikel lengkap tetap dipertahankan.
- Radius kartu/fitur dipusatkan dalam token 16/20px; kontrol memakai token
  8/10px yang ada. Override panel yang sudah tergantikan dihapus.
- Run katalog/editorial/navigasi/UI: 74/74 lulus. Run visual/preferensi/media/UI:
  98/98 lulus, tanpa retry, satu worker. Termasuk seluruh tema dan ID/EN/ZH
  pada teks 200%, menu, dock media, reduced motion dan referensi visual Windows.
- Referensi aktual telah diperiksa sebagai lembar kontak dan gambar penuh
  representatif: pusat koleksi, katalog, PDF, pembaca, catatan, menu, pengaturan,
  hasil kosong dan ringkasan. Pixel threshold tidak diubah; referensi Linux tidak
  diregenerasi. Referensi lama ukuran landscape/320 di luar suite aktif tidak
  boleh dianggap sebagai bukti hasil build baru.
- Regresi feed dijalankan pada build sebelum perbaikan: gagal pada judul katalog
  yang tetap lama. Build terbaru lulus seluruh 5 tes katalog, termasuk pembaruan
  sampul di katalog dan pembaca serta pencarian pengguna yang tetap tersimpan.
- Preview nyata di 127.0.0.1:5173 berhasil mengaktifkan pembaruan dan membuka
  pusat koleksi. Bukti: `../ui/2026-10-02-comprehensive/preview-collection-hub.jpg`.
- Build/typecheck lulus; initial JS terbaru 177.8 KiB / batas 180 KiB.
  Audit penuh dan verifikasi ulang selesai seperti dicatat di bagian akhir; prasyarat backend/native/layanan
  eksternal tetap harus dilaporkan terpisah dari bukti browser.

## Bukti UI paket offline dengan backend tiruan

Build terpisah di port 4174 memakai VITE_BFF_BASE_URL lokal dengan route fixture;
build utama di 4173/5173 tidak diganti. Seluruh 6 tes aset lulus tanpa retry:
daftar paket, koleksi opsional, instalasi Alkitab, restart offline, hapus dan
pasang ulang Alkitab/Kidung. Fixture Kidung sebelumnya mengganti katalog inti
untuk permintaan service worker dan gagal verifikasi integritas. Fixture kini
hanya mengganti permintaan halaman; worker memasang byte inti asli yang cocok
dengan manifest. Pemeriksaan integritas produksi tetap utuh. Ini bukti UI dan
penyimpanan browser memakai fixture, bukan unduhan paket KJV asli atau backend
produksi yang hidup.

## Hasil akhir dan batas penerimaan

- Audit penuh: 526 kasus, satu worker, tanpa retry; 520 lulus, 3 dilewati
  karena prasyarat build BFF, 3 gagal pada assertion desain lama. Ketiganya
  menuntut riwayat kosong berdampingan, backlink Suara ke Beranda, atau seluruh
  pengaturan berada di viewport tanpa scroll. Assertion diperbarui sesuai
  desain yang telah diperiksa, tanpa mengurangi batas viewport/touch target.
- Build akhir setelah pembersihan key terjemahan tidak terpakai: 81/81 lulus,
  satu worker, tanpa retry. Run ini mengulang seluruh kelompok responsive,
  usability, Suara detail, katalog, worker nyata dan kedua suite visual.
  Semua kasus yang gagal pada audit penuh telah lulus; baseline diverifikasi
  tanpa mode update. Tiga prasyarat statis tercakup oleh run backend tiruan
  6/6 yang dicatat di atas.
- Unit workspace/web 369 lulus; build, typecheck, lint, format, generated
  provenance, native asset boundary, bundle budget, docs dan diff check lulus.
- Preview nyata mengaktifkan versi final dan meta build cocok dengan dist:
  `73e3c2881d9ef054`. Preview: http://127.0.0.1:5173/GYSApp-Tauri/lainnya.
- Bukti route/state tersimpan di `../ui/2026-10-02-comprehensive/routes-390/`
  dan `routes-1440/`; contoh pemulihan kosong/ringkasan serta preview nyata
  tersimpan di folder yang sama. Screenshot responsif 320–1920, semua tema,
  ID/EN/ZH, teks 200% dan reduced motion memiliki pemeriksaan browser.
- Penerimaan mencakup aplikasi browser lokal. Backend unduhan memakai fixture;
  perangkat fisik, aplikasi native, provider login nyata, hosted Linux dan
  deployment baru belum diuji dari pekerjaan ini. Tidak ada push/deploy.
- Kelima tahap rencana selesai dengan batas bukti tersebut. Ini bukan klaim
  bahwa aplikasi tidak akan pernah mempunyai bug atau sudah mencapai desain
  sempurna; perubahan konkret dan kriteria yang direncanakan telah diverifikasi.
