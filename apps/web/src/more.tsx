import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  type AccountProfile,
  type AssetManifestV1,
  type DistributedAssetKind,
} from "@gys/contracts";
import {
  decryptBackupV2,
  encryptBackupV2,
  importLegacyGysbk,
} from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import {
  applyAssetManifestUpdate,
  checkAssetManifest,
  parseAssetManifest,
  readActiveAssetManifest,
  type AssetManifestDiff,
} from "./asset-updater.js";
import {
  getEgysProfile,
  readCachedEgysProfile,
  readEgysSessionTrace,
  saveEgysProfile,
  signOutEgys,
  trackEgysProfileSeen,
  type EgysSessionTrace,
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
import { Icon, type IconName } from "./icons.js";
import { recordDiagnostic } from "./diagnostics.js";
import { clearPlatformStorage } from "./platform.js";
import {
  isTauriShell,
  openNativeEgysLogin,
  subscribeNativeEgysLogin,
} from "./native-platform.js";
import type { ShellTheme } from "./settings.js";
import {
  getDistributedAssetManager,
  distributedDownloadsConfigured,
  type ManagedDistributedAsset,
} from "./distributed-asset-manager.js";
import {
  ACCENT_PRESETS,
  getAccentColor,
  setAccentColor,
  subscribeAccentColor,
} from "./accent-color.js";

type PackManifest = {
  version: number;
  generatedAt: string;
  bible: string;
  hymns: number;
  items: { id: string; path: string; bytes: number; sha256: string }[];
};

type AssetCheckState =
  | { status: "idle" | "checking" | "current" | "error" }
  | {
      status: "update";
      manifest: AssetManifestV1;
      diff: AssetManifestDiff;
      url: string;
    };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function distributedAssetStateLabel(asset: ManagedDistributedAsset): string {
  switch (asset.state) {
    case "bundled":
      return "Termasuk paket inti";
    case "available":
      return "Belum diunduh";
    case "installed":
      return `Tersimpan · v${asset.installedVersion ?? asset.item?.version ?? "?"}`;
    case "update":
      return `Pembaruan tersedia · v${asset.item?.version ?? "?"}`;
    case "unavailable":
      return "Belum tersedia";
  }
}

const ASSET_GROUPS: {
  key: DistributedAssetKind;
  label: string;
  icon: IconName;
}[] = [
  { key: "bible", label: "Alkitab", icon: "book" },
  { key: "hymnal", label: "Kidung Rohani", icon: "music" },
  { key: "soundfont", label: "Soundfont", icon: "music" },
];

function DistributedAssetPanel({
  assets,
  busyCode,
  progress,
  error,
  loading,
  downloadAvailable,
  onInstall,
  onRemove,
}: {
  assets: ManagedDistributedAsset[];
  busyCode?: string;
  progress?: { received: number; total: number };
  error?: string;
  loading?: boolean;
  downloadAvailable: boolean;
  onInstall: (code: string) => void;
  onRemove: (code: string) => void;
}) {
  const groups = ASSET_GROUPS.map((group) => ({
    ...group,
    items: assets.filter((asset) => asset.kind === group.key),
  })).filter((group) => group.items.length > 0);
  return (
    <article className="more-card more-card-wide distributed-assets-card">
      <div className="more-card-heading">
        <div>
          <h2>Manajemen Aset</h2>
        </div>
      </div>
      {!downloadAvailable && (
        <div className="inline-error" role="status">
          Layanan unduhan belum dikonfigurasi. Aset inti tetap dapat digunakan
          offline.
        </div>
      )}
      <div className="distributed-assets-list">
        {loading && (
          <small className="account-sync-note">Memuat katalog aset…</small>
        )}
        {!loading && assets.length === 0 && (
          <small className="account-sync-note">
            Belum ada aset tambahan yang tersedia.
          </small>
        )}
        {groups.map((group) => (
          <section className="distributed-asset-group" key={group.key}>
            <div className="distributed-asset-group-label">
              <Icon name={group.icon} size={15} />
              <strong>{group.label}</strong>
              <span>{group.items.length}</span>
            </div>
            {group.items.map((asset) => {
              const busy = busyCode === asset.code;
              const percent =
                busy && progress?.total
                  ? Math.min(
                      100,
                      Math.round((progress.received / progress.total) * 100),
                    )
                  : 0;
              return (
                <div className="distributed-asset-row" key={asset.code}>
                  <div className="distributed-asset-copy">
                    <strong>{asset.title}</strong>
                    <small>
                      {distributedAssetStateLabel(asset)}
                      {asset.sizeBytes
                        ? ` · ${formatBytes(asset.sizeBytes)}`
                        : ""}
                    </small>
                    {busy && (
                      <progress
                        value={percent}
                        max={100}
                        aria-label={`Mengunduh ${asset.title}`}
                      />
                    )}
                  </div>
                  <div className="distributed-asset-actions">
                    {busy ? (
                      <span className="account-sync-note">
                        Mengunduh {percent}%…
                      </span>
                    ) : asset.state === "bundled" ? (
                      <span className="pack-badge is-verified">
                        Siap offline
                      </span>
                    ) : asset.state === "installed" ||
                      asset.state === "update" ? (
                      <>
                        <button
                          className="quiet-button asset-action-button"
                          type="button"
                          disabled={!downloadAvailable}
                          onClick={() => onInstall(asset.code)}
                          aria-label={`${asset.state === "update" ? "Perbarui" : "Unduh ulang"} ${asset.title}`}
                          title={`${asset.state === "update" ? "Perbarui" : "Unduh ulang"} ${asset.title}`}
                        >
                          <Icon name="download" size={17} />
                          <span className="asset-action-copy">
                            {asset.state === "update"
                              ? "Perbarui"
                              : "Unduh ulang"}
                          </span>
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => onRemove(asset.code)}
                        >
                          Hapus
                        </button>
                      </>
                    ) : asset.state === "available" ? (
                      <button
                        className="primary-button asset-action-button"
                        type="button"
                        disabled={!downloadAvailable}
                        onClick={() => onInstall(asset.code)}
                        aria-label={`Unduh ${asset.title}`}
                        title={`Unduh ${asset.title}`}
                      >
                        <Icon name="download" size={17} />
                        <span className="asset-action-copy">Unduh</span>
                      </button>
                    ) : (
                      <span className="account-sync-note">Tidak tersedia</span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
    </article>
  );
}

function localUpdateCount(diff: AssetManifestDiff): number {
  return [...diff.added, ...diff.changed].filter(
    (item) => item.source === "local",
  ).length;
}

const BACKUP_STORAGE_KEYS = [
  "gys-locale",
  "gys-theme",
  "gys-shell-settings-v1",
  "gys-activity-v1",
  "gys-favorites-v1",
  "gys-literature-progress-v2",
  "gys-asset-index-v1",
  "gys-active-asset-manifest-v1",
  "gys-bible-book",
  "gys-bible-chapter",
  "gys-bible-version-v1",
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
  "gys-midi-preferences-v1",
  "gys-hymn-typography-v1",
  "gys-speech-voice-v1",
  "gys-speech-rate-v1",
  "gys-speech-engine-v1",
  "gys-report-draft",
  "gys-reminder-time-v1",
  "gys-chord-cache-index-v1",
  "gys-midi-playlist-v1",
  "gys-hymn-view-mode-v1",
  "gys-hymn-chord-visibility-v1",
];

function collectBackupSettings() {
  const dynamicKeys = Object.keys(localStorage).filter(
    (key) =>
      key.startsWith("gys-pdf-page:") || key.startsWith("gys-pdf-layout:"),
  );
  return Object.fromEntries(
    [...BACKUP_STORAGE_KEYS, ...dynamicKeys].flatMap((key) => {
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

export async function clearAppData() {
  let resetError: unknown;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("gys-")) localStorage.removeItem(key);
    }
  } catch (error) {
    resetError = error;
    recordDiagnostic("warn", "storage.reset.local", error);
  }
  try {
    await clearPlatformStorage();
  } catch (error) {
    // A private browser or a native storage permission failure must be
    // surfaced to the action handler instead of being reported as success.
    resetError ??= error;
    recordDiagnostic("warn", "storage.reset", error);
  }
  if (resetError) throw resetError;
}

export function MorePage({
  locale,
  theme,
  setLocale,
  setTheme,
}: {
  locale: Locale;
  theme: ShellTheme;
  setLocale: (value: Locale) => void;
  setTheme: (value: ShellTheme) => void;
}) {
  const nativeShell = isTauriShell();
  const [manifest, setManifest] = useState<PackManifest | undefined>();
  const [assetManifest, setAssetManifest] = useState<AssetManifestV1>();
  const [assetCheck, setAssetCheck] = useState<AssetCheckState>({
    status: "idle",
  });
  const [packBusy, setPackBusy] = useState(false);
  const [packProgress, setPackProgress] = useState(0);
  const [report, setReport] = useState(
    () => localStorage.getItem("gys-report-draft") ?? "",
  );
  const [reportStatus, setReportStatus] = useState<
    "idle" | "sending" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [accountProfile, setAccountProfile] = useState<
    AccountProfile | undefined
  >(() => readCachedEgysProfile());
  const [egysSession, setEgysSession] = useState<EgysSessionTrace | undefined>(
    () => readEgysSessionTrace(),
  );
  const [accountLoading, setAccountLoading] = useState(
    () => !readCachedEgysProfile(),
  );
  const [egysUnavailable, setEgysUnavailable] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [egysLoginOpen, setEgysLoginOpen] = useState(false);
  const [isEgysLoginClosing, setIsEgysLoginClosing] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File>();
  const [reminderOpen, setReminderOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlist, setPlaylist] = useState(() => getMidiPlaylist());
  const [playlistFile, setPlaylistFile] = useState<File>();
  const [distributedAssets, setDistributedAssets] = useState<
    ManagedDistributedAsset[]
  >([]);
  const [distributedAssetsLoading, setDistributedAssetsLoading] =
    useState(true);
  const [distributedBusyCode, setDistributedBusyCode] = useState<string>();
  const [distributedProgress, setDistributedProgress] = useState<{
    received: number;
    total: number;
  }>();
  const [distributedError, setDistributedError] = useState<string>();
  const [reminderTime, setReminderTime] = useState(
    () => localStorage.getItem("gys-reminder-time-v1") ?? "",
  );
  const accentColor = useSyncExternalStore(
    subscribeAccentColor,
    getAccentColor,
    getAccentColor,
  );
  const changeTheme = (next: ShellTheme) => {
    setTheme(next);
  };

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
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/pack-manifest.json`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) setManifest((await response.json()) as PackManifest);
      })
      .catch(() => undefined);
    void fetch(`${import.meta.env.BASE_URL}offline/asset-manifest.json`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Asset manifest failed: ${response.status}`);
        const packaged = parseAssetManifest(
          await response.json(),
          response.url,
        );
        const active = readActiveAssetManifest();
        const baseline = active ?? packaged;
        setAssetManifest(baseline);
        try {
          const checked = await checkAssetManifest(baseline, controller.signal);
          if (checked.diff.hasUpdate) {
            setAssetCheck({
              status: "update",
              manifest: checked.manifest,
              diff: checked.diff,
              url: checked.url,
            });
          } else {
            setAssetCheck({ status: "current" });
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            recordDiagnostic("warn", "assets.manifest.check", error);
            setAssetCheck({ status: "error" });
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          recordDiagnostic("warn", "assets.manifest.load", error);
          setAssetCheck({ status: "error" });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => subscribeMidiPlaylist(() => setPlaylist(getMidiPlaylist())),
    [],
  );

  useEffect(() => {
    let active = true;
    const manager = getDistributedAssetManager();
    const refresh = async () => {
      try {
        const next = await manager.refresh();
        if (active) {
          setDistributedAssets(next);
          setDistributedAssetsLoading(false);
          setDistributedError(undefined);
        }
      } catch (error) {
        if (active) {
          recordDiagnostic("warn", "assets.distributed.catalog", error);
          setDistributedAssetsLoading(false);
          setDistributedError("Katalog aset tambahan belum dapat dimuat.");
        }
      }
    };
    void refresh();
    const onAssetsChanged = () => void refresh();
    window.addEventListener("gys-distributed-assets-change", onAssetsChanged);
    return () => {
      active = false;
      window.removeEventListener(
        "gys-distributed-assets-change",
        onAssetsChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (!nativeShell) return;
    return subscribeNativeEgysLogin(() => {
      const controller = new AbortController();
      setAuthBusy(true);
      void getEgysProfile(controller.signal)
        .then((profile) => {
          setAccountProfile(profile);
          setEgysUnavailable(false);
          if (profile) {
            saveEgysProfile(profile);
            setEgysSession(trackEgysProfileSeen(profile));
          }
          show(
            profile
              ? `Selamat datang, ${profile.displayName}.`
              : "Login e-GYS berhasil, tetapi profil belum tersedia.",
          );
        })
        .catch((error: unknown) => {
          recordDiagnostic("error", "egys.native-login.profile", error);
          show(
            "Login e-GYS selesai, tetapi profil belum dapat dibaca. Coba muat ulang.",
          );
        })
        .finally(() => {
          controller.abort();
          setAuthBusy(false);
        });
    });
  }, [nativeShell]);

  useEffect(() => {
    // If we already have a full cached profile, ensure session trace is up to date
    const cached = readCachedEgysProfile();
    if (cached) {
      setAccountProfile(cached);
      setEgysSession(readEgysSessionTrace());
    } else {
      // Check if there is an existing session trace to reconstruct active profile
      const trace = readEgysSessionTrace();
      if (trace && trace.userId) {
        const reconstructed: AccountProfile = {
          id: trace.userId,
          displayName: trace.displayName ?? "Jemaat e-GYS",
          branchCode: trace.branchCode,
          branchName: trace.branchName,
          isMember: trace.isMember ?? true,
          memberStatus: trace.isMember ? "Jemaat Aktif" : undefined,
          provider: "egys",
          locale: "id",
        };
        setAccountProfile(reconstructed);
      }
    }

    const controller = new AbortController();
    void getEgysProfile(controller.signal)
      .then((profile) => {
        if (profile) {
          setAccountProfile(profile);
          saveEgysProfile(profile);
          setEgysUnavailable(false);
          setEgysSession(trackEgysProfileSeen(profile));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          recordDiagnostic("warn", "egys.profile.detect", error);
          if (nativeShell) setEgysUnavailable(true);
        }
      })
      .finally(() => setAccountLoading(false));
    return () => controller.abort();
  }, [nativeShell]);

  const closeEgysLogin = () => {
    if (isEgysLoginClosing) return;
    setIsEgysLoginClosing(true);
    window.setTimeout(() => {
      setEgysLoginOpen(false);
      setIsEgysLoginClosing(false);
    }, 200);
  };

  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      try {
        const data = event.data as Record<string, unknown> | undefined;
        if (!data || typeof data !== "object") return;
        if (
          data.type === "egys-login-success" ||
          data.event === "auth-success"
        ) {
          closeEgysLogin();
          const controller = new AbortController();
          setAuthBusy(true);
          void getEgysProfile(controller.signal)
            .then((profile) => {
              if (profile) {
                setAccountProfile(profile);
                saveEgysProfile(profile);
                setEgysSession(trackEgysProfileSeen(profile));
                show(`Selamat datang, ${profile.displayName}.`);
              }
            })
            .finally(() => setAuthBusy(false));
        }
      } catch {
        // ignore unknown events
      }
    };
    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
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
    } catch (error) {
      recordDiagnostic("warn", "feedback.submit", error);
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
    } catch (error) {
      recordDiagnostic("warn", "backup.export", error);
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

  const checkOfflinePack = async () => {
    if (!assetManifest || packBusy) return;
    setAssetCheck({ status: "checking" });
    const controller = new AbortController();
    try {
      const checked = await checkAssetManifest(
        assetManifest,
        controller.signal,
      );
      setAssetCheck(
        checked.diff.hasUpdate
          ? {
              status: "update",
              manifest: checked.manifest,
              diff: checked.diff,
              url: checked.url,
            }
          : { status: "current" },
      );
    } catch (error) {
      recordDiagnostic("warn", "assets.manifest.check", error);
      setAssetCheck({ status: "error" });
      show("Versi paket belum dapat diperiksa. Coba lagi saat online.");
    }
  };

  const updateOfflinePack = async () => {
    const target =
      assetCheck.status === "update" ? assetCheck.manifest : assetManifest;
    if (!manifest || !target || packBusy) return;
    setPackBusy(true);
    setPackProgress(0);
    try {
      const diff = await applyAssetManifestUpdate(assetManifest, target, {
        forceAll: assetCheck.status !== "update",
        ...(assetCheck.status === "update"
          ? { sourceUrl: assetCheck.url }
          : {}),
        onProgress: (completed, total) =>
          setPackProgress(Math.round((completed / total) * 100)),
      });
      setAssetManifest(target);
      setAssetCheck({ status: "current" });
      show(
        diff.hasUpdate
          ? localUpdateCount(diff) > 0
            ? `Paket diperbarui: ${localUpdateCount(diff)} aset baru.`
            : "Metadata paket diperbarui."
          : "Paket offline berhasil diverifikasi dan disimpan.",
      );
    } catch (error) {
      recordDiagnostic("warn", "assets.pack", error);
      show(
        "Paket offline gagal diperbarui. Periksa koneksi dan ruang penyimpanan.",
      );
    } finally {
      setPackBusy(false);
    }
  };

  const installDistributedAsset = async (code: string) => {
    if (distributedBusyCode) return;
    setDistributedBusyCode(code);
    setDistributedProgress(undefined);
    setDistributedError(undefined);
    try {
      const manager = getDistributedAssetManager();
      await manager.install(code, {
        onProgress: (received, total) =>
          setDistributedProgress({ received, total }),
      });
      setDistributedAssets(await manager.loadStatuses());
      show("Aset berhasil diunduh dan disimpan offline.");
    } catch (error) {
      recordDiagnostic("warn", "assets.distributed.install", error);
      setDistributedError(
        error instanceof Error
          ? error.message
          : "Aset gagal diunduh. Coba lagi saat online.",
      );
    } finally {
      setDistributedBusyCode(undefined);
      setDistributedProgress(undefined);
    }
  };

  const removeDistributedAsset = async (code: string) => {
    if (
      distributedBusyCode ||
      !window.confirm("Hapus aset offline ini dari perangkat?")
    )
      return;
    try {
      const manager = getDistributedAssetManager();
      await manager.remove(code);
      setDistributedAssets(await manager.loadStatuses());
      show("Aset dihapus dari penyimpanan offline.");
    } catch (error) {
      recordDiagnostic("warn", "assets.distributed.remove", error);
      setDistributedError(
        error instanceof Error ? error.message : "Aset gagal dihapus.",
      );
    }
  };

  const openNativeEgysLoginFlow = async () => {
    setAuthBusy(true);
    try {
      await openNativeEgysLogin();
      show("Halaman login resmi e-GYS sudah dibuka.");
    } catch (error) {
      recordDiagnostic("error", "egys.native-login.open", error);
      show("Halaman login e-GYS belum dapat dibuka. Coba lagi.");
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="page more-page">
      <section className="page-intro">
        <div>
          <h1>{translate(locale, "page.moreTitle")}</h1>
        </div>
      </section>

      <section className="more-grid">
        <article className="more-card more-card-wide account-card egys-card">
          <div className="more-card-heading">
            <div>
              <h2>
                {accountProfile
                  ? (accountProfile.displayName ?? "Akun Jemaat")
                  : "Akun e-GYS"}
              </h2>
            </div>
            {accountProfile || nativeShell ? (
              <span
                className={`pack-badge${accountProfile ? " is-verified" : ""}`}
              >
                {accountProfile
                  ? "Terhubung"
                  : egysUnavailable
                    ? "Tidak tersedia"
                    : "Tamu"}
              </span>
            ) : null}
          </div>

          {accountLoading || authBusy ? (
            <div className="account-loading-box" role="status">
              <p>Memeriksa status akun e-GYS…</p>
            </div>
          ) : accountProfile ? (
            <div className="egys-member-badge">
              <div className="member-badge-header">
                <span className="member-church-title">Gereja Yesus Sejati</span>
                <span className="member-status-pill">
                  {accountProfile.isMember === true
                    ? "Jemaat Resmi ✓"
                    : "Anggota Terdaftar"}
                </span>
              </div>
              <div className="member-badge-body">
                <div className="member-info-row">
                  <span className="info-label">Nama Lengkap</span>
                  <strong className="info-value member-name">
                    {accountProfile.displayName}
                  </strong>
                </div>
                <div className="member-info-grid">
                  <div>
                    <span className="info-label">Daerah / Cabang</span>
                    <strong className="info-value">
                      {accountProfile.branchName ??
                        accountProfile.branchCode ??
                        "Pusat"}
                    </strong>
                  </div>
                  {accountProfile.membershipNo && (
                    <div>
                      <span className="info-label">No. Anggota</span>
                      <strong className="info-value">
                        {accountProfile.membershipNo}
                      </strong>
                    </div>
                  )}
                </div>
                {accountProfile.memberStatus && (
                  <div className="member-info-row">
                    <span className="info-label">Status Keanggotaan</span>
                    <span className="info-value-text">
                      {accountProfile.memberStatus}
                    </span>
                  </div>
                )}
                {accountProfile.email && (
                  <div className="member-info-row">
                    <span className="info-label">Email</span>
                    <span className="info-value-text">
                      {accountProfile.email}
                    </span>
                  </div>
                )}
                {egysSession?.userId === accountProfile.id && (
                  <small className="egys-login-trace">
                    Login terakhir{" "}
                    {new Date(egysSession.lastSeenAt).toLocaleString(locale)} ·
                    terdeteksi sejak{" "}
                    {new Date(egysSession.firstLoginAt).toLocaleDateString(
                      locale,
                    )}
                  </small>
                )}
              </div>
              <div className="member-badge-actions">
                <button
                  type="button"
                  className="quiet-button account-signout"
                  onClick={() => {
                    void signOutEgys().then(() => {
                      setAccountProfile(undefined);
                      setEgysSession(undefined);
                      show("Sesi e-GYS sudah dikeluarkan dari perangkat ini.");
                    });
                  }}
                >
                  Keluar dari Akun Ini
                </button>
              </div>
            </div>
          ) : (
            <div className="egys-login-box">
              <p className="egys-login-desc">
                {nativeShell
                  ? "Masuk melalui halaman resmi e-GYS."
                  : "Login resmi; sinkronisasi profil tersedia di aplikasi terpasang."}
              </p>
              <div className="egys-login-actions">
                {nativeShell ? (
                  <>
                    <button
                      type="button"
                      className="primary-button egys-login-button"
                      onClick={() => void openNativeEgysLoginFlow()}
                    >
                      <Icon name="person" size={16} />
                      <span>Buka login e-GYS resmi</span>
                    </button>
                    <small className="account-sync-note">
                      Google, Apple, dan WhatsApp OTP diproses langsung di
                      halaman resmi e-GYS.
                    </small>
                  </>
                ) : (
                  <a
                    className="primary-button egys-login-button"
                    href={`https://e.gys.or.id/login?theme=${theme}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setEgysLoginOpen(true);
                    }}
                  >
                    <Icon name="person" size={16} />
                    <span>Buka login e-GYS resmi</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </article>

        <article className="more-card more-card-wide appearance-card">
          <div className="more-card-heading">
            <div>
              <h2>Tampilan & Bahasa</h2>
            </div>
          </div>

          <div className="appearance-section">
            <label className="section-subtitle">Tema Layar</label>
            <div
              className="theme-pill-grid"
              role="radiogroup"
              aria-label="Pilih Tema"
            >
              {[
                { key: "light", icon: "sun" as const, label: "Terang" },
                { key: "dark", icon: "moon" as const, label: "Gelap" },
                { key: "amoled", icon: "amoled" as const, label: "AMOLED" },
                { key: "sepia", icon: "sepia" as const, label: "Sepia" },
                { key: "system", icon: "system" as const, label: "Otomatis" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={theme === item.key}
                  className={`theme-pill-btn${theme === item.key ? " is-active" : ""}`}
                  onClick={() => changeTheme(item.key as typeof theme)}
                  aria-label={item.label}
                  title={item.label}
                >
                  <span className="pill-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="pill-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-section">
            <label className="section-subtitle">Warna Aksen</label>
            <div
              className="accent-palette-grid"
              role="radiogroup"
              aria-label="Pilih Warna Aksen"
            >
              {ACCENT_PRESETS.map((preset) => {
                const active = accentColor === preset.color;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`accent-palette-item${active ? " is-active" : ""}`}
                    onClick={() => setAccentColor(preset.color)}
                    aria-label={`Warna aksen ${preset.name}`}
                    title={preset.name}
                  >
                    <span
                      className="accent-swatch-circle"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="accent-swatch-name">{preset.name}</span>
                  </button>
                );
              })}
              <label
                className={`accent-palette-item is-custom${!ACCENT_PRESETS.some((p) => p.color === accentColor) ? " is-active" : ""}`}
                title="Pilih Warna Kustom"
              >
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="sr-only"
                  aria-label="Pilih warna aksen kustom"
                />
                <span
                  className="accent-swatch-circle is-custom-circle"
                  style={{
                    backgroundColor: !ACCENT_PRESETS.some(
                      (p) => p.color === accentColor,
                    )
                      ? accentColor
                      : "transparent",
                  }}
                >
                  🎨
                </span>
                <span className="accent-swatch-name">Kustom</span>
              </label>
            </div>
          </div>

          <div className="appearance-section">
            <label className="section-subtitle">Bahasa Aplikasi</label>
            <div className="lang-pill-grid">
              <Select
                value={locale}
                onChange={(val) => {
                  const next = val as Locale;
                  setLocale(next);
                }}
                label="Pilih Bahasa"
                options={[
                  { value: "id", label: "🇮🇩 Bahasa Indonesia (Utama)" },
                  { value: "en", label: "🇬🇧 English" },
                  { value: "zh", label: "🇨🇳 简体中文" },
                ]}
              />
            </div>
          </div>
        </article>

        <article className="more-card more-card-wide">
          <div className="more-card-heading">
            <div>
              <h2>Paket lokal</h2>
            </div>
            <span className="pack-badge">Siap</span>
          </div>
          <p>
            Alkitab TB dan metadata inti tersedia tanpa koneksi. Versi tambahan,
            PDF, partitur, dan SoundFont diunduh sesuai kebutuhan.
          </p>
          <div className="pack-stats">
            <span>
              <strong>{manifest?.bible ?? "TB"}</strong>
              <small>terjemahan</small>
            </span>
            <span>
              <strong>{manifest?.hymns ?? "—"}</strong>
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
                : assetCheck.status === "update"
                  ? localUpdateCount(assetCheck.diff) > 0
                    ? `Unduh ${localUpdateCount(assetCheck.diff)} pembaruan`
                    : "Perbarui metadata paket"
                  : "Verifikasi & simpan paket"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={
                !assetManifest || packBusy || assetCheck.status === "checking"
              }
              onClick={() => void checkOfflinePack()}
            >
              {assetCheck.status === "checking"
                ? "Memeriksa…"
                : "Periksa versi"}
            </button>
            <small>
              Manifest v{manifest?.version ?? 1} ·{" "}
              {manifest
                ? new Date(manifest.generatedAt).toLocaleDateString(locale)
                : "memuat"}
              {assetCheck.status === "update" &&
                ` · ${localUpdateCount(assetCheck.diff)} pembaruan tersedia`}
              {assetCheck.status === "current" && " · terbaru"}
              {assetCheck.status === "error" && " · belum diperiksa"}
            </small>
          </div>
        </article>

        <DistributedAssetPanel
          assets={distributedAssets}
          loading={distributedAssetsLoading}
          downloadAvailable={distributedDownloadsConfigured()}
          {...(distributedBusyCode ? { busyCode: distributedBusyCode } : {})}
          {...(distributedProgress ? { progress: distributedProgress } : {})}
          {...(distributedError ? { error: distributedError } : {})}
          onInstall={(code) => void installDistributedAsset(code)}
          onRemove={(code) => void removeDistributedAsset(code)}
        />

        <button
          className="more-card more-action"
          type="button"
          onClick={() => setPlaylistOpen((open) => !open)}
        >
          <span className="more-icon">♫</span>
          <strong>Antrean MIDI</strong>
          <small>
            {playlist.items.length
              ? `${playlist.items.length} lagu tersimpan · ${playlist.autoNext ? "lanjut otomatis" : "manual"}`
              : "Daftar lagu untuk kebaktian atau latihan"}
          </small>
        </button>

        <button
          className="more-card more-action"
          type="button"
          onClick={() => setBackupOpen((open) => !open)}
        >
          <span className="more-icon">↥</span>
          <strong>Backup & import</strong>
          <small>Simpan atau pulihkan data catatan & riwayat</small>
        </button>

        <button
          className="more-card more-action"
          type="button"
          onClick={() => {
            void clearAppData()
              .then(() =>
                show(
                  "Preferensi dan cache GYS sudah direset. Muat ulang bila diperlukan.",
                ),
              )
              .catch(() =>
                show(
                  "Reset belum selesai sepenuhnya. Periksa izin penyimpanan lalu coba lagi.",
                ),
              );
          }}
        >
          <span className="more-icon">⌁</span>
          <strong>Reset perangkat</strong>
          <small>Bersihkan cache dan mulai ulang preferensi</small>
        </button>

        <button
          className="more-card more-action"
          type="button"
          onClick={() => setReminderOpen((open) => !open)}
        >
          <span className="more-icon">◷</span>
          <strong>Pengingat</strong>
          <small>Atur waktu teduh membaca firman harian</small>
        </button>

        <form className="more-card report-card" onSubmit={submitReport}>
          <div className="more-card-heading">
            <div>
              <h2>Laporkan masalah</h2>
            </div>
          </div>
          <label className="sr-only" htmlFor="report-message">
            {translate(locale, "more.reportMessage")}
          </label>
          <textarea
            id="report-message"
            value={report}
            maxLength={2_000}
            onChange={(event) => {
              setReport(event.target.value);
              if (reportStatus === "error") setReportStatus("idle");
            }}
            rows={3}
            placeholder="Tuliskan kendala atau saran perbaikan di sini…"
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
      {egysLoginOpen &&
        createPortal(
          <div
            className={`egys-login-backdrop${isEgysLoginClosing ? " is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Login e-GYS resmi"
            onClick={closeEgysLogin}
          >
            <div
              className="egys-login-overlay"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="egys-login-head">
                <div className="egys-login-title">
                  <Icon name="person" size={18} />
                  <strong>Login e-GYS Resmi</strong>
                  <small>Gereja Yesus Sejati</small>
                </div>
                <button
                  className="egys-login-close"
                  type="button"
                  aria-label="Tutup login e-GYS"
                  onClick={closeEgysLogin}
                >
                  ×
                </button>
              </div>
              <div className="egys-login-frame-container">
                <iframe
                  className="egys-login-iframe"
                  src={`https://e.gys.or.id/login?theme=${theme}`}
                  title="Halaman Login Resmi e-GYS"
                  allow="camera; microphone"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
              <div className="egys-login-footer">
                <span>
                  <Icon name="check" size={14} />
                  Koneksi resmi & aman langsung ke portal e.gys.or.id
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={closeEgysLogin}
                >
                  Selesai / Tutup
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
