import http.server
import mimetypes
import os
import socketserver
import sys
from pathlib import Path

# Register MIME types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/manifest+json", ".webmanifest")

DIST_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "dist"

if not DIST_DIR.exists() or not (DIST_DIR / "index.html").exists():
    print(f"Error: Dist directory not found at {DIST_DIR}")
    print("Please run `pnpm --filter @gys/web build` first.")
    sys.exit(1)

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def translate_path(self, path):
        clean_path = path.split("?", 1)[0].split("#", 1)[0]
        if clean_path.startswith("/GYSApp-Tauri/"):
            clean_path = clean_path[len("/GYSApp-Tauri"):]
        elif clean_path == "/GYSApp-Tauri":
            clean_path = "/"
        return super().translate_path(clean_path)

    def send_head(self):
        fpath = self.translate_path(self.path)
        if not os.path.exists(fpath):
            clean_path = self.path.split("?", 1)[0].split("#", 1)[0]
            ext = os.path.splitext(clean_path)[1].lower()
            if ext not in [".js", ".mjs", ".wasm", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".json", ".webmanifest", ".map", ".woff", ".woff2", ".ttf"]:
                self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

def run(port=8000):
    while True:
        try:
            with socketserver.TCPServer(("", port), SPAHandler) as httpd:
                print(f"\n========================================================")
                print(f"  GYSApp Python Web Server is running!")
                print(f"  Local URL    : http://localhost:{port}")
                print(f"  Pages Prefix : http://localhost:{port}/GYSApp-Tauri/")
                print(f"  Serving from : {DIST_DIR}")
                print(f"========================================================\n", flush=True)
                httpd.serve_forever()
        except OSError as e:
            if "address already in use" in str(e).lower() or getattr(e, 'errno', None) in (10048, 48, 98):
                print(f"Port {port} in use, trying port {port + 1}...", flush=True)
                port += 1
            else:
                raise

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run(port)
