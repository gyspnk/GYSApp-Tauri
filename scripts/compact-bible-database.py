"""Losslessly compact the packaged Bible database; refresh manifests afterwards."""

import argparse
import os
import sqlite3
import tempfile
from contextlib import closing
from itertools import zip_longest
from pathlib import Path


def compact_database(source: Path, write: bool = False) -> tuple[int, int]:
    before = source.stat().st_size
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as original:
        if (
            original.execute("pragma freelist_count").fetchone()[0] == 0
            and original.execute("pragma page_size").fetchone()[0] == 4096
        ):
            return before, before
        handle, temporary = tempfile.mkstemp(suffix=".db", dir=source.parent)
        os.close(handle)
        candidate = Path(temporary)
        try:
            original.execute("pragma page_size=4096")
            original.execute("vacuum into ?", (temporary,))
            with closing(sqlite3.connect(candidate)) as compact:
                schema = "select type,name,tbl_name,sql from sqlite_master order by type,name"
                if original.execute(schema).fetchall() != compact.execute(schema).fetchall():
                    raise ValueError("Compaction changed the database schema")
                for (name,) in original.execute("select name from sqlite_master where type='table'"):
                    table = '"' + name.replace('"', '""') + '"'
                    query = f"select rowid,* from {table} order by rowid"
                    sentinel = object()
                    for left, right in zip_longest(
                        original.execute(query), compact.execute(query), fillvalue=sentinel
                    ):
                        if left != right:
                            raise ValueError(f"Compaction changed rows or row IDs in {name}")
                for pragma in ("user_version", "application_id"):
                    if original.execute(f"pragma {pragma}").fetchone() != compact.execute(f"pragma {pragma}").fetchone():
                        raise ValueError(f"Compaction changed {pragma}")
                if compact.execute("pragma integrity_check").fetchone() != ("ok",):
                    raise ValueError("Compacted database failed integrity_check")
            after = candidate.stat().st_size
            if after >= before:
                return before, before
            # Close the read handle before replacement, including on Windows.
            original.close()
            if write:
                candidate.chmod(source.stat().st_mode)
                os.replace(candidate, source)
            return before, after
        finally:
            candidate.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    arguments = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / "apps/web/public/offline/bible/b_tb.db"
    before, after = compact_database(source, arguments.write)
    print(f"Bible SQLite: {before:,} -> {after:,} bytes; schema, rows and row IDs verified")
