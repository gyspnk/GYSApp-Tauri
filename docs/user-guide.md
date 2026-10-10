# User guide

Current behavior, reviewed 2026-10-08. Labels follow the selected ID/EN/ZH locale;
examples here use Indonesian labels. Some online/account actions need the
configured backend and an internet connection.

## Navigation and appearance

Use Beranda, Alkitab, Kidung, Iman and Lainnya from the sidebar or mobile bottom
bar. Desktop navigation can collapse into an icon rail. The persistent player
has a separate minimize control and stays independent of document scrolling.
The header search opens cross-application results; Ctrl/⌘K is its keyboard
shortcut. Search results return to internal readers rather than duplicate pages.

Language, theme and reading preferences persist on the device. Church blue is
the default accent. Theme changes preserve reader state/scroll while fading
colors; reduced-motion settings remove optional motion. A detected e-GYS account
photo appears in the header. There is no online/offline badge in the header.

## Beranda, Sauh and Suara Sejati

Beranda shows useful cached content before refreshing online. Continue-reading
items open the saved reader/source. Sauh follows the publisher's daily entry;
Suara Sejati opens an internal, sanitized article. Thumbnail space is reserved
before the image arrives so cards do not briefly expand during loading.

Articles use adaptive reading columns and theme-aware text. Missing or failed
live content keeps an explicit retry/source path instead of inventing an article.
A cached entry may be older than the current publisher; network availability
and the publisher determine when fresh material can replace it.

## Alkitab

The bundled TB projection supports reading and search offline. Additional
installed translations depend on their data availability. Verse typography is
justified, responsive and persisted; Ctrl+wheel and pinch change reader scale
within its supported limits. The chapter can be split into two reading panes.
Annotations, bookmarks and history remain local.

### Choose a book, chapter and verse

1. Open the book/address picker from the reader navigation.
2. Choose a book from its dropdown; use its search to find a book or verse text.
3. Tap **Pasal** or **Ayat** once to edit that field with the on-screen keypad.
   The first typed digit replaces the current value automatically. Subsequent
   digits append; backspace corrects the number.
4. A second tap on the same numbered field opens its dropdown. Selecting an
   item edits the draft. Typing does not navigate the reader.
5. Press **Buka ayat** to apply the draft and open the selected address.

Chapter bounds follow the selected book. Verse bounds follow the actual active
translation/chapter. Invalid addresses disable opening; canceling discards the
draft. Desktop numeric keys, dropdown arrow keys and Escape are supported.
Opening the phone picker does not require a software keyboard for numeric input.

### Voice reading

Choose the detected speech provider/voice and start the verse queue. Browser
Auto can use a configured Edge-compatible gateway or fall back to system voices.
Native Edge/system capabilities depend on the installed runtime and OS. A voice
is not advertised as available without its actual catalog/capability. Starting
MIDI pauses speech; starting speech pauses MIDI, without automatic resumption of
the previous audible session.

## Kidung

The catalog keeps category, Kidung/Playlist/Pengaturan and text/score controls
in one compact field. Categories include **Semua** and **KR**; use the number/
title search to find a hymn, including lettered A/B variants. A row opens the
current presentation. Each new app launch/reload defaults to text; switching
to score is remembered across navigation within that runtime only. Explicit
`?mode=pdf` links still request a score. Typography, chord visibility and reading
progress remain saved independently. Lyrics and score are distinct modes; leaving the score
viewer returns to the hymn list through its back action.

### Text and chords

Text starts with a scale suited to the viewport and available lyric space.
User typography/spacing choices persist and take precedence over first-open
fitting. Show/hide chords with the dedicated chord control. Chord rows expand
and collapse smoothly; verse/song transitions preserve musical state.
Ctrl+wheel or pinch provides smooth bounded text zoom. Long lines retain their
required scrolling/overflow behavior rather than cutting off the words.

Canonical chords load only when requested. Some hymns have no published chord
file; unavailable source data is distinguished from a retryable load failure.
Text and PDF chords use the displayed score's key and note geometry. Changing
key/transpose affects actual MIDI/chord labels rather than only renaming a key.
Chord labels sit above the score notation and fade without replacing the page.

### Score/PDF mode

The first completed page fits as large as possible in the viewport and centers
horizontally/vertically. Use single/spread/continuous layouts where available;
a saved two-page preference falls back to one readable page on narrow screens.
Page navigation and previous/next-hymn actions stay distinct even in a two-page
hymn. Zoom/pan controls are shared with other internal PDF readers below.

### MIDI player

The viewer's MIDI button turns the persistent player on or closes it. Showing
the player does not force playback; press Play to authorize audio. TimGM is
packaged by default, so no separate SoundFont install is needed for ordinary
playback. GeneralUser is an optional download in data/asset settings.

The expanded player provides previous/play-pause/next, seek/time, instrument,
key, transpose and icon reset. The utility menu holds volume, mute, stop, tempo,
loop/queue and related secondary controls. All 128 General MIDI programs are
selectable from the active SoundFont; piano (program 0) is the default. MIDI-file
program and bank changes are ignored. Installing/removing GeneralUser refreshes
the active bank. Playback requires SoundFont synthesis; an unavailable bank or
synthesis worker reports an error. Tempo is 30–220 BPM; transpose is −24 to +24
semitones. Preferences persist. A seek drag previews its position and commits
one audio update on release.

Minimize leaves a small animated half-circle attached to the left or right
screen edge. Tap to restore full controls. Drag it to move vertically or to the
opposite edge; keyboard arrows move it, and Home/End reach the safe bounds.
Hover/focus reveals more of the tab. The equalizer animates while playback is
active. Dragging does not restore the player; minimizing, changing pages and
scrolling do not stop playback. Close the player to end the MIDI session.

## Dasar Kepercayaan

All ten belief texts appear in full on the page in the selected available
locale. The search spans numbers and words and fills the adaptive page width.
Text is justified, with compact note/PDF actions at the lower right of each
belief. Expand text within the card without leaving an unused outer box.

The ten official Indonesian booklets are served locally to avoid publisher
CORS failures. PDF opens in the shared internal viewer. Notes use the existing
annotation tools; an extra reflection-selector section is not required.
Reader typography and smooth wheel/pinch zoom keep mobile text usable.

## Literatur and internal PDF reading

Filter/search the catalog and open a publication. Favorites, history and page/
scroll resume stay on this device. Opening a PDF keeps one reader/header while
its source metadata, cached bytes and PDF.js become ready. The content Worker
handles official TJC/S3 PDF transport; a stale Worker can still cause a hosted
load failure until its backend deployment is updated.

All internal PDFs support:

- Initial maximal fit and centered placement; 100% means the fitted page size.
- Smooth Ctrl+wheel/pinch zoom up to 800%, with sharp visible-region detail.
- Mouse/pen drag and single-touch pan after enlargement.
- Compact page navigation, fullscreen, source/download and contextual tools.
- Version-aware saved location; invalid saved pages are clamped safely.
- Inline loading/progress and retry for the current document without reloading
  the application or purging unrelated reader caches.

Very large issues and first-time network retrieval can still take time. Reuse
and range streaming reduce work; they cannot eliminate publisher/network
latency. Offline reopening requires previously retained bytes or an installed
publication; a catalog entry alone does not include its complete PDF.

## e-GYS account

Expand the account section in settings and choose Google, WhatsApp or Apple.
All three buttons remain in one adaptive row; Google stays visible even when
backend/session probing is unavailable. Login behavior depends on web versus
installed Tauri runtime.

For web WhatsApp, one click opens the prepared WhatsApp send link and begins
tracking. Send that prepared message; GYSApp receives the internal confirmation
through its tracking channel. There is no code/OTP field and no separate Send
button. The small badge beside WhatsApp counts down from 120 seconds. Expiry
stops the attempt; pressing the same provider again replaces it with a new
request. If the badge reports a failure, retry after verifying popup/network
access. Do not substitute a different message/reference.

Google's dynamic sign-in button appears directly in the account row; small
layouts use its Google icon. It opens provider authorization immediately and
does not require a second login button in an application overlay. If its SDK
cannot load, the visible Google action retries in place after network recovery.
Apple uses its provider authorization UI. A successful exchange refreshes
the account/profile photo. Tauri authenticates in its allowlisted official e-GYS
login window and stores the token in the OS keyring. Logging out removes the
local credential/session boundary; browser tokens are not kept in localStorage.

Settings retain one disclosure per category. Opening Appearance shows theme,
accent palette and language together; offline diagnostics and device reset
have no second disclosure. Reset still asks for confirmation.

## Offline data, backups and recovery

Bundled Bible/faith/catalog projections remain available offline. Heavier PDFs,
chords and MIDI are verified before their active cache pointer changes. Startup
checks chord metadata and fetches only missing/changed entries; it does not
redownload every cached file. Installed/pinned data survives ordinary reading
until explicit maintenance or device storage eviction.

Use data/asset management to install optional packs, verify or repair them, and
check the configured manifest for updates. A failed update keeps the last valid
pack. Backups use a versioned encrypted format; legacy import does not re-export
the legacy encryption scheme. Export a backup before a reset when local notes,
preferences or playlists matter. Reset clears owned application stores/caches;
it is different from retrying one failed PDF.

The immersive reader suppresses browser text selection/copy/context menus while
keeping form editing usable. Accessible buttons and explicit application actions
remain the primary navigation/editing path.
