import { readFileSync, writeFileSync } from "node:fs";

const kidungPath = "apps/web/src/kidung.tsx";
const cssPath = "apps/web/src/kidung-ux.css";

let kidung = readFileSync(kidungPath, "utf8");
let css = readFileSync(cssPath, "utf8");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

kidung = replaceOnce(
  kidung,
  `              <Icon name="settings" size={18} />
              <span className="sr-only">Pengaturan baca</span>`,
  `              <span className="reader-aa-label" aria-hidden="true">
                Aa
              </span>
              <span className="sr-only">Pengaturan baca</span>`,
  "reader settings summary",
);

const settingsStart = kidung.indexOf(
  '<details\n            className="hymn-reader-settings"',
);
if (settingsStart < 0) throw new Error("Missing hymn reader settings block");

const songOpen = '            <div className="song-controls">\n';
const songOpenIndex = kidung.indexOf(songOpen, settingsStart);
if (songOpenIndex < 0) throw new Error("Missing reader song-controls");
const contentStart = songOpenIndex + songOpen.length;

const readingStartMarker = `              <div
                className="reader-preferences"`;
const readingStart = kidung.indexOf(readingStartMarker, contentStart);
if (readingStart < 0) throw new Error("Missing reader preferences");

const readingEndMarker = `                <button
                  type="button"
                  className="text-button"
                  onClick={() => updateTypography(DEFAULT_HYMN_TYPOGRAPHY)}
                >
                  {translate(locale, "kidung.resetText")}
                </button>
              </div>`;
const readingEndStart = kidung.indexOf(readingEndMarker, readingStart);
if (readingEndStart < 0) throw new Error("Missing reader preferences end");
const readingEnd = readingEndStart + readingEndMarker.length;

const songCloseMarker = `
            </div>
          </details>`;
const songCloseIndex = kidung.indexOf(songCloseMarker, readingEnd);
if (songCloseIndex < 0) throw new Error("Missing reader song-controls close");

const musicChunk = kidung.slice(contentStart, readingStart).trimEnd();
const readingChunk = kidung.slice(readingStart, readingEnd);
if (!musicChunk.includes('className="transpose-control"'))
  throw new Error("Music chunk lost transpose controls");
if (!musicChunk.includes('className="capo-control"'))
  throw new Error("Music chunk lost capo controls");
if (!readingChunk.includes('className="reader-preferences"'))
  throw new Error("Reading chunk lost typography controls");

const groupedControls = `            <div className="song-controls">
              <details
                className="reader-settings-group hymn-reading-settings"
                open
              >
                <summary>Teks & jarak</summary>
                <div className="reader-settings-group-body">
${readingChunk}
                </div>
              </details>
              <details className="reader-settings-group hymn-music-settings">
                <summary>Musik & chord</summary>
                <div className="reader-settings-group-body">
${musicChunk}
                </div>
              </details>
            </div>`;

kidung =
  kidung.slice(0, songOpenIndex) +
  groupedControls +
  kidung.slice(songCloseIndex + "\n            </div>".length);

const cssAppend = `

/* Reader settings hierarchy: typography is the default task; music controls
   remain fully available but stay collapsed until explicitly requested. */
.reader-aa-label {
  display: inline-block;
  color: currentColor;
  font-size: 15px;
  font-weight: 780;
  letter-spacing: -0.045em;
  line-height: 1;
}

.reader-settings-group {
  grid-column: 1 / -1;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-soft);
}

.reader-settings-group > summary {
  display: flex;
  min-height: var(--control-hit, 44px);
  align-items: center;
  justify-content: space-between;
  padding: 0 11px;
  list-style: none;
  color: var(--muted);
  font-size: 12px;
  font-weight: 720;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}

.reader-settings-group > summary::-webkit-details-marker {
  display: none;
}

.reader-settings-group > summary::after {
  content: "+";
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  transition: transform var(--motion-fast) var(--ease-out);
}

.reader-settings-group[open] > summary {
  background: color-mix(in srgb, var(--blue-soft) 44%, transparent);
  color: var(--blue);
}

.reader-settings-group[open] > summary::after {
  content: "−";
}

.reader-settings-group > summary:hover,
.reader-settings-group > summary:focus-visible {
  background: color-mix(in srgb, var(--blue-soft) 50%, transparent);
  color: var(--blue);
}

.reader-settings-group > summary:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--blue) 42%, transparent);
  outline-offset: -3px;
}

.reader-settings-group-body {
  display: grid;
  gap: 12px;
  padding: 10px;
  border-top: 1px solid var(--line);
  background: var(--surface);
  animation: kidung-disclosure-in var(--motion-fast) var(--ease-out) both;
}

.reader-settings-group-body > .reader-preferences,
.reader-settings-group-body > .hymn-midi-reader-controls,
.reader-settings-group-body > .transpose-control,
.reader-settings-group-body > .capo-control {
  margin: 0;
}

@keyframes kidung-disclosure-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-settings-group > summary,
  .reader-settings-group > summary::after,
  .reader-settings-group-body {
    transition: none;
    animation: none;
    transform: none;
  }
}
`;

if (css.includes("/* Reader settings hierarchy:"))
  throw new Error("Reader settings CSS already applied");
css += cssAppend;

writeFileSync(kidungPath, kidung);
writeFileSync(cssPath, css);
