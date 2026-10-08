"""Android runtime smoke against the actual packaged APK (no browser mocks)."""
import argparse
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "id.or.gys.app"


def adb(*args, timeout=45):
    result = subprocess.run(["adb", *args], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr).decode(errors="replace"))
    return result.stdout


def alive():
    return bool(adb("shell", "pidof", PACKAGE).strip())


def hierarchy(output, name):
    # Rotation can briefly leave UiAutomator without an idle hierarchy. Unique
    # paths prevent a failed dump from reusing an earlier portrait snapshot.
    last_error = None
    for attempt in range(5):
        path = f"/sdcard/gys-window-{time.monotonic_ns()}.xml"
        try:
            result = adb("shell", "uiautomator", "dump", path)
            (output / f"{name}-dump.txt").write_bytes(result)
            raw = adb("exec-out", "cat", path)
            (output / f"{name}.xml").write_bytes(raw)
            return ET.fromstring(raw)
        except (ET.ParseError, RuntimeError) as error:
            last_error = error
            if not alive():
                raise RuntimeError("App exited while capturing " + name) from error
            if attempt < 4:
                time.sleep(2)
    raise RuntimeError("Unable to capture current hierarchy: " + name) from last_error


def bounds(node):
    values = [int(value) for value in re.findall(r"\d+", node.attrib["bounds"])]
    return tuple(values)


def find_label(tree, label):
    for node in tree.iter("node"):
        values = (node.get("text", ""), node.get("content-desc", ""))
        # Chromium exposes disclosure summaries as a combined account+badge
        # label on Android; accept that exact leading account heading too.
        if any(value == label or (label == "Akun e-GYS" and value.startswith(label + " "))
               for value in values):
            l, t, r, b = bounds(node)
            if r > l and b > t:
                return node
    return None


def wait_label(output, label, name):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if not alive():
            raise RuntimeError("App process exited while waiting for " + label)
        tree = hierarchy(output, name)
        node = find_label(tree, label)
        if node is not None:
            return node
        time.sleep(2)
    print(ET.tostring(tree, encoding="unicode"), flush=True)
    raise RuntimeError("Accessible control not found: " + label)


def capture(output, name):
    tree = hierarchy(output, name)
    webviews = [n for n in tree.iter("node") if n.get("class") == "android.webkit.WebView"]
    if not webviews:
        raise RuntimeError("No accessible application WebView")
    viewport = bounds(webviews[0])
    window = adb("shell", "dumpsys", "window").decode(errors="replace")
    (output / f"{name}-window.txt").write_text(window)
    size = adb("shell", "wm", "size").decode()
    w, h = map(int, re.findall(r"(\d+)x(\d+)", size)[-1])
    # XML root uses the current orientation; wm size reports natural orientation.
    root_bounds = bounds(next(tree.iter("node")))
    if root_bounds[2] > root_bounds[3] and w < h:
        w, h = h, w
    safe = [0, 0, w, h]
    sources = 0
    for line in window.splitlines():
        if "InsetsSource" not in line or not re.search(r"statusBars|navigationBars|displayCutout", line):
            continue
        if re.search(r"(?:mVisible|visible)=false", line):
            continue
        frame = re.search(r"(?:mFrame|frame)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]", line)
        if not frame:
            continue
        l, t, r, b = map(int, frame.groups())
        if r <= l or b <= t:
            continue
        sources += 1
        if l == 0 and r == w:
            if t == 0 and b < h / 4:
                safe[1] = max(safe[1], b)
            if b == h and t > h * 3 / 4:
                safe[3] = min(safe[3], t)
        if t == 0 and b == h:
            if l == 0 and r < w / 4:
                safe[0] = max(safe[0], r)
            if r == w and l > w * 3 / 4:
                safe[2] = min(safe[2], l)
    if not sources:
        raise RuntimeError("System inset sources unavailable in dumpsys")
    if not (viewport[0] >= safe[0] and viewport[1] >= safe[1]
            and viewport[2] <= safe[2] and viewport[3] <= safe[3]):
        raise RuntimeError(f"WebView {viewport} overlaps native safe viewport {safe}")
    screenshot = adb("exec-out", "screencap", "-p")
    if not screenshot.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Native screencap returned an invalid PNG: " + name)
    (output / f"{name}.png").write_bytes(screenshot)
    print(f"PASS {name}: WebView={viewport}, safe={safe}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--android-version", default="17", choices=["16", "17"])
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        try:
            if adb("shell", "getprop", "sys.boot_completed", timeout=10).strip() == b"1":
                break
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(3)
    else:
        raise RuntimeError("Android emulator did not complete boot")
    version = adb("shell", "getprop", "ro.build.version.release").decode().strip()
    if version != args.android_version:
        raise RuntimeError("Expected Android " + args.android_version + ", got " + version)
    # Fresh preview images finish services/ART setup after boot_completed.
    time.sleep(20)
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "wm", "dismiss-keyguard")
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        state = adb("shell", "am", "get-started-user-state", "0").decode().strip()
        if "RUNNING_UNLOCKED" in state:
            break
        time.sleep(2)
    else:
        print(adb("shell", "dumpsys", "user").decode(), flush=True)
        raise RuntimeError("Emulator user remains locked: " + state)
    print("Emulator user: " + state, flush=True)
    print(adb("shell", "df", "-h", "/data").decode(), flush=True)
    adb("install", "-r", args.apk, timeout=180)
    package_info = adb("shell", "dumpsys", "package", PACKAGE)
    (output / "package.txt").write_bytes(package_info)
    print(package_info.decode(errors="replace")[:16000], flush=True)
    component = adb("shell", "cmd", "package", "resolve-activity", "--brief",
                    "-a", "android.intent.action.MAIN", "-c",
                    "android.intent.category.LAUNCHER", PACKAGE).decode().strip().splitlines()[-1]
    if not component.startswith(PACKAGE + "/"):
        raise RuntimeError("Installed APK has no launchable activity: " + component)
    print("Launching installed APK: " + component, flush=True)
    adb("logcat", "-c")
    adb("shell", "am", "start", "-W", "-n", component, timeout=90)
    node = wait_label(output, "Lainnya", "home")
    l, t, r, b = bounds(node)
    print("Tapping More: " + str(node.attrib), flush=True)
    # Coordinates come exclusively from the current UI hierarchy.
    adb("shell", "input", "tap", str((l + r) // 2), str((t + b) // 2))
    wait_label(output, "Akun e-GYS", "more-loaded")
    for _ in range(10):
        if not alive():
            raise RuntimeError("App exited after entering More (credential read)")
        time.sleep(1)
    capture(output, "more-portrait")
    overlays = adb("shell", "cmd", "overlay", "list").decode()
    for overlay, name in [
        ("com.android.internal.systemui.navbar.threebutton", "more-threebutton"),
        ("com.android.internal.systemui.navbar.gestural", "more-gesture"),
        ("com.android.internal.display.cutout.emulation.tall", "more-cutout"),
    ]:
        if overlay not in overlays:
            raise RuntimeError("Required emulator overlay missing: " + overlay)
        adb("shell", "cmd", "overlay", "enable-exclusive", "--category", "--user", "0", overlay)
        time.sleep(3)
        capture(output, name)
    adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
    adb("shell", "settings", "put", "system", "user_rotation", "1")
    time.sleep(4)
    capture(output, "more-landscape-cutout")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", component, timeout=90)
    wait_label(output, "Lainnya", "cold-restart")
    if not alive():
        raise RuntimeError("App exited on cold restart")
    print(f"PASS Android {args.android_version} More/insets/cold-restart smoke", flush=True)


if __name__ == "__main__":
    try:
        main()
    finally:
        parser = argparse.ArgumentParser()
        parser.add_argument("--apk")
        parser.add_argument("--output")
        args, _ = parser.parse_known_args()
        if args.output:
            output = Path(args.output)
            output.mkdir(parents=True, exist_ok=True)
            try:
                logcat = adb("logcat", "-d")
                (output / "logcat.txt").write_bytes(logcat)
                if sys.exc_info()[0] is not None:
                    print(adb("logcat", "-b", "crash", "-d").decode(errors="replace"), flush=True)
                    print(logcat.decode(errors="replace")[-24000:], flush=True)
            except Exception as error:
                (output / "logcat-error.txt").write_text(str(error))
