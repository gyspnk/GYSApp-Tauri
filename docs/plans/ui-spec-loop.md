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
