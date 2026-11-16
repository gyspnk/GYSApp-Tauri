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

| Permukaan | Status   | Bukti terakhir                                                                                                                   |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Kidung    | sebagian | rail `2e6af9c`; kontrol koleksi kembali dropdown (lihat bawah)                                                                   |
| Beranda   | sebagian | cover 2:3 `d50437a`, pita kosong `f0663995`, panel ayat datar `d490a440`                                                         |
| Alkitab   | sebagian | `3be29a6`, `42837850897`                                                                                                         |
| Iman      | ya       | baris + kolom cari berhenti di 88ch, sama dengan pembaca Alkitab (putaran 95); baris -> panel catatan (putaran 48)               |
| Literatur | sebagian | chip + 3 kolom `c1b044d`, CLS 0 `42878292349`, sortir di rel samping cari (putaran 96)                                           |
| Suara     | sebagian | urutan arsip `5e5ebdf`; salinan kosong sendiri; kolom cari satu baris penuh di ponsel dan sebaris sortir di desktop (putaran 97) |
| Lainnya   | sebagian | grup pengaturan `60a5d60`                                                                                                        |
| Dialog    | sebagian | `confirm-dialog.tsx`, `aa44eb9`                                                                                                  |

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

### Alkitab: lebar mengikuti halaman, drag layar penuh, font lebih besar (diterapkan 11 Nov)

| Perubahan                                                                                                                        | Alasan                                                                                                    | Kontrak                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cap baca `64ch` → `min(100%, 88ch)`; fallback font 1,125rem → 1,25rem, default 18 → 20 px                                        | Di landscape teks hanya memakai 74–84% kolom halaman, dan ukuran baca terasa kecil untuk teks panjang     | `apps/web/e2e/bible-reader-width.spec.ts` (landscape: ≥90% kolom, font ≥20 px, tanpa gulir; 1440×900 ≥1100 px)              |
| **Drag nama kitab** jadi sheet `inset: 0`, radius 0, panel `color-mix(--surface 86%, transparent)` + `blur(20px) saturate(1.08)` | Permintaan pemilik: yang layar penuh adalah navigasi cepat hasil drag, bukan dialog "Pilih Kitab & Pasal" | `apps/web/e2e/bible-quick-nav-overlay.spec.ts` (lebar = viewport ±2 px, radius 0, alpha 0 < a < 1, blur ada, lepas menutup) |
| Dialog "Pilih Kitab & Pasal" tetap kartu `min(420px, 100%)`, radius 24, skrim bertint                                            | Permintaan yang sama: dialog ini bukan permukaan layar penuh                                              | `apps/web/e2e/bible-picker-overlay.spec.ts` (lebar ≤422 px dan < viewport−20, tengah ±2 px, radius 24, alpha skrim > 0)     |
| Keyboard dan tepi backdrop tetap menutup dialog, fokus kembali ke pemicu                                                         | Tanpa ini pengguna keyboard terjebak di dialog                                                            | `apps/web/e2e/bible-picker-overlay.spec.ts` "still closes from the keyboard and the rim"                                    |

Angka: 1024×600 ayat 576 → 726 px dari kolom 776 (74% → 93,6%), font 18 → 20 px; 844×390 614 → 678 dari 728 (84% → 93,1%), font 18 → 22,5 px. Cap `46rem`/`88ch` kini hanya untuk portrait dan jendela desktop yang tinggi: di landscape kolom ayat memakai lebar halaman penuh (1440×900: kolom 1216 px, teks 1142 px; sebelumnya 736 px di tengah). Alasan: pemilik membaca ayat selebar halaman pada mode landscape, dan sisa ruang di kanan-kiri terbaca sebagai halaman yang belum jadi.

Grid sheet mengukur kotaknya sendiri (`ResizeObserver`) dan menahan setiap sel ≥ **24 px** (WCAG 2.2 target-size minimum) dengan mengorbankan jumlah baris, bukan ukuran sel: landscape 844×390 → 10 kolom × 7 baris (sel 76,4×29,1 px); portrait 390×844 → 4 kolom × 17 baris (sel 83,5×28,2 px); keduanya `scrollHeight == clientHeight` (tidak terpotong, tanpa gulir), item terakhir portrait berhenti 20 px di atas pil langkah. Pil langkah disembunyikan di landscape pendek karena readout melayang sudah memuat petunjuk yang sama; override media ditaruh paling akhir berkas supaya menang urutan sumber.

### Lainnya: pembaruan memasang diri di halaman mana pun (diterapkan 11 Nov)

| Perubahan                                                                                                    | Alasan                                                                                         | Kontrak                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `isUpdateBusy(editing, overlay)` — rute baca, MIDI, dan suara tidak lagi menahan pembaruan                   | Pemilik meminta pembaruan berjalan di halaman apa pun, tidak menunggu kembali ke Beranda       | `apps/web/src/app-update.test.ts`, `apps/web/e2e/app-update.spec.ts`       |
| Yang masih menahan hanya draf tulisan (editor kotor/fokus di kolom teks) dan permukaan terbuka (dialog, PDF) | Reload di tengah menulis atau saat dialog terbuka menghilangkan pekerjaan yang belum tersimpan | `apps/web/e2e/app-update.spec.ts` "unsaved note…" dan "Faith PDF overlay…" |
| Salinan `update.waiting` jadi "Selesaikan tulisan yang sedang dibuka dulu" (id/en/zh)                        | Kalimat lama menyebut "membaca", padahal membaca tidak lagi menahan                            | `apps/web/e2e/app-update.spec.ts` teks banner                              |

### Aksesibilitas permukaan baru (diterapkan 11 Nov)

| Perubahan                                                                                       | Alasan                                                                                | Kontrak                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Audit axe untuk sheet drag, dialog kitab, baris Iman + panel catatan, rail Kidung, dialog hapus | Permukaan baru ini hanya muncul saat dibuka, jadi audit rute tidak pernah melihatnya  | `bible-a11y.spec.ts`, `faith-a11y.spec.ts`, `kidung-a11y.spec.ts` |
| Fokus kembali ke `<summary>` menu baris bila pemicu sudah tidak fokusable                       | Setelah "Batal", `<details>` sudah menutup sehingga fokus jatuh ke `<body>`           | `kidung-a11y.spec.ts` "Escape restores focus"                     |
| Setiap sel grid drag ≥ 24 px                                                                    | WCAG 2.2 target-size minimum; 44 px tidak mungkin tanpa memecah "66 kitab satu layar" | `bible-quick-nav-overlay.spec.ts`                                 |
| Input impor playlist diberi `aria-label` (`kidung.import`)                                      | Audit axe menemukan `label` critical: input file `sr-only` tanpa nama aksesibel       | `kidung-a11y.spec.ts` "delete playlist dialog"                    |

Dua layer melayang Alkitab (`.quick-nav-multistep`, `.selected-verse-toolbar`) kini diportal ke dalam `<main>` (`#main-content`, fallback `document.body`), sehingga audit axe `best-practice` bersih tanpa mengubah posisi fixed-nya — geometri diverifikasi di 390×844 dan 844×390. Kontrak `apps/web/e2e/bible-a11y.spec.ts` menambahkan audit `["wcag2a","wcag2aa","best-practice"]` pada dua state drag. Kontrak ukur di `apps/web/e2e/bible-chapter-nav.spec.ts` juga dipisah per orientasi: portrait tetap menjaga plafon 90 karakter, landscape wajib memakai ≥85% lebar halaman (sesuai permintaan lebar penuh).

## Dialog bertumpuk: hanya layer teratas yang menanggapi (diterapkan 11 Nov)

| Perubahan                                                                                | Alasan                                                                                                                                                                                                       | Kontrak                                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `useDialogFocus` menyimpan stack `dialogLayers`, Escape/Tab hanya diproses layer teratas | dua dialog yang hidup bersamaan saling menutup: listener sheet Iman jalan lebih dulu, memanggil `preventDefault()`, lalu PDF di atasnya tidak pernah menerima Escape; trap Tab sheet juga bisa mencuri fokus | `apps/web/e2e/faith-layers.spec.ts`                                                                     |
| `openFaithPdf` tidak lagi menutup sheet topik                                            | sheet yang ter-unmount membuat "kembali ke sheet" mustahil dan fokus jatuh ke `<body>`                                                                                                                       | `faith-layers` (Escape pertama menutup PDF, sheet tetap terlihat, fokus kembali ke "Baca lebih lanjut") |

## Kontrol pilihan: fokus nyata di dalam daftar (diterapkan 11 Nov)

| Perubahan                                                                                                                                                                                               | Alasan                                                                                                                              | Kontrak                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web/src/select.tsx` memindahkan fokus DOM ke opsi saat daftar terbuka; panah/Home/End memindah, Enter memilih, Escape menutup tanpa mengubah nilai dan mengembalikan fokus ke trigger, Tab keluar | `aria-activedescendant` di trigger/menu tidak memberi posisi nyata bagi pembaca layar, dan Tab sempat masuk ke menu sebelum menutup | `apps/web/e2e/kidung-collection-select.spec.ts` (3 tes, 390×844, opsi English+KR lewat route metadata) |

Pembaruan hanya menunda untuk pembaca (`.pdf-reader`) dan tulisan yang belum disimpan — sheet topik, catatan, maupun pemilih tidak lagi menahan pembaruan, karena menutupnya tidak menghilangkan apa pun. Kontrak `apps/web/e2e/app-update.spec.ts` menguji PDF Iman menahan pembaruan sampai ditutup, lalu pembaruan berjalan di halaman yang sama.

## Baseline visual: blur dikunci di fixture, bukan dihapus dari produk (diterapkan 11 Nov)

`backdrop-filter` disampel compositor, jadi DOM/CSS yang sama bisa bergeser satu-dua piksel antar-render dan perbandingan piksel eksak mengubahnya jadi baseline "berubah" tanpa beda visual — `bible-notes-390x844` dan `kidung-reader-settings-390x844` sudah dua kali diadopsi ulang karena ini. Kedua spec visual kini menyuntikkan `*, *::before, *::after { backdrop-filter: none !important }` lewat `addInitScript` sebelum navigasi, jadi determinisme menjadi sifat lingkungan tes. Blur tetap ada di produk karena itu niat desain yang dilihat pengguna; menghapusnya akan mengubah tampilan rilis dan membuat spec berhenti menjaga lapisan yang dibentuknya. Bukti: dua render berturut-turut menghasilkan sha256 identik (`kidung-reader-settings`, `bible-notes`), lalu empat baseline Linux diadopsi setelah diperiksa (`appearance-accent-1440x900`, `appearance-settings-1440x900`, `bible-notes-390x844`, `kidung-reader-settings-390x844`).

Audit `apps/web/e2e/kidung-a11y.spec.ts` kini memakai tag `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, dan `best-practice` untuk katalog 390×844/1440×900, reader desktop (rail + isi), panel menu playlist, dan dialog hapus. Tidak ada pelanggaran dan tidak ada komponen Kidung yang perlu diubah; `region` dan `target-size` terbukti berjalan, berbeda dari audit rute lama yang berhenti di `wcag2aa`.

Iman: sheet topik melepas `aria-modal` saat panel catatan atau PDF di atasnya terbuka — hanya layer teratas yang modal (`apps/web/e2e/faith-a11y.spec.ts`). Audit axe `/iman` (390×844 dan 1440×900: halaman, sheet, panel catatan, PDF bertumpuk) dan `/literatur` (katalog + pembaca) dengan enam tag `wcag2a/2aa/21a/21aa/22aa/best-practice`: 0 pelanggaran, tanpa `disableRules` (`faith-a11y.spec.ts`, `literature-a11y.spec.ts`).

### Beranda: cadangan tinggi panel ayat saat tanpa ayat (diterapkan 11 Nov)

| Perubahan                                                                              | Alasan                                                                                                                                                 | Kontrak tes                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `:has(.sauh-offline-state)` memakai `min-height` 180/182/180 yang sama dengan skeleton | kartu "Sauh hari ini belum tersedia" 19–48 px lebih pendek dari skeleton, menarik `.continue-panel` + section Suara ke atas (CLS 0,0094/0,0085/0,0134) | `ui-polish.spec.ts` (pita 72 px), probe perf lokal 0,00004/0,00001/0,00099 |
| `.sauh-card-content` di state offline jadi `flex: 1 0 auto; justify-content: center`   | `margin-top: auto` menempelkan teks ke bawah, sisa CLS 0,00365 di phone                                                                                | idem                                                                       |

Pergeseran 10 px serentak ~650 ms adalah animasi `soft-rise` pada `.home-grid > *`, bukan layout shift (CLS mengabaikan transform). `apps/web/e2e/shell-a11y.spec.ts` mengaudit Beranda/Alkitab/Suara/Lainnya dengan enam tag axe (0 violations), dan drawer "Menu Bacaan" sekarang memindahkan fokus ke dalam dialog sehingga Escape menutupnya.

### Audit axe permukaan baru (11 Nov)

Empat permukaan diaudit dengan enam tag di `apps/web/e2e/shell-a11y.spec.ts`: rail Kidung + chip koleksi (listbox), dialog hapus playlist, kartu akun (login palsu), dan banner pembaruan (service worker palsu). Hasil: 0 pelanggaran setelah satu perbaikan — `role="status"` dipasang pada `<aside>` melanggar `aria-allowed-role`, jadi banner memakai `<div>` (`apps/web/src/service-worker-updates.ts:12`). Dua `incomplete` dibiarkan dan dicatat: `aria-valid-attr-value` pada chip karena axe tidak bisa menelusuri `aria-controls` saat `aria-haspopup`, dan `color-contrast` pada paragraf dialog karena latar overlay.

### Beranda: satu lantai tinggi untuk semua keadaan panel ayat (11 Nov)

Skeleton, kartu offline, dan kartu terisi kini memakai satu lantai `min-height`: 340 px dasar, 400 px di 960–1199, `max(510px, 56.25vw + 220px)` di bawah 600, dan `calc(56.25vw + 190px)` di 600–959. Di bawah 960 skeleton/offline juga mendapat placeholder media 16:9 supaya kotak isinya sama dengan kartu terisi.
Tinggi terukur skeleton → loaded: 320/390 510→510, 599 557→557, 600 528→528, 768 622→622, 900 696→696, 960–1199 400→400, 1440 340→340 (selisih ≤0,7 px). CLS dengan feed nyata tertunda 1,5 detik: 320 0,222 → 0; 390 0,217 → 0; 600 0,185 → 0; 768 0,315 → 0; 900 0,285 → 0; 1440 0,059 → 0,020 (reflow di dalam panel yang sudah tetap). Kontrak `apps/web/e2e/home-verse-reservation.spec.ts` gagal di CSS lama (280 px @390, 458,8 px @900) dan lulus sesudahnya.

### Dua `incomplete` axe jadi bukti terukur (11 Nov)

`apps/web/src/contrast.ts` (baru) menghitung rasio kontras WCAG dari warna CSS apa pun yang dipakai shell (hex, `rgb()`, `rgba()`, `color(srgb …)`, `transparent`), dengan `composite()` untuk lapisan transparan. Kontrak `apps/web/e2e/shell-a11y.spec.ts` mengukur paragraf dialog hapus per tema: light 5,506 · dark 9,023 · sepia 9,743 · amoled 9,349 — semuanya ≥4,5:1, jadi tidak ada warna yang diubah. Kontrak kedua membuka chip koleksi, membaca `aria-controls`, dan menegaskan `getElementById(id)` ada dengan `role="listbox"` dan `aria-hidden="false"`, sehingga kekhawatiran axe ditutup tanpa `disableRules`.

### Beranda: kartu ayat ≥960 px memakai geometri hero yang sama (11 Nov)

Tinggi panel sudah tetap, tetapi isi kartu masih melompat: state skeleton/offline memakai padding bertumpuk sementara kartu terisi ≥960 px adalah hero gabungan (panel padding 0, media absolut, salinan di scrim bawah). Satu blok `@media (min-width: 960px)` di `apps/web/src/app-design.css` menyamakan strukturnya — panel `position: relative; padding: 0`, piring `::before` inset 0, salinan `margin-top: auto` dengan lantai 221 px untuk tiga keadaan (tiga selector `:has()` wajib agar menang atas `min-height: 96px` di baris 4709).
CLS feed nyata tertunda 1,5 detik: 960 0,0589 → 0,00001; 1024 0,0559 → 0,00001; 1199 0,0470 → 0,00001; 1440 0,0201 → 0. Kontrak `home-verse-reservation.spec.ts` kini mengulang 390/900/1024/1440 dan menambahkan `|dTop| ≤ 8` serta `|dH| ≤ 8` untuk `.sauh-card-content`; dengan CSS lama 2 dari 4 gagal (1024 `Received: 205.359375`, 1440 `Received: 129.5625`).

Catatan performa (bukan UI): grafik awal turun 160,5 → 132,6 KiB gz setelah skema zod playlist keluar dari jalur first paint; angka resmi ada di `node scripts/check-bundle-budget.mjs`, bukan catatan lama.

Catatan susulan: indikator muat kartu ayat kini benar-benar di tengah pelat, bukan di tengah slot salinan. Dua hal yang membuatnya sempat gagal: `.sauh-card-content` dipakai sebagai containing block karena slot salinan memang `position: relative` untuk teks, dan aturan `.sauh-skeleton` lama (baris 4729) menang urutan sumber atas aturan baru. Penyelesaiannya satu: slot jadi `position: static` **sesudah** aturan slot, sehingga `position: absolute; inset: 0` jatuh ke panel. Kontrak `Sauh loading state is centered` kembali hijau, `home-verse-reservation` 4/4 dan `ui-polish` 16/16 tetap hijau.

### Kidung: chord terbaca di tema gelap, toolbar landscape bisa dilipat (diterapkan 12 Nov)

| Perubahan                                                                            | Alasan                                                                                             | Kontrak                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Warna teks chord di-mix ke `var(--ink)` per tema (66/66/42/50 %)                     | `#0b4c99` hanya 2,01:1 di dark dan 2,51:1 di amoled; chip pastel membuat pasangan teks–chip 1,01:1 | `apps/web/e2e/chord-contrast.spec.ts` (4 tema, ≥4,5:1) + `apps/web/src/chord-ui-prefs.test.ts` |
| Isi chip chord di-mix ke `var(--surface)` di tema gelap (5/9 % dan 6/10 %)           | chip putih di halaman gelap menyilaukan dan menghapus kontras teks                                 | sama                                                                                           |
| `.chord-visual-marker` di text viewer memakai `var(--chord-text-color, var(--navy))` | `--navy` di dark `#a9d8ef` = 1,36:1 di atas chip                                                   | sama                                                                                           |
| Toolbar katalog di landscape pendek punya tombol lipat 44 px                         | satu baris toolbar memakan 148 px tinggi; daftar baru mulai di 232 px                              | `apps/web/e2e/kidung-toolbar-collapse.spec.ts`                                                 |
| Saat dilipat, nav dan pemilih koleksi disembunyikan, tombol mode menempel kanan      | menghemat 40 px dan tidak menyisakan sel kosong                                                    | sama                                                                                           |

Angka terukur: rasio chord light 9,16 / sepia 9,99 / dark 6,13 / amoled 6,99; toolbar 148 → 108 px, daftar mulai 232 → 192 px pada 844×390.

### Lainnya: layar selamat datang saat pertama dibuka (diterapkan 12 Nov)

| Perubahan                                                                                                                                                          | Alasan                                                                                                        | Kontrak                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/src/welcome.tsx` tampil sebelum `<Routes>` bila `onboarded` masih false: sapaan, satu `h1`, pemilih bahasa, tawaran masuk e-GYS, dan tombol lewati 44 px | Perangkat baru langsung masuk ke Beranda tanpa pernah ditanya bahasa atau diberi tahu bahwa akun itu opsional | `apps/web/e2e/welcome.spec.ts` "a first visit greets the reader in one heading and can skip" |
| Bahasa diterapkan seketika (`setLocale`) sebelum aplikasi dimulai; pilihan tersimpan di amplop `gys-shell-settings-v1` yang sama dengan tema                       | Satu tempat penyimpanan, tidak ada preferensi kedua yang bisa berbeda                                         | tes kedua: id → en → zh lalu lewati menyimpan `locale: "zh"`                                 |
| Flag `onboarded` hanya muncul **sekali**; amplop lama tanpa flag dianggap sudah pernah dibuka, perangkat tanpa amplop dianggap baru                                | Pengguna lama tidak boleh dipaksa melihat layar pembuka, perangkat baru harus melihatnya                      | `apps/web/src/settings.test.ts` (migrasi warisan → `onboarded: true`)                        |
| Baris Google memakai tombol yang sama dengan kartu akun, dan label dekoratifnya disembunyikan begitu tombol fallback tampil                                        | Dua tulisan "Google" bersebelahan terbaca seperti dua tombol berbeda                                          | tes ketiga: hanya satu label yang terlihat; `egys-v1` + `account-menu` 32 tes tetap hijau    |
| Kontrak lain diberi `storageState` "sudah pernah dibuka" di `apps/web/playwright.config.ts`                                                                        | 37 spec yang membuka `/` menguji aplikasi, bukan layar pembuka                                                | suite penuh tetap memakai keadaan pembaca lama                                               |

Kontrak tambahan yang ikut berubah: `apps/web/e2e/fixtures/onboarded-state.ts` dipakai `playwright.config.ts` **dan** fixture `reuse-context` (konteks bersama melewati `storageState`), `apps/web/e2e/app-update-real.spec.ts` menyemai amplop di origin proxy-nya, `apps/web/e2e/appearance-preferences.spec.ts:171` menulis tema gelap lewat amplop (kunci lama `gys-theme` kalah oleh amplop), dan `apps/web/scripts/native-quick-smoke.mjs` kini melewati layar sambutan pada profil baru sebelum menunggu `.home-grid`.

### Alkitab: lembar drag memenuhi layar dengan latar blur (diterapkan 12 Nov)

| perubahan                                                                   | alasan                                                                      | kontrak                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Panel informasi kitab dan angka halaman dihapus dari lembar drag            | Lembar itu sekarang seluruh layar; teks di atasnya hanya memakan baris      | `apps/web/e2e/bible-quick-nav-overlay.spec.ts` menolak `.quick-nav-floater` dan `.quick-nav-column-header` |
| Latar belakang jadi `backdrop-filter: blur(20px)` tanpa lapisan warna solid | Permintaan pemilik: halaman di belakang tetap terlihat, bukan tertutup      | spec membaca `backdrop-filter` dan memastikan alfa overlay < 0,08                                          |
| Kisi menghitung tinggi dari kotak lembar sendiri                            | Tanpa header, 66 kitab muat 6×11 di 844×390 dan 3×22 di 390×844 tanpa gulir | spec memeriksa `scrollHeight == clientHeight` dan jumlah sel                                               |

### Kidung: header antrean MIDI menyamai katalog (diterapkan 12 Nov)

| perubahan                                                                                    | alasan                                                                 | kontrak                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Judul besar "Antrean MIDI" jadi `sr-only`, baris alat memakai kartu yang sama dengan katalog | Pindah tab membuat semua kontrol bergeser karena tinggi header berbeda | `apps/web/e2e/kidung-queue-header.spec.ts` menyamakan tinggi `.kidung-controls-field` |
| Switch dua tab tidak lagi selebar kolom                                                      | Kontrol selebar field terbaca sebagai baris tab, bukan alat            | spec memastikan lebar nav < 75 % field                                                |

### Beranda: sapaan berupa tanggal, tanpa kalimat pembuka (diterapkan 12 Nov)

| perubahan                                                            | alasan                                                           | kontrak                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Judul "Bacaan & nyanyian" jadi `sr-only`; hanya tanggal yang tampil  | Tiga kartu di bawahnya sudah menyebut bacaan, nyanyian, dan iman | `apps/web/e2e/home-hero.spec.ts` memastikan tepat satu `h1`, tak terlihat, dan tanggal sejajar dengan kartu |
| Tanggal jadi eyebrow aksen (bukan teks kecil abu-abu), angka tabular | Diminta pemilik: tampilan tanggal lebih menarik dan sejajar      | spec membandingkan tepi kiri tanggal dengan `.home-portals`                                                 |
| Sejak 720 px tanggal dan tiga pintu berbagi satu baris               | Tanggal tadinya menggantung sendiri di atas ikon yang di tengah  | spec memeriksa keduanya tumpang tindih vertikal di 1440                                                     |

### Lainnya: pengaturan landscape satu baris satu pengaturan (diterapkan 12 Nov)

| perubahan                                                       | alasan                                                                                       | kontrak                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Di bawah 540 px tinggi, daftar pengaturan jadi satu kolom penuh | Dua kolom di samping panel terbuka tidak terbaca; pemilik meminta satu baris satu pengaturan | `apps/web/e2e/more-landscape.spec.ts` memilih 1 kolom saat tinggi ≤ 540, tetap 2 di 1024x600 |

Kontrak yang ikut bergerak: `apps/web/e2e/kidung-section-navigation.spec.ts` menuntut tab antrean ≥80 px (kini 88 px minimum lewat `kidung-responsive.css`, karena berkas itu dimuat setelah `app-design.css`), `apps/web/e2e/kidung-offline.spec.ts` membaca judul antrean dari `h1` di dalam `.kidung-tool-page` setelah header terpisah dihapus, dan `apps/web/e2e/kidung-style-behavior.spec.ts` memakai toleransi 1 px untuk geseran hover (piksel pecahan dari tata letak baris).

## Kidung: mode partitur setara mode teks (12 Nov, revisi goal 20)

Permintaan pemilik (m11121): judul di mode teks terlalu dekat ke atas, tombol "PDF" harus bernama "Partitur", dan tampilan mode partitur harus konsisten dengan mode teks.

Spec yang dikunci:

1. Kedua mode memakai satu variabel jarak atas `--reader-top-gap` (14 px, 18 px sejak 720 px) di `.hymn-detail-page`.
2. Mode teks menerapkannya sebagai `padding-top` halaman; mode partitur menerapkannya sebagai `padding-top` chrome, karena chrome-nya sticky di dalam overlay `position: fixed` sehingga padding halaman tidak terlihat.
3. Chrome partitur dan toolbar teks memakai radius kontrol 12 px yang sama (`.hymn-text-toolbar .detail-actions .hymn-action`, `.hymn-partitur-toggle`, `.hymn-pdf-viewer-chrome .viewer-chrome-button`).
4. Tidak ada teks "PDF" yang terlihat di chrome kidung; label mode memakai `kidung.score` = "Partitur"/"Score"/"乐谱".
5. Kontrak `apps/web/e2e/kidung-partitur-parity.spec.ts` mengukur di 390 dan 1440: judul teks ≥ jarak, chrome partitur ≥ jarak, selisih keduanya ≤ 10 px, radius sama, dan tidak ada "PDF" di tombol chrome.

Jebakan yang ditemukan: chrome partitur hidup di dalam `.gys-pdf-overlay` yang `position: fixed`, jadi `padding-top` pada `.hymn-detail-page` tidak berpengaruh (halaman itu hanya wadah 0 px). Selain itu `:is()` menaikkan spesifisitas selektor lama sehingga aturan radius baru kalah — selektor literal diperlukan. Aturan `padding-block: 6px` di `apps/web/src/styles/04-reader-media.css` (media ≤599 px) juga menang atas selektor dua kelas, jadi aturan baru harus menyebut `.app-frame.is-reader-route` dan `.gys-pdf-overlay` secara eksplisit.

Kontrak yang ikut bergerak: `apps/web/e2e/score-seamless.spec.ts` memberi anggaran tinggi chrome `(width >= 960 ? 72 : 64) * textScale + readerGap`, karena chrome partitur sekarang membawa jarak atas yang sama dengan judul mode teks (14 px, 18 px sejak 720 px). Tanpa penambahan itu, chrome 320 px terukur 75,4 px dan 1440 px 82 px — keduanya hanya melewati anggaran lama sebesar jarak baru.

Kotak Google di kartu akun tidak lagi memipihkan tombol Google: aturan lama memaksa `height: 100%` dan `padding: 0` pada `[role="button"]` milik Google Identity Services, sehingga tombolnya runtuh jadi satu baris teks 18 px dan sisa chromenya menimpa WhatsApp/Apple. Sekarang Google menentukan tinggi sendiri (40 px "large", lebih tinggi saat kartu personalisasi muncul), hanya border dan latarnya yang dilipat ke bingkai aplikasi, dan host `.egys-google-button` memotong apa pun yang lebih besar. Terukur dengan skrip Google sungguhan: 97x44 px di 390 (ikon 40x40 di tengah) dan 355x40 px di 1440, `scrollWidth == clientWidth` di kedua lebar. Penjaga regresi: `apps/web/src/egys-google-frame.test.ts`.

### Kidung: pemilih lagu di landscape (putaran 83)

| Butir spec      | Nilai                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Kapan muncul    | `(orientation: landscape) and (max-width: 1199px)` dan mode teks; rail 1200 px tetap seperti sebelumnya                  |
| Bentuk          | `<details class="kidung-reader-picker">` di bawah hero, tertutup secara bawaan                                           |
| Baris ringkas   | 44 px, label "Koleksi", judul lagu aktif, chevron                                                                        |
| Isi             | daftar rail yang sama (nomor + judul, 44 px per baris), tinggi maksimum `min(46dvh, 320px)`                              |
| Setelah memilih | panel menutup sendiri, rute berganti tanpa kehilangan posisi baca                                                        |
| Kontrak         | `apps/web/e2e/kidung-reader-picker.spec.ts` (912x420 memilih lagu 002 lalu menutup; 390 dan 1440 tidak merender pemilih) |

Aturan `.kidung-rail-list`/`.kidung-rail-row` dipindah keluar dari media query 1200 px supaya baris yang sama dipakai rail desktop dan pemilih landscape; hanya tata letak kolom yang tetap di dalam media query.

### Tampilan: kepadatan dan gaya huruf jadi baris biasa (putaran 85)

| Aspek          | Ketentuan                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Bentuk         | Dua baris `.appearance-setting-row` di dalam grup Tampilan, sejajar Tema Layar dan Warna Aksen. Tidak ada dialog, scrim, atau tombol pembuka. |
| Kontrol        | `Select` bersama (`role="combobox"`), label baris menjadi nama combobox; opsi dari `more.density.*` dan `more.font.*`.                        |
| Sasaran sentuh | Baris ≥44 px, trigger ≥44 px, swatch aksen tetap 44×44.                                                                                       |
| Kolom label    | Semua baris mulai di x yang sama; nilai di kanan.                                                                                             |
| Teks 200%      | Tidak ada overflow dokumen di 320 px.                                                                                                         |
| Gerak          | Tidak ada animasi panel; `prefers-reduced-motion` tidak mengubah apa pun karena tidak ada transisi.                                           |

Alasan: panel modal membuat pilihan yang sama terlihat seperti jenis pengaturan lain, dan di 390 px ia menutupi hampir seluruh layar padahal pengaturan lain hanya membuka satu baris. `apps/web/src/ui-preferences-panel.tsx` dihapus; penggantinya `apps/web/src/ui-preferences-rows.tsx`. Kontrak: `apps/web/e2e/appearance-preferences.spec.ts` (12 tes) dan audit axe di `apps/web/e2e/accessibility.spec.ts`.

### Kidung: mode partitur memakai rangka mode teks (putaran 86)

| Bagian    | Mode teks                                           | Mode partitur (sekarang)                               |
| --------- | --------------------------------------------------- | ------------------------------------------------------ |
| Permukaan | `--surface` (putih/kanvas tema)                     | sama: overlay, stage, dan chrome memakai `--surface`   |
| Kepala    | back 32/44 px, judul `clamp(17px, 2.2vw, 22px)`/600 | angka yang sama, satu variabel `--hymn-chrome-control` |
| Tombol    | 32 px (mouse) / 44 px (sentuh), radius 12 px        | sama; tombol Aa tidak lagi bertanda `--blue-soft`      |
| Judul     | `h1` 14.6 px (390) / 22 px (1440), tanpa nomor      | `strong` 14.6/22 px, nomor `small` sebaris di kanan    |
| Dok       | pil putih melayang, radius 999/16 px                | pil yang sama, lebar `min(760px, 100%)`, bayangan sama |
| Kertas    | halaman putih                                       | lembar skor putih + garis 1 px `--line`                |

Alasan: sampai putaran 85 mode partitur adalah aplikasi lain — kepala biru-muda seluas layar, judul tebal 14 px, tombol Aa 56 px bertanda `--blue-soft`, dan dok selebar layar. Orang yang menekan "Partitur" melihat dokumen yang sama; yang berubah hanya isinya. Variabel `--hymn-chrome-control` kini dideklarasikan di `.hymn-detail-page`, bukan di `.is-text-viewer`, sehingga kedua mode membaca satu angka.

Catatan pelaksana: `apps/web/e2e/score-seamless.spec.ts` mengubah ambang tombolnya menjadi `matchMedia("(pointer: coarse)") ? 44 : 32` — aturan 44 px tetap berlaku untuk sentuh, sedangkan mouse memakai 32 px seperti toolbar teks. Kontrak paritas `apps/web/e2e/kidung-partitur-parity.spec.ts` kini juga membandingkan ukuran kontrol, ukuran/potret huruf judul, warna permukaan, dan bentuk dok.

### Kidung: satu pujian menampilkan halamannya, bukan seluruh buku (putaran 88)

| Aspek          | Aturan                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sumber jendela | `hymnPdfPageRange({ initialPage, pageCount })` dipakai untuk **semua** sumber: master Fork, PDF kanonik, dan buku distribusi. Dulu `pageRange` hanya dikirim untuk `pdfSource === "fork"`, sehingga buku HYMNE/MDR/ASM membuka 559–608 halaman sekaligus. |
| Peta halaman   | `fillMissingHymnPages()` mengisi lagu yang `page`-nya kosong bila celah antara lagu sebelumnya dan berikutnya pas; sisanya dibiarkan kosong, tidak ditebak.                                                                                               |
| Tanpa peta     | Bila master adalah satu-satunya sumber dan lagu ini belum punya halaman, panel `.hymn-pdf-unmapped` muncul dengan tombol "Buka seluruh buku"; pembaca tidak pernah melukis ratusan halaman tanpa diminta.                                                 |
| Bukti          | HYMNE 001 (`hymn-001`, halaman 5 dari 608) menampilkan "Halaman 1 / 1" sesudah perbaikan.                                                                                                                                                                 |

Kontrak `apps/web/e2e/kidung-hymnal-window.spec.ts` menjaga aturan itu tanpa perlu mengunduh paket asli: ia menanam buku uji dua halaman (`apps/web/e2e/fixtures/two-page.pdf` + indeks dua lagu) ke `localStorage["gys-distributed-assets-v1"]` dan Cache API, lalu menuntut lagu yang punya halaman tampil "Halaman 1 / 1", dan lagu tanpa halaman menampilkan panel "Buka seluruh buku" sebelum "Halaman 1 / 2" muncul.

### Kidung: gelombang masuk katalog menutup satu layar (putaran 90)

| Aspek           | Aturan                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Satu commit     | `apps/web/src/kidung-catalog.tsx` melukis seluruh daftar dalam satu commit. Diukur 13 Nov: baris pertama muncul 640–720 ms di kedua jalur, dan 533 baris lengkap ~700 ms dengan satu commit melawan 900–940 ms lewat batch menganggur — batching hanya menambah state waktu dan dua kontrak yang patah. |
| Mulai gelombang | Timer 760 ms mulai saat baris pertama ada (`hasRows`), bukan saat halaman di-mount; muatan lambat dulu menghabiskan seluruh gelombang pada daftar kosong lalu melukis semua baris sekaligus.                                                                                                            |
| Jeda            | `animation-delay: min(calc(var(--row-index) * var(--motion-stagger)), 240ms)` — gelombang berhenti memanjang setelah 0,24 detik, jadi bagian bawah layar tidak menunggu lalu muncul serentak.                                                                                                           |
| Ekor daftar     | `.pujian-item:nth-child(n + 61)` tidak beranimasi sama sekali; 533 baris dulu menggerakkan 533 animasi bersamaan.                                                                                                                                                                                       |
| Kontrak         | `apps/web/e2e/kidung-catalogue-entrance.spec.ts` — setiap baris yang dilukis pertama ikut bergelombang, jeda maksimum 250 ms, seluruh layar ikut, gelombang berhenti sendiri, dan aturan ekor diperiksa dari CSS-nya.                                                                                   |

### Iman dan Suara: judul yang sama dengan Literatur (putaran 98)

| Butir                   | Sebelum                                          | Sesudah                            |
| ----------------------- | ------------------------------------------------ | ---------------------------------- |
| Judul Iman              | `h1` sr-only, rute terbuka tanpa nama terlihat   | `h1` dicat "Dasar Kepercayaan"     |
| Judul Suara             | dicat, tapi 48 px lebih rendah karena breadcrumb | sebaris dengan Literatur dan Iman  |
| Breadcrumb daftar Suara | "← Beranda" di atas judul                        | dihapus; Beranda ada di navigasi   |
| Metrik judul            | 31,5 px/650 (390), 36 px/650 (1440)              | sama di ketiga rute, y 74          |
| Kontrak                 | tidak ada yang membandingkan rute                | `apps/web/e2e/page-titles.spec.ts` |

Kontrak `page-titles.spec.ts` mengukur ketiga rute di 390 dan 1440: satu `h1` terlihat per rute, ukuran dan berat huruf sama, tepi atas dan tepi kiri berselisih ≤1 px. Kunci i18n `suara.backHome` dihapus dari tiga bahasa karena tidak ada lagi yang memakainya (`i18n.test.ts` gagal pada kunci mati).

### Suara & Literatur: judul artikel memakai suara judul katalog (putaran 100)

| Butir          | Sebelum (Suara)                   | Sebelum (Literatur)               | Sesudah                                                                                                         |
| -------------- | --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Keluarga huruf | Source Serif 4                    | Source Serif 4                    | GYS Reading Sans (sama dengan katalog)                                                                          |
| Ukuran         | `clamp(1.625rem, 3.4vw, 2.25rem)` | `clamp(1.6875rem, 3.5vw, 2.5rem)` | `clamp(1.75rem, 2.5vw, 2.25rem)`                                                                                |
| Berat          | 740                               | 600                               | 650                                                                                                             |
| Tracking       | -0.038em                          | -0.04em                           | -0.035em                                                                                                        |
| Kontrak        | —                                 | —                                 | `page-titles.spec.ts` membandingkan keluarga, ukuran, berat, dan tracking judul artikel dengan judul katalognya |

### Kidung: kolom pencarian ikut keluarga yang sama (putaran 99)

| Butir       | Sebelum                           | Sesudah                                                                                                     |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tinggi      | 44 px                             | 48 px                                                                                                       |
| Border      | `color-mix(--blue 16%, --line)`   | `--line`                                                                                                    |
| Isi         | `color-mix(--blue 3%, --surface)` | `--surface`                                                                                                 |
| Radius      | 12 px                             | 12 px (tetap)                                                                                               |
| Ukuran teks | 0.875rem                          | 0.875rem (tetap)                                                                                            |
| Kontrak     | —                                 | `search-field-family.spec.ts` membandingkan tinggi, radius, border, isi, dan ukuran teks di empat permukaan |

### Iman: kolom pencarian sama dengan dua katalog lain (putaran 98)

| Butir            | Sebelum                         | Sesudah                                                                                        |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Tinggi bidang    | 54 px, `padding: 8px 12px`      | 48 px, `padding-inline: 14px`                                                                  |
| Border           | `--line-strong` + bayangan 2 px | `--line`, tanpa bayangan                                                                       |
| Ukuran input     | 32 px, 14 px (16 px ≥960)       | 46 px, 0.875rem (15,75 px di 390)                                                              |
| Jarak dari judul | 0 px (menempel)                 | 18 px, sama dengan Literatur/Suara                                                             |
| Ikon             | 13 px dari tepi                 | 15 px dari tepi, warna `--blue`                                                                |
| Kontrak          | —                               | `page-titles.spec.ts` membandingkan tinggi, radius, border, ukuran input, dan jarak antar-rute |

### Kidung: tombol mode dinamai perbuatannya (putaran 98)

| Butir           | Sebelum                                  | Sesudah                                              |
| --------------- | ---------------------------------------- | ---------------------------------------------------- |
| Nama aksesibel  | "Teks" saat mode teks (menyebut keadaan) | "Tampilkan partitur" (menyebut perbuatan)            |
| Setelah ditekan | "Partitur"                               | "Tampilkan teks"                                     |
| Grup            | "Mode tampilan kidung"                   | tetap                                                |
| Kunci i18n      | `kidung.text` / `kidung.score`           | `kidung.showText` / `kidung.showScore` (tiga bahasa) |
| Kontrak         | tidak ada                                | `apps/web/e2e/kidung-mode-name.spec.ts`              |

Tombol ini satu-satunya kontrol di katalog yang mengubah mode, dan `aria-pressed` sudah menyatakan keadaan; nama yang mengulang keadaan membuat pembaca layar mengumumkan "Teks, tidak ditekan" pada tombol yang justru membuka partitur.

### Tema gelap: kontras ditokenkan, target sentuh 44 px di semua pointer (putaran 101)

Audit tiga subagent atas `kidung-*.css`, `styles/01-03`, `app-design.css`, dan
`reading-surfaces.css` menemukan literal warna yang hanya benar di shell terang.
Enam di antaranya gagal kontras di dark/amoled karena tokennya berubah:

| Elemen                                    | Sebelum                      | Sesudah                            | Kontras gelap                  |
| ----------------------------------------- | ---------------------------- | ---------------------------------- | ------------------------------ |
| `.kidung-mode-cycle[aria-pressed="true"]` | `#fff` di `var(--blue)`      | `var(--on-accent)`                 | 1,6:1 → 9,6:1                  |
| `.more-cat-btn.is-active`                 | `#ffffff` di `var(--navy)`   | `var(--on-accent)`                 | ~1,3:1 → 10,2:1                |
| `.confirm-dialog-confirm`                 | `#fff` di `var(--danger)`    | `var(--on-accent)`                 | ~1,5:1 → 8,9:1                 |
| `.hamburger-switch .switch-thumb`         | `#fff`                       | `var(--on-accent)`                 | kenop hilang di trek biru muda |
| gambar cadangan `.img-fallback`           | `#102536` / `#fff`           | `var(--navy)` / `var(--on-accent)` | tetap mengikuti tema           |
| `.route-recovery-mark`                    | `#9a671c` (+ tint `#b98132`) | `var(--gold)` + `color-mix`        | amber gelap → amber tema       |

Selain itu `.kidung-row-menu > summary:focus-visible` kehilangan titik di depannya,
sehingga **seluruh selector list** tidak valid dan ring fokus hilang untuk menu baris
maupun menu musik PDF. Sekarang `.kidung-row-menu > summary:focus-visible`.

Target sentuh: sembilan kontrol hanya naik ke 44 px di dalam blok `max-width: 599px`,
sehingga tablet 820 px dengan jari tetap mendapat 24–36 px. Satu blok
`@media (pointer: coarse)` di `apps/web/src/styles/05-responsive-refinements.css`
menaikkan `.faith-selection-close`, `.faith-search-clear`, `.article-resume-toggle`,
`.article-resume-options button`, `.bible-crossref-nav-btn`,
`.bible-crossref-header button`, `.bible-notes-close`,
`.bible-typography-controls button`, `.hamburger-drawer-close`, dan `.highlight-dot`.
`.pdf-loading-actions :is(button, a)` juga ikut memakai `var(--control-hit)`.

Kontrak baru: `shell-a11y.spec.ts` menjalankan enam tag axe atas beranda, Alkitab,
pembaca kidung, katalog kidung, dan pengaturan di **tiga shell gelap** (dark, sepia,
amoled) — terang sudah diaudit tes per permukaan — plus dua rute desktop di dark dan
amoled. `responsive-touch-targets.spec.ts` menambah konteks `hasTouch` 820×1180 dan
memastikan `(pointer: coarse)` benar-benar aktif sebelum mengukur.
`kidung-mode-contrast.test.ts` mengunci aturan CSS-nya supaya literal putih tidak
kembali.

### Iman dan Pengaturan: satu bidang halaman (putaran 102)

Dua permukaan yang sama-sama "tidak mengikuti halaman" saat dibuka lebar.

**Iman.** Baris berhenti di 88ch, jadi pada 1280 px daftar menempel di kiri
sementara judul melintang penuh: 1015 px judul, 704 px isi, 311 px kosong di kanan.
Sejak 900 px daftar memakai **dua kolom** yang mengisi bidang halaman (padding
kolom 32 px), sehingga tiap baris tetap ~55 karakter — bukan 100 — dan tidak ada
ruang yang menganggur. Di bawah 900 px tetap satu kolom penuh (844×390 terukur 725
px = 100% halaman). Kolom pencarian ikut selebar daftar, bukan 88ch.

| Butir           | Aturan                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| ≥900 px         | `.faith-rows` `grid-template-columns: repeat(2, minmax(0,1fr))`, `column-gap: 32px`, `max-width: none` |
| <900 px         | satu kolom, `max-width: min(100%, 88ch)`                                                               |
| Kolom pencarian | selebar daftar pada semua lebar                                                                        |
| Teks pernyataan | `text-align: start` (justify membuka sungai kata di kolom sempit)                                      |

**Pengaturan.** Halaman ini menyembunyikan judulnya (`h1.sr-only` "Lainnya"),
menaruh eyebrow kecil sebagai pengganti, dan membagi daftar jadi dua kolom: setiap
chevron kedua jatuh di tengah layar (x818 dari 1440), satu grup terbelah ke dua
separuh, dan panel yang dibuka selebar 1170 px sementara baris di atasnya 585 px.
Sekarang: judul **terlihat** "Pengaturan & perangkat" dengan suara judul katalog,
lalu tiga pintu (Literatur / Suara Sejati / Sauh Bagi Jiwa), lalu satu kolom
`max-width: 760px` yang sepusat — 452..1212 pada 1440, 12..378 pada 390. Nilai dan
chevron menempel di tepi kanan barisnya sendiri.

| Butir         | Aturan                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| Judul         | `h1` terlihat di `.page-intro`, satu per halaman                            |
| Kolom         | `max-width: 760px; margin-inline: auto` untuk intro, grid pintu, dan daftar |
| Baris         | satu kolom, 52 px, hairline, chevron di tepi kanan                          |
| Panel terbuka | `grid-column: auto` — selebar kolom, bukan selebar halaman                  |
| Jarak         | 18 px antara pintu dan grup pertama                                         |

Kontrak: `apps/web/e2e/settings-layout.spec.ts` (3 tes, 6,7 dtk) dan
`apps/web/e2e/faith-measure.spec.ts` (3 tes) — memeriksa satu `h1` terlihat, tepi
intro/pintu/daftar sama ±1 px, semua baris satu `x`, chevron ≤24 px dari tepi, 44 px,
dan nol overflow; Iman memeriksa dua kolom sejajar pada 1440 dan satu kolom penuh
pada 844×390.

### Iman: creed justified only where the measure is comfortable (putaran 102)

Dua kolom selebar ~55 karakter membuka sungai antar kata bila diratakan kiri-kanan,
jadi aturan dasar tetap `text-align: start`. Perataan kembali hanya di atas 768 px,
tempat ukuran bacanya cukup lebar untuk menutup baris tanpa celah aneh.

| Butir   | Aturan                                                              |
| ------- | ------------------------------------------------------------------- |
| Dasar   | `.faith-page .faith-statement { text-align: start }`                |
| Lebar   | `@media (min-width: 768px) { … text-align: justify }`               |
| Alasan  | kolom sempit + justify = sungai; kolom lebar = tepi kanan rata      |
| Kontrak | `apps/web/e2e/faith-zoom.spec.ts` (3 tes) memaku keduanya per lebar |

Kontrak `faith-zoom.spec.ts` juga membandingkan lebar kolom pencarian dengan
**daftar** `.faith-rows`, bukan dengan satu baris: di atas 900 px daftar itu dua
kolom, jadi satu baris hanya separuh daftar (568,97 px vs 1169,94 px pada 1440).

### Pengaturan: label dan nilai berbagi satu kolom (putaran 103)

| Butir                | Sebelum                                                                                | Sesudah                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Label baris tampilan | "Kepadatan antarmuka" membungkus dua baris di 390 dan 320 (butuh 152 px, tersedia 102) | "Kepadatan" / "Density" / "密度" — satu baris di semua lebar                               |
| Tinggi baris         | 56 px, tetapi label dua baris membuat baris kepadatan 44 px label di dalam 56 px       | 56 px dengan label satu baris, sejajar dengan tiga baris lain                              |
| Kolom label          | `minmax(96px, 1fr)` — label 488 px di 1440 sehingga nilai terdorong ke tepi kanan      | tetap `1fr` (keputusan: nilai 220 px di kanan adalah pola baris pengaturan yang sudah ada) |
| Kontrak              | `appearance-preferences.spec.ts` mencari nama lama                                     | mencari "Kepadatan" dan tetap menuntut empat baris satu kolom label                        |

Keputusan yang dicatat: kolom label yang melebar di desktop **bukan** cacat — baris pengaturan lain (Akun e-GYS, Tampilan, Data Offline) memakai pola label kiri / nilai kanan yang sama, dan nilai yang menempel ke chevron membuat baris terbaca sebagai satu baris. Yang diperbaiki hanya label yang membungkus.

### Suara & Literatur: kolom artikel berhenti di 88ch (putaran 104)

| Permukaan                    | Sebelum                                         | Sesudah                          |
| ---------------------------- | ----------------------------------------------- | -------------------------------- |
| `.online-article-body` @1440 | 811 px, ~88 karakter/baris                      | 704 px, ~88 karakter/baris       |
| `.online-article-body` @2560 | **1613 px, ~176 karakter/baris**                | 704 px, ~88 karakter/baris       |
| Kolom teks @1440             | tanggal/judul/catatan/aksi 811 px, badan 803 px | semuanya 704 px, satu tepi kanan |
| Kolom gambar @1440           | 315 px (0.7fr dari sisa)                        | 352 px, tetap proporsional       |

Aturan: `max-width: min(100%, 88ch)` pada `.online-article-body` (batas yang sama dengan pembaca Alkitab dan baris Iman), dan grid artikel ≥1000 px memakai `minmax(220px, 22rem) minmax(0, 88ch)` dengan `justify-content: center` supaya kolom teks berhenti di ukuran baca dan sisa lebar dibagi rata, bukan ditarik ke kiri.

Kontrak: `apps/web/e2e/article-measure.spec.ts` (1440 dan 2560) mengukur 88ch dengan span probe di dalam halaman, menuntut lebar badan ≤ batas itu +1 px, ≤92 karakter per baris, dan **satu** tepi kanan untuk tanggal, judul, catatan, badan, dan aksi (kolom gambar dikecualikan).

### Suara & Literatur: kolom artikel berhenti di 88ch (putaran 104)

| Aspek                                       | Sebelum                    | Sesudah                                |
| ------------------------------------------- | -------------------------- | -------------------------------------- |
| Lebar badan artikel @1440                   | 811 px (~88 karakter)      | 704 px (88ch)                          |
| Lebar badan artikel @2560                   | 1613 px (~176 karakter)    | 704 px, kartu di tengah                |
| Kolom gambar @1440/2560                     | 1075 px (mengikuti fraksi) | 352 px (batas `22rem`)                 |
| Tepi kanan tanggal/judul/catatan/badan/aksi | 811 vs 803 (8 px selisih)  | satu tepi 704 px                       |
| Kontrak                                     | tidak ada                  | `apps/web/e2e/article-measure.spec.ts` |

Batas 88ch sama dengan pembaca Alkitab dan baris Iman. Kolom gambar butuh batas atas tetap (`minmax(220px, 22rem)`), bukan fraksi: dengan `0.7fr` gambar tumbuh 1075 px di 2560 dan menyisakan teks 385 px di 1024. `justify-content: center` wajib, kalau tidak teks menempel ke x1371 saat kartu selebar halaman.

Teks panjang tanpa spasi (URL audio di artikel Sauh) memakai `overflow-wrap: anywhere`, bukan `break-word`: hanya `anywhere` yang ikut mengecilkan lebar min-content sehingga track `minmax(0, 88ch)` bisa menyusut (run 43628116451).

### Pengaturan: teks mikro tidak lagi di bawah lantai (putaran 106)

Halaman pengaturan membawa aturan tipografinya sendiri, dan beberapa di antaranya turun ke 10–11 px di desktop sementara label di atas judul sudah dinaikkan ke 12 px pada putaran 105. Satu lantai untuk seluruh halaman.

| Bagian                                                     | Sebelum           | Sesudah         |
| ---------------------------------------------------------- | ----------------- | --------------- |
| Label grup (`.more-settings-group`)                        | 0,6875rem → 11 px | 0,75rem → 12 px |
| Badge paket (`.pack-badge`)                                | 0,6875rem         | 0,75rem         |
| Statistik paket (`.pack-stats small`)                      | 0,625rem → 10 px  | 0,75rem         |
| Status periksa paket (`.pack-manager-actions > small`)     | 0,625rem          | 0,75rem         |
| Baris aset terdistribusi (`.distributed-asset-copy small`) | 0,6875rem         | 0,75rem         |
| Label kolom (`.search-field > span`)                       | 0,6875rem         | 0,75rem         |
| Asal Google (`.egys-google-origin-current`)                | 0,6875rem         | 0,75rem         |
| Petunjuk formulir (`.form-status`, `.report-email-hint`)   | 0,6875rem         | 0,75rem         |

Kontrak: `apps/web/e2e/micro-text.spec.ts` menelusuri setiap elemen daun yang terlihat di `.more-page` pada 390 dan 1440 dan menuntut ukuran ≥12 px. Diukur nol pelanggaran di 320, 390, 768, 844×390, dan 1440.

### Shell: label mikro tidak turun di bawah 12 px (putaran 105)

| Aspek              | Sebelum   | Sesudah                           |
| ------------------ | --------- | --------------------------------- |
| `.date-line` @1440 | 10 px     | 12 px                             |
| `.date-line` @390  | 11,25 px  | 13,5 px                           |
| Kontrak            | tidak ada | `apps/web/e2e/micro-text.spec.ts` |

`apps/web/src/app-design.css` menimpa ukuran dasar 0,75rem dari `apps/web/src/styles/01-foundations-and-layout.css` dengan 0,625rem, jadi label terkecil di shell (eyebrow di atas judul) jatuh ke 10 px di desktop — di bawah lantai 12 px yang dipakai seluruh aplikasi untuk teks mikro. Label Alkitab tetap 10 px karena berada di dalam heading `sr-only` dan tidak pernah dicat.

### Kidung: katalog membuka dengan judul yang terlihat (putaran 107)

Katalog kidung adalah permukaan terakhir yang namanya hanya ada untuk pembaca layar: `apps/web/src/kidung-catalog.tsx:240` merender `<h1 className="sr-only">`, sehingga `/kidung` terbuka tanpa judul sementara Literatur, Suara, Iman, dan Pengaturan semuanya membuka dengan judul yang sama bentuknya. Aturan judul katalog di `apps/web/src/app-design.css:81` bahkan mengecualikan `.hymn-page`, jadi halaman ini mewarisi serif `clamp(1.75rem, 3vw, 2.375rem)` dari `calm-liturgical.css:527` pada bobot 600 — 38 px di 1440, bukan 36 px.

| Butir            | Sebelum               | Sesudah                      |
| ---------------- | --------------------- | ---------------------------- |
| Judul terlihat   | tidak ada (`sr-only`) | `Kidung` di `.page-intro`    |
| Keluarga huruf   | Source Serif 4        | GYS Reading Sans (`inherit`) |
| Ukuran           | 38 px @1440           | 31,5 px @390, 36 px @1440    |
| Bobot            | 600                   | 650                          |
| Jarak ke toolbar | 3 px @1440            | 21 px @1440                  |

Kontrak: `apps/web/e2e/page-titles.spec.ts` ("the hymn catalogue opens on the same title as its siblings") membandingkan ukuran, bobot, baris, dan tepi kiri judul katalog dengan `/literatur`, lalu menuntut jarak ≥16 px ke `.kidung-index-toolbar`.

Kolom "Jarak ke toolbar" di atas berlaku untuk kedua bagian Kidung: halaman antrean ("Antrean MIDI") ikut mendapat `.page-intro` sendiri, karena tanpa judul baris tab-nya duduk 10–94 px lebih tinggi daripada katalog dan berpindah bagian membuat baris itu melompat. Halaman antrean adalah grid dengan `row-gap: 10px`, jadi judulnya hanya butuh `margin-bottom: 8px` (8 + 10 = 18) — dan selektornya harus `.page.hymn-page.kidung-tool-page > .page-intro`, karena `.page.hymn-page > .page-intro` (3 kelas) mengalahkan versi 2 kelas.

### Shell: setiap kontrol yang dicapai keyboard menampilkan cincin fokus (putaran 108)

Axe tidak mengaudit cincin fokus, dan stylesheet bisa kehilangannya tanpa ada tes yang gagal: aturan `.kidung-row-menu > summary:focus-visible` pernah terkirim tanpa titik di depan, yang membatalkan **seluruh daftar selektor** sehingga dua menu kehilangan cincinnya sekaligus (putaran 101). Kontrak baru berjalan dengan Tab sungguhan, bukan `element.focus()`, karena cincin hanya muncul untuk `:focus-visible`.

| Butir           | Aturan                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Permukaan       | `/kidung`, `/lainnya`, `/bible?book=kejadian&chapter=1`                                          |
| Tema            | light dan dark                                                                                   |
| Langkah         | 12 Tab per permukaan, jeda 140 ms (cincin memudar masuk)                                         |
| Cincin sah      | `outline-width > 0` dengan `outline-style` bukan `none`, atau `box-shadow` yang tidak transparan |
| Cincin di induk | dihitung sah — kolom pencarian melukis fokusnya di pembungkus                                    |
| Kegagalan       | daftar kontrol tanpa cincin harus kosong                                                         |

### Shell: lantai teks mikro berlaku untuk setiap daun yang dilukis (putaran 109)

| Butir spec                                      | Sebelum                               | Sesudah                                                                 |
| ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Lantai ukuran                                   | 12 px hanya di pengaturan dan tanggal | 12 px untuk **setiap** teks yang benar-benar dilukis, di tujuh rute     |
| Badge pintasan `kbd`                            | 10 px                                 | 12 px                                                                   |
| Label bagian (`.section-heading`)               | 11 px                                 | 12 px                                                                   |
| Label kolom pilihan (`.control-select-label`)   | 11 px                                 | 12 px                                                                   |
| Keterangan aksi kidung (`.hymn-action-caption`) | 10 px                                 | 12 px                                                                   |
| Pil cakupan bait (`.hymn-scope-pill-btn`)       | 11 px                                 | 12 px                                                                   |
| Preferensi pembaca (A−/A+ dan bacaannya)        | 11 px                                 | 12 px                                                                   |
| Keterangan kunci nada, label BPM, capo          | 10–11 px                              | 12 px                                                                   |
| Tanggal kartu Suara                             | 10 px                                 | 12 px                                                                   |
| Teks miring Literatur                           | 11 px                                 | 12 px                                                                   |
| Kontrak                                         | hanya `.date-line` dan `.more-page`   | `apps/web/e2e/micro-text.spec.ts` menelusuri tujuh rute di 390 dan 1440 |

Teks yang hanya untuk pembaca layar (`.sr-only`) tidak dihitung: ia tidak pernah dilukis, jadi tidak punya ukuran yang perlu dijaga. Kontrak membaca ulang sampai halaman tenang, lalu menunggu satu detik lagi sebelum menuduh — panel aset sempat melukis catatan muat 10 px yang membuat tes berkedip.

### Shell: reduced-motion berlaku untuk setiap rute (putaran 110)

| Butir            | Aturan                                                                          | Kontrak                                          |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Cakupan          | Setiap rute, bukan satu elemen yang kebetulan diuji                             | `apps/web/e2e/reduced-motion.spec.ts`            |
| Sumber kebenaran | `prefers-reduced-motion: reduce` dari browser, bukan kelas yang disuntik        | `page.emulateMedia({ reducedMotion: "reduce" })` |
| Ambang           | Animasi > 50 ms dianggap gerak; di bawahnya fade mikro                          | `longest <= 0.05` dilewati                       |
| Waktu sampel     | 900 ms setelah rute siap, karena entrance mulai saat mount dan saat data tiba   | `waitForTimeout(900)`                            |
| Rute             | `/`, `/kidung`, `/kidung/hymn-001`, `/bible`, `/literatur`, `/iman`, `/lainnya` | `SURFACES`                                       |
| Lebar            | 390 dan 1440                                                                    | dua tes                                          |

Hasil: **0** animasi berjalan di ketujuh rute pada kedua lebar. Sebelumnya tidak ada kontrak yang memeriksa ini; setiap tes reduced-motion hanya memeriksa elemen yang sudah dikenal, sehingga entrance baru tanpa penjaga akan lolos.

### Kidung & Iman: tanpa hero, dan bar Alkitab langsung berbentuk tombol (putaran 111)

Pemilik meminta dua hal: judul paling atas di Kidung dan Dasar Kepercayaan dibuang, dan bar Alkitab tidak lagi melukis teks sebelum tombolnya muncul.

| Permukaan                  | Sebelum                                                           | Sesudah                                                         |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `/kidung`                  | `.page-intro` 51 px (390) / 76 px (1440), toolbar mulai y143/y168 | `h1.sr-only`, toolbar mulai **y74** di kedua lebar              |
| `/kidung?section=playlist` | intro yang sama, tab row y148/177                                 | `h1.sr-only`, tab row **y74**                                   |
| `/iman`                    | intro 51/56 px, `.faith-stack` mulai y143/y148                    | `h1.sr-only`, kolom pencarian **y74** (gap 0 dari tepi halaman) |
| Bar Alkitab, frame pertama | teks "Bacaan" lalu "Bacaan / Alkitab"                             | tombol picker, select, cari, dan menu dalam keadaan `disabled`  |

Kontrak: `apps/web/e2e/page-titles.spec.ts` ("headerless destinations start on their first control") menuntut tepat satu `h1` yang tidak terlukis (≤1 px), tidak ada `.page-intro`, dan kontrol pertama ≤24 px dari tepi atas halaman. `apps/web/e2e/bible-header-first-paint.spec.ts` merekam setiap frame lewat `requestAnimationFrame` dan menolak frame yang memuat teks "Bacaan"/"Alkitab" atau tidak punya tombol.

### Shell: audit tema menyentuh setiap permukaan yang berubah (putaran 112)

| Butir                    | Sebelum                                       | Sesudah                              |
| ------------------------ | --------------------------------------------- | ------------------------------------ |
| Rute matriks tema (390)  | beranda, Alkitab, kidung, katalog, pengaturan | + Literatur, Suara, Iman             |
| Rute matriks tema (1440) | beranda, kidung                               | + Literatur, Suara                   |
| Tema                     | dark, sepia, amoled                           | sama                                 |
| Tag axe                  | enam tag, tanpa `disableRules`                | sama                                 |
| Hasil                    | —                                             | 0 pelanggaran pada percobaan pertama |

Kontrak: `apps/web/e2e/shell-a11y.spec.ts` ("reading surfaces stay axe clean in every shell theme", "the desktop shell stays axe clean in the dark and amoled themes").

### Sambutan: tombol Google memenuhi 44 px (putaran 114)

Halaman sambutan sudah punya kontrak 44 px, tetapi kontrak itu hanya mengukur tombol lewati. Tombol Google di dalam `welcome-login` memakai bingkai `.egys-provider` yang dulu menulis `border: 1px solid var(--line)`; karena tombol yang bisa ditekan adalah anak ber-`position: absolute; inset: 0`, bingkai 44 px itu menyisakan **42 px** untuk sasaran tekan. Angka 42 px lolos dari mata dan dari kontrak selama berbulan-bulan.

| Butir                             | Sebelum                     | Sesudah                                   |
| --------------------------------- | --------------------------- | ----------------------------------------- |
| Tinggi bingkai `.egys-provider`   | 44 px (border 1 px)         | 44 px (hairline lewat inset shadow)       |
| Tinggi tombol Google yang ditekan | 42 px                       | **44 px**                                 |
| Lebar tombol Google 390 / 1440    | 282 / 400                   | 284 / 402                                 |
| Garis tepi                        | `border`                    | `box-shadow: inset 0 0 0 1px`             |
| Hover/fokus                       | `border-color: var(--blue)` | `box-shadow: inset 0 0 0 1px var(--blue)` |

Pola yang sama sudah dipakai untuk kertas PDF (garis 1 px digambar dengan inset shadow) dan alasannya identik: border mengubah kotak yang diukur tata letak, shadow tidak. Kontrak: `apps/web/e2e/welcome.spec.ts` mengukur `.welcome-login .egys-google-control .egys-google-fallback` ≥44×44, dan `apps/web/src/egys-google-frame.test.ts` menolak `border` selebar piksel pada `.egys-provider`.

### Sambutan: landscape memuat tombol lewati tanpa menggulir (putaran 114)

Di 844×390 kartu sambutan setinggi 429 px sementara pandangan hanya 390, sehingga "Lewati, mulai membaca" — satu-satunya jalan keluar tanpa akun — berada di bawah lipatan. Di 740×360 jaraknya 93 px lebih jauh lagi.

| Butir                      | Sebelum                       | Sesudah                                        |
| -------------------------- | ----------------------------- | ---------------------------------------------- |
| Tinggi kartu 844×390       | 429 px                        | **244 px**                                     |
| Posisi bawah tombol lewati | 424 px (di luar 390)          | **298 px**                                     |
| Kartu 740×360              | 477 px, lewati tidak terlihat | 244 px, lewati terlihat                        |
| Tata letak                 | satu kolom                    | dua kolom: identitas di kiri, kendali di kanan |
| Sasaran tekan              | 44 px                         | 44 px (Google dan lewati)                      |
| Gulir dokumen              | 87 px                         | 0                                              |

.Kartu hanya berubah di `max-height: 540px` dan `orientation: landscape`; di 390×844 dan 1440×900 tinggi kartu tetap 444 dan 410 px. Salinan pembuka dibungkus `.welcome-copy` agar bisa dipindah ke kolom kiri, dan setiap kendali mendapat sel sendiri supaya penempatan otomatis tidak menyelipkan tombol ke dalam kolom teks.

Kontrak: `apps/web/e2e/welcome.spec.ts` "a landscape phone shows the skip without scrolling" mengukur bahwa tombol lewati sepenuhnya di dalam pandangan, dokumen tidak menggulir, tidak ada luapan mendatar, dan kedua sasaran tekan ≥44 px.

### Literatur: ponsel mendatar memuat bacaan di lipatan (putaran 115)

| Butir                                   | Sebelum                                         | Sesudah                                                |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Tinggi tumpukan alat (390 px pandangan) | 183 px (cari 48 + chip 44 + urutkan 71 + celah) | 102 px (cari & urutkan satu baris 48 + chip 44)        |
| Baris "Urutkan"                         | label tercetak, kontrol di baris sendiri        | label hanya nama aksesibel, kontrol di kanan pencarian |
| Atas konten pertama                     | y 388 (di bawah lipatan)                        | y 290                                                  |
| Sasaran tekan urutkan                   | 48 px                                           | 48 px (tidak berubah)                                  |
| Gulir mendatar                          | 0                                               | 0                                                      |

Kontrak `apps/web/e2e/literature-toolbar.spec.ts` menambah tes di 844×390: pencarian dan urutkan satu baris, urutkan ≤52 px tinggi, combobox masih bernama "Urutkan", dan konten pertama berada di atas lipatan. Aturan CSS-nya berada di blok `@media (orientation: landscape) and (max-height: 540px)` paling akhir `apps/web/src/app-design.css`, sehingga mengalahkan susunan satu kolom di bawah 1200 px.

### Kidung: partitur diaudit di empat tema (putaran 116)

Chrome partitur dirombak pada putaran 86 agar memakai rangka mode teks, tetapi audit axe-nya hanya berjalan di tema terang. `apps/web/e2e/score-a11y.spec.ts` sekarang membuka Partitur di 390 untuk dark, amoled, dan sepia juga, memastikan `html[data-theme]` benar-benar berubah, lalu menjalankan enam tag axe.

| Tema              | Hasil         |
| ----------------- | ------------- |
| light (390, 1440) | 0 pelanggaran |
| dark              | 0 pelanggaran |
| amoled            | 0 pelanggaran |
| sepia             | 0 pelanggaran |

Cakupan bertambah tanpa perbaikan: token kontras dari putaran 101 (`--on-accent`, `--gold`) sudah menahan chrome baru di semua shell. Tes: 5 lulus (12,9 s).

### Kidung: takarir aksi tidak terpotong saat teks 200 % (putaran 117)

| Butir                                         | Sebelum                                                | Sesudah                        |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Takarir "Favorit" pada panel aksi, teks 200 % | 59 px kolom, 66 px teks → terpotong `overflow: hidden` | Membungkus dua baris, utuh     |
| Tinggi tombol aksi di panel, teks 200 %       | 48 px (tetap)                                          | 79 px (`height: auto`)         |
| Tinggi panel, teks 200 %                      | 119 px                                                 | 150 px                         |
| Tampilan pada ukuran normal                   | 48 px / 119 px                                         | 48 px / 119 px (tidak berubah) |
| Gulir mendatar, teks 200 %, 8 rute            | 0                                                      | 0                              |

Kontrak `apps/web/e2e/text-resize.spec.ts` (baru) menuntut tidak ada gulir mendatar di delapan permukaan saat akar font digandakan menjadi 32 px, dan menambah tes khusus yang membuka panel aksi kidung lalu memastikan tidak ada takarir yang `scrollHeight` melebihi kotaknya lebih dari 4 px.

### Kidung: antrean kosong sejajar dengan baris opsinya (putaran 119)

| Butir                        | Sebelum                      | Sesudah                                                                                |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| Tepi kiri kartu kosong, 1440 | x 512 (tengah kolom 1170 px) | **x 247**, sama dengan toolbar dan baris opsi                                          |
| Lebar kartu kosong           | 640 px                       | 640 px (bingkai garis putus 1170 px untuk satu kalimat terbaca sebagai bingkai kosong) |
| Ponsel 390                   | 366 px penuh                 | 366 px penuh (tidak berubah)                                                           |
| Jumlah tepi kiri di halaman  | 2 (toolbar 247, kartu 512)   | 1                                                                                      |

Kontrak `apps/web/e2e/kidung-queue-header.spec.ts` menambah tes: kartu kosong berbagi tepi kiri dengan halaman (±1 px) dan tidak lebih lebar dari 641 px di 1440, sementara di 390 kartu tetap memenuhi lebar.

### Galat dan muat: warna peringatan ikut tema, kerangka tidak menutupi galat (putaran 120)

| Permukaan                                               | Sebelum                                                                    | Sesudah                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tepi `.error-panel`, `.inline-error`, `.route-recovery` | hex `#b98132` di keempat tema                                              | `color-mix(in srgb, var(--gold) …)` — gelap `#e8c46a`, sepia `#8a6a2a` |
| Label peringatan di pengaturan                          | teks `#b98132` dengan latar 14 %                                           | `var(--gold)` di atas `color-mix(var(--gold) 14%, transparent)`        |
| `/literatur` saat katalog gagal                         | kerangka 4 kartu di atas kartu galat                                       | kerangka hanya saat `status === "loading"`                             |
| Rute berhalaman saat chunk datang                       | cadangan 680 px ditimpa 180 px oleh lembar terakhir                        | cadangan 680 px dipertahankan; hanya shell pembaca yang 180 px         |
| Tombol "Coba lagi" di `.error-panel`                    | `.quiet-button` melebar selebar kartu                                      | selebar isinya, seperti `.primary-button`                              |
| Pemilih lagu landscape, lagu ke-81+                     | daftar `overflow: visible`, gulir di badan → pemuat baris tak pernah jalan | daftar yang menggulir, 80 → 160 baris                                  |

Kontrak: `apps/web/src/error-tone.test.ts` menolak hex literal dan menuntut token pada `.error-panel`; `apps/web/src/loading-reserve.test.ts` menjaga cadangan 680 px dan tidak membiarkan lembar lain mengecilkannya; `apps/web/e2e/kidung-reader-picker.spec.ts` menggulir daftar sampai ujung dan menuntut lebih dari 80 baris.

### Galat: setiap kartu menawarkan tindakan yang disebutnya (putaran 121)

| Permukaan                            | Sebelum                                            | Sesudah                                     |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------- |
| Pencarian global saat indeks gagal   | satu baris teks "muat ulang aplikasi" tanpa tombol | judul singkat + tombol "Muat ulang"         |
| Kartu "PDF edisi ini belum tersedia" | judul + paragraf, tanpa jalan keluar               | tombol "Coba lagi" yang memuat ulang sumber |
| Panel muat beranda                   | `min-height: 0` → bilah ±100 px, konten 190 px     | cadangan `min(190px, 40dvh)`                |
| Label kategori di sampul placeholder | 0,625rem (10 px)                                   | 0,75rem                                     |

Kontrak: `apps/web/src/error-actions.test.ts` menuntut judul + tombol muat ulang pada galat pencarian dan tombol coba lagi pada kartu PDF; `apps/web/e2e/micro-text.spec.ts` menjaga lantai 12 px.

### Daftar kosong: kartu menyediakan jalan keluarnya (putaran 123)

| Permukaan                        | Sebelum                       | Sesudah                                                                      |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Literatur, pencarian tanpa hasil | judul + saran, tanpa tombol   | tombol "Hapus filter" (44 px) yang mengosongkan kata kunci dan kategori      |
| Suara, pencarian tanpa hasil     | judul + saran, tanpa tombol   | tombol "Hapus filter" yang mengosongkan kata kunci                           |
| Kidung, pencarian tanpa hasil    | sudah punya "Hapus filter"    | tidak berubah                                                                |
| Iman, pencarian tanpa hasil      | sudah punya "Hapus pencarian" | tidak berubah, tetapi `.secondary-button` naik 40 → 44 px                    |
| `.secondary-button`              | `min-height: 40px`            | `var(--control-hit, 44px)` — tombol kartu galat/kosong adalah sasaran jempol |

Kunci `catalog.resetEmpty` ("Tampilkan semua" / "Show everything" / "显示全部") sengaja berbeda dari `catalog.reset` di toolbar: dua tombol bernama sama dalam satu halaman membuat `getByRole` ambigu, dan `apps/web/e2e/catalog-discovery.spec.ts` sudah memakai nama toolbar itu.

Kontrak: `apps/web/e2e/empty-states.spec.ts` mengisi "zzzqqq" pada keempat katalog, menuntut kartu kosong terlihat, tombolnya ≥43,5 px, lalu mengklik tombol itu dan menuntut kartu hilang serta kolom pencarian kosong.

### Pengaturan: palet akor dan tautan antrean memenuhi 44 px (putaran 124)

| Kontrol                                                      | Sebelum                   | Sesudah                                |
| ------------------------------------------------------------ | ------------------------- | -------------------------------------- |
| `.chord-ui-swatch` (tema & isi akor)                         | 26×26 px, radius 8        | `var(--control-hit, 44px)`, radius 10  |
| `.kidung-settings-section > .text-button` ("Kelola antrean") | 17 px (tinggi baris teks) | `inline-flex`, `min-height: 44px`      |
| Palet akor di 390                                            | 162×194                   | 162×194 (tetap, hanya swatch membesar) |

Kontrak: `apps/web/e2e/settings-touch.spec.ts` membuka panel Nyanyian pada konteks `hasTouch` 390×844, memastikan `(pointer: coarse)` benar-benar aktif, lalu menuntut setiap swatch dan tautan panel ≥43,5 px di kedua sumbu tanpa luapan horizontal.

### Pengaturan: panel Nyanyian, Audio, dan Offline diaudit di empat tema (putaran 125)

| Panel                              | Kontrol yang diperiksa                 | Hasil         |
| ---------------------------------- | -------------------------------------- | ------------- |
| Nyanyian (`data-setting="hymns"`)  | palet akor, sakelar, tautan antrean    | 0 pelanggaran |
| Audio (`data-setting="audio"`)     | select, tombol pratinjau, slider       | 0 pelanggaran |
| Offline (`data-setting="offline"`) | kartu aset terdistribusi, tombol unduh | 0 pelanggaran |

Kontrak: `apps/web/e2e/shell-a11y.spec.ts` › "the settings panels are axe clean in every shell" — 390 px, tema terang + gelap + amoled + sepia, enam tag axe, tanpa `disableRules`.

### Shell: tepi breakpoint diukur, bukan hanya angka bulat (putaran 126)

| Lebar       | Rute   | Hasil                                          |
| ----------- | ------ | ---------------------------------------------- |
| 599 / 600   | 8 rute | tanpa luapan, konten pertama di dalam viewport |
| 719 / 720   | 8 rute | idem                                           |
| 899 / 900   | 8 rute | idem                                           |
| 1199 / 1200 | 8 rute | idem                                           |

Kontrak: `apps/web/e2e/breakpoint-edges.spec.ts` — delapan rute, delapan lebar tepi, `scrollWidth - innerWidth <= 1` dan konten pertama mulai di atas lipatan.

### Shell: tautan lewati memenuhi 44 px dan tetap jadi perhentian pertama (putaran 127)

| Ukuran                         | Sebelum                             | Sesudah                                  |
| ------------------------------ | ----------------------------------- | ---------------------------------------- |
| Tinggi `.skip-link` saat fokus | 41 px                               | 44 px (`min-height: var(--control-hit)`) |
| Lebar                          | 174 px (390) / 157 px (1440)        | tidak berubah                            |
| Perhentian Tab pertama         | `.skip-link`                        | tetap `.skip-link`                       |
| Enter                          | fokus pindah ke `main#main-content` | tetap                                    |

Kontrak: `apps/web/e2e/skip-link.spec.ts` — Tab pertama mendarat di `.skip-link`, kotaknya ≥43,5 px di kedua sumbu, `y >= 0` saat fokus, dan Enter memindahkan fokus ke `main#main-content`.

### Shell: bahasa dokumen mengikuti pilihan pembaca (putaran 128)

| Keadaan                                | `html[lang]`                     |
| -------------------------------------- | -------------------------------- |
| Envelope `locale: "id"`                | `id`                             |
| Envelope `locale: "en"`                | `en`                             |
| Envelope `locale: "zh"`                | `zh`                             |
| Pembaca memilih EN dari pemilih bahasa | berubah ke `en` tanpa muat ulang |

Kontrak: `apps/web/e2e/document-language.spec.ts` — tiga locale dari envelope, lalu satu tes yang benar-benar mengganti bahasa lewat pemilih dan menuntut atribut ikut berubah.

### Shell: halaman tercetak hanya membawa teksnya (putaran 129)

| Elemen                                                                                 | Saat `@media print`               |
| -------------------------------------------------------------------------------------- | --------------------------------- |
| `.topbar`, `.navigation-shell`, `.primary-nav`, `.skip-link`                           | `display: none`                   |
| `.media-surface`, `.update-banner`, `.welcome-page`                                    | `display: none`                   |
| `.main-content`, `.route-view`, `.app-frame`                                           | tanpa padding/margin, latar putih |
| `.verse-content`, `.hymn-text-body`, `.online-article-body`, `.literature-detail-copy` | `max-width: none`, warna `#000`   |

Kontrak: `apps/web/e2e/print-layout.spec.ts` — `page.emulateMedia({ media: "print" })`, chrome wajib tersembunyi, kolom baca tetap terlihat dengan warna tinta dan tanpa gutter.

### Kidung: kontrol ukuran teks memenuhi 44 px (putaran 130)

| Kontrol                             | Sebelum  | Sesudah                                   |
| ----------------------------------- | -------- | ----------------------------------------- |
| A− / A+ / rapatkan / lebarkan baris | 42×40 px | `var(--control-hit, 44px)` di kedua sumbu |
| Reset teks (ikon saja)              | 18×44 px | 44×44 px                                  |
| Panel teks di 390                   | 334×96   | 334×96 (lima tombol 106×44)               |

Kontrak: `apps/web/e2e/reader-preferences-touch.spec.ts` membuka tiga lapis disclosure di toolbar (`hymn-more-actions` → `hymn-reader-settings` → `reader-settings-group`), memastikan `(pointer: coarse)` aktif, lalu menuntut setiap tombol panel ≥43,5 px tanpa luapan.

### Pengaturan: slider akor memakai pita sentuh 44 px (putaran 131)

| Kontrol                                                 | Sebelum             | Sesudah                                                   |
| ------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| `.chord-ui-slider input[type="range"]` di pointer kasar | 16 px (jalur tipis) | `height: var(--control-hit, 44px)`, `margin-block: -12px` |
| Slider audio (panel lain)                               | sudah 44 px         | tidak berubah                                             |

Kontrak: `apps/web/e2e/settings-touch.spec.ts` kini juga mengukur slider akor, bukan hanya swatch dan tautan.

### Kidung: slider volume MIDI memakai pita sentuh 44 px (putaran 132)

| Kontrol                                                  | Sebelum | Sesudah                                                 |
| -------------------------------------------------------- | ------- | ------------------------------------------------------- |
| `.hymn-midi-volume input[type="range"]` di pointer kasar | 16 px   | `var(--control-hit, 44px)` dengan `margin-block: -12px` |
| Lebar                                                    | 222 px  | 222 px (tidak berubah)                                  |

Kontrak: `apps/web/e2e/reader-preferences-touch.spec.ts` kini juga mengukur slider volume di panel yang sama, di samping lima tombol teks.

### Shell: navigasi bawah menandai tepat satu tujuan (putaran 133)

| Rute                                                                                          | `aria-current="page"`                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------- |
| `/`, `/bible`, `/kidung`, `/kidung/hymn-001`, `/kidung?section=playlist`, `/iman`, `/lainnya` | tujuan masing-masing                  |
| `/literatur`, `/suara`                                                                        | `Lainnya` (keduanya dibuka dari sana) |

Kontrak: `apps/web/e2e/nav-current.spec.ts` — sembilan rute, tepat satu `a[aria-current="page"]` di `.primary-nav`, dan namanya cocok dengan tujuan rute.

### Shell: tepi kontrol memenuhi 3:1 di keempat tema (putaran 134)

`--line-strong` dipakai untuk tepi kontrol, bukan garis hias. Nilainya dulu `#bdcedd` di tema terang — **1,61:1** di atas putih — dan `#96836b` di sepia, 2,87:1 di atas kanvas. WCAG 1.4.11 menuntut batas kontrol mencapai 3:1, jadi tombol dan kolom isian terbaca seperti teks dengan noda di sekelilingnya.

| Tema   | Sebelum          | Sesudah   | Terukur (surface / soft / canvas) |
| ------ | ---------------- | --------- | --------------------------------- |
| Terang | `#bdcedd` 1,61:1 | `#6b849b` | 3,89 / 3,39 / 3,59                |
| Gelap  | `#8497a3`        | `#8497a3` | 5,56 / 4,83 / 6,12                |
| Amoled | `#777777`        | `#777777` | 4,42 / 4,11 / 4,69                |
| Sepia  | `#96836b` 2,87:1 | `#7a6847` | 4,80 / 3,93 / 4,24                |

71 aturan kontrol berpindah dari `var(--line)` ke `var(--line-strong)`; garis hias (pemisah baris, bingkai kartu, kerangka) tetap memakai `var(--line)`. Kontrol yang terisi dikecualikan: batasnya digambar oleh isian, bukan tepi.

Kontrak: `apps/web/e2e/control-borders.spec.ts` mengukur setiap kontrol bertepi di delapan rute × empat tema dan menuntut rasio ≥3:1 terhadap latarnya sendiri. 4 lulus (25,8 s).

### Alkitab: setiap baris laci menu adalah target sentuh (putaran 135)

Laci "Menu Alkitab" berisi tombol, select, dan satu tautan prosa ke Pengaturan Tampilan. Tautan itu satu-satunya baris yang tinggal **245×21 px** di bawah pointer kasar, karena ia masih mengalir sebagai teks di dalam paragraf.

| Baris                                                  | Sebelum | Sesudah       |
| ------------------------------------------------------ | ------- | ------------- |
| Tautan "Tema diatur di Pengaturan Tampilan →"          | 245×21  | 245×44        |
| Tombol laci (Catatan, Belah, Player, Pengaturan Suara) | 311×54  | tidak berubah |
| Tutup laci                                             | 44×44   | tidak berubah |

Kontrak: `apps/web/e2e/responsive-touch-targets.spec.ts` › "every row in the Bible drawer is a tap target" membuka laci di 390×844 dengan `hasTouch`, memastikan `(pointer: coarse)` benar, lalu menuntut setiap `button`, `a[href]`, `select`, dan `summary` yang terlihat ≥43,5 px. 7 lulus (12,6 s).

### Alkitab: bilah ayat terpilih memakai target 44 px (putaran 141)

| Butir spec                                     | Sebelum (844×390) | Sesudah                                                                 |
| ---------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| Tombol aksi (Salin, Bagikan, Bacakan, Catatan) | 48–102×36         | tinggi 44                                                               |
| Tombol tutup                                   | 32×32             | 44×44                                                                   |
| Pemilih warna khusus                           | 36×36             | 44×44                                                                   |
| Kontrak                                        | tidak ada         | `responsive-touch-targets.spec.ts` › "the verse toolbar is thumb-sized" |

Bilah yang muncul saat ayat ditekan lama adalah satu-satunya permukaan yang dijangkau jempol sambil membaca, dan di ponsel landscape tombolnya masih 36 px dengan tutup 32 px. Aturan `(pointer: coarse)` di `apps/web/src/styles/05-responsive-refinements.css` menaikkan `.selected-verse-actions .quiet-button`, `.selected-verse-close`, dan `.selected-verse-highlights .highlight-custom` ke `var(--control-hit, 44px)`; input warna 42 px di dalam label 44 px, jadi labelnya yang menjadi target.

### Shell: dok media memakai baris 44 px di pointer kasar (putaran 140)

| Butir spec           | Sebelum   | Sesudah                                                              |
| -------------------- | --------- | -------------------------------------------------------------------- |
| Tautan sumber di dok | 292×24    | 292×44                                                               |
| Slider progres       | 16 px     | pita 44 px                                                           |
| Select kecepatan     | 61×26     | 61×44                                                                |
| Tinggi dok           | 262 px    | 300 px                                                               |
| Kontrak              | tidak ada | `responsive-touch-targets.spec.ts` › "the media dock is thumb-sized" |

Dok media adalah satu-satunya permukaan yang dijangkau jempol saat membaca, dan barisnya masih seukuran teks. Aturan `@media (pointer: coarse)` di `apps/web/src/styles/05-responsive-refinements.css` menaikkan tautan sumber, slider progres, dan select kecepatan ke `var(--control-hit, 44px)`; dok tumbuh 38 px dan tidak ada overflow di 390 maupun 320.

### Alkitab: pengaturan suara di laci memakai baris 44 px (putaran 139)

| Butir spec              | Sebelum           | Sesudah                                                                                   |
| ----------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| Select mesin suara      | 281×34            | 281×44                                                                                    |
| Kolom endpoint Edge     | 281×34            | 281×44                                                                                    |
| Slider volume/kecepatan | 16 px             | pita 44 px di pointer kasar                                                               |
| Label baris             | 0,6875rem (11 px) | 0,75rem                                                                                   |
| Kontrak                 | tidak ada         | `responsive-touch-targets.spec.ts` › "the Bible drawer's speech settings are thumb-sized" |

Laci Alkitab adalah permukaan jempol, tetapi baris pengaturan suaranya tetap 34 px setelah seluruh kontrol pembaca lain mencapai 44 px. Aturan `.drawer-speech-select, .drawer-speech-input` sekarang memakai `min-height: var(--control-hit, 44px)`, slider mendapat pita 44 px di `(pointer: coarse)`, dan labelnya naik ke lantai teks mikro.

### Kidung: jalan keluar dari antrean kosong adalah target sentuh (putaran 138)

| Butir spec                        | Sebelum                   | Sesudah                                                                  |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Tautan "Kembali ke daftar Kidung" | 140×17 (setinggi teksnya) | 140×44                                                                   |
| Di 390 px                         | 167×17                    | 167×44                                                                   |
| Kontrak                           | tidak ada                 | `empty-states.spec.ts` › "the way out of an empty queue is a tap target" |

Kartu kosong di katalog lain berakhir dengan tombol 44 px; antrean MIDI berakhir dengan tautan teks, dan tautan hanya setinggi barisnya. Aturan `.kidung-tool-page .kidung-empty-state .text-button` memberi `inline-flex` + `min-height: var(--control-hit, 44px)` tanpa mengubah bingkai kartunya.

### Shell: landscape juga jempol, bukan hanya 390 px (putaran 137)

| Butir spec                   | Sebelum                              | Sesudah                                               |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Konteks probe                | `hasTouch` hanya bila lebar < 768 px | opsi `touch` eksplisit; 844×390 diukur sebagai jempol |
| Target di `/kidung`          | 36×36 (mode, tab)                    | 44×44                                                 |
| Target di `/kidung/hymn-001` | 32×32 (kembali, aksi, Partitur)      | 44×44                                                 |
| Target di `/bible`           | nomor ayat 24×39                     | area tekan `::before` 44×44                           |
| Kontrak                      | hanya 390 dan 820                    | +844×390 untuk empat rute pembaca                     |

`apps/web/scripts/probe-harness.mjs` sekarang menerima `touch` (default: lebar < 768 px) supaya probe landscape tidak lagi mengukur tata letak pointer halus dan melaporkan target 32 px yang tidak pernah dilihat jempol. Kontrak `responsive-touch-targets.spec.ts` menambah blok 844×390 yang memastikan `(pointer: coarse)` benar dulu, melewati `details:not([open])` (panel tertutup tidak dilukis, jadi anak-anaknya masih membawa tata letak sebelum animasi masuk), melewati input `clip: rect(0,0,0,0)`, dan menghitung area tekan `::before` sebagai bagian dari target.

### Shell: logo dan tautan surel adalah target sentuh di ponsel sempit (putaran 136)

| Elemen                              | Sebelum (320/360) | Sesudah    | Aturan                                                           |
| ----------------------------------- | ----------------- | ---------- | ---------------------------------------------------------------- |
| `a.brand.brand-mark`                | 40×44             | **44×44**  | `min-width: var(--control-hit, 44px)` di blok `max-width: 599px` |
| `.report-card .report-email-hint a` | 132×19            | **132×44** | `inline-flex` + `min-height: var(--control-hit, 44px)`           |

Logo adalah jalan pulang, dan tautan surel di kartu laporan tetap kontrol meski berada di dalam baris petunjuk. Keduanya lolos 44 px tanpa menambah gulir mendatar (320/360/390/1440: `scrollWidth - innerWidth` = 0). Kontrak: `apps/web/e2e/responsive-touch-targets.spec.ts` › "the brand link and the report mailto are tap targets at 320".

Catatan pengukuran: tombol di dalam panel yang tertutup terbaca 43,1 px karena animasi `selector-in` (`scale(0.98)`) belum pernah berjalan — panel tertutup tidak dilukis, jadi angka itu bukan target nyata. Probe harus melewati kontrol di dalam `details:not([open])`.

### Putaran 144 / batch 402: tekan Google nyata dan gelombang Kidung

Spesifikasi sebelum implementasi UI (Refs #99, #100, #101; tindak lanjut harness #102):

1. Kontrol GIS yang sudah tergambar memberi pesan terlihat segera pada setiap tekan pointer atau keyboard lewat API resmi `click_listener`, bukan tangkapan klik induk iframe.
2. Pesan id/en/zh menjelaskan menunggu Google dan cara mencoba lagi bila jendela tidak muncul; tidak mengklaim popup pasti diblokir atau login berhasil.
3. Pesan memakai semantik status, berada di alur dokumen di luar bingkai kontrol, tidak menutupi sasaran 44 px dan tidak menambah h1.
4. Welcome dan menu akun memakai komponen bersama; empat tema mengikuti token teks yang sudah ada, tanpa warna literal dan tanpa animasi baru.
5. Callback kredensial menghapus pesan sebelum pertukaran token; unmount/retry/locale baru tidak boleh menerima notifikasi dari kontrol lama.
6. Kontrak browser menekan kontrol GIS no-op yang benar-benar tergambar, bukan memanggil handler komponen langsung; pengujian mencakup pointer dan keyboard serta status terlihat.
7. Kontrak Kidung mengukur nama animasi saat gelombang pertama pada baris layar penuh dan memastikan reduced-motion mematikan animasi pada saat itu, bukan setelah 900 ms. Batching awal sudah diperbaiki; data tambahan terlambat tidak diubah tanpa bukti.
8. Harness `check:fast` gagal nonzero bila penemuan Git gagal; repo bersih tetap lolos. Fallback selektif tetap menyertakan spec yang berubah eksplisit (#102), bukan membuangnya ketika sumber bersama memicu core tier. Regresi CLI tidak menjalankan suite/build lokal berat.

Implementasi batch ini selesai; `pnpm check:fast` lulus (25 tes skrip, 23 tes web, typecheck, format, dokumen). Kontrak credential menunggu status benar-benar terlihat sebelum mengirim callback, agar assertion penghapusan pesan tidak lulus semu akibat batching React. Perubahan Kidung hanya memperkuat regresi untuk perbaikan produksi yang sudah ada, bukan mengklaim perbaikan CSS baru.

Bukti hosted batch ini sekarang ada pada HEAD `3f721824`. Push run `43821078698` (job unit `133144140958`) menjalankan 1.135 tes: 885 Vitest, 3 policy, 217 skrip, 30 skrip web. Job selektif `133144141015` menjalankan 101/101 tes pada delapan spec — termasuk Google dan Kidung, serta fallback core tier yang mempertahankan spec eksplisit (#102). Full dispatch `43821357448` memberi shard `133145244115`, `133145244117`, `133145244124`, `133145244134`, perf `133145244160`, dan gate `133148985842`; job unit-nya skipped, jadi angka unit di atas hanya milik push run, bukan dispatch. Artefak yang tersedia: build `14204956487`, preview shard 1 `14205356172` (empat gambar appearance), dan preview shard 2 `14204128935` (26 gambar Kidung). Status Google tidak punya screenshot, jadi ia hanya dibuktikan assertion — bukan mata. Katalog Kidung ponsel dan pengaturan tampilan tablet gelap dibaca langsung: tidak ada klip yang jelas; audit awal verifier memeriksa 8 dari 30 gambar; baseline tidak diperbarui.

Tindak lanjut harness pada putaran goal 2 (#103), tanpa perubahan UI: verifikasi
ulang fork pemulihan 13/13 lulus, tetapi manager live HMR menolak instalasi dengan
`already-installed` dan `changed:false`. Fork tidak aktif; tidak ada remove gate,
rotasi proxy, atau perubahan baseline. Satu proxy lama 0.1.215 tetap berjalan.
Tes fork bukan bukti kelanjutan chat lama; aktivasi menunggu jalur aman yang
mempertahankan gate atau maintenance berizin dengan rollback.

Galat pasangan tool saat pemulihan sesi diatribusikan jujur: pasangan asli di transcript utuh, penyebab di jalur wire belum terbukti, dan HTTP 413 pada request CommandCode adalah masalah terpisah; pemulihan masih terbuka. Audit HEAD sebelumnya memakai full run 43800676388 (browser/perf) dan push run 43800675190 (unit). Contrast putaran 143 sudah diimplementasikan pada HEAD 79cf2315 dan tercakup lima kontrak di `prefers-contrast.spec.ts`.
