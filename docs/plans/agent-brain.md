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
2. Maksimal tiga subagent berjalan bersamaan di mesin ini; verifier dijalankan
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
