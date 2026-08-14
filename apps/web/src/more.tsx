import { useEffect, useRef, useState, type FormEvent } from "react";
import { translate, type Locale } from "./i18n.js";
import {
  exchangeEgysToken,
  getEgysProfile,
  getEgysProviders,
  getEgysWhatsAppState,
  signOutEgys,
  startEgysWhatsAppLogin,
} from "./egys.js";

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

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function MorePage({ locale }: { locale: Locale }) {
  const [manifest, setManifest] = useState<PackManifest | undefined>();
  const [report, setReport] = useState("");
  const [notice, setNotice] = useState("");
  const [accountName, setAccountName] = useState<string>();
  const [accountLoading, setAccountLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const whatsappAbort = useRef<AbortController | undefined>(undefined);
  const [providers, setProviders] =
    useState<Awaited<ReturnType<typeof getEgysProviders>>>();

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}offline/pack-manifest.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (response.ok) setManifest((await response.json()) as PackManifest);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => whatsappAbort.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    void getEgysProviders(controller.signal)
      .then(setProviders)
      .catch(() => setProviders(undefined));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getEgysProfile(controller.signal)
      .then((profile) => setAccountName(profile?.displayName))
      .catch(() => undefined)
      .finally(() => setAccountLoading(false));
    return () => controller.abort();
  }, []);

  const show = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!report.trim()) return;
    try {
      const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
      if (!base) throw new Error("BFF not configured");
      const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/report`, {
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

  const signInWithProvider = async (provider: "google" | "apple") => {
    show(
      `Buka ${provider === "google" ? "Google" : "Apple"} untuk menyelesaikan login e-GYS.`,
    );
    const sdkUrl =
      provider === "google"
        ? "https://accounts.google.com/gsi/client"
        : "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    try {
      await new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[src="${sdkUrl}"]`)) return resolve();
        const script = document.createElement("script");
        script.src = sdkUrl;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("SDK unavailable"));
        document.head.appendChild(script);
      });
      if (provider === "google") {
        const clientId = providers?.google.clientId;
        const google = (
          window as Window & {
            google?: {
              accounts?: {
                id?: {
                  initialize: (config: {
                    client_id: string;
                    callback: (response: { credential: string }) => void;
                  }) => void;
                  prompt: () => void;
                };
              };
            };
          }
        ).google;
        if (!clientId || !google?.accounts?.id)
          throw new Error("Google client unavailable");
        await new Promise<void>((resolve, reject) => {
          google.accounts?.id?.initialize({
            client_id: clientId,
            callback: (response) => {
              void exchangeEgysToken("google", response.credential)
                .then(resolve)
                .catch(reject);
            },
          });
          google.accounts?.id?.prompt();
        });
      } else {
        const apple = (
          window as Window & {
            AppleID?: {
              auth?: {
                init: (config: {
                  clientId: string;
                  scope: string;
                  redirectURI: string;
                  usePopup: boolean;
                }) => void;
                signIn: () => Promise<{
                  authorization?: { id_token?: string };
                }>;
              };
            };
          }
        ).AppleID;
        const clientId = providers?.apple.clientId;
        if (!clientId || !apple?.auth)
          throw new Error("Apple client unavailable");
        apple.auth.init({
          clientId,
          scope: "name email",
          redirectURI: window.location.origin,
          usePopup: true,
        });
        const result = await apple.auth.signIn();
        const token = result.authorization?.id_token;
        if (!token) throw new Error("Apple token unavailable");
        await exchangeEgysToken("apple", token);
      }
      const profile = await getEgysProfile();
      setAccountName(profile?.displayName);
      show(
        profile
          ? `Selamat datang, ${profile.displayName}.`
          : "Login e-GYS berhasil.",
      );
    } catch {
      show(
        "Login e-GYS belum dapat diselesaikan. Pastikan Worker dan client provider sudah dikonfigurasi.",
      );
    }
  };

  const signInWithWhatsApp = async () => {
    whatsappAbort.current?.abort();
    const controller = new AbortController();
    whatsappAbort.current = controller;
    setAuthBusy(true);
    try {
      const started = await startEgysWhatsAppLogin(controller.signal);
      const popup = window.open(
        started.whatsappUrl,
        "_blank",
        "noopener,noreferrer",
      );
      if (!popup) {
        show("WhatsApp diblokir browser. Izinkan pop-up lalu coba lagi.");
        return;
      }
      show(
        "Kirim pesan yang sudah disiapkan di WhatsApp; kami menunggu konfirmasi.",
      );
      const expiresAt = Date.parse(started.expiresAt);
      while (!controller.signal.aborted && Date.now() < expiresAt) {
        await waitFor(2_000, controller.signal);
        if (controller.signal.aborted) return;
        const state = await getEgysWhatsAppState(
          started.pollToken,
          controller.signal,
        );
        if (state.state === "READY") {
          const profile = await getEgysProfile(controller.signal);
          setAccountName(profile?.displayName ?? "e-GYS");
          show(
            profile
              ? `Selamat datang, ${profile.displayName}.`
              : "Login WhatsApp e-GYS berhasil.",
          );
          return;
        }
        if (state.state === "UNKNOWN_SENDER") {
          show("Nomor WhatsApp belum terdaftar di e-GYS.");
          return;
        }
        if (state.state === "EXPIRED") {
          show("Permintaan WhatsApp sudah kedaluwarsa. Mulai lagi bila perlu.");
          return;
        }
      }
      if (!controller.signal.aborted)
        show("Permintaan WhatsApp kedaluwarsa sebelum dikonfirmasi.");
    } catch {
      if (!controller.signal.aborted)
        show(
          "Login WhatsApp e-GYS belum tersedia. Pastikan Worker terkonfigurasi.",
        );
    } finally {
      if (!controller.signal.aborted) setAuthBusy(false);
    }
  };

  return (
    <div className="page more-page">
      <section className="page-intro">
        <div>
          <p className="date-line">Perangkat · koleksi & bantuan</p>
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
        <a
          className="more-card more-action"
          href={`${import.meta.env.BASE_URL}literatur`}
        >
          <span className="more-icon">▤</span>
          <strong>Literatur</strong>
          <small>Jelajahi bacaan, warta, dan renungan resmi</small>
        </a>
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
        <article className="more-card more-action account-card">
          <span className="more-icon">◯</span>
          <strong>
            {accountLoading || authBusy
              ? "Memeriksa akun…"
              : (accountName ?? "Akun e-GYS")}
          </strong>
          <small>
            {accountName
              ? "Keluar dari sesi e-GYS"
              : providers?.google.enabled ||
                  providers?.apple.enabled ||
                  providers?.whatsapp
                ? "Pilih provider untuk masuk"
                : "Google, Apple, atau e-GYS"}
          </small>
          {accountName ? (
            <button
              type="button"
              className="text-button account-signout"
              onClick={() => {
                void signOutEgys().then(() => {
                  setAccountName(undefined);
                  show("Sesi e-GYS sudah dikeluarkan dari perangkat ini.");
                });
              }}
            >
              Keluar
            </button>
          ) : (
            providers &&
            (providers.google.enabled ||
              providers.apple.enabled ||
              providers.whatsapp) && (
              <span className="account-provider-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    providers.google.enabled &&
                    void signInWithProvider("google")
                  }
                >
                  Google
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    providers.apple.enabled && void signInWithProvider("apple")
                  }
                >
                  Apple
                </button>
                {providers.whatsapp && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void signInWithWhatsApp()}
                  >
                    WhatsApp
                  </button>
                )}
              </span>
            )
          )}
        </article>
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
