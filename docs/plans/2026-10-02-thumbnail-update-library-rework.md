# Thumbnail, pembaruan, dan desain perpustakaan

Basis: working tree PR #9 (`codex/gysapp-loading-debug-efficiency`).
Tanggal: 2 Oktober 2026. Pekerjaan melanjutkan polish sebelumnya dan
mempertahankan file screenshot pengguna yang sudah ada.

## Temuan dan perbaikan

| Masalah                                                                                                | Perbaikan dan bukti                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gambar cache bisa selesai sebelum callback React; reset effect mengembalikan opacity ke status loading | Periksa `complete`/`naturalWidth` dari ref; state terpisah saat URL berubah; regresi kunjungan ulang                                                            |
| Normalisasi URL selalu memilih original meski derivative resmi masih tersedia                          | Kandidat terbatas: proxy/original/URL sumber, tanpa loop retry tak terbatas; uji original gagal tetapi derivative sukses                                        |
| Gambar gagal tetap pada fallback setelah jaringan kembali                                              | Event `online` mencoba ulang gambar yang gagal; browser offline→online lulus tanpa reload                                                                       |
| Metadata gambar baru untuk ID katalog lama diabaikan                                                   | Merge Suara/Literatur membandingkan data aktual, mengirim perubahan dan menyimpan cover yang dipulihkan; unit regresi cache lulus                               |
| Sebagian arsip tidak membawa URL sampul                                                                | Ilustrasi SVG lokal yang sudah ada di repo digunakan sebagai fallback, dengan motif kategori dan label aksesibel yang tetap menyatakan pratinjau tidak tersedia |
| Worker waiting yang redundant masih meninggalkan banner pembaruan                                      | Hanya offer yang bersangkutan ditarik ketika redundant; regresi worker lama/baru dan browser banner lulus                                                       |
| Tombol pembaruan dapat ditekan berulang, status masih “siap” saat aktivasi                             | Aktivasi sekali, status “Memasang pembaruan…” dalam ID/EN/ZH, tombol dinonaktifkan sampai controller berubah                                                    |
| Aktivasi eksplisit pada tab tanpa controller tidak memicu reload                                       | Regresi unit gagal sebelum perbaikan; aktivasi eksplisit kini reload, sementara instalasi pertama tetap tidak reload otomatis                                   |
| Pencarian katalog dianggap edit belum disimpan setelah blur                                            | Gunakan input search native; pencarian tidak masuk dirty-editor set; browser menguji update kembali tersedia setelah blur                                       |
| Hover pengaturan kurang kontras di tema terang                                                         | Teks memakai warna ink; axe pada pengaturan terbuka memeriksa semua tema                                                                                        |
| Kartu Literatur tablet terlalu sempit                                                                  | Rak horizontal 600–1199px dengan kartu 168px, menjaga judul terbaca dan halaman tidak overflow                                                                  |

Snapshot lokal berisi 164 item Suara dengan 101 URL gambar kosong, serta
300 Literatur dengan 299 URL sampul resmi. URL kosong berbeda dari kegagalan
render/transport. Sumber API publik yang dicoba dari shell pada audit ini
timeout 15 detik; itu tidak membuktikan semua gambar sumber tidak tersedia.
Fallback ilustrasi tidak diklaim sebagai sampul resmi.

Pada preview dengan cache pengguna, katalog gabungan menampilkan 315 judul.
Keenam sampul terbaru teramati `loaded` dari host S3 resmi; ini bukti sumber
nyata yang terpisah dari fixture visual dan screenshot fallback.

## Arah desain dan evaluasi

Beranda menggunakan headline serif, gambar/kutipan berdampingan pada desktop,
kartu lanjutkan bacaan yang terpisah, serta kartu Suara dan Literatur dengan
caption bersih, sudut konsisten, dan hover yang ringan. Sampul pengganti
memakai tema kategori, bukan kotak kosong. Navigasi dan panel pengaturan
memakai bentuk yang konsisten; banner pembaruan menjadi toast terbatas di
kanan bawah, agar tidak menutupi seluruh lebar layar.

Katalog Kidung memakai daftar putih yang terbingkai dan nomor lagu yang mudah
dipindai. Dasar Kepercayaan memakai kartu bacaan dengan ruang teks dan tombol
yang jelas. Baris Literatur memiliki batas, jarak, dan hierarki sampul/judul
yang konsisten; badge kategori tidak dipaksakan ke thumbnail baris yang kecil.

Pilihan font sans pengguna tetap dihormati. Permukaan pembaca, audio persisten,
kontrol PDF, touch target, serta reduced motion tetap diperiksa. Review
mencakup 59 referensi Windows dalam delapan contact sheet, 11 route/state
capture pada 390/1440px, dan viewport visual 320–1920px. Rak tablet yang
ditemukan pada review ditindaklanjuti dengan pemeriksaan khusus pada build final.

## Status verifikasi

- Unit workspace/policy/script tests dan typecheck lulus; unit web kini 369.
- Lint, generated provenance, native assets, dan production build lulus.
- Initial JS 177.3 KiB gzip, di bawah batas 180 KiB.
- Run terfokus pertama: 52/56 lulus; empat selector lama berubah karena
  semantic role searchbox dan artwork SVG. Selector diperbarui sesuai UI.
- Run terfokus berikutnya: 65/66 lulus; satu kegagalan kontras hover ditemukan
  dan diperbaiki. Run editorial/update/thumbnail/visual setelahnya: 85/85 lulus.
- Baseline visual final sebelum koreksi rak tablet: 57/57 lulus tanpa retry.
  Threshold pixel tetap; referensi Linux tidak dibangkitkan oleh host Windows.
- Uji offline→online gambar: 1/1 lulus tanpa reload.
- Run lengkap sebelumnya: 509 lulus, 3 dilewati, 2 gagal karena assertion
  lama (ukuran headline dan selector gambar yang ikut menghitung SVG fallback).
  Keduanya diperbarui sesuai perilaku yang memang diinginkan.
- Review build berikutnya: 155/155 browser checks lulus, termasuk rak tablet
  600/768/1024px, visual, aksesibilitas, pencarian, thumbnail, dan pembaruan.
- Service worker nyata pada instalasi bersih, dua reload, dan aktivasi versi
  baru melalui tombol: 2/2 lulus tanpa banner tersisa.
- Suite lengkap 515 kasus: 511 lulus, 3 dilewati karena prasyarat BFF,
  1 gagal ketika request stylesheet lokal mengalami `net::ERR_NO_BUFFER_SPACE`.
  Trace mencatat response status -1 untuk CSS; bukan hasil render warna
  dengan stylesheet yang berhasil dimuat. Pengulangan pada build akhir
  bersama pemeriksaan visual, tablet, aksesibilitas, thumbnail, dan pembaruan:
  63/63 lulus dengan satu worker, tanpa retry, termasuk kasus warna yang gagal
  pada run lengkap. Tidak ada kegagalan kasus run lengkap yang belum diverifikasi
  ulang; tiga integrasi BFF tetap belum diuji pada preview statis.

## Bukti tampilan

- [Beranda dengan sumber nyata](../ui/2026-10-02-library-rework/home-live-desktop.jpg)
- [Beranda ketika sumber tidak tersedia](../ui/2026-10-02-library-rework/home-unavailable-desktop.png)
- [Literatur desktop](../ui/2026-10-02-library-rework/literature-desktop.png)
- [Literatur dengan sampul resmi nyata](../ui/2026-10-02-library-rework/literature-live-desktop.jpg)
- [Literatur tablet](../ui/2026-10-02-library-rework/literature-tablet.png)
- [Kidung mobile](../ui/2026-10-02-library-rework/kidung-mobile.png)
- [Iman mobile](../ui/2026-10-02-library-rework/faith-mobile.png)

Hasil packaged Tauri, perangkat fisik, provider eksternal, dan deployment
tidak diklaim oleh audit Chromium Windows ini. Perubahan masih lokal.
