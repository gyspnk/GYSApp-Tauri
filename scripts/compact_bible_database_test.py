import hashlib
import importlib.util
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "compact", Path(__file__).with_name("compact-bible-database.py")
)
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)


class CompactBibleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "bible.db"

    def create_database(self):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("pragma page_size=1024")
            connection.execute("pragma user_version=7")
            connection.execute("pragma application_id=123")
            connection.execute("create table verse (id integer primary key, text text)")
            connection.execute("create index verse_text on verse(text)")
            for index in range(100):
                connection.execute("insert into verse(text) values (?)", (str(index) * 1024,))
            connection.execute("delete from verse where rowid % 10 != 1")
            connection.commit()

    def test_audit_does_not_modify_source(self):
        self.create_database()
        original = self.database.read_bytes()
        before, after = compact.compact_database(self.database)
        self.assertLess(after, before)
        self.assertEqual(self.database.read_bytes(), original)

    def test_write_preserves_records_metadata_and_is_idempotent(self):
        self.create_database()
        before, after = compact.compact_database(self.database, write=True)
        self.assertLess(after, before)
        with closing(sqlite3.connect(self.database)) as connection:
            self.assertEqual(connection.execute("pragma user_version").fetchone(), (7,))
            self.assertEqual(connection.execute("pragma application_id").fetchone(), (123,))
            self.assertEqual(connection.execute("pragma integrity_check").fetchone(), ("ok",))
            self.assertEqual(connection.execute("select count(*) from verse").fetchone(), (10,))
        digest = hashlib.sha256(self.database.read_bytes()).digest()
        self.assertEqual(compact.compact_database(self.database, write=True), (after, after))
        self.assertEqual(hashlib.sha256(self.database.read_bytes()).digest(), digest)

    def test_row_id_changes_are_rejected_without_replacing_source(self):
        self.create_database()
        original = self.database.read_bytes()
        connect = sqlite3.connect

        def changed_candidate(path, **kwargs):
            connection = connect(path, **kwargs)
            if not kwargs.get("uri"):
                connection.execute("update verse set id=id+1000")
                connection.commit()
            return connection

        with patch.object(compact.sqlite3, "connect", side_effect=changed_candidate):
            with self.assertRaisesRegex(ValueError, "row IDs"):
                compact.compact_database(self.database, write=True)
        self.assertEqual(self.database.read_bytes(), original)
        self.assertEqual(list(self.database.parent.glob("*.db")), [self.database])


if __name__ == "__main__":
    unittest.main()
