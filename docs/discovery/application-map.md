# Application map

Current runtime, reviewed 2026-10-07. The same shell owns locale, theme,
route recovery, search and persistent media across web/PWA/Tauri.

| Route                                 | Owner                                                  | Main behavior                                                                                                               |
| ------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/`                                   | `home.tsx`                                             | Cached-first Home, current Sauh, continue reading and publication shortcuts.                                                |
| `/bible`                              | `bible.tsx`                                            | TB/split reader, lazy search, annotations, voice and numeric address picker. Validated book/chapter/verse query deep links. |
| `/kidung`                             | `kidung-catalog.tsx`                                   | Category/number/title catalog; compact shared local navigation and text/score selection.                                    |
| `/kidung/:songId`                     | `kidung.tsx`                                           | Text or PDF score (`mode=lyrics` / `mode=pdf`), shared chord/musical state and verse/song navigation.                       |
| Kidung playlist/settings destinations | `kidung-playlist-page.tsx`, `kidung-settings-page.tsx` | Lazy sibling views; local navigation keeps identical positions.                                                             |
| `/iman`                               | `faith.tsx`                                            | Complete ten beliefs, localized search, notes and local official PDF booklets.                                              |
| `/literatur`, `/literatur/:id`        | `literature.tsx`, catalog/reader helpers               | Catalog/filter/history/favorites; internal article/PDF opening and versioned resume.                                        |
| `/sauh`                               | `online-content.tsx`, `sauh.ts`                        | Publisher daily reading with cached snapshot and internal article.                                                          |
| `/suara`, `/suara/:postId`            | `online-content.tsx`, `suara.ts`, `online-article.ts`  | Feed and trusted sanitized article.                                                                                         |
| `/lainnya`                            | `more.tsx`                                             | Collection/settings/account/data/backup/report tools.                                                                       |

`route-pages.ts` defines lazy route modules; `route-preload.ts` prepares intent
and bounded idle warming. `route-transitions.ts` animates content while shell
and `media-surface.tsx` persist. Desktop navigation is fixed/scroll-independent.
There is no connectivity badge in the header and no chord-loaded toast.

MIDI minimize is an edge half-circle, separate from the application's navigation
rail. The TTS session retains its source context. PDF, article and lyric modes
are internal reading presentations rather than external tabs; provider messaging/
authorization windows are an explicit authentication handoff.

See [the user guide](../user-guide.md) for gesture/draft/mode semantics and
[architecture](../architecture.md) for storage/security ownership.
