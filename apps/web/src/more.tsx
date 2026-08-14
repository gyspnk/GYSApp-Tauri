import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AssetManifestV1Schema,
  type AccountProfile,
  type AssetManifestV1,
} from "@gys/contracts";
import {
  decryptBackupV2,
  encryptBackupV2,
  importLegacyGysbk,
} from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { assetStore } from "./asset-store.js";
import {
  exchangeEgysToken,
  getEgysProfile,
  getEgysProviders,
  getEgysUpstreamMeta,
  getEgysWhatsAppState,
  signOutEgys,
  startEgysWhatsAppLogin,
} from "./egys.js";
import {
  clearMidiPlaylist,
  downloadMidiPlaylist,
  getMidiPlaylist,
  importMidiPlaylist,
  moveMidiPlaylistItem,
  removeMidiPlaylistItem,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
  updateMidiPlaylistOptions,
} from "./midi-playlist.js";
import { Select } from "./select.js";

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

const BACKUP_STORAGE_KEYS = [
  "gys-locale",
  "gys-theme",
  "gys-activity-v1",
  "gys-favorites-v1",
  "gys-literature-progress-v2",
  "gys-asset-index-v1",
  "gys-bible-book",
  "gys-bible-chapter",
  "gys-bible-last-reading",
  "gys-bible-bookmarks",
  "gys-bible-notes-v1",
  "gys-bible-highlights-v1",
  "gys-bible-search-history-v1",
  "gys-bible-split-v1",
  "gys-bible-split-ratio-v1",
  "gys-daily-sauh-mode-v1",
  "gys-media-minimized",
  "gys-media-position-v1",
  "gys-speech-voice-v1",
  "gys-speech-rate-v1",
  "gys-speech-engine-v1",
  "gys-report-draft",
  "gys-reminder-time-v1",
  "gys-chord-cache-index-v1",
  "gys-midi-playlist-v1",
];

function collectBackupSettings() {
  return Object.fromEntries(
    BACKUP_STORAGE_KEYS.flatMap((key) => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}

function downloadBackup(envelope: unknown) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gys-backup-${new Date().toISOString().slice(0, 10)}.gysbk`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function clearAppData() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("gys-")) localStorage.removeItem(key);
  }
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("gys-"))
        .map((name) => caches.delete(name)),
    );
  }
}

export function MorePage({ locale }: { locale: Locale }) {
  const [manifest, setManifest] = useState<PackManifest | undefined>();
  const [assetManifest, setAssetManifest] = useState<AssetManifestV1>();
  const [packBusy, setPackBusy] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [report, setReport] = useState(
    () => localStorage.getItem("gys-report-draft") ?? "",
  );
  const [reportStatus, setReportStatus] = useState<
    "idle" | "sending" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [accountProfile, setAccountProfile] = useState<AccountProfile>();
  const [accountLoading, setAccountLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const whatsappAbort = useRef<AbortController | undefined>(undefined);
  const [providers, setProviders] =
    useState<Awaited<ReturnType<typeof getEgysProviders>>>();
  const [egysMeta, setEgysMeta] =
    useState<Awaited<ReturnType<typeof getEgysUpstreamMeta>>>();
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File>();
  const [reminderOpen, setReminderOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlist, setPlaylist] = useState(() => getMidiPlaylist());
  const [playlistFile, setPlaylistFile] = useState<File>();
  const [reminderTime, setReminderTime] = useState(
    () => localStorage.getItem("gys-reminder-time-v1") ?? "",
  );

  useEffect(() => {
    if (!reminderTime) return;
    let timer: number | undefined;
    const schedule = () => {
      const [hours, minutes] = reminderTime.split(":").map(Number);
      const next = new Date();
      next.setHours(hours || 0, minutes || 0, 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
      timer = window.setTimeout(
        () => {
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Waktu teduh GYS", {
              body: "Saatnya membaca firman dan renungan hari ini.",
            });
          }
          schedule();
        },
        Math.max(1_000, next.getTime() - Date.now()),
      );
    };
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [reminderTime]);

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}offline/pack-manifest.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (response.ok) setManifest((await response.json()) as PackManifest);
      })
      .catch(() => undefined);
    void fetch(`${import.meta.env.BASE_URL}offline/asset-manifest.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = AssetManifestV1Schema.safeParse(await response.json());
        if (parsed.success) setAssetManifest(parsed.data);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => whatsappAbort.current?.abort(), []);

  useEffect(
    () => subscribeMidiPlaylist(() => setPlaylist(getMidiPlaylist())),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void getEgysProviders(controller.signal)
      .then(setProviders)
      .catch(() => setProviders(undefined));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getEgysUpstreamMeta(controller.signal)
      .then(setEgysMeta)
      .catch(() => setEgysMeta(undefined));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getEgysProfile(controller.signal)
      .then(setAccountProfile)
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
    const message = report.trim();
    if (!message || reportStatus === "sending") return;
    setReportStatus("sending");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
      if (!base) throw new Error("BFF not configured");
      const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "web", message }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Report failed");
      setReport("");
      localStorage.removeItem("gys-report-draft");
      setReportStatus("idle");
      show("Laporan diterima. Terima kasih.");
    } catch {
      setReportStatus("error");
      show("Laporan disimpan sebagai draft; kirim kembali saat online.");
      localStorage.setItem("gys-report-draft", message);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const exportBackup = async () => {
    if (backupPassword.length < 8) {
      show("Gunakan kata sandi backup minimal 8 karakter.");
      return;
    }
    try {
      const envelope = await encryptBackupV2(
        { settings: collectBackupSettings() },
        backupPassword,
        { appVersion: "0.1.0", domains: ["settings"] },
      );
      downloadBackup(envelope);
      setBackupPassword("");
      setBackupOpen(false);
      show("Backup terenkripsi berhasil diunduh.");
    } catch {
      show(
        "Backup gagal dibuat. Coba lagi di perangkat yang mendukung AES-GCM.",
      );
    }
  };

  const importBackup = async () => {
    if (!backupFile) {
      show("Pilih file .gysbk terlebih dahulu.");
      return;
    }
    if (backupPassword.length < 8) {
      show("Masukkan kata sandi backup untuk membuka file.");
      return;
    }
    try {
      const text = await backupFile.text();
      const parsed: unknown = JSON.parse(text);
      const data = await decryptBackupV2(
        parsed as Parameters<typeof decryptBackupV2>[0],
        backupPassword,
      );
      const settings = data.settings;
      if (!settings || typeof settings !== "object" || Array.isArray(settings))
        throw new Error("settings missing");
      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith("gys-") && typeof value === "string")
          localStorage.setItem(key, value);
      }
      setBackupPassword("");
      setBackupFile(undefined);
      setBackupOpen(false);
      show(
        "Backup berhasil dipulihkan. Muat ulang untuk menerapkan semua preferensi.",
      );
    } catch {
      try {
        const legacy = await importLegacyGysbk(await backupFile.text());
        localStorage.setItem("gys-legacy-import-v1", JSON.stringify(legacy));
        show(
          "Backup lama berhasil diimpor dan disimpan untuk migrasi satu arah.",
        );
      } catch {
        show("Backup tidak valid atau kata sandi salah.");
      }
    }
  };

  const saveReminder = async () => {
    if (!reminderTime) {
      localStorage.removeItem("gys-reminder-time-v1");
      setReminderOpen(false);
      show("Pengingat dinonaktifkan.");
      return;
    }
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    localStorage.setItem("gys-reminder-time-v1", reminderTime);
    setReminderOpen(false);
    const notificationGranted =
      "Notification" in window && Notification.permission === "granted";
    show(
      notificationGranted
        ? `Pengingat aktif setiap hari pukul ${reminderTime}.`
        : "Waktu pengingat tersimpan; izinkan notifikasi agar pemberitahuan muncul.",
    );
  };

  const updateOfflinePack = async () => {
    const items = assetManifest?.items.filter(
      (item) => item.source === "local",
    );
    if (!manifest || !items?.length || packBusy) return;
    setPackBusy(true);
    setPackProgress(0);
    try {
      await assetStore.installPack(items, undefined, (completed, total) =>
        setPackProgress(Math.round((completed / total) * 100)),
      );
      show("Paket offline berhasil diverifikasi dan disimpan.");
    } catch {
      show(
        "Paket offline gagal diperbarui. Periksa koneksi dan ruang penyimpanan.",
      );
    } finally {
      setPackBusy(false);
    }
  };

  const signInWithProvider = async (provider: "google" | "apple") => {
    setAuthBusy(true);
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
                .then(() => resolve())
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
      setAccountProfile(profile);
      show(
        profile
          ? `Selamat datang, ${profile.displayName}.`
          : "Login e-GYS berhasil.",
      );
    } catch {
      show(
        "Login e-GYS belum dapat diselesaikan. Pastikan Worker dan client provider sudah dikonfigurasi.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithWhatsApp = async () => {
    whatsappAbort.current?.abort();
    const controller = new AbortController();
    whatsappAbort.current = controller;
    setAuthBusy(true);
    // Reserve the popup during the click gesture; opening it after the
    // network round-trip is rejected by most popup blockers.
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      const started = await startEgysWhatsAppLogin(controller.signal);
      if (!popup) {
        show("WhatsApp diblokir browser. Izinkan pop-up lalu coba lagi.");
        return;
      }
      popup.location.href = started.whatsappUrl;
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
          setAccountProfile(profile);
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
        <span className="pack-badge">Offline-first</span>
      </section>
      <section className="more-grid">
        <Link className="more-card more-action" to="/literatur">
          <span className="more-icon">▤</span>
          <strong>Literatur</strong>
          <small>Jelajahi kesaksian, warta, panduan, dan PDF resmi</small>
        </Link>
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
          <div className="pack-manager-actions">
            <button
              className="quiet-button"
              type="button"
              disabled={!manifest || packBusy}
              onClick={() => void updateOfflinePack()}
            >
              {packBusy
                ? `Menyimpan ${packProgress}%…`
                : "Verifikasi & simpan paket"}
            </button>
            <small>
              Manifest v{manifest?.version ?? 1} ·{" "}
              {manifest
                ? new Date(manifest.generatedAt).toLocaleDateString(locale)
                : "memuat"}
            </small>
          </div>
        </article>
        <button
          className="more-card more-action"
          type="button"
          onClick={() => setBackupOpen((open) => !open)}
        >
          <span className="more-icon">↥</span>
          <strong>Backup & import</strong>
          <small>Ekspor AES-GCM atau impor .gysbk lama</small>
        </button>
        <button
          className="more-card more-action"
          type="button"
          onClick={() => setReminderOpen((open) => !open)}
        >
          <span className="more-icon">◷</span>
          <strong>Pengingat</strong>
          <small>Atur waktu baca dan renungan</small>
        </button>
        <button
          className="more-card more-action"
          type="button"
          onClick={() => setPlaylistOpen((open) => !open)}
        >
          <span className="more-icon">♫</span>
          <strong>Antrean MIDI</strong>
          <small>
            {playlist.items.length
              ? `${playlist.items.length} lagu tersimpan · ${playlist.autoNext ? "lanjut otomatis" : "manual"}${playlist.loop === "off" ? "" : ` · ulang ${playlist.loop}`}`
              : "Simpan lagu, urutkan, dan atur putar berikutnya"}
          </small>
        </button>
        <article className="more-card account-card">
          <span className="more-icon">◯</span>
          <strong>
            {accountLoading || authBusy
              ? "Memeriksa akun…"
              : (accountProfile?.displayName ?? "Akun e-GYS")}
          </strong>
          <small>
            {accountProfile
              ? "Profil native e-GYS tersambung"
              : providers?.google.enabled ||
                  providers?.apple.enabled ||
                  providers?.whatsapp
                ? "Pilih provider untuk masuk"
                : "Google, Apple, atau e-GYS"}
          </small>
          {egysMeta && (
            <small className="account-sync-note">
              Kontrak e-GYS tersinkron ·{" "}
              {egysMeta.sourceCommit?.slice(0, 7) ?? "menunggu"}
            </small>
          )}
          {accountProfile ? (
            <>
              <dl className="account-profile-details">
                <div>
                  <dt>Status</dt>
                  <dd>
                    {accountProfile.isMember === true
                      ? `Jemaat${accountProfile.memberStatus ? ` · ${accountProfile.memberStatus}` : ""}`
                      : accountProfile.isMember === false
                        ? "Bukan jemaat"
                        : "Belum terverifikasi"}
                  </dd>
                </div>
                <div>
                  <dt>Cabang</dt>
                  <dd>{accountProfile.branchName ?? "Belum tersedia"}</dd>
                </div>
                {accountProfile.membershipNo && (
                  <div>
                    <dt>No. jemaat</dt>
                    <dd>{accountProfile.membershipNo}</dd>
                  </div>
                )}
                {accountProfile.email && (
                  <div>
                    <dt>Email</dt>
                    <dd>{accountProfile.email}</dd>
                  </div>
                )}
              </dl>
              <button
                type="button"
                className="text-button account-signout"
                onClick={() => {
                  void signOutEgys().then(() => {
                    setAccountProfile(undefined);
                    show("Sesi e-GYS sudah dikeluarkan dari perangkat ini.");
                  });
                }}
              >
                Keluar
              </button>
            </>
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
            void clearAppData().then(() =>
              show(
                "Preferensi dan cache GYS sudah direset. Muat ulang bila diperlukan.",
              ),
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
            maxLength={2_000}
            onChange={(event) => {
              setReport(event.target.value);
              if (reportStatus === "error") setReportStatus("idle");
            }}
            rows={3}
            placeholder="Apa yang perlu kami perbaiki?"
          />
          <button
            className="primary-button"
            type="submit"
            disabled={!report.trim() || reportStatus === "sending"}
          >
            {reportStatus === "sending" ? "Mengirim…" : "Kirim laporan"}
          </button>
          <small className="form-status" aria-live="polite">
            {reportStatus === "error"
              ? "Draft tersimpan di perangkat."
              : `${report.length}/2.000 karakter`}
          </small>
        </form>
      </section>
      {backupOpen && (
        <section className="utility-panel" aria-label="Backup dan import">
          <div className="more-card-heading">
            <div>
              <p className="date-line">Data lokal</p>
              <h2>Backup terenkripsi</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setBackupOpen(false)}
            >
              Tutup
            </button>
          </div>
          <p>
            Backup hanya memuat preferensi, riwayat baca, bookmark, dan indeks
            cache. Kata sandi tidak dikirim ke server.
          </p>
          <label className="search-field">
            <span>Kata sandi backup</span>
            <input
              type="password"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <div className="utility-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void exportBackup()}
            >
              Ekspor .gysbk
            </button>
            <label className="quiet-button file-button">
              Pilih file
              <input
                type="file"
                accept=".gysbk,.json"
                onChange={(event) => setBackupFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="quiet-button"
              type="button"
              onClick={() => void importBackup()}
              disabled={!backupFile}
            >
              Impor
            </button>
          </div>
        </section>
      )}
      {reminderOpen && (
        <section className="utility-panel" aria-label="Pengingat harian">
          <div className="more-card-heading">
            <div>
              <p className="date-line">Notifikasi perangkat</p>
              <h2>Pengingat harian</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setReminderOpen(false)}
            >
              Tutup
            </button>
          </div>
          <p>
            Pilih waktu untuk pengingat membaca. Jadwal disimpan lokal dan tidak
            memerlukan akun.
          </p>
          <label className="search-field">
            <span>Waktu</span>
            <input
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
            />
          </label>
          <div className="utility-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void saveReminder()}
            >
              Simpan pengingat
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => {
                setReminderTime("");
                void saveReminder();
              }}
            >
              Nonaktifkan
            </button>
          </div>
        </section>
      )}
      {playlistOpen && (
        <section className="utility-panel" aria-label="Antrean MIDI">
          <div className="more-card-heading">
            <div>
              <p className="date-line">Kidung Rohani</p>
              <h2>Antrean MIDI</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setPlaylistOpen(false)}
            >
              Tutup
            </button>
          </div>
          <div className="playlist-settings">
            <label className="control-check">
              <input
                type="checkbox"
                checked={playlist.autoNext}
                onChange={(event) =>
                  updateMidiPlaylistOptions({ autoNext: event.target.checked })
                }
              />
              <span>Lanjut otomatis</span>
            </label>
            <label className="control-check">
              <input
                type="checkbox"
                checked={playlist.shuffle}
                onChange={(event) =>
                  updateMidiPlaylistOptions({ shuffle: event.target.checked })
                }
              />
              <span>Acak</span>
            </label>
            <Select
              value={playlist.loop}
              onChange={(value) => updateMidiPlaylistOptions({ loop: value })}
              label="Ulangi"
              options={[
                { value: "off" as const, label: "Tidak mengulang" },
                { value: "one" as const, label: "Lagu ini" },
                { value: "all" as const, label: "Seluruh antrean" },
              ]}
            />
          </div>
          {playlist.items.length ? (
            <ol className="playlist-list">
              {playlist.items.map((item, index) => (
                <li
                  className={
                    index === playlist.currentIndex ? "is-current" : ""
                  }
                  key={item.songId}
                >
                  <button
                    className="playlist-item-main"
                    type="button"
                    onClick={() => selectMidiPlaylistItem(index)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.title}</strong>
                  </button>
                  <div className="playlist-item-actions">
                    <button
                      className="text-button"
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveMidiPlaylistItem(index, index - 1)}
                      aria-label={`Naikkan ${item.title}`}
                    >
                      ↑
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={index === playlist.items.length - 1}
                      onClick={() => moveMidiPlaylistItem(index, index + 1)}
                      aria-label={`Turunkan ${item.title}`}
                    >
                      ↓
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => removeMidiPlaylistItem(item.songId)}
                      aria-label={`Hapus ${item.title}`}
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-inline">
              <p>Belum ada lagu. Tambahkan dari detail Kidung.</p>
            </div>
          )}
          <div className="utility-actions">
            <button
              className="quiet-button"
              type="button"
              onClick={downloadMidiPlaylist}
              disabled={!playlist.items.length}
            >
              Ekspor antrean
            </button>
            <label className="quiet-button file-button">
              Impor antrean
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => setPlaylistFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="quiet-button"
              type="button"
              disabled={!playlistFile}
              onClick={() => {
                if (!playlistFile) return;
                void playlistFile
                  .text()
                  .then((value) => importMidiPlaylist(value))
                  .then(() => {
                    setPlaylistFile(undefined);
                    show("Antrean MIDI berhasil diimpor.");
                  })
                  .catch(() => show("File antrean tidak valid."));
              }}
            >
              Terapkan
            </button>
            <button
              className="text-button"
              type="button"
              disabled={!playlist.items.length}
              onClick={() => {
                clearMidiPlaylist();
                show("Antrean MIDI dikosongkan.");
              }}
            >
              Kosongkan
            </button>
          </div>
          <small>
            Format antrean tervalidasi dan dapat dipulihkan melalui backup
            aplikasi.
          </small>
        </section>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
