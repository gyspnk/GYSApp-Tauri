import { useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import {
  addMidiPlaylistItem,
  clearMidiPlaylist,
  downloadMidiPlaylist,
  getMidiPlaylist,
  importMidiPlaylist,
  moveMidiPlaylistItem,
  removeMidiPlaylistItem,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import { playMidiPlaylistItem } from "./midi-queue.js";
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
import { applyAutoNextMode, getAutoNextMode } from "./midi-playlist.js";
import type { HymnMetadata } from "@gys/contracts";
import {
  type CatalogState,
  parseCatalog,
  numberLabel,
} from "./kidung-shared.js";
import { KidungLocalNav } from "./kidung-local-nav.js";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string>();

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
    // Refresh snapshot after the bulk add
    window.dispatchEvent(new CustomEvent("gys-kidung-playlists-change"));
  };
  const showToastLike = (name: string) => {
    window.setTimeout(
      () => setNoticeLocal(translate(locale, "kidung.playlistSaved", { name })),
      0,
    );
  };
  const [noticeLocal, setNoticeLocal] = useState("");
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
      <KidungLocalNav active="playlist" locale={locale} />
      <header className="kidung-tool-heading">
        <div>
          <h1>{translate(locale, "kidung.playlist")}</h1>
        </div>
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
            onChange={(event) => {
              void importPlaylist(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>
      <section
        className="kidung-queue-surface"
        aria-label={translate(locale, "kidung.midiPlaylist")}
      >
        <div className="kidung-queue-options">
          <Select
            value={getAutoNextMode()}
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
            className="text-button kidung-clear-playlist"
            type="button"
            onClick={() => clearMidiPlaylist()}
            disabled={playlist.items.length === 0}
          >
            {translate(locale, "kidung.clearPlaylist")}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={saveQueueAsPlaylist}
            disabled={playlist.items.length === 0}
          >
            {translate(locale, "kidung.saveAsPlaylist")}
          </button>
        </div>
        {noticeLocal && (
          <p className="kidung-inline-error" role="status">
            {noticeLocal}
          </p>
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
                    <span>
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
                                const entry =
                                  catalog.status === "ready"
                                    ? catalog.items.find(
                                        (candidate) => candidate.id === songId,
                                      )
                                    : undefined;
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
                          onClick={(event) => {
                            deleteSavedPlaylist(saved.id);
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                          }}
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
        {importError && (
          <p className="kidung-inline-error" role="alert">
            {importError}
          </p>
        )}
        {playlist.items.length === 0 ? (
          <div className="kidung-empty-state">
            <strong>{translate(locale, "kidung.emptyPlaylistTitle")}</strong>
            <p>{translate(locale, "kidung.emptyPlaylistBody")}</p>
            <Link className="text-button" to="/kidung">
              {translate(locale, "kidung.backToCatalog")}
            </Link>
          </div>
        ) : (
          <ol className="kidung-playlist-list">
            {playlist.items.map((item, index) => (
              <li
                className={
                  index === playlist.currentIndex ? "is-current" : undefined
                }
                key={item.songId}
              >
                <button
                  className="kidung-playlist-song"
                  type="button"
                  onClick={() => {
                    selectMidiPlaylistItem(index);
                    void playMidiPlaylistItem(item.songId).catch(
                      () => undefined,
                    );
                  }}
                >
                  <span className="kidung-playlist-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {index === playlist.currentIndex
                        ? translate(locale, "kidung.selected")
                        : translate(locale, "kidung.readyToPlay")}
                    </small>
                  </span>
                </button>
                <div className="kidung-playlist-actions">
                  <details className="kidung-row-menu">
                    <summary
                      aria-label={translate(locale, "kidung.songOptions", {
                        title: item.title,
                      })}
                      title={translate(locale, "kidung.songOptions", {
                        title: item.title,
                      })}
                    >
                      <Icon name="more" size={18} />
                    </summary>
                    <div className="kidung-row-menu-panel">
                      <button
                        className="text-button"
                        type="button"
                        aria-label={translate(locale, "kidung.moveUp", {
                          title: item.title,
                        })}
                        onClick={() => moveMidiPlaylistItem(index, index - 1)}
                        disabled={index === 0}
                      >
                        {translate(locale, "kidung.moveUp", {
                          title: item.title,
                        })}
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        aria-label={translate(locale, "kidung.moveDown", {
                          title: item.title,
                        })}
                        onClick={() => moveMidiPlaylistItem(index, index + 1)}
                        disabled={index === playlist.items.length - 1}
                      >
                        {translate(locale, "kidung.moveDown", {
                          title: item.title,
                        })}
                      </button>
                      <button
                        className="text-button kidung-open-song"
                        type="button"
                        onClick={() => navigate(`/kidung/${item.songId}`)}
                      >
                        {translate(locale, "kidung.openSong")}
                      </button>
                      <button
                        className="text-button kidung-danger-action"
                        type="button"
                        aria-label={translate(
                          locale,
                          "kidung.removeSongFromPlaylist",
                          { title: item.title },
                        )}
                        onClick={() => removeMidiPlaylistItem(item.songId)}
                      >
                        {translate(locale, "kidung.removeFromPlaylist")}
                      </button>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
