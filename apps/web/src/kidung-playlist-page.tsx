import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import {
  addMidiPlaylistItem,
  applyAutoNextMode,
  clearMidiPlaylist,
  downloadMidiPlaylist,
  getAutoNextMode,
  getMidiPlaylist,
  importMidiPlaylist,
  moveMidiPlaylistItem,
  removeMidiPlaylistItem,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import {
  playMidiPlaylistItem,
  playNextMidiPlaylistItem,
  playPreviousMidiPlaylistItem,
} from "./midi-queue.js";
import { midiPlayer } from "./midi-player.js";
import {
  addSongToActivePlaylist,
  createSavedPlaylist,
  deleteSavedPlaylist,
  exportUpstreamPlaylist,
  getActivePlaylistId,
  getSavedPlaylists,
  importUpstreamPlaylist,
  moveSavedPlaylistSong,
  removeSongFromPlaylist,
  renameSavedPlaylist,
  setActivePlaylist,
  subscribeSavedPlaylists,
  type SavedPlaylist,
} from "./kidung-playlists.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import type { HymnMetadata } from "@gys/contracts";
import {
  type CatalogState,
  parseCatalog,
  numberLabel,
} from "./kidung-shared.js";
import { KidungLocalNav } from "./kidung-local-nav.js";
import { navigateSmooth } from "./route-transitions.js";

export function HymnPlaylistPage({
  locale,
  catalog,
}: {
  locale: Locale;
  catalog: CatalogState<HymnMetadata>;
}) {
  const navigate = useNavigate();
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const savedPlaylists = useSyncExternalStore(
    subscribeSavedPlaylists,
    getSavedPlaylists,
    getSavedPlaylists,
  );
  const player = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string>();
  const [quickQuery, setQuickQuery] = useState("");
  const [noticeLocal, setNoticeLocal] = useState("");
  const [pendingPlaylistDelete, setPendingPlaylistDelete] = useState<
    string | null
  >(null);

  const catalogById = useMemo(() => {
    if (catalog.status !== "ready") return new Map<string, HymnMetadata>();
    return new Map(catalog.items.map((item) => [item.id, item]));
  }, [catalog]);

  const queueIds = useMemo(
    () => new Set(playlist.items.map((entry) => entry.songId)),
    [playlist.items],
  );

  const quickMatches = useMemo(() => {
    const trimmed = quickQuery.trim().toLowerCase();
    if (!trimmed || catalog.status !== "ready") return [];
    const results: HymnMetadata[] = [];
    for (const item of catalog.items) {
      if (item.assetCode) continue;
      const num = numberLabel(item.number, item.id).toLowerCase();
      if (
        num.includes(trimmed) ||
        String(item.number).includes(trimmed) ||
        item.title.toLowerCase().includes(trimmed)
      ) {
        results.push(item);
        if (results.length >= 6) break;
      }
    }
    return results;
  }, [catalog, quickQuery]);

  const currentItem =
    playlist.items[playlist.currentIndex] ?? playlist.items[0];
  const isQueueSongActive = Boolean(
    player.songId && queueIds.has(player.songId),
  );
  const isPlayingQueue = isQueueSongActive && player.status === "playing";
  const autoNextMode = getAutoNextMode();
  const isShuffleActive =
    autoNextMode === "shuffle-playlist" || autoNextMode === "shuffle-all";
  const isRepeatActive =
    autoNextMode === "playlist" ||
    autoNextMode === "one" ||
    autoNextMode === "all";

  const handleTogglePlayQueue = () => {
    if (playlist.items.length === 0) return;
    if (isPlayingQueue) {
      void midiPlayer.pause();
      return;
    }
    if (isQueueSongActive && player.status === "paused") {
      void midiPlayer.play().catch(() => undefined);
      return;
    }
    const targetIndex =
      playlist.currentIndex >= 0 && playlist.currentIndex < playlist.items.length
        ? playlist.currentIndex
        : 0;
    const target = playlist.items[targetIndex];
    if (!target) return;
    selectMidiPlaylistItem(targetIndex);
    void playMidiPlaylistItem(target.songId).catch(() => undefined);
  };

  const handleToggleShuffle = () => {
    applyAutoNextMode(isShuffleActive ? "playlist" : "shuffle-playlist");
  };

  const handleToggleRepeat = () => {
    applyAutoNextMode(isRepeatActive ? "off" : "playlist");
  };

  const importPlaylist = async (file: File | undefined) => {
    if (!file) return;
    try {
      const serialized = await file.text();
      const value: unknown = JSON.parse(serialized);
      if (
        value &&
        typeof value === "object" &&
        (value as { version?: unknown }).version === 1 &&
        Array.isArray((value as { items?: unknown }).items)
      ) {
        importMidiPlaylist(serialized);
      } else {
        const entries =
          catalog.status === "ready"
            ? catalog.items
            : await fetch(
                `${import.meta.env.BASE_URL}offline/hymn-catalog.json`,
                {
                  cache: "force-cache",
                },
              ).then(async (response) => {
                if (!response.ok) throw new Error("Hymn catalog unavailable");
                return parseCatalog(await response.json());
              });
        const imported = importUpstreamPlaylist(value, entries);
        createSavedPlaylist(`${imported.name} (Imported)`, imported.songIds);
      }
      setImportError(undefined);
    } catch {
      setImportError(translate(locale, "kidung.playlistImportError"));
    }
  };

  const downloadSavedPlaylist = (saved: SavedPlaylist) => {
    if (catalog.status !== "ready") return;
    try {
      const data = exportUpstreamPlaylist(saved, catalog.items);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${data.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setImportError(translate(locale, "kidung.playlistImportError"));
    }
  };

  const showToastLike = (name: string) => {
    window.setTimeout(
      () => setNoticeLocal(translate(locale, "kidung.playlistSaved", { name })),
      0,
    );
  };

  const saveQueueAsPlaylist = () => {
    const name = window.prompt(
      translate(locale, "kidung.playlistNamePrompt"),
      translate(locale, "kidung.playlistNameDefault", {
        count: savedPlaylists.length + 1,
      }),
    );
    if (!name?.trim()) return;
    const saved = createSavedPlaylist(name);
    setActivePlaylist(saved.id);
    for (const item of playlist.items) addSongToActivePlaylist(item.songId);
    showToastLike(name);
    window.dispatchEvent(new CustomEvent("gys-kidung-playlists-change"));
  };

  const loadSavedPlaylist = (saved: SavedPlaylist) => {
    if (catalog.status !== "ready") return;
    clearMidiPlaylist();
    let added = 0;
    for (const songId of saved.songIds) {
      const entry = catalog.items.find((candidate) => candidate.id === songId);
      if (!entry) continue;
      if (addMidiPlaylistItem({ songId, title: entry.title })) added += 1;
    }
    setNoticeLocal(
      translate(locale, "kidung.playlistLoaded", {
        name: saved.name,
        count: added,
      }),
    );
  };

  return (
    <div className="page hymn-page kidung-tool-page">
      <h1 className="sr-only">{translate(locale, "kidung.playlist")}</h1>
      <div className="kidung-index-toolbar">
        <div className="kidung-controls-field">
          <KidungLocalNav active="playlist" locale={locale} />
          <div className="kidung-tool-heading-actions">
            <details className="kidung-row-menu">
              <summary aria-label={translate(locale, "kidung.playlistTools")}>
                <Icon name="more" size={18} />
              </summary>
              <div className="kidung-row-menu-panel">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {translate(locale, "kidung.import")}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => downloadMidiPlaylist()}
                  disabled={playlist.items.length === 0}
                >
                  {translate(locale, "kidung.exportQueue")}
                </button>
              </div>
            </details>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label={translate(locale, "kidung.import")}
              onChange={(event) => {
                void importPlaylist(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <section
        className="kidung-queue-surface"
        aria-label={translate(locale, "kidung.midiPlaylist")}
      >
        <div className="kidung-queue-hero">
          <div className="kidung-queue-hero-top">
            <div className="kidung-queue-hero-meta">
              <span className="kidung-queue-badge">
                <Icon name="queueMusic" size={15} />
                <span>{translate(locale, "kidung.midiPlaylist")}</span>
                <strong>{playlist.items.length}</strong>
              </span>
              <h2 className="kidung-queue-hero-title">
                {currentItem
                  ? currentItem.title
                  : translate(locale, "kidung.emptyPlaylistTitle")}
              </h2>
              <p className="kidung-queue-hero-subtitle">
                {playlist.items.length > 0
                  ? `${translate(locale, "kidung.settingsSongCount", { count: playlist.items.length })} · ${
                      isPlayingQueue
                        ? translate(locale, "kidung.selected")
                        : translate(locale, "kidung.readyToPlay")
                    }`
                  : translate(locale, "kidung.emptyPlaylistBody")}
              </p>
            </div>
            <div className="kidung-queue-transport">
              <button
                type="button"
                className="icon-button kidung-queue-transport-btn"
                aria-label={translate(locale, "media.previousSong")}
                title={translate(locale, "media.previousSong")}
                disabled={playlist.items.length < 2}
                onClick={() =>
                  void playPreviousMidiPlaylistItem().catch(() => undefined)
                }
              >
                <Icon name="skipPrevious" size={18} />
              </button>
              <button
                type="button"
                className="primary-button kidung-queue-play-btn"
                disabled={playlist.items.length === 0}
                onClick={handleTogglePlayQueue}
              >
                <Icon name={isPlayingQueue ? "pause" : "play"} size={18} />
                <span>
                  {isPlayingQueue
                    ? translate(locale, "shell.pause")
                    : translate(locale, "shell.play")}
                </span>
              </button>
              <button
                type="button"
                className="icon-button kidung-queue-transport-btn"
                aria-label={translate(locale, "media.nextSong")}
                title={translate(locale, "media.nextSong")}
                disabled={playlist.items.length < 2}
                onClick={() =>
                  void playNextMidiPlaylistItem().catch(() => undefined)
                }
              >
                <Icon name="skipNext" size={18} />
              </button>
              {isQueueSongActive && (
                <button
                  type="button"
                  className="icon-button kidung-queue-transport-btn"
                  aria-label={translate(locale, "media.stopMidi")}
                  title={translate(locale, "media.stopMidi")}
                  onClick={() => void midiPlayer.stop()}
                >
                  <Icon name="stop" size={17} />
                </button>
              )}
            </div>
          </div>

          <div className="kidung-queue-options">
            <Select
              value={autoNextMode}
              onChange={(mode) => applyAutoNextMode(mode)}
              label={translate(locale, "kidung.playNext")}
              options={[
                {
                  value: "off",
                  label: translate(locale, "kidung.playNext.off"),
                },
                {
                  value: "number",
                  label: translate(locale, "kidung.playNext.number"),
                },
                {
                  value: "playlist",
                  label: translate(locale, "kidung.playNext.playlist"),
                },
                {
                  value: "one",
                  label: translate(locale, "kidung.playNext.one"),
                },
                {
                  value: "all",
                  label: translate(locale, "kidung.playNext.all"),
                },
                {
                  value: "shuffle-all",
                  label: translate(locale, "kidung.playNext.shuffleAll"),
                },
                {
                  value: "shuffle-playlist",
                  label: translate(locale, "kidung.playNext.shufflePlaylist"),
                },
              ]}
            />
            <button
              type="button"
              className={`kidung-queue-chip${isRepeatActive ? " is-active" : ""}`}
              aria-pressed={isRepeatActive}
              onClick={handleToggleRepeat}
            >
              <Icon name="repeat" size={15} />
              <span>{translate(locale, "kidung.playNext.playlist")}</span>
            </button>
            <button
              type="button"
              className={`kidung-queue-chip${isShuffleActive ? " is-active" : ""}`}
              aria-pressed={isShuffleActive}
              onClick={handleToggleShuffle}
            >
              <Icon name="swapVert" size={15} />
              <span>
                {translate(locale, "kidung.playNext.shufflePlaylist")}
              </span>
            </button>
            <div className="kidung-queue-hero-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={saveQueueAsPlaylist}
                disabled={playlist.items.length === 0}
              >
                <Icon name="bookmark" size={15} />
                <span>{translate(locale, "kidung.saveAsPlaylist")}</span>
              </button>
              <button
                className="text-button kidung-clear-playlist"
                type="button"
                onClick={() => clearMidiPlaylist()}
                disabled={playlist.items.length === 0}
              >
                {translate(locale, "kidung.clearPlaylist")}
              </button>
            </div>
          </div>

          {catalog.status === "ready" && (
            <div className="kidung-queue-quickadd">
              <label className="search-field kidung-queue-quickadd-field">
                <Icon name="search" size={17} />
                <input
                  type="search"
                  value={quickQuery}
                  onChange={(event) => setQuickQuery(event.target.value)}
                  placeholder={translate(locale, "kidung.searchPlaceholder")}
                />
              </label>
              {quickMatches.length > 0 && (
                <ul className="kidung-queue-quickadd-results">
                  {quickMatches.map((entry) => {
                    const alreadyInQueue = queueIds.has(entry.id);
                    return (
                      <li key={entry.id}>
                        <span className="kidung-queue-quickadd-num">
                          {numberLabel(entry.number, entry.id)}
                        </span>
                        <span className="kidung-queue-quickadd-title">
                          {entry.title}
                        </span>
                        <button
                          type="button"
                          className={`kidung-queue-quickadd-btn${alreadyInQueue ? " is-added" : ""}`}
                          onClick={() => {
                            if (alreadyInQueue) {
                              removeMidiPlaylistItem(entry.id);
                            } else {
                              addMidiPlaylistItem({
                                songId: entry.id,
                                title: entry.title,
                              });
                            }
                          }}
                        >
                          <Icon
                            name={
                              alreadyInQueue
                                ? "playlistAddCheck"
                                : "playlistAdd"
                            }
                            size={16}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {noticeLocal && (
          <p className="kidung-queue-notice" role="status">
            {noticeLocal}
          </p>
        )}
        {importError && (
          <p className="kidung-inline-error" role="alert">
            {importError}
          </p>
        )}

        {playlist.items.length === 0 ? (
          <div className="kidung-empty-state">
            <span className="kidung-empty-icon" aria-hidden="true">
              <Icon name="queueMusic" size={28} />
            </span>
            <strong>{translate(locale, "kidung.emptyPlaylistTitle")}</strong>
            <p>{translate(locale, "kidung.emptyPlaylistBody")}</p>
            <Link
              className="primary-button"
              to="/kidung"
              onClick={(event) => {
                event.preventDefault();
                void navigateSmooth(navigate, "/kidung");
              }}
            >
              <Icon name="musicNote" size={16} />
              <span>{translate(locale, "kidung.backToCatalog")}</span>
            </Link>
          </div>
        ) : (
          <ol className="kidung-playlist-list">
            {playlist.items.map((item, index) => {
              const isCurrent = index === playlist.currentIndex;
              const isPlayingItem =
                player.songId === item.songId && player.status === "playing";
              const meta = catalogById.get(item.songId);
              return (
                <li
                  className={`${isCurrent ? "is-current" : ""}${isPlayingItem ? " is-playing" : ""}`.trim() || undefined}
                  key={item.songId}
                >
                  <button
                    className="kidung-playlist-song"
                    type="button"
                    onClick={() => {
                      if (isPlayingItem) {
                        void midiPlayer.pause();
                        return;
                      }
                      selectMidiPlaylistItem(index);
                      void playMidiPlaylistItem(item.songId).catch(
                        () => undefined,
                      );
                    }}
                  >
                    <span className="kidung-playlist-index">
                      {isPlayingItem ? (
                        <span className="kidung-eq-bars" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="kidung-playlist-song-copy">
                      <strong>
                        {meta && (
                          <span className="kidung-playlist-num-tag">
                            {numberLabel(meta.number, meta.id)}
                          </span>
                        )}
                        {item.title}
                      </strong>
                      <small>
                        {isPlayingItem
                          ? translate(locale, "kidung.selected")
                          : isCurrent
                            ? translate(locale, "kidung.selected")
                            : translate(locale, "kidung.readyToPlay")}
                      </small>
                    </span>
                  </button>
                  <div
                    className="kidung-playlist-actions"
                    role="group"
                    aria-label={translate(locale, "kidung.songOptions", {
                      title: item.title,
                    })}
                  >
                    <button
                      className="icon-button kidung-queue-row-btn"
                      type="button"
                      aria-label={translate(locale, "kidung.moveUp", {
                        title: item.title,
                      })}
                      title={translate(locale, "kidung.moveUp", {
                        title: item.title,
                      })}
                      onClick={() => moveMidiPlaylistItem(index, index - 1)}
                      disabled={index === 0}
                    >
                      <Icon name="chevronUp" size={16} />
                    </button>
                    <button
                      className="icon-button kidung-queue-row-btn"
                      type="button"
                      aria-label={translate(locale, "kidung.moveDown", {
                        title: item.title,
                      })}
                      title={translate(locale, "kidung.moveDown", {
                        title: item.title,
                      })}
                      onClick={() => moveMidiPlaylistItem(index, index + 1)}
                      disabled={index === playlist.items.length - 1}
                    >
                      <Icon name="chevronDown" size={16} />
                    </button>
                    <button
                      className="icon-button kidung-queue-row-btn"
                      type="button"
                      aria-label={translate(locale, "kidung.openSong")}
                      title={translate(locale, "kidung.openSong")}
                      onClick={() =>
                        void navigateSmooth(navigate, `/kidung/${item.songId}`)
                      }
                    >
                      <Icon name="externalLink" size={15} />
                    </button>
                    <button
                      className="icon-button kidung-queue-row-btn kidung-danger-action"
                      type="button"
                      aria-label={translate(
                        locale,
                        "kidung.removeSongFromPlaylist",
                        { title: item.title },
                      )}
                      title={translate(locale, "kidung.removeFromPlaylist")}
                      onClick={() => removeMidiPlaylistItem(item.songId)}
                    >
                      <Icon name="cross" size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {savedPlaylists.length > 0 && (
          <section
            className="kidung-saved-playlists"
            aria-label={translate(locale, "kidung.savedPlaylists")}
          >
            <h2>{translate(locale, "kidung.savedPlaylists")}</h2>
            {savedPlaylists.map((saved) => {
              return (
                <div className="kidung-saved-playlist-row" key={saved.id}>
                  <button
                    type="button"
                    className="kidung-playlist-song"
                    onClick={() => {
                      setActivePlaylist(saved.id);
                      loadSavedPlaylist(saved);
                    }}
                  >
                    <span className="kidung-saved-playlist-icon">
                      <Icon name="playlist" size={18} />
                    </span>
                    <span className="kidung-playlist-song-copy">
                      <strong>{saved.name}</strong>
                      <small>
                        {translate(locale, "kidung.settingsSongCount", {
                          count: saved.songIds.length,
                        })}
                        {getActivePlaylistId() === saved.id
                          ? ` · ${translate(locale, "kidung.active")}`
                          : ""}
                      </small>
                    </span>
                  </button>
                  <div className="kidung-playlist-actions">
                    <details className="kidung-row-menu">
                      <summary
                        aria-label={translate(
                          locale,
                          "kidung.playlistOptions",
                          {
                            name: saved.name,
                          },
                        )}
                        title={translate(locale, "kidung.playlistOptions", {
                          name: saved.name,
                        })}
                      >
                        <Icon name="more" size={18} />
                      </summary>
                      <div className="kidung-row-menu-panel">
                        <button
                          type="button"
                          className="text-button"
                          onClick={(event) => {
                            const name = window.prompt(
                              translate(locale, "kidung.renamePlaylistPrompt"),
                              saved.name,
                            );
                            if (name?.trim())
                              renameSavedPlaylist(saved.id, name);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          {translate(locale, "kidung.renamePlaylist")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={(event) => {
                            downloadSavedPlaylist(saved);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
                        >
                          {translate(locale, "kidung.export")}
                        </button>
                        {saved.songIds.length > 0 && (
                          <details className="kidung-manage-saved-items">
                            <summary>
                              {translate(
                                locale,
                                "kidung.managePlaylistContents",
                                {
                                  count: saved.songIds.length,
                                },
                              )}
                            </summary>
                            <div>
                              {saved.songIds.map((songId, index) => {
                                const entry = catalogById.get(songId);
                                const title = entry?.title ?? songId;
                                return (
                                  <div
                                    className="kidung-saved-playlist-item"
                                    key={songId}
                                  >
                                    <span>
                                      {entry
                                        ? `${numberLabel(entry.number, entry.id)} · `
                                        : ""}
                                      {title}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-button"
                                      aria-label={translate(
                                        locale,
                                        "kidung.moveUp",
                                        { title },
                                      )}
                                      disabled={index === 0}
                                      onClick={() =>
                                        moveSavedPlaylistSong(
                                          saved.id,
                                          index,
                                          index - 1,
                                        )
                                      }
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      className="text-button"
                                      aria-label={translate(
                                        locale,
                                        "kidung.moveDown",
                                        { title },
                                      )}
                                      disabled={
                                        index === saved.songIds.length - 1
                                      }
                                      onClick={() =>
                                        moveSavedPlaylistSong(
                                          saved.id,
                                          index,
                                          index + 1,
                                        )
                                      }
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      className="text-button kidung-danger-action"
                                      aria-label={translate(
                                        locale,
                                        "kidung.removeSongFromPlaylist",
                                        { title },
                                      )}
                                      onClick={() =>
                                        removeSongFromPlaylist(saved.id, songId)
                                      }
                                    >
                                      {translate(
                                        locale,
                                        "kidung.removeFromPlaylist",
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                        <button
                          type="button"
                          className="text-button kidung-danger-action"
                          onClick={() => setPendingPlaylistDelete(saved.id)}
                        >
                          {translate(locale, "kidung.deletePlaylist")}
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <ConfirmDialog
          open={pendingPlaylistDelete !== null}
          title={translate(locale, "kidung.deletePlaylistTitle")}
          body={translate(locale, "kidung.deletePlaylistBody")}
          confirmLabel={translate(locale, "kidung.deletePlaylist")}
          cancelLabel={translate(locale, "common.cancel")}
          onCancel={() => setPendingPlaylistDelete(null)}
          onConfirm={() => {
            if (pendingPlaylistDelete)
              deleteSavedPlaylist(pendingPlaylistDelete);
            setPendingPlaylistDelete(null);
          }}
        />
      </section>
    </div>
  );
}
