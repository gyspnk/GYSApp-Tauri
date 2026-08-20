"""Generate the browser reader/search pack from the canonical TB SQLite file.

The SQLite database remains the native source. The compact JSON projection is
used by the web worker boundary because browser builds do not ship a SQLite
runtime just to render a chapter.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "apps" / "web" / "public" / "offline" / "bible" / "b_tb.db"
OUTPUT = ROOT / "apps" / "web" / "public" / "offline" / "bible" / "tb-reader.json"


def main() -> None:
    if DATABASE.stat().st_size == 0:
        raise SystemExit(f"TB database is empty: {DATABASE}")

    with sqlite3.connect(DATABASE) as connection:
        books = [
            {"id": row[0], "short": row[1], "name": row[2], "chapters": row[3]}
            for row in connection.execute("select id, bs, bl, c from book order by id")
        ]
        verses = [
            {
                "id": f"{book}:{chapter}:{verse}",
                "book": str(book),
                "bookOrder": book,
                "chapter": chapter,
                "verse": verse,
                "text": text,
            }
            for book, chapter, verse, text in connection.execute(
                "select b, c, v, t from bible order by b, c, v"
            )
        ]
        def decode_sv(value: int) -> dict | None:
            if not value:
                return None
            b = value // 1_000_000
            c = (value % 1_000_000) // 1000
            v = value % 1000
            if b <= 0 or c <= 0 or v <= 0:
                return None
            return {"book": str(b), "chapter": c, "verse": v}

        parallels_by_id: dict[int, list[dict]] = {}
        for pid, id1, id2, t in connection.execute("select id, id1, id2, t from pericope_paralel order by id, id1"):
            dec1 = decode_sv(id1)
            dec2 = decode_sv(id2)
            item: dict = {"text": t}
            if dec1:
                item["start"] = dec1
            if dec2:
                item["end"] = dec2
            parallels_by_id.setdefault(pid, []).append(item)

        pericopes = []
        for pid, _, b, c, v, t in connection.execute("select id, s, b, c, v, t from pericope order by b, c, v"):
            p = {"id": str(pid), "book": str(b), "chapter": c, "verse": v, "title": t}
            if pid in parallels_by_id:
                p["parallels"] = parallels_by_id[pid]
            pericopes.append(p)

        cross_refs: dict[str, list] = {}
        for pid, sv, ev in connection.execute("select id, sv, ev from ref order by id, sv"):
            decoded = decode_sv(sv)
            if not decoded:
                continue
            entry: dict = {
                "book": decoded["book"],
                "chapter": decoded["chapter"],
                "verse": decoded["verse"],
            }
            if ev:
                # ev may encode end verse similarly, or just verse number
                # try decode as full encoded if >1000, else simple verse number
                if ev >= 1_000_000:
                    ev_dec = decode_sv(ev)
                    if ev_dec:
                        if ev_dec["book"] != decoded["book"]:
                            entry["endBook"] = ev_dec["book"]
                        if ev_dec["chapter"] != decoded["chapter"]:
                            entry["endChapter"] = ev_dec["chapter"]
                        if ev_dec != decoded:
                            entry["endVerse"] = ev_dec["verse"]
                elif ev > 0 and ev != decoded["verse"]:
                    entry["endVerse"] = ev

            # Add by verse key "1:1:1"
            vid_dec = decode_sv(pid)
            if vid_dec:
                formatted_key = f"{vid_dec['book']}:{vid_dec['chapter']}:{vid_dec['verse']}"
                cross_refs.setdefault(formatted_key, []).append(entry)
            # Also add by numeric id string "1001001"
            cross_refs.setdefault(str(pid), []).append(entry)

    payload = (
        json.dumps(
            {
                "version": 1,
                "translation": "TB",
                "source": "ThenGB/GYSAPP-Fork@4f0d39b",
                "books": books,
                "verses": verses,
                "pericopes": pericopes,
                "crossRefs": cross_refs,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )
    # Path.write_text translates newlines on Windows; write bytes explicitly so
    # the generated digest is identical on Windows and Linux CI.
    OUTPUT.write_bytes(payload.encode("utf-8"))
    print(f"Generated {len(books)} books, {len(verses)} verses, {len(pericopes)} pericopes, {len(cross_refs)} cross-ref groups: {OUTPUT}")


if __name__ == "__main__":
    main()
