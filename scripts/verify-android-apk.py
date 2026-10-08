"""Verify the optimized ARM64 APK's native packaging and 16 KiB ELF alignment."""

import struct
import sys
import zipfile
from pathlib import Path


def verify_apk(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        libraries = [item for item in archive.infolist() if item.filename.endswith(".so")]
        if len(libraries) != 1 or libraries[0].filename != "lib/arm64-v8a/libgysapp_native_lib.so":
            raise ValueError("Preview APK must contain only the ARM64 native library")
        if libraries[0].compress_type != zipfile.ZIP_DEFLATED:
            raise ValueError("JNI library must be compressed for the compact APK")
        library = archive.read(libraries[0])
        if library[:6] != b"\x7fELF\x02\x01" or struct.unpack_from("<H", library, 18)[0] != 183:
            raise ValueError("Expected an ELF64 little-endian AArch64 library")
        offset = struct.unpack_from("<Q", library, 32)[0]
        stride, count = struct.unpack_from("<HH", library, 54)
        loads = 0
        for index in range(count):
            kind, _, file_offset, virtual, _, _, _, alignment = struct.unpack_from(
                "<IIQQQQQQ", library, offset + stride * index
            )
            if kind == 1:
                loads += 1
                if alignment < 16384 or (virtual - file_offset) % 16384:
                    raise ValueError("Native LOAD segment is not 16 KiB compatible")
        if not loads:
            raise ValueError("Native library has no loadable segments")


if __name__ == "__main__":
    path = Path(sys.argv[1])
    verify_apk(path)
    print(f"APK verified: ARM64, compressed JNI, 16 KiB ELF; {path.stat().st_size:,} bytes")
