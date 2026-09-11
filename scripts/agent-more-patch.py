from pathlib import Path

path = Path("apps/web/src/more.tsx")
text = path.read_text()
old = '''        <button
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
        </button>'''
new = '''        <button
          className="more-card more-action"
          type="button"
          onClick={() => setBackupOpen((open) => !open)}
        >
          <span className="more-icon">↥</span>
          <strong>Backup & import</strong>
          <small>Simpan atau pulihkan catatan, progres baca, dan preferensi</small>
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
              : "Susun lagu untuk kebaktian atau latihan"}
          </small>
        </button>

        <details
          className="more-card more-card-wide device-data-tools"
          data-testid="device-data-tools"
        >
          <summary className="device-data-summary">
            <span>
              <strong>Perangkat & data</strong>
              <small>Alat lanjutan untuk penyimpanan lokal</small>
            </span>
            <span className="device-data-chevron" aria-hidden="true">›</span>
          </summary>
          <div className="device-data-body">
            <div>
              <strong>Reset perangkat</strong>
              <small>
                Hapus preferensi, cache, progres lokal, dan data offline aplikasi
                dari perangkat ini. Gunakan hanya bila diperlukan.
              </small>
            </div>
            <button
              className="quiet-button danger-button"
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Hapus semua data GYS di perangkat ini? Catatan, progres baca, preferensi, dan cache lokal akan dihapus.",
                );
                if (!confirmed) return;
                void clearAppData()
                  .then(() =>
                    show(
                      "Data lokal GYS sudah direset. Muat ulang bila diperlukan.",
                    ),
                  )
                  .catch(() =>
                    show(
                      "Reset belum selesai sepenuhnya. Periksa izin penyimpanan lalu coba lagi.",
                    ),
                  );
              }}
            >
              Reset perangkat
            </button>
          </div>
        </details>'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one More action cluster, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))

styles = Path("apps/web/src/styles.css")
styles.write_text(
    styles.read_text()
    + '''

/* More: keep destructive device actions secondary to everyday settings. */
.device-data-tools {
  padding: 0;
  overflow: clip;
}

.device-data-summary {
  min-height: 70px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
  list-style: none;
}

.device-data-summary::-webkit-details-marker {
  display: none;
}

.device-data-summary > span:first-child {
  display: grid;
  gap: 3px;
}

.device-data-summary small,
.device-data-body small {
  color: var(--muted);
}

.device-data-chevron {
  font-size: 1.35rem;
  line-height: 1;
  transition: transform 160ms ease;
}

.device-data-tools[open] .device-data-chevron {
  transform: rotate(90deg);
}

.device-data-body {
  border-top: 1px solid var(--line);
  padding: 16px 20px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.device-data-body > div {
  display: grid;
  gap: 4px;
  max-width: 64ch;
}

.danger-button {
  flex: 0 0 auto;
}

@media (max-width: 620px) {
  .device-data-summary {
    min-height: 64px;
    padding: 16px;
  }

  .device-data-body {
    padding: 14px 16px 16px;
    align-items: stretch;
    flex-direction: column;
  }

  .danger-button {
    width: 100%;
  }
}
'''
)
