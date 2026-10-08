import importlib.util
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "apk", Path(__file__).with_name("verify-android-apk.py")
)
apk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk)


class AndroidApkTests(unittest.TestCase):
    def check_archive(self, alignment=16384, abi="arm64-v8a", compression=zipfile.ZIP_DEFLATED):
        library = bytearray(120)
        library[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", library, 18, 183)
        struct.pack_into("<Q", library, 32, 64)
        struct.pack_into("<HH", library, 54, 56, 1)
        struct.pack_into("<IIQQQQQQ", library, 64, 1, 4, 0, 0, 0, 120, 120, alignment)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preview.apk"
            with zipfile.ZipFile(path, "w", compression=compression) as archive:
                archive.writestr(f"lib/{abi}/libgysapp_native_lib.so", library)
            apk.verify_apk(path)

    def test_compatible_compressed_arm64_library(self):
        self.check_archive()

    def test_four_kib_only_library_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "16 KiB"):
            self.check_archive(alignment=4096)

    def test_wrong_abi_or_stored_library_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "only the ARM64"):
            self.check_archive(abi="x86_64")
        with self.assertRaisesRegex(ValueError, "compressed"):
            self.check_archive(compression=zipfile.ZIP_STORED)


if __name__ == "__main__":
    unittest.main()
