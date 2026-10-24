#!/usr/bin/env python3
"""Build a theme's sprite cache: crop each frame from its image, scale it once, write JSON.

The mod has no image decoder, so it runs this when a theme's cache is missing or stale.
It reads <theme>/theme.json, crops every frame, makes the background clear, scales the
frame to the theme's height, and writes one cache file the mod loads on every start.

Usage: build-theme.py --theme DIR --out FILE [--home DIR] [--height N] [--stamp TEXT]

Only the standard library is needed. A PNG it cannot read (interlaced, 16-bit, or fewer
than 8 bits a channel) is read with Pillow when that is installed.
"""

import argparse
import json
import math
import os
import struct
import sys
import zlib
from pathlib import Path

GLYPHS = "0123456789abcdefghijklmnopqrstuvwxyz"
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def resolve(text, home, base):
    """A path in theme.json: `~/` is the home folder, a relative path is the theme's."""
    if text.startswith("~/"):
        return Path(home) / text[2:]

    path = Path(text)

    return path if path.is_absolute() else Path(base) / path


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def unfilter(raw, width, height, bpp):
    stride = width * bpp
    rows = []
    prev = bytearray(stride)
    pos = 0
    for _ in range(height):
        kind = raw[pos]
        line = bytearray(raw[pos + 1 : pos + 1 + stride])
        pos += 1 + stride
        for i in range(stride):
            left = line[i - bpp] if i >= bpp else 0
            up = prev[i]
            corner = prev[i - bpp] if i >= bpp else 0
            if kind == 1:
                line[i] = (line[i] + left) & 255
            elif kind == 2:
                line[i] = (line[i] + up) & 255
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 255
            elif kind == 4:
                line[i] = (line[i] + paeth(left, up, corner)) & 255
        rows.append(line)
        prev = line

    return rows


def read_png(path):
    """Returns (width, height, RGBA bytes) for an 8-bit, non-interlaced PNG."""
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")

    pos = 8
    idat = bytearray()
    palette = []
    alpha = []
    header = None
    while pos < len(data):
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + size]
        pos += 12 + size
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            palette = [tuple(body[i : i + 3]) for i in range(0, len(body), 3)]
        elif kind == b"tRNS":
            alpha = list(body)
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break

    if header is None:
        raise ValueError("no IHDR chunk")

    width, height, depth, color, _, _, interlace = header
    if depth != 8 or interlace or color not in CHANNELS:
        raise NotImplementedError("needs an 8-bit, non-interlaced PNG")

    bpp = CHANNELS[color]
    out = bytearray()
    for line in unfilter(zlib.decompress(bytes(idat)), width, height, bpp):
        for x in range(width):
            px = line[x * bpp : (x + 1) * bpp]
            if color == 6:
                out += bytes(px)
            elif color == 2:
                out += bytes(px) + b"\xff"
            elif color == 0:
                out += bytes((px[0], px[0], px[0], 255))
            elif color == 4:
                out += bytes((px[0], px[0], px[0], px[1]))
            else:
                r, g, b = palette[px[0]]
                out += bytes((r, g, b, alpha[px[0]] if px[0] < len(alpha) else 255))

    return width, height, bytes(out)


def read_image(path):
    try:
        return read_png(path)
    except NotImplementedError:
        try:
            from PIL import Image
        except ImportError:
            raise SystemExit(f"{path}: needs an 8-bit, non-interlaced PNG (or install Pillow)")

        image = Image.open(path).convert("RGBA")

        return image.width, image.height, image.tobytes()


def crop(image, box):
    width, height, data = image
    x0, y0, w, h = box if box else (0, 0, width, height)
    if x0 < 0 or y0 < 0 or x0 + w > width or y0 + h > height:
        raise ValueError(f"box {list(box)} is outside the {width}x{height} image")

    out = bytearray()
    for y in range(y0, y0 + h):
        out += data[(y * width + x0) * 4 : (y * width + x0 + w) * 4]

    return w, h, bytes(out)


def to_pixels(image, key):
    """Hex colours row-major, None where the pixel is clear or matches the key colour."""
    _, _, data = image
    pixels = []
    for i in range(0, len(data), 4):
        r, g, b, a = data[i : i + 4]
        is_clear = a < 128 or (key is not None and (r, g, b) == tuple(key))
        pixels.append(None if is_clear else f"#{r:02x}{g:02x}{b:02x}")

    return pixels


def luma(colour):
    r, g, b = int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16)

    return 0.3 * r + 0.59 * g + 0.11 * b


def shrink(width, height, pixels, to):
    """Area-averages a frame down to `to` pixels tall, keeping its proportions.

    Each output pixel votes with the source pixels it covers. Dark pixels count for more,
    so outlines survive the scale, and an output pixel that is mostly clear stays clear.
    """
    if to >= height:
        return width, height, pixels

    k = to / height
    out_w = max(1, round(width * k))
    out = []
    for oy in range(to):
        for ox in range(out_w):
            x0, x1 = ox / k, (ox + 1) / k
            y0, y1 = oy / k, (oy + 1) / k
            votes = {}
            for sy in range(int(y0), min(height, math.ceil(y1))):
                for sx in range(int(x0), min(width, math.ceil(x1))):
                    area = (min(x1, sx + 1) - max(x0, sx)) * (min(y1, sy + 1) - max(y0, sy))
                    if area <= 0:
                        continue
                    colour = pixels[sy * width + sx]
                    weight = area * (1.3 if colour and luma(colour) < 90 else 1)
                    votes[colour] = votes.get(colour, 0) + weight
            clear = votes.pop(None, 0)
            if not votes or clear > 0.55 * (x1 - x0) * (y1 - y0):
                out.append(None)
            else:
                out.append(max(votes, key=votes.get))

    return out_w, to, out


def pack(width, height, pixels):
    palette = sorted({p for p in pixels if p})
    if len(palette) > len(GLYPHS):
        raise ValueError(f"{len(palette)} colours is more than one frame can hold ({len(GLYPHS)})")

    glyph = {colour: GLYPHS[i] for i, colour in enumerate(palette)}
    rows = [
        "".join(glyph[p] if p else "." for p in pixels[row * width : (row + 1) * width])
        for row in range(height)
    ]

    return {"w": width, "h": height, "palette": palette, "rows": rows}


def source_of(frame, sheets, home, base):
    """The image file and key colour a frame draws from."""
    sheet = None
    if "sheet" in frame:
        sheet = sheets.get(frame["sheet"])
        if sheet is None:
            raise ValueError(f'unknown sheet "{frame["sheet"]}"')

    # A sheet is an image, or a folder of images that `file` picks from.
    if sheet and "file" in frame:
        path = resolve(sheet["file"], home, base) / frame["file"]
    elif "file" in frame:
        path = resolve(frame["file"], home, base)
    elif sheet:
        path = resolve(sheet["file"], home, base)
    else:
        raise ValueError('needs a "sheet" or a "file"')

    return path, frame.get("key", (sheet or {}).get("key"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--theme", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--home", default=str(Path.home()))
    parser.add_argument("--height", type=int, default=8)
    parser.add_argument("--stamp", default="")
    args = parser.parse_args()

    base = Path(args.theme)
    spec = json.loads((base / "theme.json").read_text())
    sheets = spec.get("sheets", {})
    images = {}
    frames = {}
    problems = []
    for name, frame in spec.get("frames", {}).items():
        try:
            path, key = source_of(frame, sheets, args.home, base)
            if path not in images:
                images[path] = read_image(path)
            image = crop(images[path], frame.get("box"))
            pixels = to_pixels(image, key)
            width, height, pixels = shrink(image[0], image[1], pixels, frame.get("height", args.height))
            frames[name] = pack(width, height, pixels)
        except (OSError, ValueError, zlib.error) as error:
            problems.append(f"{name}: {error}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps({"stamp": args.stamp, "frames": frames}, separators=(",", ":")) + "\n")
    os.replace(tmp, out)
    print(f"built {len(frames)} frames to {out}")
    for line in problems:
        print(f"skipped {line}", file=sys.stderr)

    return 1 if problems and not frames else 0


if __name__ == "__main__":
    sys.exit(main())
