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
