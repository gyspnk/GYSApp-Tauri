# Application map

The clean-room rewrite keeps five top-level destinations so navigation and
media state remain stable across platforms:

1. Home — greeting/date/account, continue reading/song, Sauh, announcement,
   daily verse, and shortcuts.
2. Bible — books, chapter reader, search, history, bookmark, notes, sharing,
   versions, and TTS.
3. Kidung — six hymn books, text/chord/PDF modes, MIDI player, and playlists.
4. Iman — ten faith topics in Indonesian/English/Chinese with search and PDF.
5. Lainnya — literature/media, managers, settings, account, backup, reports,
   and maintenance.

The shell owns route-persistent media, offline status, locale, theme, and
error boundaries. Feature modules own domain state behind repository ports.
