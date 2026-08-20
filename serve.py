#!/usr/bin/env python3
"""
serve.py — Jalankan GYSApp-Tauri di localhost (dev / preview)

Cara pakai:
  python serve.py                 # dev  -> http://127.0.0.1:5173/
  python serve.py --preview       # preview build -> http://127.0.0.1:4173/
  python serve.py --port 3000     # custom port
  python serve.py --host 0.0.0.0   # listen di semua interface
  python serve.py --open          # buka browser otomatis

Cara stop:
  - Ctrl+C di terminal (paling mudah)
  - ketik q + Enter
  - di Windows: tekan q / x / ESC tanpa Enter (keybind langsung)

Script ini wrapper di atas `pnpm dev` / `pnpm preview` yang sudah
di-fix di apps/web/vite.config.ts:16-25 dan package.json agar
selalu bind ke 127.0.0.1.
"""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

DEFAULT_DEV_HOST = "127.0.0.1"
DEFAULT_DEV_PORT = 5173
DEFAULT_PREVIEW_HOST = "127.0.0.1"
DEFAULT_PREVIEW_PORT = 4173

# Event untuk koordinasi stop antar thread
stop_event = threading.Event()


def find_project_root(start: Path) -> Path:
    """Cari folder yang punya package.json + pnpm-workspace.yaml"""
    cur = start.resolve()
    for p in [cur, *cur.parents]:
        if (p / "package.json").exists() and (p / "pnpm-workspace.yaml").exists():
            return p
        if (p / "apps" / "web" / "package.json").exists():
            return p
    # fallback: asumsi cwd adalah root
    return cur


def check_tool(name: str) -> str | None:
    return shutil.which(name)


def resolve_pnpm() -> str:
    return shutil.which("pnpm") or "pnpm"


def build_command(args, root: Path, pnpm_bin: str) -> tuple[list[str], str]:
    """Return (cmd, url)"""
    if args.preview:
        host = args.host or DEFAULT_PREVIEW_HOST
        port = args.port or DEFAULT_PREVIEW_PORT
        url = f"http://{host}:{port}/"
        if args.host or args.port:
            cmd = [pnpm_bin, "--filter", "@gys/web", "exec", "vite", "preview", "--host", host, "--port", str(port)]
        else:
            cmd = [pnpm_bin, "preview"]
        dist = root / "apps" / "web" / "dist"
        if not dist.exists():
            print(f"[warn] dist belum ada di {dist}", file=sys.stderr)
            print("       jalankan `pnpm build` dulu atau pakai --build", file=sys.stderr)
        return cmd, url
    else:
        host = args.host or DEFAULT_DEV_HOST
        port = args.port or DEFAULT_DEV_PORT
        url = f"http://{host}:{port}/"
        if args.host or args.port:
            cmd = [pnpm_bin, "--filter", "@gys/web", "exec", "vite", "--host", host, "--port", str(port)]
        else:
            cmd = [pnpm_bin, "dev"]
        return cmd, url


def popen_pnpm(cmd: list[str], **kwargs) -> subprocess.Popen:
    """Popen wrapper yang handle .CMD di Windows (butuh shell)."""
    if os.name == "nt":
        # pnpm di Windows adalah pnpm.CMD -> harus lewat shell/cmd.exe
        # gunakan list2cmdline + shell=True agar PATHEXT & .CMD ter-handle
        cmd_str = subprocess.list2cmdline(cmd)
        return subprocess.Popen(cmd_str, shell=True, **kwargs)
    return subprocess.Popen(cmd, **kwargs)


def run_pnpm(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    if os.name == "nt":
        cmd_str = subprocess.list2cmdline(cmd)
        return subprocess.run(cmd_str, shell=True, **kwargs)
    return subprocess.run(cmd, **kwargs)


def terminate_proc(proc: subprocess.Popen):
    """Kill process tree secara graceful, cross-platform."""
    if proc.poll() is not None:
        return
    print("\n[serve.py] menghentikan server...", flush=True)
    try:
        if os.name == "nt":
            # taskkill /T membunuh tree pnpm -> vite -> node
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
        else:
            # POSIX: kill process group
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:
                proc.terminate()
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass

    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                )
            proc.kill()
            proc.wait(timeout=3)
        except Exception:
            pass
    print("[serve.py] server berhenti.", flush=True)


def keyboard_listener_windows():
    """Keybind tanpa Enter untuk Windows (msvcrt). q/x/ESC/Ctrl+C langsung stop."""
    try:
        import msvcrt  # type: ignore

        print("[serve.py] keybind aktif: tekan q / x / ESC untuk stop (tanpa Enter)", flush=True)
        while not stop_event.is_set():
            if msvcrt.kbhit():
                ch = msvcrt.getch()
                # handle special keys (arrow etc. returns b'\xe0' + second byte)
                if ch in (b"q", b"Q", b"x", b"X", b"\x1b", b"\x03"):
                    stop_event.set()
                    try:
                        print(f"\n[serve.py] key '{ch!r}' terdeteksi → stop", flush=True)
                    except Exception:
                        pass
                    break
                # abaikan prefix 0xE0 / 0x00 untuk arrow keys
                if ch in (b"\xe0", b"\x00"):
                    try:
                        msvcrt.getch()
                    except Exception:
                        pass
            time.sleep(0.05)
    except Exception as e:
        try:
            print(f"[serve.py] msvcrt listener error: {e}", flush=True)
        except Exception:
            pass


def keyboard_listener_fallback():
    """Fallback: butuh Enter. Ketik q / x / quit lalu Enter untuk stop. Juga handle PIPE."""
    try:
        print("[serve.py] ketik q + Enter untuk stop (juga via PIPE)", flush=True)
    except Exception:
        pass
    try:
        while not stop_event.is_set():
            line = sys.stdin.readline()
            if not line:
                # EOF — jangan auto-stop. Untuk DEVNULL/PIPE tutup tanpa q,
                # biarkan server tetap jalan; user hentikan via Ctrl+C atau q.
                # Terminal close akan kirim SIGINT/SIGTERM yang ditangani handler.
                break
            cmd = line.strip().lower()
            if cmd in ("q", "x", "quit", "exit", "stop", "qq"):
                stop_event.set()
                try:
                    print(f"[serve.py] input '{cmd}' → stop", flush=True)
                except Exception:
                    pass
                break
            # input lain diabaikan
    except Exception:
        pass


def start_keyboard_thread() -> threading.Thread:
    # kombo: selalu jalankan fallback (untuk q+Enter & PIPE), plus msvcrt untuk tanpa Enter di Windows
    # fallback harus jalan dulu agar test PIPE q\n terdeteksi bahkan saat msvcrt aktif
    t_fallback = threading.Thread(target=keyboard_listener_fallback, daemon=True)
    t_fallback.start()
    if os.name == "nt":
        try:
            import msvcrt  # noqa: F401

            t_win = threading.Thread(target=keyboard_listener_windows, daemon=True)
            t_win.start()
            # return fallback sebagai primary (fallback yang handle PIPE), tapi simpan referensi win agar tidak GC
            # simpan di global agar tidak hilang
            global _win_thread
            _win_thread = t_win
            return t_fallback
        except ImportError:
            pass
    return t_fallback


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Jalankan GYSApp-Tauri di localhost (wrapper pnpm dev/preview)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Contoh:\n  python serve.py\n  python serve.py --preview\n  python serve.py --port 3000 --open\n  python serve.py --host 0.0.0.0",
    )
    parser.add_argument("--preview", action="store_true", help="jalankan preview build (default: dev)")
    parser.add_argument("--host", type=str, default=None, help="custom host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=None, help="custom port (dev 5173, preview 4173)")
    parser.add_argument("--open", action="store_true", help="buka browser otomatis setelah server ready")
    parser.add_argument("--build", action="store_true", help="jika --preview dan dist belum ada, jalankan pnpm build dulu")
    args = parser.parse_args()

    root = find_project_root(Path.cwd())
    os.chdir(root)
    print(f"[serve.py] project root: {root}", flush=True)

    pnpm_bin = resolve_pnpm()
    pnpm_path = check_tool("pnpm")
    if not pnpm_path:
        print("[error] pnpm tidak ditemukan di PATH.", file=sys.stderr)
        print("        install via `corepack enable` atau https://pnpm.io/installation", file=sys.stderr)
        return 1

    node = check_tool("node")
    if node:
        try:
            ver = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=3)
            print(f"[serve.py] node {ver.stdout.strip()} | pnpm {pnpm_path}", flush=True)
        except Exception:
            print(f"[serve.py] pnpm {pnpm_path}", flush=True)

    # optional build step
    if args.preview and args.build:
        dist = root / "apps" / "web" / "dist"
        if not dist.exists():
            print("[serve.py] dist belum ada → menjalankan pnpm build...", flush=True)
            ret = run_pnpm([pnpm_bin, "build"])
            if ret.returncode != 0:
                print("[error] build gagal, preview dibatalkan", file=sys.stderr)
                return ret.returncode

    cmd, url = build_command(args, root, pnpm_bin)
    mode = "preview" if args.preview else "dev"
    print(f"[serve.py] mode: {mode}", flush=True)
    print(f"[serve.py] cmd : {' '.join(cmd)}", flush=True)
    print(f"[serve.py] url : {url}", flush=True)
    if args.preview:
        print(f"[serve.py] note: preview production base = {url}GYSApp-Tauri/", flush=True)
    print("[serve.py] stop: Ctrl+C  |  q + Enter  |  (Windows) q/x/ESC tanpa Enter", flush=True)
    print("-" * 60, flush=True)

    # start keyboard listener
    kb_thread = start_keyboard_thread()

    # siapkan subprocess
    # - Di POSIX pakai preexec_fn=os.setsid agar bisa kill group
    # - Di Windows pakai CREATE_NEW_PROCESS_GROUP
    # - stdin DEVNULL agar input q/x tidak dicuri oleh vite/pnpm child
    popen_kwargs: dict = {"cwd": str(root), "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        popen_kwargs["preexec_fn"] = os.setsid  # type: ignore

    try:
        proc = popen_pnpm(cmd, **popen_kwargs)  # inherit stdio biar log vite terlihat
    except FileNotFoundError as e:
        print(f"[error] gagal menjalankan {' '.join(cmd)}: {e}", file=sys.stderr)
        return 1

    # handler Ctrl+C (SIGINT) & SIGTERM
    original_sigint = signal.getsignal(signal.SIGINT)
    original_sigterm = signal.getsignal(signal.SIGTERM) if hasattr(signal, "SIGTERM") else None

    def sig_handler(signum, frame):
        print(f"\n[serve.py] signal {signum} diterima → stop", flush=True)
        stop_event.set()
        terminate_proc(proc)

    try:
        signal.signal(signal.SIGINT, sig_handler)
        if hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, sig_handler)
    except ValueError:
        # signal hanya bisa di main thread (sudah main thread, tapi jaga-jaga)
        pass

    # auto open browser (delay 1.5 detik biar vite sempat ready)
    if args.open:

        def _open():
            time.sleep(1.8)
            if proc.poll() is None and not stop_event.is_set():
                print(f"[serve.py] membuka browser: {url}", flush=True)
                try:
                    webbrowser.open(url)
                except Exception as e:
                    print(f"[warn] gagal buka browser: {e}", file=sys.stderr)

        threading.Thread(target=_open, daemon=True).start()

    # main wait loop: cek stop_event & proc exit
    try:
        while True:
            if stop_event.is_set():
                terminate_proc(proc)
                break
            ret = proc.poll()
            if ret is not None:
                # vite exit sendiri (error atau user tutup)
                if ret == 0:
                    print(f"[serve.py] server exit normal (code {ret})", flush=True)
                else:
                    print(f"[serve.py] server exit dengan code {ret}", file=sys.stderr)
                break
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\n[serve.py] KeyboardInterrupt (Ctrl+C) → stop", flush=True)
        stop_event.set()
        terminate_proc(proc)
    finally:
        # restore signal
        try:
            signal.signal(signal.SIGINT, original_sigint)
            if original_sigterm is not None and hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, original_sigterm)
        except Exception:
            pass
        # pastikan proc benar-benar mati
        if proc.poll() is None:
            terminate_proc(proc)
        # beri waktu thread keyboard selesai (daemon, tidak block lama)
        stop_event.set()

    return proc.returncode if proc.returncode is not None else 0


if __name__ == "__main__":
    sys.exit(main())
