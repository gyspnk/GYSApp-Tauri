# Reuse register: subagent sessions

Sejak 11 November (goal revisi 16) sesi subagent **tidak dibuang setelah satu tugas**.
Kalau tujuan atau konteksnya sama, sesi yang sudah ada dilanjutkan dengan
`send_message` — context window-nya sudah berisi berkas, keputusan, dan hasil
pengukuran yang tidak perlu dibangun ulang. Membuat sesi baru hanya untuk pekerjaan
yang benar-benar berbeda permukaan.

## Aturan

1. **Cek register dulu.** Sebelum memanggil `subagent`, cari baris dengan tujuan yang
   sama. Ada → `send_message` ke agennya. Tidak ada → buat baru, lalu daftarkan.
2. **Nama dulu, kerja kemudian.** Baris pertama brief selalu `Nama: <permukaan> —
<kata kerja + objek>`, mis. `Nama: Kidung — dropdown koleksi`. `description` pada
   panggilan `subagent` memakai frasa yang sama (3–5 kata) supaya judul chat di
   harness dan label di panel otak terbaca jelas, bukan "builder" atau "task".
3. **Satu sesi = satu permukaan.** Sesi `Kidung` tidak dipakai untuk `Iman`; sesi
   `release` tidak dipakai untuk `brain`.
4. **Builder tetap tidak commit.** Reuse tidak mengubah batas peran.
5. **Hapus hanya kalau tujuannya mati.** Sesi yang sudah selesai tetap `inactive`
   dan bisa dilanjutkan kapan saja; tidak perlu ditutup.

## Register (per 11 November 2026)

| Nama                         | Agen                                   | Dipakai ulang untuk                                      |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `Alkitab — scroll restore`   | `48513d30-9e38-4b53-b58e-39e04701e480` | riwayat gulir, popstate, fokus judul setelah navigasi    |
| `Brain — spesifikasi panel`  | `734c27a2-e3cb-4279-b827-b49c87c4821f` | spesifikasi panel otak, token tema, tata letak SVG       |
| `CSS — pemangkasan selektor` | `e0e92439-bd76-4b5f-828b-fc6695014e31` | sisa selektor mati, grup selektor yang belum dipangkas   |
| `Release — pipeline APK`     | `20eda717-7f21-4e37-b0fe-13c2da56bf07` | audit jalur rilis, cadence, changelog, aset APK          |
| `Harness — API sesi klien`   | `226d91ca-6c33-4e78-a92f-f042dbdc3e05` | bentuk data `sessions`, `binding().eventSource`          |
| `TTS — kontrak fallback`     | `161a5a4e-c462-49fc-bcde-4085060cb912` | Edge TTS, ucapan "Allah", fallback suara sistem          |
| `Kidung — dropdown koleksi`  | `1e32ac40-26d2-4da6-a6b0-d32a904fb82e` | kontrol koleksi, rel pembaca, chunk pembaca              |
| `Iman — baris satu ketuk`    | `cf07588a-a2b5-456d-bd56-9197084ac89c` | permukaan Dasar Kepercayaan, sheet catatan, PDF          |
| `E2E — migrasi spec`         | `da2a5298-3c19-4f5d-87a5-348062413549` | spek yang mengikuti perubahan markup                     |
| `E2E — flake transisi`       | `ab089fbb-7468-4a19-af20-35f3dc774444` | flake waktu, `page.clock`, preload 180 ms                |
| `Lainnya — panel landscape`  | `98bbf30e-1dd3-4327-a3ac-6b145f4daebe` | pengaturan landscape, panel terbuka, tabel dua kolom     |
| `Release — nama aset APK`    | `900ad3e3-1149-4ec0-af52-3d4aa4b7bd72` | `release-asset-name.mjs`, workflow Android, versi native |
| `Brain — fase workflow`      | `119137b6-38ce-46e5-832c-196ec190a26a` | panel otak: badge workflow, hitungan agen, locale plugin |
| `Home — cadangan CLS`        | `aa7fe12e-e1e9-490e-b4c0-1f8568d1b774` | blok yang menyusut 650 ms di beranda, cadangan tinggi    |
| `Media — balapan nexttrack`  | `cf7d882b-efd5-4327-a24e-06dac3e6c3af` | aksi media ganda, shard sibuk, `media-dock.spec.ts`      |
| `A11y — rute tersisa`        | `50b0904c-e247-4b68-891e-278b7ca89b8d` | axe enam tag untuk beranda, Alkitab, Suara, Lainnya      |

Panel otak di GB Tools menampilkan `displayTitle` tiap sesi dan menyalin id ke
clipboard saat simpul diklik, jadi id untuk `send_message` diambil langsung dari
panel — bukan dari ingatan.
