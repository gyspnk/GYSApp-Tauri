import type { ChordDocumentV2 } from "@gys/contracts";

const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function transposeChord(chord: string, offset: number): string {
  if (!offset) return chord;
  return chord.replace(
    /([A-G](?:#|♯|b|♭)?)(.*)/,
    (_, root: string, suffix: string) => {
      const normalized = root.replace("#", "♯").replace("b", "♭");
      const index = NOTES.indexOf(normalized);
      return index < 0
        ? chord
        : `${NOTES[(index + offset + NOTES.length) % NOTES.length]}${suffix}`;
    },
  );
}

export function ChordViewer({
  document,
  transpose = 0,
}: {
  document: ChordDocumentV2;
  transpose?: number;
}) {
  if ("verses" in document) {
    return (
      <section className="chord-viewer" aria-label="Chord viewer">
        <div className="chord-viewer-heading">
          <strong>Chord lagu</strong>
          <small>{document.key} · canonical note-aligned</small>
        </div>
        {document.verses.map((verse) => (
          <div className="chord-verse" key={verse.label}>
            <span className="chord-verse-label">{verse.label}</span>
            {verse.lines.map((line, index) => (
              <div className="chord-line" key={`${verse.label}-${index}`}>
                {line.chords.length > 0 ? (
                  <span className="chord-aligned-line">
                    {[...line.text].map((character, characterIndex) => {
                      const tokens = line.chords.filter(
                        (token) => token.index === characterIndex,
                      );
                      return (
                        <span
                          className="chord-aligned-cell"
                          key={`${characterIndex}-${character}`}
                        >
                          <small>
                            {tokens
                              .map((token) =>
                                transposeChord(token.token, transpose),
                              )
                              .join(" ")}
                          </small>
                          <span>{character || " "}</span>
                        </span>
                      );
                    })}
                    {line.chords
                      .filter((token) => token.index >= line.text.length)
                      .map((token) => (
                        <span
                          className="chord-aligned-cell"
                          key={`tail-${token.index}`}
                        >
                          <small>
                            {transposeChord(token.token, transpose)}
                          </small>
                          <span> </span>
                        </span>
                      ))}
                  </span>
                ) : (
                  <span>{line.text || " "}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>
    );
  }
  const entries = Object.entries(document.pages).flatMap(([page, values]) =>
    values.map((entry) => ({ page, ...entry })),
  );
  return (
    <section className="chord-viewer" aria-label="Chord viewer">
      <div className="chord-viewer-heading">
        <strong>Chord lagu</strong>
        <small>canonical note-aligned · {entries.length} posisi</small>
      </div>
      <div className="chord-chip-list">
        {entries.map((entry, index) => (
          <span
            className="chord-chip"
            key={`${entry.page}-${entry.noteIdx}-${index}`}
          >
            {transposeChord(entry.chord, transpose)}
          </span>
        ))}
      </div>
      <p className="chord-note">
        Posisi chord mengikuti notasi PDF canonical dan tetap terbaca saat nada
        diubah.
      </p>
    </section>
  );
}
