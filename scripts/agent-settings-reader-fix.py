from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


faith = "apps/web/src/faith.tsx"
replace_once(
    faith,
    '  const [noteDraft, setNoteDraft] = useState("");\n  const [notice, setNotice] = useState("");',
    '  const [noteDraft, setNoteDraft] = useState("");\n  const [noteRevision, setNoteRevision] = useState(0);\n  const [notice, setNotice] = useState("");',
)
replace_once(
    faith,
    '    [items],\n  );\n  const hasNote = (number: string) =>',
    '    [items, noteRevision],\n  );\n  const hasNote = (number: string) =>',
)
replace_once(
    faith,
    '    localStorage.setItem(noteKey(active.number), noteDraft.trim());\n    flash(translate(locale, "faith.noteSaved"));',
    '    localStorage.setItem(noteKey(active.number), noteDraft.trim());\n    setNoteRevision((revision) => revision + 1);\n    flash(translate(locale, "faith.noteSaved"));',
)
replace_once(
    faith,
    '    localStorage.removeItem(noteKey(number));\n    if (active?.number === number) setNoteDraft("");',
    '    localStorage.removeItem(noteKey(number));\n    setNoteRevision((revision) => revision + 1);\n    if (active?.number === number) setNoteDraft("");',
)

more = "apps/web/src/more.tsx"
replace_once(
    more,
    '      key.startsWith("gys-pdf-layout:") ||\n      key.startsWith("gys-faith-pdf-"),',
    '      key.startsWith("gys-pdf-layout:") ||\n      key.startsWith("gys-faith-pdf-") ||\n      key.startsWith("gys-faith-note-"),',
)
replace_once(
    more,
    '  const checkOfflinePack = async () => {',
    '  const disableReminder = () => {\n    setReminderTime("");\n    localStorage.removeItem("gys-reminder-time-v1");\n    setReminderOpen(false);\n    show("Pengingat dinonaktifkan.");\n  };\n\n  const checkOfflinePack = async () => {',
)
replace_once(
    more,
    '''              onClick={() => {\n                setReminderTime("");\n                void saveReminder();\n              }}''',
    '              onClick={disableReminder}',
)
replace_once(
    more,
    '''          <p>\n            Backup hanya memuat preferensi, riwayat baca, bookmark, dan indeks\n            cache. Kata sandi tidak dikirim ke server.\n          </p>''',
    '''          <p>\n            Backup memuat preferensi, progres baca, bookmark, catatan, dan\n            indeks cache. Kata sandi tidak dikirim ke server.\n          </p>''',
)

literature = "apps/web/src/literature.tsx"
replace_once(
    literature,
    'import { Link, useParams, useSearchParams } from "react-router-dom";',
    'import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";',
)
replace_once(
    literature,
    '  const { itemId } = useParams();\n  const [searchParams] = useSearchParams();',
    '  const { itemId } = useParams();\n  const navigate = useNavigate();\n  const [searchParams] = useSearchParams();',
)
replace_once(
    literature,
    '  const [readerOpen, setReaderOpen] = useState(false);\n  const [readerError, setReaderError] = useState("");',
    '''  const [readerOpen, setReaderOpen] = useState(false);\n  const [readerError, setReaderError] = useState("");\n  const closeReader = () => {\n    if (directRead) {\n      navigate("/literatur");\n      return;\n    }\n    setReaderOpen(false);\n  };''',
)
replace_once(
    literature,
    '              onClick={() => setReaderOpen(false)}\n            >\n              Tutup',
    '              onClick={closeReader}\n            >\n              Tutup',
)
