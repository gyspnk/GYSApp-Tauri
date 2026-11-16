# Otak agent: delegasi terstruktur untuk GYSApp-Tauri

Mulai putaran 33 goal ini mewajibkan pekerjaan didelegasikan ke subagent dengan peran
yang jelas, bukan dikerjakan serial oleh satu agen. Dokumen ini menyebut peran,
kontrak masuk/keluar, dan cara hasilnya diperiksa. Diagram plugin harness yang
menampilkan koneksi antar komponen menyusul di `docs/plans/agent-brain-viz.md`
setelah spesifikasinya selesai.

## Default utama: MAIN di chat ini

Keputusan pemilik, 16 November 2026: sesi
`session-c96f4351-b076-4c33-9a7c-9f28f29bc799` adalah **satu-satunya MAIN
orchestrator default** untuk pekerjaan lanjutan goal ini. Chat _Nonstop Development
Part 2_ hanya menjadi riwayat dan target pemulihan, bukan pusat koordinasi paralel.
Jangan memindahkan MAIN atau mengganti modelnya tanpa permintaan eksplisit pemilik.

- MAIN tetap `chatgpt/gpt-6.1-sol`: memilih prioritas, membagi lingkup, mengambil
  keputusan, mengintegrasikan hasil, commit/push, serta mencatat bukti dan status goal.
- Semua explorer, executor/builder, harness, dan verifier anak/cucu memakai
  `DeepSeek V4.1 Flash (latest) (CC)` melalui
  `commandcode/deepseek/deepseek-v4.1-flash`, termasuk sesi yang dipakai ulang.
  Buktikan route dari request runtime; label brief bukan bukti model.
- Alur baku: issue terbuka + handoff → batch terukur → spec UI sebelum kode →
  scope penulis terpisah + reuse register → delegasi paralel sambil MAIN bekerja →
  verifier independen → pemeriksaan cepat lokal → commit/push oleh MAIN → bukti
  hosted → dokumentasi/issue → batch berikutnya. Builder tidak commit/push;
  verifier read-only. Jangan membuat delegasi semu untuk tugas sederhana.
- Default empat subagent untuk batch yang punya pekerjaan mandiri; maksimum enam
  hanya bila scope terpisah dan sumber daya terukur cukup. MAIN tidak menunggu
  pekerjaan saling bergantung dengan menambah agen.
- Saat sesi dipulihkan, baca bagian ini dan `subagents.md` sebelum delegasi.
  Plugin `@local/gys-session-policy` terikat root MAIN ini; root lain tidak diubah.
  Aturan ini bukan perubahan model default global seluruh profil.

Goal runtime **revisi 3** sudah diperbarui pada giliran manusia langsung, 16 November
2026: MAIN default, route CC descendant, dan perbaikan estetika GB Tools/Agent Brain
sudah tertulis di objective. Penolakan pada putaran otomatis sebelumnya adalah
riwayat, bukan status pending yang masih berlaku. Backlog UI dilacak di #104.

Untuk #104, mulai dari cacat yang dapat dibuktikan: kartu node 156 unit bertabrakan
ketika 14 anak ditempatkan dengan sela pusat 44 unit. Builder tunggal memegang
client plugin dan tes model; MAIN menulis spec/dokumen; verifier read-only. Client
Slots/Theme belum punya halaman terhubung, sehingga perubahan warna dan klaim
visual final ditunda. Jangan mengarang token atau menilai UI dari tes headless.
Perubahan Money Worker yang sudah ada di working tree plugin harus tetap utuh dan
tidak boleh ikut commit batch ini.

## Pelajaran layout dan verifikasi panel (#104)

- Uji batas kartu/metadata pada maksimum node; jumlah render yang benar tidak
  mencegah tabrakan. Fixture 4 akar + 14 anak awalnya memiliki 39 pasangan overlap
  dan dua kartu keluar peta; grid tiga kolom menurunkannya ke nol tanpa mengecilkan
  teks. Tinggi intrinsik 878 unit perlu viewport gulir, bukan pemampatan vertikal.
- Pada viewport gulir, wheel biasa tidak boleh dicegat sebagai zoom. Gunakan
  Ctrl/Meta+wheel; tombol panah memindah fokus/scroll ke node, bukan hanya selection.
  Label reset tidak boleh menyatakan Fit bila hanya kembali ke skala 1:1.
- Pisahkan tes model/render (25), stub registrasi (dua tambahan, total 27), pemeriksaan
  source/patch, dan browser nyata. Kelulusan headless tidak membuktikan UI termuat,
  kontras, reduced-motion, perilaku trackpad, atau fokus SVG saat zoom/pan.
- Publish source plugin hanya setelah WIP dan stack repo terkait terisolasi.
  Commit/CI dokumen aplikasi tidak membuktikan kode plugin diuji hosted. #104
  tetap terbuka untuk tema dan estetika pada Client yang benar-benar terhubung.

## Handoff aktif versus arsip (#105)

Prompt copy/paste §9 handoff harus menunjuk kebijakan dan cadence yang berlaku,
bukan menyalin status commit, angka rilis, atau hasil CI historis. Checker memeriksa
blok prompt aktif; arsip di luar blok bukan instruksi baru dan tidak dilarang.
Putaran 4 memakai ulang Harness sebagai penulis checker/tes, MAIN sebagai penulis
dokumen, dan verifier read-only untuk audit publikasi plugin serta review guard.
Dua scope mandiri cukup untuk batch ini; tidak ada dua penulis pada berkas sama.

## Preview terverifikasi tanpa build lokal (#107)

Pada putaran 6, Harness mengaudit/download arsip dan verifier mengaudit rollout
secara read-only; MAIN mengintegrasikan dist serta menulis dokumen. Hanya dua
scope mandiri, tanpa penulis ganda atau tool permanen baru. Reuse artefak mensyaratkan
repo/run/SHA, digest dan input runtime cocok; semua delta Git tetap diperiksa,
meski key cache CI lebih konservatif karena mencakup seluruh `scripts/`.
HTTP 200 bukan freshness: cocokkan index, manifest integrity dan aset yang benar-benar
disajikan. Jangan menghapus site data, mengubah baseline, atau menyebut build SHA
artefak sebagai HEAD baru. Pisahkan browser test hosted, byte HTTP lokal, dan UI
aktual dengan service-worker cache milik pengguna. Review independen mencegah
rename lintas filesystem: `/tmp` adalah tmpfs; staging/backup dipindahkan ke
`.verify/preview-round6` pada filesystem repo, guard `st_dev` tetap dipertahankan.
Unduh arsip sebagai stream pada job terkelola agar timeout/buffer sementara tidak
membuang seluruh progres; percobaan sebelumnya gagal sebelum 32 MB selesai.
Request round 6 tetap membuktikan MAIN `chatgpt/gpt-6.1-sol` dan kedua sesi reuse
`commandcode/deepseek/deepseek-v4.1-flash` (13:15–13:16 UTC).

## Prinsip

1. Satu putaran = satu batch perubahan yang bisa dibuktikan. MAIN menetapkan
   cakupan; delegasi memindahkan pekerjaan mandiri, bukan memperluasnya diam-diam.
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

1. **Pilih**: MAIN membaca issue terbuka, `docs/plans/ui-spec-loop.md`, dan sisa
   handoff; pilih batch prioritas dengan hasil dan batas verifikasi yang jelas.
2. **Bagi**: baca register dan pakai ulang anak yang bisa diakses. Default empat
   subagent paralel dengan scope penulis terpisah; maksimum enam bila mesin ringan.
   Bila pekerjaan tidak mandiri, MAIN mengerjakannya tanpa delegasi semu.
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

## Panel tidak mengarang (11 Nov)

Audit panel terhadap API klien menemukan sepuluh tempat di mana tampilan bisa berbeda dari keadaan sebenarnya. Yang diperbaiki di plugin (commit `9cfa5ff`):

- **Garis hanya bila induknya nyata.** Anak yang induknya di luar empat root teratas tidak lagi disambung ke root acak; simpulnya ditandai `orphan` dan tampil tanpa kabel.
- **Detail tidak hilang saat daftar terbit.** `read()` tidak lagi mereset `details`; setState menggabungkan hasil baca sebelumnya.
- **Workflow dihitung per `runId`.** Beberapa run bisa hidup bersamaan, jadi tiap run punya kumpulan `started`/`ended` sendiri; `run-end` hanya menutup run dengan `runId` yang sama, dan agen = selisih himpunan untuk semua run yang hidup.
- **Angka yang tidak pasti ditandai.** Bila jendela event terpotong (`hasMore`) atau ada `agent-end` tanpa `agent-start`, badge menulis `≥N`, bukan angka palsu.
- **Biaya pindai turun.** Hanya simpul `running` dan yang dipilih yang dibaca detailnya, dengan gerbang `revision` dan debounce 250 ms — streaming per chunk tidak lagi memicu pemindaian seluruh jendela untuk setiap simpul.

Kontrak yang tersedia sekarang hanya `node --check`, `node test/smoke.js`, dan uji event sintetis (dua run paralel, satu `run-end`); belum ada uji browser karena `127.0.0.1:3080` menjawab 401 untuk sesi non-operator (issue #12).

## Kontrak model panel (11 Nov)

Logika panel dipisah ke model murni di scope modul `client.js` (`buildGraph`, `readWorkflow`, `describeDetail`, `sameDetail`, `shortLabel`) dan diekspor lewat `typeof module` — `require` relatif tidak didukung loader klien (`dsh-client-modules/lib/client.js:840` melempar "missed the module table"), jadi tes menyentuh fungsi yang sama, bukan salinan.

`node --test test/` di repo plugin = 18 kasus (`test/brain-model.test.js` 16 + `test/bundle-load.test.js` 2). Jalankan sebelum menyentuh panel; `bundle-load` menjalankan `client.js` di `vm` dengan loader tiruan sehingga "dock tetap terdaftar" tidak perlu browser.

## Umur data (11 Nov)

Panel sebelumnya hanya bisa menyatakan "sedang berjalan", padahal jendela event klien bisa tertinggal dari host — simpul bisa tampak hidup padahal datanya sudah basi. Karena itu tiap simpul kini membawa `detail.updatedAt` (waktu saat turn/tool/workflow terakhir benar-benar berubah, bukan saat chunk streaming masuk) dan menampilkan umurnya dalam bentuk pendek: di bawah 5 detik ditulis "baru saja" (kata disesuaikan locale), lalu `12s`, `3m`, `1h`. Simpul yang tidak punya detail tidak menampilkan umur sama sekali — kosong lebih jujur daripada angka palsu. Ambang 60 detik dipakai untuk menandai simpul `running === false` yang sudah lama tidak berubah: kelas `.kb-brain-node--stale` menurunkan opacity ke 0.72 dan `title` berisi umur yang sama, tanpa mengubah bentuk atau ukurannya. Batas 5 detik dipilih karena itu ritme publikasi tile streaming; 60 detik dipilih karena satu giliran agen yang sehat jarang diam lebih lama dari itu.

Antrean putaran dibaca dengan `pnpm issue:next`, bukan dari ingatan: skrip `scripts/issue-queue.mjs` mengambil issue terbuka lewat `gh`, mengurutkan `bug` → `harness` → `release` → `blocked` → label lain, lalu menampilkan yang bisa dikerjakan lebih dulu. Alat ini read-only dan tidak menutup/membuka issue.

Panel sekarang memetakan view model murni (`brainNodeView`) ke `h(...)` tanpa logika di markup; `test/brain-render.test.js` menguji model itu headless (26 tes di plugin), karena `react`/`react-dom/server` tidak dapat di-resolve dari Node. Kontrak browser tetap hilang sampai sesi non-operator bisa membuka 127.0.0.1:3080 (#12).

Menonton run hosted sekarang satu perintah: `pnpm run:watch <runId>` (`scripts/watch-run.mjs`) memanggil `gh api .../runs/<id>` sampai selesai, lalu mencetak satu blok berisi hasil, durasi, job yang gagal, dan perintah lanjutannya (`pnpm verify --explain <id>`). Tidak ada keluaran selama run berjalan, jadi putaran tidak lagi menulis lima sampai sepuluh panggilan polling per run; skripnya keluar 0 untuk hijau, 1 untuk merah, dan 2 bila anggaran waktunya habis (default 45 menit) supaya tidak pernah menggantung. Enam tes di `scripts/watch-run.test.mjs` menjalankan `gh` palsu — termasuk kasus run yang masih berjalan, merah, dan kehabisan waktu.

`pnpm check:fast` ikut menjalankan gerbang dokumentasi (`node scripts/verify-documentation.mjs`) begitu ada berkas `docs/` atau `README.md` yang berubah, jadi tautan rusak dan catatan putaran yang belum ditulis ketahuan dalam hitungan detik, bukan di CI.

## Baseline adoption is a decision, not a copy

`pnpm baselines:adopt --run <id>` prints every changed screenshot with the number of pixels that moved and the box they moved in, then copies only what you select: `--min-diff 1000` drops encoder noise, `--only kidung-390x844` names files. A run that changes three screenshots on purpose no longer drags six noise files into the commit.

## A local contract run rebuilds only for bundle inputs

`pnpm e2e:one <spec>` skips the rebuild when `apps/web/dist/index.html` is not older than the newest file the bundler reads. The walk used to include `apps/web/e2e/`, so adopting one baseline PNG marked the tree stale and every later run paid a ~6 s build for a bundle nothing had touched. `e2e` is excluded from the freshness scan now: a spec or a snapshot edit costs the spec run and nothing else — measured 8.4 s → 2.3 s for the same contract. `scripts/e2e-one.test.mjs` pins the rule with a fake tree whose snapshot is newer than every source.

## A module nothing imports is dead weight

`pnpm css:dead` answers "which class has no markup". `pnpm modules:dead` answers the twin question: "which module has no importer". They must both answer zero, and both run in the `verify` job, because a component replaced by a newer surface leaves its stylesheet names behind and keeps the CSS scan quiet.

The scan knows the three ways this app loads a module — static `import … from "…"`, dynamic `import("…")`, and `new Worker(new URL("…", import.meta.url))` — and it resolves `./x.js` to `x.ts`/`x.tsx` beside it. Entry points (`src/main.tsx`), test files and anything outside `src/` are never reported.

## Batch 402: discovery failure is not an empty queue

Audit empat agen menemukan `check:fast` menelan galat Git dan mengubahnya menjadi daftar kosong (#100). Regresi CLI harus memisahkan tiga keadaan: repo bersih, base ref hilang, dan cwd bukan repo. Dua yang terakhir wajib nonzero; jangan menampilkan verdict “Nothing changed” atau “clean” bila input pemeriksaan tidak bisa ditemukan. Fixture Git berada di direktori sementara terisolasi, bukan commit pada repo aplikasi.

Reuse hanya sah untuk anak parent yang dapat diakses. Setelah tool menolak sesi lama dengan `belongs to another parent session`, catat batas itu dan daftarkan sesi penggantinya di `subagents.md`; jangan mengulang panggilan gagal atau mengarang garis koneksi panel. Batch ini memisahkan penulis Google, kontrak Kidung, harness Git, dan verifier read-only; dokumen dimiliki otak. Builder tidak commit/push dan tes browser/build tetap hosted. Bukti full dispatch tidak mencakup unit bila job unit skipped: sebut push run dan dispatch run secara terpisah.

Fallback core tier tidak boleh menghilangkan kontrak yang sengaja diubah: union `CORE_SPECS` dengan spec eksplisit yang valid, dedupe, lalu saring berkas yang sudah dihapus (#102). Tes mixed source+spec harus membuktikan kontrak Kidung/welcome benar-benar ada dalam argumen, tanpa memperluas ke seluruh sweep.

Bukti batch 402 pada working tree HEAD `3f721824`: `node --test scripts/test-e2e-selective-core.test.mjs` 14/14 dan `node --test scripts/test-e2e-selective-ui.test.mjs` 6/6 lulus; tesnya membuktikan welcome/Kidung ada di argumen, smoke tidak dobel, fallback tanpa spec tetap tepat tujuh spec, dan `--retries=0` tidak hilang. Hosted, job selektif `133144141015` menjalankan 101/101 tes pada delapan spec termasuk Kidung dan Google. Atribusi tetap dipisah: job unit ada di push run `43821078698` (`133144140958`, 1.135 tes), bukan di full dispatch `43821357448` yang melewati unit.

## Ukur biaya harness sebelum mengubahnya (#106)

- Satu sesi mengukur pasangan sebelum/sesudah, bukan dua benchmark bersamaan.
  Verifier mengaudit semantik dan regresi secara terpisah; MAIN memilih perubahan.
- Scope berkas/cwd/env harus sama dan minimum tiga pasangan; pisahkan launcher
  (`--version`) dari formatting. Sampel lokal putaran 5 memberi median 1.500,0 →
  932,9 ms untuk lima berkas. Ini hemat 567 ms, bukan bukti akar lonjakan 29 detik.
- Dependency CLI terpasang boleh dipanggil lewat Node saat ini dan export resmi,
  tanpa path store tetap atau daemon baru. Tetap uji config/ignore, PATH tanpa
  package-manager launcher, exit gagal, dan mode check yang tidak menulis berkas.
  Fixture argumen memakai path bergaya Git (`scripts/probe.mjs`), bukan
  `path.join` yang mengubah separator di Windows; path filesystem tetap memakai
  helper platform. Ini bukan bukti Windows sudah dijalankan.
- Dua peran reuse cukup untuk scope ini dengan memori tersedia sekitar 1.792 MiB;
  tidak membuat empat tugas semu. Builder hanya memegang fast-check dan tesnya,
  MAIN dokumen, verifier read-only. Hosted tetap gerbang regresi; angka device
  tidak diganti oleh timing runner yang berbeda.

## Pemulihan konteks: preflight tidak sama dengan aktivasi (#103)

Pada putaran goal 2, dua sesi reuse memeriksa fork pemulihan dan jalur aktivasi;
MAIN mencatat issue dan memeriksa runtime. Paralel dibatasi dua karena memori
tersedia sekitar 1.562 MiB dengan swap terpakai 7.379 MiB, bukan membuat empat
pekerjaan semu. Tes fokus 13/13, syntax, dan import lulus; itu belum membuktikan
provider wire atau kelanjutan chat lama.

Manager pada profil live HMR menolak paket yang sudah terpasang dengan
`already-installed` sebelum pnpm berjalan (`changed:false`, `application:failed`).
Jangan mengubah saran remove→install menjadi izin mematikan gate. Fork tetap belum
terpasang; proxy tunggal PID 136 tetap versi 0.1.215 dengan fingerprint
`d8b5e8b188cf348899e3d5c3221796003622c4071e855b5f51a40314def57661`.
Tidak ada rotasi, perubahan riwayat, atau proxy kedua. Tunggu jalur atomic replace
resmi atau prosedur maintenance berizin dengan rollback; jangan ulangi install
identik. Pemeriksaan proses harus menerima nama Node `node-MainThread`, bukan
hanya `node`, agar hasil nol palsu tidak dianggap bukti proxy mati.

Orchestrator sesi ini tetap `chatgpt/gpt-6.1-sol`; semua anak/cucu memakai `commandcode/deepseek/deepseek-v4.1-flash` atas pilihan pengguna. Buktikan model dari request runtime, bukan dari label brief. Policy bawaan hanya tersampling pada sesi baru; plugin Host lokal `@local/gys-session-policy` memakai `agent/request` untuk descendant root yang ditentukan dan tidak menyentuh main/root lain. Verifier sudah menjalankan request pada route CC yang diminta.
