# Panduan lengkap Cloudflare Worker GYSApp

Panduan ini menggunakan workflow dan konfigurasi yang benar-benar ada di
`gyspnk/GYSApp-Tauri`. Worker menjalankan BFF untuk konten, proxy PDF, chord dan
integrasi akun. GitHub Pages serta APK/EXE adalah artefak terpisah: deploy Pages
saja tidak memperbarui Worker.

## 1. Pilih akun Cloudflare

1. Masuk ke [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Pilih akun yang memiliki Worker sekarang, bila ingin memperbarui
   `gysapp-tauri-bff.pas-presensi.workers.dev` tanpa mengganti URL aplikasi.
3. Catat **Account ID** dari halaman akun/Workers & Pages. Ini bukan Zone ID.
4. Buka **Workers & Pages** dan aktifkan subdomain `workers.dev` jika belum ada.
   Domain berbayar/custom domain tidak diperlukan.

Nama Worker dalam repositori adalah `gysapp-tauri-bff`. Akun baru dapat memakai
nama yang sama tetapi menghasilkan subdomain berbeda. Jangan menebak URL:
ambil URL hasil deploy/dashboard.

Tidak perlu membuat KV, D1, R2 atau Durable Objects untuk konfigurasi saat ini.
Cache konten di Worker tidak merupakan database akun; kredensial native tetap
berada di penyimpanan aman perangkat.

## 2. Buat API token deployment

Buka **My Profile → API Tokens → Create Token → Create Custom Token**.

- Account permission: **Workers Scripts → Edit**.
- Account permission: **Account Settings → Read** untuk penemuan akun/subdomain
  oleh Wrangler.
- Account Resources: **Include → Specific account**, pilih akun langkah 1.
- Tidak perlu memberi akses semua akun atau semua zone untuk URL `workers.dev`.
- Simpan token yang ditampilkan saat dibuat. Jangan gunakan Global API Key.

Template **Edit Cloudflare Workers** juga tersedia, tetapi periksa scope-nya
agar terbatas ke akun yang dimaksud. Pengelolaan custom-domain/zone routes,
penyimpanan lain atau tail logs dapat memerlukan izin tambahan; konfigurasi
repositori ini tidak mewajibkan fitur tersebut untuk deploy biasa.

## 3. Tambahkan dua secrets di GitHub

Buka [Settings → Secrets and variables → Actions](https://github.com/gyspnk/GYSApp-Tauri/settings/secrets/actions).
Pada tab **Secrets**, buat **New repository secret**:

| Nama                    | Nilai                |
| ----------------------- | -------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token langkah 2  |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID langkah 1 |

Keduanya harus repository secrets karena workflow saat ini tidak menggunakan
GitHub Environment tertentu. Nama harus sama persis. Jangan memasukkan token
ke source, repository variable, `VITE_*`, screenshot atau chat.

Workflow dapat berstatus hijau walaupun deploy dilewati. Sebelum secrets
tersedia, langkah **Record protected prerequisite** mencatat `deploy skipped`.
Keberhasilan workflow saja bukan bukti Worker produksi sudah diperbarui.

## 4. Deploy Worker pertama kali

1. Buka [Actions → Cloudflare Worker](https://github.com/gyspnk/GYSApp-Tauri/actions/workflows/worker.yml).
2. Klik **Run workflow**, pilih branch `main`, lalu jalankan.
3. Tunggu langkah **Deploy Worker** selesai. Langkah itu harus berjalan, bukan
   `Skipped`.
4. Pada log Wrangler, catat URL `https://gysapp-tauri-bff.<subdomain>.workers.dev`
   dan deployment/version ID.
5. Buka Worker di Cloudflare Dashboard dan cocokkan deployment terbaru.

Workflow menginstal pnpm, membangun `@gys/contracts`, lalu menjalankan Wrangler
menggunakan `apps/bff/wrangler.toml`. Deploy berikutnya otomatis dipicu push ke
main yang mengubah BFF, contracts, lockfile atau workflow Worker. Perubahan
khusus UI/dokumentasi tidak otomatis memicu deploy Worker; gunakan Run workflow.

## 5. Aktifkan backend e-GYS

Setelah Worker dibuat, buka **Workers & Pages → gysapp-tauri-bff → Settings →
Variables and Secrets → Add**. Pilih tipe **Secret**, lalu tambahkan:

| Nama                | Nilai                 |
| ------------------- | --------------------- |
| `EGYS_API_BASE_URL` | `https://e.gys.or.id` |

Jangan tambahkan `/api/v1`; kode BFF menambahkan jalur API sendiri. Simpan dan
terapkan perubahan/deploy sesuai tombol dashboard. Ini konfigurasi backend,
bukan token login WhatsApp/Apple/Google milik pengguna.

`EGYS_GOOGLE_CLIENT_ID` bersifat opsional. Default kode mengikuti client resmi
v1 yang diaudit. Jangan mengganti dengan client Google baru tanpa memastikan
backend e-GYS menerima audience tersebut. Begitu juga
`VITE_EGYS_GOOGLE_CLIENT_ID` di build frontend: keduanya harus selaras bila
override memang diperlukan.

Pengaturan opsional:

- `EDGE_TTS_URL`: secret berisi gateway audio Edge yang sudah diverifikasi.
- `EDGE_TTS_VOICES_URL`: secret URL katalog suara gateway tersebut, bila tersedia.

Jangan mengisi URL gateway fiktif. Tanpa gateway, TTS Edge tidak otomatis aktif;
provider suara lain tetap mengikuti kemampuan platform. Secret Worker bukan
GitHub secret bernama sama: workflow deploy saat ini tidak menyalin binding
runtime dari GitHub secara otomatis. Secret yang disimpan pada Worker tetap
terpisah dari variabel publik di TOML.

## 6. Periksa CORS dan sumber konten

Default publik tersimpan dalam `apps/bff/wrangler.toml`:

```toml
name = "gysapp-tauri-bff"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[vars]
ALLOWED_ORIGINS = "https://gyspnk.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://tauri.localhost,https://tauri.localhost,tauri://localhost"
SAUH_SOURCE_URL = "https://tjc.org/id/wp-json/wp/v2/posts"
SUARA_SOURCE_URL = "https://tjc.org/id/wp-json/wp/v2/posts?categories=194&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia"
LITERATURE_SOURCE_URL = "https://tjc.org/id/literatur/"
```

Origin tidak menyertakan path: gunakan `https://gyspnk.github.io`, bukan
`https://gyspnk.github.io/GYSApp-Tauri`. Untuk domain tambahan, edit daftar
`ALLOWED_ORIGINS` di TOML, commit lalu deploy. Jangan menggunakan `*` untuk akun
berkredensial. Perubahan variabel publik hanya melalui dashboard dapat tertimpa
oleh nilai TOML pada deploy berikutnya.

Jangan mengubah tanggal compatibility atau sumber publisher untuk mengatasi
error tanpa diagnosis. Allowlist PDF memang membatasi host/jalur resmi.

## 7. Sambungkan web, Android dan Windows

Buka [GitHub repository variables](https://github.com/gyspnk/GYSApp-Tauri/settings/variables/actions).
Pada tab **Variables**, buat:

```text
VITE_BFF_BASE_URL=https://gysapp-tauri-bff.<subdomain>.workers.dev
```

Gunakan URL Worker yang sebenarnya, tanpa `/api/v1`. Nilai ini publik, bukan
secret. Workflow Pages serta build Android/Windows membaca repository variable
tersebut ketika membangun aplikasi.

Sesudah mengganti URL:

1. Jalankan [Pages](https://github.com/gyspnk/GYSApp-Tauri/actions/workflows/pages.yml)
   kembali jika workflow menyediakan Run workflow; jika tidak, deploy pada push
   main berikutnya yang memicu Pages.
2. Jalankan [Native Android APK](https://github.com/gyspnk/GYSApp-Tauri/actions/workflows/native-android.yml)
   dengan `ref` commit/main terbaru untuk APK yang memakai URL baru.
3. Bila Windows juga perlu URL baru, jalankan workflow Native Windows installer.

APK/EXE yang sudah terpasang tidak otomatis mendapatkan perubahan `VITE_*`;
build dan instal versi baru. Bila tetap memakai akun/subdomain Worker lama,
URL tetap sama dan perbaikan backend dapat diterapkan tanpa perubahan URL APK.
Fallback publik lama untuk PDF tidak menggantikan konfigurasi akun BFF utama.

## 8. Verifikasi hasil deploy

Contoh shell berikut hanya memakai URL publik. Ganti subdomain terlebih dahulu:

```sh
worker_url='https://gysapp-tauri-bff.<subdomain>.workers.dev'
curl -i "$worker_url/api/v1/chords/manifest"
curl -i -H 'Origin: https://gyspnk.github.io' "$worker_url/api/v1/chords/manifest"
curl -i "$worker_url/api/v1/content/literature"
```

Yang diperiksa:

- Manifest chord mengembalikan HTTP 200 dan JSON.
- Permintaan dengan Origin Pages mengembalikan header CORS untuk origin itu.
- Literatur mengembalikan katalog, bukan error `Unknown content kind` dari
  Worker versi lama.
- Worker dashboard/log deploy menunjukkan versi baru yang sesuai commit.

Untuk PDF, ambil URL PDF resmi dari katalog/metadata literatur dan uji range:

```sh
pdf_url='https://<host-resmi>/<jalur-dokumen>.pdf'
curl --get --data-urlencode "url=$pdf_url" \
  -H 'Range: bytes=0-65535' -H 'Origin: https://gyspnk.github.io' \
  -D /tmp/gys-pdf-headers.txt -o /tmp/gys-pdf-range.bin \
  "$worker_url/api/v1/content/pdf"
cat /tmp/gys-pdf-headers.txt
```

Harapkan HTTP 206, `Content-Type: application/pdf`, `Content-Range`, dan header
CORS yang sesuai. Jangan mengunduh seluruh dokumen besar hanya untuk tes
transport. Terakhir, buka **Warta Sejati**, **Pelita Kecil**, dan literatur lain di
aplikasi; pastikan halaman PDF benar-benar ter-render. Tes HTTP saja tidak
membuktikan viewer berhasil.

`/api/v1/content/pdf-source?url=...` menerima URL halaman edisi literatur resmi,
bukan sembarang URL PDF. Gunakan URL halaman edisi dari katalog dan encode query
seperti contoh curl `--data-urlencode`. Route itu mengembalikan JSON URL PDF.

Login akun harus diuji dengan akun nyata secara terpisah. Respons 401 untuk
request tanpa sesi tidak sama dengan kegagalan deploy; 503 perlu ditelusuri dari
konfigurasi upstream/log. Jangan mencantumkan token/sesi pengguna dalam log yang
dibagikan.

## 9. Bila ada error

| Gejala                                   | Pemeriksaan dan perbaikan                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Workflow hijau tetapi Worker lama        | Pastikan **Deploy Worker** berjalan; lihat langkah `deploy skipped`, dua secrets GitHub, dan deployment/version ID. |
| Authentication error/10000 dari Wrangler | Token masih aktif, memiliki Workers Scripts Edit dan scope akun benar; Account ID bukan Zone ID.                    |
| Worker URL 404/tidak tersedia            | Aktifkan subdomain workers.dev, cocokkan akun/nama Worker, dan gunakan URL hasil deploy.                            |
| CORS/403 dari origin aplikasi            | Cocokkan origin persis dengan `ALLOWED_ORIGINS`; domain tanpa path; deploy kembali setelah edit TOML.               |
| PDF 403                                  | URL di luar allowlist atau Worker masih versi lama; pakai metadata resmi dan periksa versi deploy.                  |
| PDF-source 400 `Unknown content kind`    | Deploy backend terbaru, bukan hanya Pages/APK.                                                                      |
| PDF/upstream 503                         | Periksa publisher/upstream, jalur sumber dan log Worker; bedakan gangguan publisher dari CORS.                      |
| Login/upstream 503                       | Pastikan secret Worker `EGYS_API_BASE_URL=https://e.gys.or.id` sudah diterapkan dan upstream tersedia.              |
| Worker error 1102/limit                  | Lihat penggunaan CPU/limit di dashboard; evaluasi Workers plan sesuai beban sebelum menaikkan paket.                |
| Aplikasi masih memakai URL lama          | Rebuild frontend/APK/EXE setelah mengubah `VITE_BFF_BASE_URL`.                                                      |

Untuk rollback, pilih deployment sebelumnya pada Cloudflare **Deployments** dan
terapkan rollback bila tersedia. Pastikan binding runtime masih sesuai; rollback
kode tidak berarti semua konfigurasi/secrets otomatis kembali. Bila akun/subdomain
berbeda, URL aplikasi juga harus diselaraskan.

## 10. Alternatif deploy dari komputer

GitHub Actions adalah jalur utama. Bila diperlukan, dari root repositori:

```sh
pnpm install --frozen-lockfile
pnpm --filter @gys/contracts build
pnpm --filter @gys/bff exec wrangler login
pnpm --filter @gys/bff exec wrangler deploy
pnpm --filter @gys/bff exec wrangler secret put EGYS_API_BASE_URL
```

Pada prompt terakhir isi `https://e.gys.or.id`; nilai tidak perlu dicantumkan
sebagai argumen command atau dikomit. Login Wrangler ini terpisah dari secrets
GitHub. Bila komputer memiliki beberapa akun Cloudflare, pastikan deployment
memilih akun yang sama dengan URL produksi.

Referensi: [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/),
[Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/#deploy),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
