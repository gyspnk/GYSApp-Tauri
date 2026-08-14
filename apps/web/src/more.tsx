import { useEffect, useState, type FormEvent } from "react";
import { translate, type Locale } from "./i18n.js";

type PackManifest = {
  version: number;
  generatedAt: string;
  bible: string;
  hymns: number;
  items: { id: string; path: string; bytes: number; sha256: string }[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MorePage({ locale }: { locale: Locale }) {
  const [manifest, setManifest] = useState<PackManifest | undefined>();
  const [report, setReport] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}offline/pack-manifest.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (response.ok) setManifest((await response.json()) as PackManifest);
      })
      .catch(() => undefined);
  }, []);

  const show = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!report.trim()) return;
    try {
      const response = await fetch("/api/v1/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "web", message: report.trim() }),
      });
      if (!response.ok) throw new Error("Report failed");
      setReport("");
      show("Laporan diterima. Terima kasih.");
    } catch {
      show("Laporan disimpan sebagai draft; kirim kembali saat online.");
      localStorage.setItem("gys-report-draft", report.trim());
    }
  };

  return (
    <div className="page more-page">
      <section className="page-intro">
        <div>
          <p className="date-line">GYSApp · settings & collections</p>
          <h1>{translate(locale, "page.moreTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.moreBody")}</p>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => show("Pengaturan akan tersimpan di perangkat ini.")}
        >
          Perangkat ini
        </button>
      </section>
      <section className="more-grid">
        <article className="more-card more-card-wide">
          <div className="more-card-heading">
            <div>
              <p className="date-line">Offline-first</p>
              <h2>Paket lokal</h2>
            </div>
            <span className="pack-badge">Siap</span>
          </div>
          <p>
            Alkitab TB, metadata 533 lagu, dan TimGM tersedia tanpa koneksi.
            PDF, MIDI, dan chord diambil saat dibutuhkan.
          </p>
          <div className="pack-stats">
            <span>
              <strong>{manifest?.bible ?? "TB"}</strong>
              <small>terjemahan</small>
            </span>
            <span>
              <strong>{manifest?.hymns ?? 533}</strong>
              <small>lagu</small>
            </span>
            <span>
              <strong>
                {manifest
                  ? formatBytes(
                      manifest.items.reduce((sum, item) => sum + item.bytes, 0),
                    )
                  : "—"}
              </strong>
              <small>paket inti</small>
            </span>
          </div>
        </article>
        <button
          className="more-card more-action"
          type="button"
          onClick={() =>
            show(
              "Backup baru menggunakan AES-GCM; format lama hanya dapat diimpor sekali.",
            )
          }
        >
          <span className="more-icon">↥</span>
          <strong>Backup & import</strong>
          <small>Ekspor terenkripsi atau impor .gysbk lama</small>
        </button>
        <button
          className="more-card more-action"
          type="button"
          onClick={() =>
            show(
              "Pengingat akan memakai notifikasi perangkat setelah izin diberikan.",
            )
          }
        >
          <span className="more-icon">◷</span>
          <strong>Pengingat</strong>
          <small>Atur waktu baca dan renungan</small>
        </button>
        <button
          className="more-card more-action"
          type="button"
          onClick={() =>
            show(
              "Account provider disiapkan melalui BFF; tidak ada token di client.",
            )
          }
        >
          <span className="more-icon">◯</span>
          <strong>Akun</strong>
          <small>Google, Apple, atau e-GYS</small>
        </button>
        <button
          className="more-card more-action"
          type="button"
          onClick={() => {
            localStorage.clear();
            show(
              "Preferensi lokal direset. Muat ulang halaman untuk menerapkan.",
            );
          }}
        >
          <span className="more-icon">⌁</span>
          <strong>Reset perangkat</strong>
          <small>Hapus preferensi dan cache aplikasi</small>
        </button>
        <form className="more-card report-card" onSubmit={submitReport}>
          <div className="more-card-heading">
            <div>
              <p className="date-line">Feedback</p>
              <h2>Laporkan masalah</h2>
            </div>
          </div>
          <textarea
            value={report}
            onChange={(event) => setReport(event.target.value)}
            rows={3}
            placeholder="Apa yang perlu kami perbaiki?"
          />
          <button className="primary-button" type="submit">
            Kirim laporan
          </button>
        </form>
      </section>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
