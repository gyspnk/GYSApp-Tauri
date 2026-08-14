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

    OUTPUT.write_text(
        json.dumps(
            {
                "version": 1,
                "translation": "TB",
                "source": "ThenGB/GYSAPP-Fork@4f0d39b",
                "books": books,
                "verses": verses,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(books)} books and {len(verses)} verses: {OUTPUT}")


if __name__ == "__main__":
    main()
