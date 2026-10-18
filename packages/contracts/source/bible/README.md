# TB generator source

`b_tb.db` is the canonical SQLite input for `scripts/generate-bible-reader-pack.py`.
It lives outside the web public directory so native and web builds ship only the
complete `offline/bible/tb-reader.json` projection. The database is retained for
reproducible generation and the SQL projection integration test.

Moving this source does not alter verses, pericopes, parallels or cross references.
Optional downloaded SQL translations still use `bible-sql-runtime.ts` and SQL.js.
The native asset verifier rejects SQLite files copied into runtime output.
