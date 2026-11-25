"""Unpacks the basemap (halifax.pmtiles) into plain tile files: <out>/{z}/{x}/{y}.pbf.

Why: Cloudflare Pages ignores HTTP range requests, which PMTiles needs, so the public site serves each map tile
as its own small file instead. The Halifax extract has about 2,500 tiles, well inside Pages' file limit.
Tiles are written uncompressed; Cloudflare compresses them on the way to the browser.

Usage: python scripts/export_basemap_tiles.py C:/halifax-twin-data/tiles/halifax.pmtiles apps/web/dist/tiles/v
Standard library only. Reads PMTiles spec version 3.
"""
from __future__ import annotations

import gzip
import struct
import sys
from pathlib import Path


def varints(buf: bytes):
    pos = 0
    while pos < len(buf):
        shift = value = 0
        while True:
            b = buf[pos]
            pos += 1
            value |= (b & 0x7F) << shift
            shift += 7
            if b < 0x80:
                break
        yield value


def decompress(data: bytes, kind: int) -> bytes:
    if kind in (0, 1):
        return data
    if kind == 2:
        return gzip.decompress(data)
    raise ValueError(f"compression {kind} is not supported")


def directory(data: bytes):
    it = varints(data)
    n = next(it)
    ids, last = [], 0
    for _ in range(n):
        last += next(it)
        ids.append(last)
    runs = [next(it) for _ in range(n)]
    lengths = [next(it) for _ in range(n)]
    offsets: list[int] = []
    for i in range(n):
        v = next(it)
        offsets.append(offsets[i - 1] + lengths[i - 1] if v == 0 and i > 0 else v - 1)
    return list(zip(ids, offsets, lengths, runs))


def tile_id_to_zxy(tile_id: int) -> tuple[int, int, int]:
    z, acc = 0, 0
    while True:
        count = (1 << z) * (1 << z)
        if tile_id < acc + count:
            break
        acc += count
        z += 1
    t, x, y, n = tile_id - acc, 0, 0, 1 << z
    s = 1
    while s < n:
        rx = 1 & (t // 2)
        ry = 1 & (t ^ rx)
        if ry == 0:
            if rx == 1:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        x += s * rx
        y += s * ry
        t //= 4
        s *= 2
    return z, x, y


def main(src: str, out: str) -> int:
    data = Path(src).read_bytes()
    if data[:7] != b"PMTiles" or data[7] != 3:
        raise SystemExit("not a PMTiles v3 file")
    q = lambda o: struct.unpack_from("<Q", data, o)[0]  # noqa: E731
    root_off, root_len, leaf_off, tile_off = q(8), q(16), q(40), q(56)
    internal, tile_comp = data[97], data[98]
    out_dir = Path(out)
    written = 0

    def walk(off: int, length: int):
        nonlocal written
        for tile_id, offset, size, run in directory(decompress(data[off:off + length], internal)):
            if run == 0:
                walk(leaf_off + offset, size)
                continue
            body = decompress(data[tile_off + offset:tile_off + offset + size], tile_comp)
            for k in range(run):
                z, x, y = tile_id_to_zxy(tile_id + k)
                path = out_dir / str(z) / str(x) / f"{y}.pbf"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
                written += 1

    walk(root_off, root_len)
    print(f"wrote {written} tiles to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
