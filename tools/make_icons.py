"""Рисует PNG-иконки приложения без сторонних библиотек (SDF + сглаживание).

Запуск:  python3 tools/make_icons.py
Результат: app/icons/*.png и app/icons/favicon.svg
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"

BG = (11, 42, 60)
INK = (230, 241, 245)
TEAL = (60, 198, 176)
FISH = (255, 154, 60)

BOAT = [(0.42, 0.42), (0.58, 0.42), (0.58, 0.58), (0.50, 0.70), (0.42, 0.58)]


def sd_circle(x, y, cx, cy, r):
    return math.hypot(x - cx, y - cy) - r


def sd_ring(x, y, cx, cy, r, w):
    return abs(math.hypot(x - cx, y - cy) - r) - w / 2


def sd_segment(x, y, ax, ay, bx, by, w):
    px, py, ex, ey = x - ax, y - ay, bx - ax, by - ay
    t = max(0.0, min(1.0, (px * ex + py * ey) / (ex * ex + ey * ey)))
    return math.hypot(px - ex * t, py - ey * t) - w / 2


def sd_round_box(x, y, half, r):
    qx = abs(x - 0.5) - (half - r)
    qy = abs(y - 0.5) - (half - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_polygon(x, y, v):
    d = (x - v[0][0]) ** 2 + (y - v[0][1]) ** 2
    s = 1.0
    n = len(v)
    for i in range(n):
        j = i - 1
        ex, ey = v[j][0] - v[i][0], v[j][1] - v[i][1]
        wx, wy = x - v[i][0], y - v[i][1]
        t = max(0.0, min(1.0, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
        bx, by = wx - ex * t, wy - ey * t
        d = min(d, bx * bx + by * by)
        c = (y >= v[i][1], y < v[j][1], ex * wy > ey * wx)
        if all(c) or not any(c):
            s = -s
    return s * math.sqrt(d)


def shapes(rounded):
    bg = (lambda x, y: sd_round_box(x, y, 0.5, 0.22)) if rounded else (lambda x, y: -1.0)
    yield bg, BG
    yield (lambda x, y: sd_ring(x, y, 0.5, 0.5, 0.31, 0.035)), INK
    for ang in (90, 180, 270):  # засечки 3, 6, 9 часов
        a = math.radians(ang)
        sx, sy = math.sin(a), -math.cos(a)
        yield (lambda x, y, sx=sx, sy=sy: sd_segment(
            x, y, 0.5 + sx * 0.29, 0.5 + sy * 0.29, 0.5 + sx * 0.235, 0.5 + sy * 0.235, 0.03)), INK
    yield (lambda x, y: sd_segment(x, y, 0.5, 0.42, 0.5, 0.21, 0.028)), TEAL
    yield (lambda x, y: sd_polygon(x, y, BOAT)), INK
    yield (lambda x, y: sd_circle(x, y, 0.5, 0.19, 0.062)), FISH


def render(size, rounded):
    layers = list(shapes(rounded))
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter: none
        y = (py + 0.5) / size
        for px in range(size):
            x = (px + 0.5) / size
            r = g = b = a = 0.0
            for sdf, (cr, cg, cb) in layers:
                cov = max(0.0, min(1.0, 0.5 - sdf(x, y) * size))
                if cov <= 0:
                    continue
                # «поверх» в непремультиплицированных цветах
                na = cov + a * (1 - cov)
                r = (cr * cov + r * a * (1 - cov)) / na
                g = (cg * cov + g * a * (1 - cov)) / na
                b = (cb * cov + b * a * (1 - cov)) / na
                a = na
            row += bytes((round(r), round(g), round(b), round(a * 255)))
        rows.append(bytes(row))
    return png(size, size, b"".join(rows))


def png(w, h, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0b2a3c"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#e6f1f5" stroke-width="3.5"/>
  <path d="M79 50h-5.5M50 79v-5.5M21 50h5.5" stroke="#e6f1f5" stroke-width="3" stroke-linecap="round"/>
  <path d="M50 42V21" stroke="#3cc6b0" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M42 42h16v16l-8 12-8-12z" fill="#e6f1f5"/>
  <circle cx="50" cy="19" r="6.2" fill="#ff9a3c"/>
</svg>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, True),
        ("icon-maskable-512.png", 512, False),  # Android сам обрежет по форме
        ("apple-touch-icon.png", 180, False),   # iOS сам скруглит углы
    ]
    for name, size, rounded in jobs:
        (OUT / name).write_bytes(render(size, rounded))
        print("готово:", name)
    (OUT / "favicon.svg").write_text(FAVICON, encoding="utf-8")
    print("готово: favicon.svg")


if __name__ == "__main__":
    main()
