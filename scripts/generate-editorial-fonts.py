"""Regenerate bundled reading fonts (fonttools 4.61.1, brotli 1.2.0).

Run from any directory. Sources are pinned and checked before subsetting.
The sans derivative is renamed because Adobe reserves the name 'Source'.
"""
from pathlib import Path
import hashlib
import io
import json
import urllib.parse
import urllib.request

import brotli
from fontTools import __version__ as fonttools_version, subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/src/assets/fonts"
COMMIT = "9710da1eacb3be272583c3224dcb70f9da6eadbb"
SOURCES = [
    ("sourcesans3", "SourceSans3[wght].ttf", "gys-reading-sans", "042fe2cc0b933e328410d7acbd0aa6a1873dca5aef81875f4bc214b08825c7b9"),
    ("sourceserif4", "SourceSerif4[opsz,wght].ttf", "source-serif-4", "97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b"),
    ("sourceserif4", "SourceSerif4-Italic[opsz,wght].ttf", "source-serif-4-italic", "15fbc7e4679489a501998c3669272637a6646388ef7e4bd77eebb5bf967a1f42"),
    ("notoserifsc", "NotoSerifSC[wght].ttf", "noto-serif-sc", "050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9"),
]
if fonttools_version != "4.61.1" or brotli.__version__ != "1.2.0":
    raise RuntimeError("Use fonttools==4.61.1 and brotli==1.2.0 for reproducible assets")
OUTPUT.mkdir(parents=True, exist_ok=True)
corpus = "".join(p.read_text() for p in sorted((ROOT / "apps/web/src").rglob("*")) if p.suffix in {".ts", ".tsx", ".json"})
records = []
for family, filename, name, expected_digest in SOURCES:
    base = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl/{family}/"
    url = base + urllib.parse.quote(filename)
    data = urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(data).hexdigest() != expected_digest:
        raise RuntimeError(f"Source checksum mismatch: {filename}")
    license_data = urllib.request.urlopen(base + "OFL.txt", timeout=60).read()
    (OUTPUT / (name + "-OFL.txt")).write_bytes(license_data.replace(b"\r\n", b"\n"))
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    if family == "sourcesans3":
        names = {1: "GYS Reading Sans", 2: "Regular", 3: "GYSReadingSans-Subset-1", 4: "GYS Reading Sans", 6: "GYSReadingSans", 16: "GYS Reading Sans", 17: "Regular", 25: "GYSReadingSans"}
        for record in font["name"].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
    options = subset.Options()
    options.layout_features = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    sub = subset.Subsetter(options=options)
    if family == "notoserifsc":
        chars = {ord(c) for c in corpus if "\u3000" <= c <= "\u9fff" or "\uff00" <= c <= "\uffef"}
    else:
        chars = set(range(0x20, 0x250)) | set(range(0x1e00, 0x1f00)) | set(range(0x2000, 0x2070)) | set(range(0x20a0, 0x20d0)) | {0x2212}
    sub.populate(unicodes=chars)
    sub.subset(font)
    font.flavor = "woff2"
    target = OUTPUT / (name + ".woff2")
    font.save(target)
    generated = target.read_bytes()
    records.append({"file": target.name, "source": url, "sourceSha256": expected_digest, "sha256": hashlib.sha256(generated).hexdigest(), "bytes": len(generated), "license": name + "-OFL.txt"})
    print(target.name, len(generated), flush=True)
(OUTPUT / "provenance.json").write_text(json.dumps({"sourceCommit": COMMIT, "fontTools": fonttools_version, "brotli": brotli.__version__, "fonts": records}, indent=2) + "\n")
