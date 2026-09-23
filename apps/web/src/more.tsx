import {
  useEffect,
  useRef,
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
import {
  collectPortableBackupSettings,
  restorePortableBackupSettings,
} from "./backup-settings.js";
import { translate, type Locale } from "./i18n.js";
import {
  applyAssetManifestUpdate,
  checkAssetManifest,
  parseAssetManifest,
  readActiveAssetManifest,
  type AssetManifestDiff,
} from "./asset-updater.js";
import {
  clearEgysProfile,
  clearEgysSessionTrace,
  getEgysProfile,
  readCachedEgysProfile,
  readEgysSessionTrace,
  saveEgysProfile,
  signInEgysWithGoogle,
  signOutEgys,
  trackEgysProfileSeen,
  type EgysSessionTrace,
} from "./egys.js";
import { renderEgysGoogleButton } from "./egys-google.js";
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

function distributedAssetStateLabel(
  locale: Locale,
  asset: ManagedDistributedAsset,
): string {
  switch (asset.state) {
    case "bundled":
      return translate(locale, "more.assetIncluded");
    case "available":
      return translate(locale, "more.assetNotDownloaded");
    case "installed":
      return translate(locale, "more.assetStored", {
        version: asset.installedVersion ?? asset.item?.version ?? "?",
      });
    case "update":
      return translate(locale, "more.assetUpdateAvailable", {
        version: asset.item?.version ?? "?",
      });
    case "unavailable":
      return translate(locale, "more.assetUnavailable");
  }
}

const ASSET_GROUPS: {
  key: DistributedAssetKind;
  labelKey: string;
  icon: IconName;
}[] = [
  { key: "bible", labelKey: "more.assetBible", icon: "book" },
  { key: "hymnal", labelKey: "more.assetHymns", icon: "music" },
  { key: "soundfont", labelKey: "more.assetSoundfont", icon: "music" },
];

function DistributedAssetPanel({
  locale,
  assets,
  busyCode,
  progress,
  error,
  loading,
  downloadAvailable,
  onInstall,
  onRemove,
}: {
  locale: Locale;
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
          <h2>{translate(locale, "more.assetManagement")}</h2>
        </div>
      </div>
      {!downloadAvailable && (
        <div className="inline-error" role="status">
          {translate(locale, "more.downloadUnavailable")}
        </div>
      )}
      <div className="distributed-assets-list">
        {loading && (
          <small className="account-sync-note">
            {translate(locale, "more.loadingAssets")}
          </small>
        )}
        {!loading && assets.length === 0 && (
          <small className="account-sync-note">
            {translate(locale, "more.noAdditionalAssets")}
          </small>
        )}
        {groups.map((group) => (
          <section className="distributed-asset-group" key={group.key}>
            <div className="distributed-asset-group-label">
              <Icon name={group.icon} size={15} />
              <strong>{translate(locale, group.labelKey)}</strong>
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
                      {distributedAssetStateLabel(locale, asset)}
                      {asset.sizeBytes
                        ? ` · ${formatBytes(asset.sizeBytes)}`
                        : ""}
                    </small>
                    {busy && (
                      <progress
                        value={percent}
                        max={100}
                        aria-label={translate(
                          locale,
                          "more.assetDownloadAction",
                          {
                            title: asset.title,
                          },
                        )}
                      />
                    )}
                  </div>
                  <div className="distributed-asset-actions">
                    {busy ? (
                      <span className="account-sync-note">
                        {translate(locale, "more.downloadProgress", {
                          percent,
                        })}
                      </span>
                    ) : asset.state === "bundled" ? (
                      <span className="pack-badge is-verified">
                        {translate(locale, "more.readyOffline")}
                      </span>
                    ) : asset.state === "installed" ||
                      asset.state === "update" ? (
                      <>
                        <button
                          className="quiet-button asset-action-button"
                          type="button"
                          disabled={!downloadAvailable}
                          onClick={() => onInstall(asset.code)}
                          aria-label={translate(
                            locale,
                            asset.state === "update"
                              ? "more.assetUpdateAction"
                              : "more.assetRedownloadAction",
                            { title: asset.title },
                          )}
                          title={translate(
                            locale,
                            asset.state === "update"
                              ? "more.assetUpdateAction"
                              : "more.assetRedownloadAction",
                            { title: asset.title },
                          )}
                        >
                          <Icon name="download" size={17} />
                          <span className="asset-action-copy">
                            {asset.state === "update"
                              ? translate(locale, "more.update")
                              : translate(locale, "more.redownload")}
                          </span>
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => onRemove(asset.code)}
                        >
                          {translate(locale, "more.delete")}
                        </button>
                      </>
                    ) : asset.state === "available" ? (
                      <button
                        className="primary-button asset-action-button"
                        type="button"
                        disabled={!downloadAvailable}
                        onClick={() => onInstall(asset.code)}
                        aria-label={translate(
                          locale,
                          "more.assetDownloadAction",
                          {
                            title: asset.title,
                          },
                        )}
                        title={translate(locale, "more.assetDownloadAction", {
                          title: asset.title,
                        })}
                      >
                        <Icon name="download" size={17} />
                        <span className="asset-action-copy">
                          {translate(locale, "more.download")}
                        </span>
                      </button>
                    ) : (
                      <span className="account-sync-note">
                        {translate(locale, "more.assetUnavailable")}
                      </span>
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
  const [egysGoogleError, setEgysGoogleError] = useState("");
  const googleButtonRef = useRef<HTMLDivElement>(null);
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
            new Notification(translate(locale, "more.notificationTitle"), {
              body: translate(locale, "more.notificationBody"),
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
          setDistributedError(translate(locale, "more.catalogUnavailable"));
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
              ? translate(locale, "more.greeting", {
                  name: profile.displayName,
                })
              : translate(locale, "more.loginProfileUnavailable"),
          );
        })
        .catch((error: unknown) => {
          recordDiagnostic("error", "egys.native-login.profile", error);
          show(translate(locale, "more.profileReadFailed"));
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
        } else {
          clearEgysProfile();
          clearEgysSessionTrace();
          setAccountProfile(undefined);
          setEgysSession(undefined);
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

  const completeGoogleLogin = async (credential: string) => {
    setAuthBusy(true);
    setEgysGoogleError("");
    try {
      await signInEgysWithGoogle(credential);
      const profile = await getEgysProfile();
      if (!profile) throw new Error("e-GYS profile was not returned");
      setAccountProfile(profile);
      saveEgysProfile(profile);
      setEgysSession(trackEgysProfileSeen(profile));
      show(translate(locale, "more.greeting", { name: profile.displayName }));
      closeEgysLogin();
    } catch (error) {
      recordDiagnostic("error", "egys.google-login.complete", error);
      setEgysGoogleError(
        error instanceof Error && error.message
          ? error.message
          : translate(locale, "more.googleDetectFailed"),
      );
      show(translate(locale, "more.loginFailed"));
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    if (!egysLoginOpen || nativeShell || !googleButtonRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const host = googleButtonRef.current;
    setEgysGoogleError("");
    void renderEgysGoogleButton(host, (credential) =>
      completeGoogleLogin(credential),
    )
      .then((nextCleanup) => {
        if (disposed) nextCleanup();
        else cleanup = nextCleanup;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        recordDiagnostic("warn", "egys.google-script", error);
        setEgysGoogleError(translate(locale, "more.googleButtonFailed"));
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [egysLoginOpen, nativeShell]);

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
      show(translate(locale, "more.reportReceived"));
    } catch (error) {
      recordDiagnostic("warn", "feedback.submit", error);
      setReportStatus("error");
      show(translate(locale, "more.reportDraftSaved"));
      localStorage.setItem("gys-report-draft", message);
    } finally {
      window.clearTimeout(timer);
    }
  };

  const exportBackup = async () => {
    if (backupPassword.length < 8) {
      show(translate(locale, "more.backupPasswordTooShort"));
      return;
    }
    try {
      const envelope = await encryptBackupV2(
        { settings: collectPortableBackupSettings() },
        backupPassword,
        { appVersion: "0.1.0", domains: ["settings"] },
      );
      downloadBackup(envelope);
      setBackupPassword("");
      setBackupOpen(false);
      show(translate(locale, "more.backupExported"));
    } catch (error) {
      recordDiagnostic("warn", "backup.export", error);
      show(translate(locale, "more.backupExportFailed"));
    }
  };

  const importBackup = async () => {
    if (!backupFile) {
      show(translate(locale, "more.chooseBackupFile"));
      return;
    }
    if (backupPassword.length < 8) {
      show(translate(locale, "more.backupPasswordRequired"));
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
      restorePortableBackupSettings(settings);
      setBackupPassword("");
      setBackupFile(undefined);
      setBackupOpen(false);
      show(translate(locale, "more.backupRestored"));
    } catch {
      try {
        const legacy = await importLegacyGysbk(await backupFile.text());
        localStorage.setItem("gys-legacy-import-v1", JSON.stringify(legacy));
        show(translate(locale, "more.legacyImported"));
      } catch {
        show(translate(locale, "more.invalidBackup"));
      }
    }
  };

  const saveReminder = async () => {
    if (!reminderTime) {
      localStorage.removeItem("gys-reminder-time-v1");
      setReminderOpen(false);
      show(translate(locale, "more.reminderDisabled"));
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
        ? translate(locale, "more.reminderSaved", { time: reminderTime })
        : translate(locale, "more.reminderNotificationPrompt"),
    );
  };

  const disableReminder = () => {
    setReminderTime("");
    localStorage.removeItem("gys-reminder-time-v1");
    setReminderOpen(false);
    show(translate(locale, "more.reminderDisabled"));
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
      show(translate(locale, "more.packCheckUnavailable"));
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
            ? translate(locale, "more.packUpdated", {
                count: localUpdateCount(diff),
              })
            : translate(locale, "more.packMetadataUpdated")
          : translate(locale, "more.packVerified"),
      );
    } catch (error) {
      recordDiagnostic("warn", "assets.pack", error);
      show(translate(locale, "more.packUpdateFailed"));
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
      show(translate(locale, "more.assetInstalled"));
    } catch (error) {
      recordDiagnostic("warn", "assets.distributed.install", error);
      setDistributedError(
        error instanceof Error
          ? error.message
          : translate(locale, "more.assetInstallFailed"),
      );
    } finally {
      setDistributedBusyCode(undefined);
      setDistributedProgress(undefined);
    }
  };

  const removeDistributedAsset = async (code: string) => {
    if (
      distributedBusyCode ||
      !window.confirm(translate(locale, "more.confirmRemoveAsset"))
    )
      return;
    try {
      const manager = getDistributedAssetManager();
      await manager.remove(code);
      setDistributedAssets(await manager.loadStatuses());
      show(translate(locale, "more.assetRemoved"));
    } catch (error) {
      recordDiagnostic("warn", "assets.distributed.remove", error);
      setDistributedError(
        error instanceof Error
          ? error.message
          : translate(locale, "more.assetRemoveFailed"),
      );
    }
  };

  const openNativeEgysLoginFlow = async () => {
    setAuthBusy(true);
    try {
      await openNativeEgysLogin();
      show(translate(locale, "more.nativeLoginOpened"));
    } catch (error) {
      recordDiagnostic("error", "egys.native-login.open", error);
      show(translate(locale, "more.nativeLoginFailed"));
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
                  ? (accountProfile.displayName ??
                    translate(locale, "more.accountMember"))
                  : translate(locale, "more.accountEgys")}
              </h2>
            </div>
            {accountProfile || nativeShell ? (
              <span
                className={`pack-badge${accountProfile ? " is-verified" : ""}`}
              >
                {accountProfile
                  ? translate(locale, "more.connected")
                  : egysUnavailable
                    ? translate(locale, "more.assetUnavailable")
                    : translate(locale, "more.guest")}
              </span>
            ) : null}
          </div>

          {accountLoading || authBusy ? (
            <div className="account-loading-box" role="status">
              <p>{translate(locale, "more.checkingAccount")}</p>
            </div>
          ) : accountProfile ? (
            <div className="egys-member-badge">
              <div className="member-badge-header">
                <span className="member-church-title">Gereja Yesus Sejati</span>
                <span className="member-status-pill">
                  {accountProfile.isMember === true
                    ? translate(locale, "more.memberOfficial")
                    : translate(locale, "more.memberRegistered")}
                </span>
              </div>
              <div className="member-badge-body">
                <div className="member-info-row">
                  <span className="info-label">
                    {translate(locale, "more.fullName")}
                  </span>
                  <strong className="info-value member-name">
                    {accountProfile.displayName}
                  </strong>
                </div>
                <div className="member-info-grid">
                  <div>
                    <span className="info-label">
                      {translate(locale, "more.branch")}
                    </span>
                    <strong className="info-value">
                      {accountProfile.branchName ??
                        accountProfile.branchCode ??
                        translate(locale, "more.center")}
                    </strong>
                  </div>
                  {accountProfile.membershipNo && (
                    <div>
                      <span className="info-label">
                        {translate(locale, "more.memberNumber")}
                      </span>
                      <strong className="info-value">
                        {accountProfile.membershipNo}
                      </strong>
                    </div>
                  )}
                </div>
                {accountProfile.memberStatus && (
                  <div className="member-info-row">
                    <span className="info-label">
                      {translate(locale, "more.membershipStatus")}
                    </span>
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
                    {translate(locale, "more.lastLogin")}{" "}
                    {new Date(egysSession.lastSeenAt).toLocaleString(locale)} ·
                    {translate(locale, "more.detectedSince")}{" "}
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
                      show(translate(locale, "more.sessionSignedOut"));
                    });
                  }}
                >
                  {translate(locale, "more.signOut")}
                </button>
              </div>
            </div>
          ) : (
            <div className="egys-login-box">
              <p className="egys-login-desc">
                {nativeShell
                  ? translate(locale, "more.officialLoginDescription")
                  : translate(locale, "more.googleLoginDescription")}
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
                      <span>{translate(locale, "more.openOfficialLogin")}</span>
                    </button>
                    <small className="account-sync-note">
                      {translate(locale, "more.nativeLoginMethods")}
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
                    <span>{translate(locale, "more.openOfficialLogin")}</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </article>

        <article className="more-card more-card-wide appearance-card">
          <div className="more-card-heading">
            <div>
              <h2>{translate(locale, "more.appearance")}</h2>
            </div>
          </div>

          <div className="appearance-section">
            <label className="section-subtitle">
              {translate(locale, "more.screenTheme")}
            </label>
            <div
              className="theme-pill-grid"
              role="radiogroup"
              aria-label={translate(locale, "more.chooseTheme")}
            >
              {[
                {
                  key: "light",
                  icon: "sun" as const,
                  label: translate(locale, "more.themeLight"),
                },
                {
                  key: "dark",
                  icon: "moon" as const,
                  label: translate(locale, "more.themeDark"),
                },
                {
                  key: "amoled",
                  icon: "amoled" as const,
                  label: translate(locale, "more.themeAmoled"),
                },
                {
                  key: "sepia",
                  icon: "sepia" as const,
                  label: translate(locale, "more.themeSepia"),
                },
                {
                  key: "system",
                  icon: "system" as const,
                  label: translate(locale, "more.themeAutomatic"),
                },
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
            <label className="section-subtitle">
              {translate(locale, "more.accent")}
            </label>
            <div
              className="accent-palette-grid"
              role="radiogroup"
              aria-label={translate(locale, "more.chooseAccent")}
            >
              {ACCENT_PRESETS.map((preset) => {
                const active = accentColor === preset.color;
                const presetName = translate(
                  locale,
                  `more.accent.${preset.id}`,
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`accent-palette-item${active ? " is-active" : ""}`}
                    onClick={() => setAccentColor(preset.color)}
                    aria-label={translate(locale, "more.accentLabel", {
                      name: presetName,
                    })}
                    title={presetName}
                  >
                    <span
                      className="accent-swatch-circle"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="accent-swatch-name">{presetName}</span>
                  </button>
                );
              })}
              <label
                className={`accent-palette-item is-custom${!ACCENT_PRESETS.some((p) => p.color === accentColor) ? " is-active" : ""}`}
                title={translate(locale, "more.customAccent")}
              >
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="sr-only"
                  aria-label={translate(locale, "more.customAccent")}
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
                <span className="accent-swatch-name">
                  {translate(locale, "more.custom")}
                </span>
              </label>
            </div>
          </div>

          <div className="appearance-section">
            <label className="section-subtitle">
              {translate(locale, "more.appLanguage")}
            </label>
            <div className="lang-pill-grid">
              <Select
                value={locale}
                onChange={(val) => {
                  const next = val as Locale;
                  setLocale(next);
                }}
                label={translate(locale, "more.chooseLanguage")}
                options={[
                  { value: "id", label: "🇮🇩 Bahasa Indonesia (Utama)" },
                  { value: "en", label: "🇬🇧 English" },
                  { value: "zh", label: "🇨🇳 简体中文" },
                ]}
              />
            </div>
          </div>
        </article>

        <div className="more-resource-group" data-testid="more-resource-group">
          <article className="more-card more-card-wide">
            <div className="more-card-heading">
              <div>
                <h2>{translate(locale, "more.localPack")}</h2>
              </div>
              <span className="pack-badge">
                {translate(locale, "more.ready")}
              </span>
            </div>
            <p>{translate(locale, "more.localPackDescription")}</p>
            <div className="pack-stats">
              <span>
                <strong>{manifest?.bible ?? "TB"}</strong>
                <small>{translate(locale, "more.translations")}</small>
              </span>
              <span>
                <strong>{manifest?.hymns ?? "—"}</strong>
                <small>{translate(locale, "more.songs")}</small>
              </span>
              <span>
                <strong>
                  {manifest
                    ? formatBytes(
                        manifest.items.reduce(
                          (sum, item) => sum + item.bytes,
                          0,
                        ),
                      )
                    : "—"}
                </strong>
                <small>{translate(locale, "more.corePack")}</small>
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
                  ? translate(locale, "more.saving", { percent: packProgress })
                  : assetCheck.status === "update"
                    ? localUpdateCount(assetCheck.diff) > 0
                      ? translate(locale, "more.downloadUpdates", {
                          count: localUpdateCount(assetCheck.diff),
                        })
                      : translate(locale, "more.updateMetadata")
                    : translate(locale, "more.verifySave")}
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
                  ? translate(locale, "more.checking")
                  : translate(locale, "more.checkVersion")}
              </button>
              <small>
                Manifest v{manifest?.version ?? 1} ·{" "}
                {manifest
                  ? new Date(manifest.generatedAt).toLocaleDateString(locale)
                  : translate(locale, "more.loading")}
                {assetCheck.status === "update" &&
                  ` · ${translate(locale, "more.updatesAvailable", {
                    count: localUpdateCount(assetCheck.diff),
                  })}`}
                {assetCheck.status === "current" &&
                  ` · ${translate(locale, "more.latest")}`}
                {assetCheck.status === "error" &&
                  ` · ${translate(locale, "more.notChecked")}`}
              </small>
            </div>
          </article>

          <DistributedAssetPanel
            locale={locale}
            assets={distributedAssets}
            loading={distributedAssetsLoading}
            downloadAvailable={distributedDownloadsConfigured()}
            {...(distributedBusyCode ? { busyCode: distributedBusyCode } : {})}
            {...(distributedProgress ? { progress: distributedProgress } : {})}
            {...(distributedError ? { error: distributedError } : {})}
            onInstall={(code) => void installDistributedAsset(code)}
            onRemove={(code) => void removeDistributedAsset(code)}
          />
        </div>

        <div
          className="more-secondary-group"
          data-testid="more-secondary-group"
        >
          <div className="more-secondary-grid">
            <button
              className="more-card more-action"
              type="button"
              onClick={() => setBackupOpen((open) => !open)}
            >
              <span className="more-icon">↥</span>
              <strong>{translate(locale, "more.backupImport")}</strong>
              <small>{translate(locale, "more.backupImportDesc")}</small>
            </button>

            <button
              className="more-card more-action"
              type="button"
              onClick={() => setReminderOpen((open) => !open)}
            >
              <span className="more-icon">◷</span>
              <strong>{translate(locale, "more.reminder")}</strong>
              <small>{translate(locale, "more.reminderDesc")}</small>
            </button>

            <button
              className="more-card more-action"
              type="button"
              onClick={() => setPlaylistOpen((open) => !open)}
            >
              <span className="more-icon">♫</span>
              <strong>{translate(locale, "more.midiQueue")}</strong>
              <small>
                {playlist.items.length
                  ? translate(locale, "more.queueStatus", {
                      count: playlist.items.length,
                      mode: playlist.autoNext
                        ? translate(locale, "more.queueAutomatic")
                        : translate(locale, "more.queueManual"),
                    })
                  : translate(locale, "more.prepareQueue")}
              </small>
            </button>

            <details
              className="more-card more-card-wide device-data-tools"
              data-testid="device-data-tools"
            >
              <summary className="device-data-summary">
                <span>
                  <strong>{translate(locale, "more.deviceData")}</strong>
                  <small>{translate(locale, "more.deviceDataDesc")}</small>
                </span>
                <span className="device-data-chevron" aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className="device-data-body">
                <div>
                  <strong>{translate(locale, "more.resetDevice")}</strong>
                  <small>{translate(locale, "more.resetDeviceDesc")}</small>
                </div>
                <button
                  className="quiet-button danger-button"
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      translate(locale, "more.confirmDeleteData"),
                    );
                    if (!confirmed) return;
                    void clearAppData()
                      .then(() => show(translate(locale, "more.dataReset")))
                      .catch(() =>
                        show(translate(locale, "more.resetIncomplete")),
                      );
                  }}
                >
                  {translate(locale, "more.resetDevice")}
                </button>
              </div>
            </details>

            <form className="more-card report-card" onSubmit={submitReport}>
              <div className="more-card-heading">
                <div>
                  <h2>{translate(locale, "more.reportProblem")}</h2>
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
                placeholder={translate(locale, "more.reportPlaceholder")}
              />
              <button
                className="primary-button"
                type="submit"
                disabled={!report.trim() || reportStatus === "sending"}
              >
                {reportStatus === "sending"
                  ? translate(locale, "more.sending")
                  : translate(locale, "more.sendReport")}
              </button>
              <small className="form-status" aria-live="polite">
                {reportStatus === "error"
                  ? translate(locale, "more.draftSaved")
                  : translate(locale, "more.characterCount", {
                      count: report.length,
                    })}
              </small>
            </form>
          </div>
        </div>
      </section>
      {backupOpen && (
        <section
          className="utility-panel"
          aria-label={translate(locale, "more.backupPanel")}
        >
          <div className="more-card-heading">
            <div>
              <p className="date-line">{translate(locale, "more.localData")}</p>
              <h2>{translate(locale, "more.encryptedBackup")}</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setBackupOpen(false)}
            >
              {translate(locale, "more.close")}
            </button>
          </div>
          <p>{translate(locale, "more.backupDescription")}</p>
          <label className="search-field">
            <span>{translate(locale, "more.backupPassword")}</span>
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
              {translate(locale, "more.exportBackup")}
            </button>
            <label className="quiet-button file-button">
              {translate(locale, "more.chooseFile")}
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
              {translate(locale, "more.import")}
            </button>
          </div>
        </section>
      )}
      {reminderOpen && (
        <section
          className="utility-panel"
          aria-label={translate(locale, "more.reminderPanel")}
        >
          <div className="more-card-heading">
            <div>
              <p className="date-line">
                {translate(locale, "more.deviceNotifications")}
              </p>
              <h2>{translate(locale, "more.reminderPanel")}</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setReminderOpen(false)}
            >
              {translate(locale, "more.close")}
            </button>
          </div>
          <p>{translate(locale, "more.reminderDescription")}</p>
          <label className="search-field">
            <span>{translate(locale, "more.time")}</span>
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
              {translate(locale, "more.saveReminder")}
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={disableReminder}
            >
              {translate(locale, "more.disable")}
            </button>
          </div>
        </section>
      )}
      {playlistOpen && (
        <section
          className="utility-panel"
          aria-label={translate(locale, "more.playlist")}
        >
          <div className="more-card-heading">
            <div>
              <p className="date-line">{translate(locale, "more.hymnLabel")}</p>
              <h2>{translate(locale, "more.playlist")}</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setPlaylistOpen(false)}
            >
              {translate(locale, "more.close")}
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
              <span>{translate(locale, "more.autoNext")}</span>
            </label>
            <label className="control-check">
              <input
                type="checkbox"
                checked={playlist.shuffle}
                onChange={(event) =>
                  updateMidiPlaylistOptions({ shuffle: event.target.checked })
                }
              />
              <span>{translate(locale, "more.shuffle")}</span>
            </label>
            <Select
              value={playlist.loop}
              onChange={(value) => updateMidiPlaylistOptions({ loop: value })}
              label={translate(locale, "more.repeat")}
              options={[
                {
                  value: "off" as const,
                  label: translate(locale, "more.noRepeat"),
                },
                {
                  value: "one" as const,
                  label: translate(locale, "more.currentSong"),
                },
                {
                  value: "all" as const,
                  label: translate(locale, "more.allQueue"),
                },
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
                      aria-label={translate(locale, "more.raise", {
                        title: item.title,
                      })}
                    >
                      ↑
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={index === playlist.items.length - 1}
                      onClick={() => moveMidiPlaylistItem(index, index + 1)}
                      aria-label={translate(locale, "more.lower", {
                        title: item.title,
                      })}
                    >
                      ↓
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => removeMidiPlaylistItem(item.songId)}
                      aria-label={`${translate(locale, "more.delete")} ${item.title}`}
                    >
                      {translate(locale, "more.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-inline">
              <p>{translate(locale, "more.emptyPlaylist")}</p>
            </div>
          )}
          <div className="utility-actions">
            <button
              className="quiet-button"
              type="button"
              onClick={downloadMidiPlaylist}
              disabled={!playlist.items.length}
            >
              {translate(locale, "more.exportQueue")}
            </button>
            <label className="quiet-button file-button">
              {translate(locale, "more.importQueue")}
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
                    show(translate(locale, "more.playlistImported"));
                  })
                  .catch(() => show(translate(locale, "more.invalidPlaylist")));
              }}
            >
              {translate(locale, "more.apply")}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={!playlist.items.length}
              onClick={() => {
                clearMidiPlaylist();
                show(translate(locale, "more.playlistCleared"));
              }}
            >
              {translate(locale, "more.clear")}
            </button>
          </div>
          <small>{translate(locale, "more.playlistNote")}</small>
        </section>
      )}
      {egysLoginOpen &&
        createPortal(
          <div
            className={`egys-login-backdrop${isEgysLoginClosing ? " is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={translate(locale, "more.loginDialog")}
            onClick={closeEgysLogin}
          >
            <div
              className="egys-login-overlay"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="egys-login-head">
                <div className="egys-login-title">
                  <Icon name="person" size={18} />
                  <strong>{translate(locale, "more.loginTitle")}</strong>
                  <small>Gereja Yesus Sejati</small>
                </div>
                <button
                  className="egys-login-close"
                  type="button"
                  aria-label={translate(locale, "more.close")}
                  onClick={closeEgysLogin}
                >
                  ×
                </button>
              </div>
              <div className="egys-login-frame-container egys-login-google-container">
                <p>{translate(locale, "more.googleModalDescription")}</p>
                <div
                  ref={googleButtonRef}
                  className="egys-google-button"
                  aria-label={translate(locale, "more.googleLogin")}
                />
                {authBusy && (
                  <p className="egys-google-status" role="status">
                    {translate(locale, "more.checkingLogin")}
                  </p>
                )}
                {egysGoogleError && (
                  <p className="egys-google-error" role="alert">
                    {egysGoogleError}
                  </p>
                )}
                <p className="egys-google-fallback">
                  {translate(locale, "more.googleFallback")}
                </p>
              </div>
              <div className="egys-login-footer">
                <span>
                  <Icon name="checkCircle" size={14} />
                  {translate(locale, "more.secureCredentials")}
                </span>
                <div className="egys-login-footer-actions">
                  <a
                    className="text-button"
                    href={`https://e.gys.or.id/login?theme=${theme}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ textDecoration: "none" }}
                  >
                    {translate(locale, "more.officialPortal")}
                  </a>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={closeEgysLogin}
                  >
                    {translate(locale, "more.close")}
                  </button>
                </div>
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
