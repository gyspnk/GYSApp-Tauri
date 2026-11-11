# Otak agent: delegasi terstruktur untuk GYSApp-Tauri

Mulai putaran 33 goal ini mewajibkan pekerjaan didelegasikan ke subagent dengan peran
yang jelas, bukan dikerjakan serial oleh satu agen. Dokumen ini menyebut peran,
kontrak masuk/keluar, dan cara hasilnya diperiksa. Diagram plugin harness yang
menampilkan koneksi antar komponen menyusul di `docs/plans/agent-brain-viz.md`
setelah spesifikasinya selesai.

## Prinsip

1. Satu putaran = satu perubahan yang bisa dibuktikan. Delegasi tidak menambah
   cakupan, hanya memindahkan kerja yang bisa dipisah.
2. Setiap subagent menerima **lingkup berkas** dan **batas tindakan**. Builder tidak
   pernah push; verifier tidak pernah mengubah kode.
3. Koordinasi lewat hasil, bukan lewat percakapan panjang: subagent mengembalikan
   ringkasan ≤ 25 baris dengan bukti (perintah + keluaran kunci).
4. Yang gagal dihapus, bukan dipertahankan. Peran yang tiga putaran berturut-turut
   tidak menghasilkan apa pun dicabut dari alur.

## Peran

| Peran                             | Masukan                                     | Keluaran                                                                            | Batas                                                     |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Otak** (agen utama)             | goal, antrean putaran, hasil subagent       | keputusan, commit, push, laporan                                                    | satu-satunya yang menyentuh git                           |
| **Penyusun spesifikasi** (`spec`) | satu permukaan + artefak desain             | 6–10 butir `perubahan — alasan — kontrak tes`, menolak butir yang datanya tidak ada | tidak menyentuh kode                                      |
| **Pembangun** (`builder`)         | butir spesifikasi + lingkup berkas          | diff di working tree, keluaran `pnpm check:fast`                                    | tidak commit/push, tidak menyentuh berkas di luar lingkup |
| **Pemeriksa** (`verifier`)        | diff + kontrak tes                          | temuan berurut: salah logika, risiko, cakupan tes kurang                            | read-only                                                 |
| **Harness** (`harness`)           | keluaran CI terakhir + keluhan waktu tunggu | satu perbaikan alat + tes                                                           | tidak menyentuh `apps/`                                   |

Peran `spec` dipakai saat permukaan belum punya spesifikasi. Kalau spesifikasi sudah
ada (`docs/plans/ui-spec-loop.md`), otak mengambil butir berikutnya sendiri dan
langsung menurunkan `builder`.

## Protokol satu putaran

1. **Pilih**: otak membaca antrean (`docs/plans/ui-spec-loop.md`, sisa pekerjaan di
   handoff) dan memilih satu butir.
2. **Bagi**: bila butir punya bagian yang mandiri (riset penyebab, pemangkasan
   mekanis, audit), otak menjalankan 1–3 subagent paralel dengan lingkup terpisah.
3. **Kerjakan**: otak mengerjakan bagian yang butuh keputusan (desain, kontrak tes)
   sambil subagent berjalan. Tidak menunggu di foreground.
4. **Gabung**: hasil subagent diperiksa otak; yang lolos di-commit oleh otak dengan
   pesan konvensional, lalu push.
5. **Buktikan**: `pnpm check:fast` lokal, lalu CI hosted (`gh api …/runs/<id>` polling).
   Bukti yang dikutip di laporan harus run id nyata.
6. **Catat**: jebakan baru masuk `docs/plans/HANDOFF-2026-11-10.md` §8; butir yang
   selesai ditandai di `ui-spec-loop.md`.

## Kontrak subagent

Setiap brief wajib memuat: tujuan satu kalimat, lingkup berkas, larangan (commit,
push, menyentuh berkas lain, menjalankan suite penuh), perintah verifikasi yang
boleh dipakai, dan bentuk laporan. Brief tanpa larangan eksplisit ditolak otak.

Subagent boleh saling mengirim pesan bila berbagi berkas; kalau tidak berbagi,
pesan hanya menambah waktu dan dihindari.

## Pengukuran

Perbaikan alur dinilai dari empat angka yang sudah tersedia: jumlah putaran per
perubahan yang di-commit, waktu dinding per putaran, jumlah run CI merah per
perubahan, dan ukuran konteks yang dipakai (ledger cache). Alur yang menaikkan
salah satunya tanpa alasan dicabut.

## Status

- Putaran 33: dua subagent paralel dijalankan (diagnosis scroll Kidung, spesifikasi
  plugin diagram) dan satu builder (pemangkasan CSS mati). Hasilnya diperiksa pada
  putaran yang sama.

## Panel otak di GB Tools (10 November 2026)

Plugin sidebar `@local/kiss-bridge` sekarang tampil sebagai **GB Tools** (judul dock,
judul dok dan metadata locale); nama paket dan id plugin tetap `@local/kiss-bridge`
supaya pemasangan `link:` di profil web tidak berubah. Menu keempat, **Agent Brain**,
adalah panel peta delegasi:

- membaca `ctx.get('sessions').list` (layanan klien resmi; tidak ada HTTP baru) dan
  berlangganan perubahan. Snapshot-nya `{ ids, byId, phase, projectionsBySession }`,
  dan baris `byId` memakai **`id`, `parentId`, `running`, `displayTitle`** — bukan
  `sessionId`/`parentSessionId`; nama yang salah itu pernah membuat panel tampil
  kosong padahal sesi ada (diperbaiki di plugin `6ab94ed`);
- akar = sesi tanpa `parentId` (maksimal 4, terbaru dulu), anak = sesi yang
  `parentId`-nya termasuk akar yang tampil (maksimal 14);
- simpul berjalan berdenyut (`running === true`), tepi dari induk ke anak bergerak,
  label dari `displayTitle` lalu nama folder kerja; klik **atau** Enter/Spasi
  menyalin id sesi, dan peta diberi label `role="group"`;
- detail hidup per simpul (plugin `738672b`): untuk tiap sesi yang tampil, panel
  membaca `sessions.binding(id).eventSource` dan memindai entri terakhir untuk
  `turn/start` dan `tool/call` (payload `{turn, step, callId, name, arguments}`),
  lalu menulis `T<turn> · <tool>` di bawah nama. Hanya perubahan turn/tool yang
  memicu render — tiap chunk streaming menerbitkan entri `transient`, jadi tanpa
  pembanding itu panel akan render ratusan kali per detik;
- semua akses ke `binding` dibungkus `try/catch` dan dianggap "tidak ada detail"
  bila bentuknya berbeda, supaya panel tidak pernah kosong total karena satu API
  bergeser;
- batas jujur: belum ada status fase workflow (`tool-workflow/*`) dan belum ada
  kontrak tes otomatis untuk panel — plugin tidak punya harness browser, jadi
  pembuktiannya hanya `node --check` + `node test/smoke.js` + pembacaan tipe. Jangan
  menulis "sudah teruji di browser" untuk panel ini;
- masih tersedia tetapi belum dipakai: `projectionsBySession[id].values.subagentCatalog`
  untuk hitungan anak yang berjalan (sekarang memakai `byId[child].running`).

## Aturan swarm (supaya tidak membebani mesin)

1. Pecah pekerjaan hanya bila bagiannya benar-benar independen; dua subagent
   untuk pekerjaan yang saling menunggu lebih lambat daripada satu.
2. Batch besar adalah default (pemilik, 11 Nov): empat subagent paralel, dan
   sampai enam bila berkas/repo-nya benar-benar terpisah serta mesin terukur
   ringan (CPU, RAM, dan waktu tunggu tidak memburuk). Verifier dijalankan
   terpisah dari builder supaya tidak menilai pekerjaannya sendiri.
3. Setiap brief memuat lingkup berkas, larangan (mis. jangan commit), bentuk
   keluaran, dan cara memverifikasi. Builder tidak pernah commit.
4. Otak memantau lewat panel dan menutup subagent yang selesai; plugin atau
   subagent yang tidak lagi dipakai dihapus, bukan dibiarkan.

## Lingkup

Otak ini bekerja untuk seluruh harness, bukan hanya GYSApp-Tauri: repositori
aplikasi, plugin sidebar, skrip harian, dan dokumen rencana. Putaran aplikasi
tetap berjalan lewat `docs/plans/ui-spec-loop.md`; pekerjaan harness lewat
panel GB Tools dan `docs/plans/agent-brain.md`.

## Panel otak: interaksi langsung (11 Nov)

Peta bukan lagi gambar statis. Yang bisa dilakukan dari panel:

- **Pilih node** dengan klik atau `Space`; node terpilih menyorot garis ke
  induk/anaknya, node lain meredup, dan kartu detail muncul di bawah peta
  (status, putaran + alat terakhir, jumlah anak yang didelegasikan, folder
  kerja, id sesi).
- **Salin id** lewat tombol di kartu detail, `Enter`, atau klik ganda.
- **Geser peta** dengan seret; **zoom** dengan roda (0,6×–2,2×, berpusat di
  kursor) atau tombol **Pas** untuk kembali.
- **Saring** dengan "Hanya berjalan" — peta hanya menyisakan sesi yang masih
  bekerja beserta garisnya.
- Animasi: garis berjalan memakai dash yang mengalir, node berjalan punya
  halo berdenyut, perpindahan node memakai transisi `transform` 280 ms, dan
  `prefers-reduced-motion` mematikan semuanya.

Batas jujur: panel belum punya kontrak browser karena harness di mesin ini
menjawab `401` untuk sesi non-operator, jadi verifikasi yang dijalankan baru
`node --check client.js`, `node test/smoke.js`, dan pemeriksaan bahwa 18 kunci
`t()` di panel ada di kedua kamus (`en` dan `id`). Kepemilikan tetap: peta
hanya membaca `sessions.list` dan `binding(id).eventSource`; ia tidak
mengarang fase workflow atau nama alat yang tidak ada di event.

## Batch besar yang efisien (11 Nov)

Supaya banyak pekerjaan selesai simultan tanpa saling merusak:

1. **Satu berkas, satu pemilik.** Dua subagent tidak boleh menulis berkas yang
   sama. Peta kepemilikan ditulis di brief ("hanya berkas ini"); otak menolak
   brief yang tumpang tindih sebelum dikirim.
2. **Brief = kontrak.** Setiap brief memuat: konteks yang berubah, lingkup berkas,
   larangan (jangan commit/push, jangan jalankan suite penuh), bentuk keluaran,
   dan cara verifikasi yang boleh dipakai.
3. **Kerja yang saling menunggu tidak didelegasikan.** Kalau B butuh hasil A,
   otak mengerjakan urutannya sendiri; subagent hanya untuk cabang independen.
4. **Ukur bebannya, bukan menebak.** Sebelum menaikkan jumlah subagent, baca
   `uptime`, `free -m`, dan waktu tunggu; kalau load rata-rata mendekati jumlah
   inti atau RAM tersisa di bawah ~15%, batch dikurangi.
5. **Hasil batch diverifikasi otak**, bukan dipercaya: `pnpm check:fast` untuk
   tipe/format, `pnpm e2e:one` untuk kontrak yang tersentuh, lalu hosted run untuk
   bukti. Subagent yang gagal dilaporkan apa adanya, bukan ditutupi.

## Fase workflow di panel (11 Nov)

Panel membaca `tool-workflow/run-start`, `agent-start`, `agent-end`, `run-end` dari
`binding(id).eventSource` yang sama dengan detail turn/tool. Yang ditampilkan hanya
badge `.kb-brain-wf` ("workflow · N agen" saat berjalan, "workflow done" setelah
`run-end`) dan satu baris "Workflow" di kartu detail. `agent-start.phase` sengaja
tidak dipakai karena itu judul fase, bukan status run. Batas jujur: kalau jendela
event terpaginasi di atas `agent-start` lama, jumlah agen adalah batas bawah —
status buka/selesai tetap benar karena event agen yang lebih baru dari `run-end`
membuktikan run masih terbuka. Panel belum punya kontrak browser; verifikasinya
`node --check`, `node test/smoke.js`, cakupan kunci locale, dan urutan event sintetis.

## Alur kerja seperti developer: issue tracking (11 Nov)

Otak bekerja seperti developer pada umumnya: masalah, pekerjaan yang belum
selesai, dan keputusan yang menunggu tinggal di GitHub issue repo ini, bukan di
catatan percakapan yang hilang.

1. **Satu masalah, satu issue.** `gh issue create` dengan judul yang menyebut
   lingkup (`[harness]`, `[release]`, `[data]`, `[bug]`) dan badan berisi apa yang
   salah, bukti yang sudah ada, dan apa yang akan menutupnya. Label: `bug`,
   `harness`, `release`, `blocked`.
2. **Antrean putaran dibaca dari issue terbuka lebih dulu**, baru dari dokumen
   rencana. Issue yang sudah ditutup tidak dikerjakan ulang.
3. **Commit menyebut issue** (`Refs #12`) supaya riwayat git dan papan issue
   saling menunjuk.
4. **Penutupan wajib berbukti**: komentar berisi run id + hasil hosted, lalu
   `gh issue close`. Issue yang ternyata tidak dikerjakan ditutup dengan alasan,
   bukan dibiarkan menggantung.
5. **Jangan membuat issue untuk hal yang sudah selesai**; kalau sebuah issue
   ternyata salah (mis. masalahnya bukan di tempat yang ditulis), perbaiki badan
   issue sebelum menutupnya.

Antrean terbuka saat aturan ini ditulis: #12 panel Agent Brain belum punya
kontrak browser, #13 commit plugin GB Tools belum dipisah/didorong, #14 rilis
putaran 276, #15 Suara butuh data audio sebelum kartu 16:9 dan tombol putar bisa
jujur.

## Sesi subagent dipakai ulang (11 Nov)

Context window subagent adalah aset: sesi yang sudah memegang berkas, keputusan, dan
angka pengukuran lebih murah dilanjutkan daripada membangun sesi baru dari nol.

1. **Cek register sebelum membuat sesi.** `docs/plans/subagents.md` memetakan nama →
   id → permukaan. Tujuan atau konteks yang sama berarti `send_message` ke sesi lama,
   bukan `subagent` baru.
2. **Nama jelas lebih dulu.** Baris pertama brief selalu `Nama: <permukaan> — <kata
kerja + objek>` dan `description` panggilan `subagent` memakai frasa yang sama
   (3–5 kata), karena itulah yang muncul sebagai judul chat di harness dan label di
   panel otak. "builder" atau "task" bukan nama.
3. **Satu sesi satu permukaan.** Jangan mencampur Kidung dengan Iman atau rilis
   dengan panel otak hanya karena sesinya masih hidup.
4. **Selesai bukan berarti dibuang.** Sesi `inactive` tetap bisa dilanjutkan; yang
   dihapus hanya peran yang sudah mati tujuannya.
5. **Builder tetap tidak commit.** Reuse tidak melonggarkan batas peran.

### Peta mengisi dialognya (11 Nov)

Panel sempat menggambar peta sebagai strip 2:1 di atas dialog yang tinggi, jadi separuh bidang tampak kosong. Sekarang `.kb-card.kb-brain` memegang tinggi body dialog (`display:flex; flex:1; min-height:0`), `.kb-brain-map` tumbuh dengan `flex:1 1 0`, dan `BrainPanel` mengukur kotak SVG lewat `ResizeObserver` lalu memakai viewBox `0 0 660 <tinggi sesuai aspect>`; koordinat node diskalakan (`y * mapH/340`) supaya sebaran ikut tinggi, dan roda/geser memakai skala 660 unit yang sama.

Terukur dengan stylesheet plugin yang sama di halaman uji statis: peta menempati **0,44 → 0,70** tinggi dialog 780×840, dan **0,32 → 0,69** pada panel sempit (420×700). Batas jujur: belum ada verifikasi di GUI hidup (127.0.0.1:3080 menjawab 401 untuk sesi non-operator) dan repo plugin masih lokal (#13).
