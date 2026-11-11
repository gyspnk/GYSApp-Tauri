# Loop spesifikasi UI (pengganti loop OpenDesign)

Dokumen ini menggantikan `docs/plans/opendesign-ui-loop.md` sebagai cara kerja harian.
Alasannya diukur, bukan selera: lihat bagian "Mengapa berganti" di bawah.

## Mengapa berganti

Catatan sesi 10 November (bukti tersimpan, bukan ingatan):

| Bukti                                               | Angka                                                 |
| --------------------------------------------------- | ----------------------------------------------------- |
| Run OpenDesign untuk Iman + Suara                   | 4 run, 2 tugas                                        |
| Run pertama yang menghasilkan artefak               | **0 dari 2** — status "succeeded", `artifactCount: 0` |
| Artefak yang akhirnya dipakai                       | 2 (satu HTML per permukaan)                           |
| Waktu per tugas (termasuk lanjutan otomatis)        | ~4,4 menit                                            |
| Perubahan yang benar-benar dikirim dari artefak itu | 3 (jumlah hasil Iman, panel catatan, urutan Suara)    |
| Artefak yang bertabrakan dengan data yang ada       | 2 dari 2 (dock audio; halaman renungan harian)        |

Pola yang berulang: artefak datang setelah satu run yang diam-diam kosong, lalu
sebagian besar butirnya harus ditolak karena data tidak ada (`SuaraSejatiPostSchema`
tanpa `audioUrl`/`durationSec`, `faith.tsx` adalah Dasar Kepercayaan, bukan renungan
harian). Biaya per perubahan jadi tinggi dan hasilnya kecil.

Artefak `docs/design/gysapp-ui-system` tetap bernilai — tetapi nilainya sudah
"bank": delapan permukaan memakainya tanpa perlu run baru. Untuk permukaan
berikutnya, spec yang ditulis dari kode yang ada lebih cepat dan lebih jujur.

## Loop baru (tanpa agen desain eksternal)

1. **Baca permukaan yang ada.** Komponen, CSS, dan data. Tulis dulu tiga hal:
   state yang benar-benar ada (`loading`, `ready`, `error`, `empty`), ukuran yang
   sudah dipakai, dan field data yang benar-benar dikirim.
2. **Ambil gambar hosted.** Baseline dari job visual CI (artifact
   `visual-baselines-<run>`), bukan screenshot lokal. Nama berkasnya sudah memuat
   lebar: `<surface>-390x844-linux.png`, dst.
3. **Tulis spec 6–10 butir**, satu baris per butir, dengan pola:
   `NN. <perubahan> — <alasan> — <kontrak tes>`. Butir yang butuh data yang tidak
   ada **dibatalkan di sini**, dengan nama field yang hilang.
4. **Implementasi + kontrak** dalam satu commit: komponen, CSS, i18n (tiga bahasa
   selalu sinkron), dan satu spec Playwright yang mengukur perilaku, bukan piksel.
5. **Verifikasi hosted**: `pnpm verify --wait` atau `pnpm verify --explain <run>`;
   `pnpm check:fast` sebelum push; `pnpm e2e:one <spec>` bila ingin umpan balik
   detik-an (ingat: `preview` menyajikan `dist`, jadi build dulu).
6. **Catat di `docs/plans/ui-spec-loop.md`** (bagian "Status per permukaan") dan
   satu baris di handoff bila ada jebakan baru.

## Aturan yang menjaga loop ini tetap jujur

- Spec ditulis dari kode yang ada, bukan dari keinginan. Bila sebuah butir butuh
  field baru, tulis "butuh data `<field>`" dan berhenti — jangan mengarang isi.
- Satu permukaan per putaran, satu kontrak per perubahan perilaku.
- Tidak ada aset desain baru tanpa sumber: mockup yang sudah ada di
  `docs/design/` boleh dipakai; membuat mockup baru berarti menulis HTML statis
  di repo, bukan memanggil agen luar.
- Ukuran target tetap: 44 px, kontras ≥ 4,5:1, satu `h1`, empat tema,
  `prefers-reduced-motion`.

## Status per permukaan

| Permukaan | Status   | Bukti terakhir                                                           |
| --------- | -------- | ------------------------------------------------------------------------ |
| Kidung    | sebagian | rail `2e6af9c`; kontrol koleksi kembali dropdown (lihat bawah)           |
| Beranda   | sebagian | cover 2:3 `d50437a`, pita kosong `f0663995`, panel ayat datar `d490a440` |
| Alkitab   | sebagian | `3be29a6`, `42837850897`                                                 |
| Iman      | sebagian | ukuran baca 68ch; baris -> panel catatan (putaran 48)                    |
| Literatur | sebagian | chip + 3 kolom `c1b044d`, CLS 0 `42878292349`                            |
| Suara     | sebagian | urutan arsip `5e5ebdf`; salinan kosong sendiri                           |
| Lainnya   | sebagian | grup pengaturan `60a5d60`                                                |
| Dialog    | sebagian | `confirm-dialog.tsx`, `aa44eb9`                                          |

Butir yang menunggu data sebelum bisa dikerjakan: chip kategori Suara (feed hanya
punya `source: "tjc.org"`), dock audio Suara (`audioUrl`, `durationSec`), penanda
"Baru" (`publishedAt` tertua 2025-03, snapshot 2026-09).

### Lainnya: kartu akun (diterapkan 11 Nov)

| Butir                                                  | Alasan                                                                                                                                            | Kontrak                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foto profil bulat 56 px, nama dan status di sebelahnya | Kartu lama menaruh avatar kecil, tulisan "Gereja Yesus Sejati", dan pil status dalam satu baris yang berdesakan; nama baru muncul di badan kartu. | `apps/web/e2e/account-card.spec.ts` menuntut `img` di avatar (dengan `naturalWidth > 0`) dan tidak ada lagi teks "Gereja Yesus Sejati" di kartu. |
| Detail jadi kisi label/nilai yang mengisi lebar        | Nilai pendek pada baris 640 px menyisakan separuh kanan kosong; kisi `auto-fit minmax(200px, 1fr)` memberi 1 kolom di ponsel dan 3-4 di desktop.  | kontrak yang sama menghitung kolom kisi >= 2 di 1440 px dan kartu mengisi panel (> 700 px).                                                      |
| Tombol keluar punya baris sendiri                      | `padding: 0 14px 14px` membuat garis pemisah menempel pada tepi atas tombol; sekarang baris aksi punya `padding-top` dan tombol pil 44 px.        | jarak atas tombol ke baris aksi >= 12 px dan tinggi tombol >= 44 px; kontrol negatif (padding 0) membuat kontrak merah.                          |

### Alkitab: catatan gabungan selalu menaik (11 Nov)

| Butir                                                             | Alasan                                                                                                                                                     | Kontrak                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label dan pratinjau catatan gabungan diurutkan dari ayat terkecil | Urutan pilih adalah urutan klik; memilih 3 lalu 1 menghasilkan label "1:3–1" dan pratinjau terbalik, padahal catatan gabungan dibaca sebagai rentang naik. | `apps/web/src/verse-selection.ts` `sortByVerseNumber` (unit) dan `apps/web/e2e/bible-multi-select.spec.ts` memilih 3-2-1 lalu menuntut "Kejadian 1:1–3" serta penanda "1. " sebelum "3. " |

### Lainnya: pengaturan pada landscape (diterapkan 11 Nov)

| Butir                                                        | Alasan                                                                                                                                    | Kontrak                                                                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dua kolom mulai 720 px, bukan 1200 px                        | Di 844x390 dan 1024x600 daftar pengaturan masih satu kolom selebar jendela: separuh lebar kosong dan setiap baris mencapai 80 px.         | `apps/web/e2e/more-landscape.spec.ts` menghitung 2 kolom di 844x390 dan 1024x600                                                                                                      |
| Panel yang terbuka memakai lebar penuh                       | Panel akun selebar setengah kolom memaksa paragraf 40 karakter dan tiga tombol penyedia berdempet.                                        | kontrak yang sama membandingkan lebar panel dengan lebar daftar                                                                                                                       |
| Ritme rapat di jendela pendek (`max-height: 540px`)          | Landscape ponsel hanya punya 390 px tinggi; padding 22 px dan baris 80 px memakan layar. Baris tetap 44-56 px agar target sentuh aman.    | semua `.more-setting-row` >= 44 px                                                                                                                                                    |
| Tile koleksi jadi baris ringkas di landscape                 | Tiga tile bertumpuk memakan 139 px sebelum daftar dimulai; sekarang 82 px.                                                                | diukur lokal: `scrollHeight` 1130 -> 880 px pada 844x390                                                                                                                              |
| Kolom anggota berpasangan dan baris penyedia dibatasi 480 px | Nilai pendek pada baris 640 px menyisakan separuh kanan kosong.                                                                           | dilihat pada tangkapan lokal 844x390 (masuk dan keluar)                                                                                                                               |
| Panel offline dan cadangan mengisi dua kolom                 | Panel aset 648 px menaruh 10 baris selebar penuh (1542,9 px tinggi di 844x390); formulir cadangan menaruh field 648 px di atas tombolnya. | `apps/web/e2e/more-landscape.spec.ts`: baris aset <= separuh lebar isi, field cadangan berbagi baris dengan aksinya. `scrollHeight` offline 2523 -> 2181 px, cadangan 1239 -> 1201 px |

### Pembalikan pemilik (11 Nov)

- **Kidung, kontrol koleksi**: chip 44 px yang diterapkan lebih awal diganti lagi menjadi dropdown (`Select`, label "Koleksi", opsi KR/Mandarin/Hymne/ASM) karena deretan chip memakan lebar saat sebuah perangkat punya beberapa koleksi. Chip dan CSS-nya dihapus; kontrak di `apps/web/e2e/kidung-usability.spec.ts` sekarang menolak chip kembali (`role="group"` "Koleksi" = 0, `combobox` "Koleksi" ada, trigger >= 44 px) dan setiap tes penggantian koleksi memilih opsi lalu memeriksa hasil filter.
- **Iman, aksi per baris**: tombol PDF dan Catatan di setiap baris dihapus. Barisnya sendiri sekarang tombol (`aria-haspopup="dialog"`, `aria-expanded`) yang membuka panel catatan; PDF hanya dibuka dari panel itu lewat "Baca lebih lanjut". Kontrak menolak tombol "Buka PDF" sebelum panel dibuka, dan empat spec memeriksa alur baris -> panel -> PDF.

### Lainnya: baris provider di header (diterapkan 11 Nov)

| Butir                                    | Alasan                                                                                                                                                      | Kontrak                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp dan Apple sejajar dengan Google | Keduanya dulu satu tautan kecil "WhatsApp · Apple" dengan chevron (42 px), sementara Google 44 px selebar kartu; keduanya terlihat seperti tautan sekunder. | `apps/web/e2e/account-menu.spec.ts` "the three sign-in rows share one shape": tiga baris, lebar sama, tinggi selisih <= 1 px dan >= 44 px, garis 1 px, tidak ada lagi teks "WhatsApp · Apple". |

### Lainnya: halaman pengaturan diringkas (diterapkan 11 Nov)

| Perubahan                                                                  | Alasan                                                                                                  | Kontrak                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hero halaman diganti `h1.sr-only`                                          | Judul "Pengaturan" setinggi satu blok hanya mengulang nama tab; pembaca tahu halaman ini dari navigasi  | `apps/web/e2e/more-settings-groups.spec.ts` menolak `.page-intro` dan menuntut tepat satu `h1` |
| Baris jadi satu baris (52 px, tanpa deskripsi)                             | Tujuh deskripsi ("Tema, bahasa, dan ukuran teks", dst.) mengulang judul baris; tidak menambah keputusan | Kontrak yang sama menolak `.more-setting-hint`                                                 |
| Grup jadi tiga: "Akun & tampilan", "Konten & unduhan", "Tentang & bantuan" | Grup "Tampilan" hanya berisi satu baris sehingga separuh kolom desktop kosong                           | Kontrak yang sama memeriksa ketiga judul dan `grid-template-columns` 2                         |
| Tiga tombol koleksi jadi satu baris 56 px tanpa subjudul                   | Tiga kartu 88 px mendorong pengaturan turun satu layar                                                  | `apps/web/e2e/ui-polish.spec.ts` (hub) dan `apps/web/e2e/navigation-layout.spec.ts:587`        |
| Ritme grup 22 → 14 px, judul bagian 24 → 14 px                             | Jarak antar grup lebih besar dari tingginya sendiri                                                     | `apps/web/e2e/more-landscape.spec.ts` untuk landscape                                          |

Hasil terukur (build lokal, preview 4173): phone 390×844 `scrollHeight` 859; desktop 1440×900 pas 900 tanpa gulir; landscape 844×390 **880 → 594**; baris semua 52 px (56 di landscape).

Dua kontrak ikut diperbaiki saat sweep konfirmasi `43017091830` (hijau): `apps/web/e2e/app-update-real.spec.ts` masih menekan tombol banner padahal pembaruan memasang dirinya sendiri (sekarang menghitung satu reload), dan `apps/web/e2e/menu-motion.spec.ts` mengukur geseran menu terhadap frame pertama sehingga halaman yang menggulir terlihat seperti menu lepas (sekarang diukur relatif terhadap trigger).

### Alkitab: lebar mengikuti halaman, navigasi layar penuh, font lebih besar (diterapkan 11 Nov)

| Perubahan                                                                                                                                                       | Alasan                                                                                                         | Kontrak                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cap baca `64ch` → `min(100%, 88ch)`; fallback font 1,125rem → 1,25rem, default 18 → 20 px                                                                       | Di landscape teks hanya memakai 74–84% kolom halaman, dan ukuran baca terasa kecil untuk teks yang dibaca lama | `apps/web/e2e/bible-reader-width.spec.ts` (landscape 1024×600: ≥70% kolom, font ≥20 px, tanpa gulir horizontal)              |
| Picker cepat jadi sheet `inset: 0`, radius 0, padding safe-area, panel `color-mix(--surface 84%, transparent)`, backdrop `blur(20px) saturate(1.08)` tanpa tint | Pemilik meminta overlay penuh dengan blur transparan, bukan kartu 420 px di atas latar solid                   | `apps/web/e2e/bible-picker-overlay.spec.ts` (kotak = viewport ±2 px, radius 0, alpha backdrop 0, blur ada, klik rim menutup) |
| Keyboard dan tepi ber-padding tetap menutup, fokus kembali ke pemicu                                                                                            | Lembar penuh menutupi semua klik; tanpa ini pengguna keyboard bisa terjebak di dalam sheet                     | `apps/web/e2e/bible-picker-overlay.spec.ts` "still closes from the keyboard and the rim"                                     |
| Badan sheet bisa digulir sendiri; rim meneruskan pointer ke backdrop; animasi skala diganti fade                                                                | Kartu yang di-scale mengubah ukuran halaman saat diukur; rim harus tetap bisa menutup                          | Kontrak yang sama + `apps/web/e2e/bible-chapter-nav.spec.ts` (batas ukur 66 → 90ch)                                          |

Angka: 1024×600 ayat 576 → 726 px dari kolom 776 (74% → 93,6%), font 18 → 20 px; 844×390 614 → 678 dari 728 (84% → 93,1%), font 18 → 22,5 px. Desktop 1440 tetap 66,2ch (≤90). Cap kolom `46rem` di ≥1200 px sengaja dipertahankan.
