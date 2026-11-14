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
