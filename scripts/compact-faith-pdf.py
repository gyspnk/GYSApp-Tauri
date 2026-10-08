"""Losslessly deduplicate the audited booklet (requires PyMuPDF==1.26.6)."""

import hashlib
import json
import os
import tempfile
from pathlib import Path

import fitz

if fitz.VersionBind != "1.26.6":
    raise SystemExit("Use the audited PyMuPDF==1.26.6 tool version")

root = Path(__file__).resolve().parents[1]
directory = root / "apps/web/public/assets/faith"
manifest_path = directory / "manifest.json"
manifest = json.loads(manifest_path.read_text())
item = next(item for item in manifest["files"] if item["file"] == "Yesus-Kristus.pdf")
source = directory / item["file"]
if item.get("optimization"):
    raise SystemExit("Audited lossless booklet is already compacted")
if hashlib.sha256(source.read_bytes()).hexdigest() != item["sha256"]:
    raise ValueError("Source PDF does not match its provenance")

handle, temporary = tempfile.mkstemp(suffix=".pdf", dir=directory)
os.close(handle)
candidate = Path(temporary)
try:
    with fitz.open(source) as original:
        verified_pages = original.page_count
        if original.is_form_pdf or original.needs_pass:
            raise ValueError("Do not rewrite interactive or protected PDFs")
        original.save(candidate, garbage=4, deflate=True)
        with fitz.open(candidate) as compact:
            if (
                original.page_count != compact.page_count
                or original.metadata != compact.metadata
                or original.get_toc() != compact.get_toc()
                or original.get_xml_metadata() != compact.get_xml_metadata()
                or original.embfile_names() != compact.embfile_names()
            ):
                raise ValueError("PDF document properties changed")
            for name in original.embfile_names():
                if original.embfile_get(name) != compact.embfile_get(name):
                    raise ValueError("PDF attachment changed")
            for index in range(original.page_count):
                left, right = original[index], compact[index]
                links = lambda page: [
                    {key: value for key, value in link.items() if key not in ("xref", "id")}
                    for link in page.get_links()
                ]
                annotations = lambda page: [(a.type, a.rect, a.info) for a in page.annots()]
                if (
                    left.rect != right.rect or left.rotation != right.rotation
                    or left.get_text() != right.get_text()
                    or links(left) != links(right) or annotations(left) != annotations(right)
                    or left.get_drawings() != right.get_drawings()
                    or left.get_image_info(hashes=True) != right.get_image_info(hashes=True)
                ):
                    raise ValueError(f"PDF content changed on page {index + 1}")
                left_pixels = left.get_pixmap(matrix=fitz.Matrix(2, 2))
                right_pixels = right.get_pixmap(matrix=fitz.Matrix(2, 2))
                if (
                    (left_pixels.width, left_pixels.height, left_pixels.n)
                    != (right_pixels.width, right_pixels.height, right_pixels.n)
                    or hashlib.sha256(left_pixels.samples).digest()
                    != hashlib.sha256(right_pixels.samples).digest()
                ):
                    raise ValueError(f"PDF pixels changed on page {index + 1}")
    bytes_after = candidate.read_bytes()
    if len(bytes_after) >= source.stat().st_size:
        raise ValueError("PDF compaction did not reduce size")
    item["optimization"] = {
        "operation": "lossless-object-deduplication",
        "tool": "PyMuPDF", "version": fitz.VersionBind,
        "sourceBytes": item["bytes"], "sourceSha256": item["sha256"],
        "verifiedPages": verified_pages, "pixelComparisonDpi": 144,
    }
    item["bytes"] = len(bytes_after)
    item["sha256"] = hashlib.sha256(bytes_after).hexdigest()
    candidate.chmod(source.stat().st_mode)
    os.replace(candidate, source)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Verified lossless booklet: {item['bytes']:,} bytes")
finally:
    candidate.unlink(missing_ok=True)
