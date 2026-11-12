"""Локальный сервер для папки app/.

  python3 tools/serve.py            → http://localhost:8080 (только этот компьютер)
  python3 tools/serve.py --lan      → ещё и по Wi‑Fi для телефона: http://<IP-компьютера>:8080
  python3 tools/serve.py --port 9000

Через Wi‑Fi (http по IP) приложение открывается и считает, но режим без интернета
браузеры включают только на https или localhost — это проверяется уже на хостинге.
"""
import argparse
import functools
import http.server
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--lan", action="store_true", help="открыть доступ из локальной сети (телефон по Wi‑Fi)")
    args = ap.parse_args()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    handler = functools.partial(Handler, directory=str(APP_DIR))
    with http.server.ThreadingHTTPServer((host, args.port), handler) as srv:
        print(f"Постановка лодки: http://localhost:{args.port}  (папка {APP_DIR})")
        srv.serve_forever()


if __name__ == "__main__":
    main()
