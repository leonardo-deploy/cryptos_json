"""Gera os PNGs da marca cryptos.json Studio a partir da geometria de assets/logo.svg.

Requer Pillow (``pip install Pillow``). Execute a partir da raiz do repositório:

    python tools/generate_icons.py

Os PNGs versionados em ``assets/`` são o resultado deste script. Ao mudar a marca,
edite ``assets/logo.svg`` e a geometria abaixo em conjunto e rode o script de novo.
"""

from __future__ import annotations

from itertools import pairwise
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
GRID = 64.0
SUPERSAMPLE = 8
CORNER_RADIUS = 15.0
STROKE_WIDTH = 3.6
WHITE = (255, 255, 255, 255)

TILE_STOPS = ((0.0, (75, 141, 255)), (0.55, (47, 139, 232)), (1.0, (31, 209, 232)))
GLOSS_ALPHA = 0.28
GLOSS_END = 0.6

# Chave esquerda: mesmos pontos do path em assets/logo.svg (grade 64x64).
LEFT_BRACE = (
    ("c", (20.5, 17.0), (17.5, 17.0), (17.0, 18.6), (17.0, 21.0)),
    ("l", (17.0, 21.0), (17.0, 27.0)),
    ("c", (17.0, 27.0), (17.0, 30.0), (15.5, 31.0), (13.5, 32.0)),
    ("c", (13.5, 32.0), (15.5, 33.0), (17.0, 34.0), (17.0, 37.0)),
    ("l", (17.0, 37.0), (17.0, 43.0)),
    ("c", (17.0, 43.0), (17.0, 45.4), (17.5, 47.0), (20.5, 47.0)),
)

# Barras ascendentes: (x, y, largura, altura, opacidade).
BARS = (
    (23.5, 35.0, 4.5, 8.0, 0.70),
    (29.75, 29.0, 4.5, 14.0, 0.85),
    (36.0, 23.0, 4.5, 20.0, 1.0),
)


# Variante compacta usada no favicon de 32px.
COMPACT_BARS = (
    (25.5, 33.0, 5.5, 10.0, 0.8),
    (33.0, 25.0, 5.5, 18.0, 1.0),
)


def mix(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, ...]:
    return tuple(round(a + (b - a) * t) for a, b in zip(start, end))


def gradient_color(t: float) -> tuple[int, ...]:
    t = min(max(t, 0.0), 1.0)
    for (t0, c0), (t1, c1) in pairwise(TILE_STOPS):
        if t <= t1:
            span = t1 - t0 or 1.0
            return mix(c0, c1, (t - t0) / span)
    return TILE_STOPS[-1][1]


def cubic_points(p0, p1, p2, p3, steps: int = 24):
    for step in range(steps + 1):
        t = step / steps
        u = 1.0 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        yield x, y


def densify(points, spacing: float = 0.7):
    """Reamostra a polilinha para stamps quase contíguos (traço sem emendas)."""
    if not points:
        return []
    dense = [points[0]]
    for (x0, y0), (x1, y1) in pairwise(points):
        length = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        for step in range(1, max(1, int(length / spacing)) + 1):
            t = min(1.0, step * spacing / length) if length else 1.0
            dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return dense


def brace_polyline(segments, mirror: bool = False):
    points: list[tuple[float, float]] = []
    for segment in segments:
        kind = segment[0]
        sampled = [segment[1], segment[2]] if kind == "l" else list(cubic_points(*segment[1:]))
        for x, y in sampled:
            point = (GRID - x if mirror else x, y)
            if not points or point != points[-1]:
                points.append(point)
    return points


def tile_gradient(size: int) -> Image.Image:
    gradient = Image.new("RGB", (size, size))
    pixels = gradient.load()
    for y in range(size):
        row = y / max(size - 1, 1)
        for x in range(size):
            pixels[x, y] = gradient_color((x / max(size - 1, 1) + row) / 2)
    return gradient


def rounded_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def gloss_layer(size: int) -> Image.Image:
    gloss = Image.new("L", (size, size), 0)
    pixels = gloss.load()
    fade = max(GLOSS_END * size, 1.0)
    for y in range(size):
        value = round(255 * GLOSS_ALPHA * max(0.0, 1.0 - y / fade))
        for x in range(size):
            pixels[x, y] = value
    return gloss


def draw_mark(size: int, scale: float, offset: float, bars=BARS) -> Image.Image:
    """Desenha braces e barras brancas em uma camada RGBA do tamanho pedido."""
    layer = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(layer)
    unit = size / GRID * scale

    def place(point: tuple[float, float]) -> tuple[float, float]:
        return (point[0] * unit + offset, point[1] * unit + offset)

    radius = max(0.5, STROKE_WIDTH * unit / 2)
    for mirror in (False, True):
        points = [place(point) for point in brace_polyline(LEFT_BRACE, mirror=mirror)]
        for x, y in densify(points):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=WHITE)

    for x, y, width, height, opacity in bars:
        left, top = place((x, y))
        right, bottom = place((x + width, y + height))
        draw.rounded_rectangle(
            (left, top, right, bottom),
            radius=width / 2 * unit,
            fill=(255, 255, 255, round(255 * opacity)),
        )
    return layer


def render(size: int, *, radius_ratio: float, mark_scale: float, bars=BARS) -> Image.Image:
    canvas = size * SUPERSAMPLE
    radius = canvas * radius_ratio
    tile = tile_gradient(canvas).convert("RGBA")
    tile.paste(Image.new("RGBA", (canvas, canvas), (255, 255, 255, 255)), (0, 0), gloss_layer(canvas))
    inset = canvas * (1 - mark_scale) / 2
    tile.alpha_composite(draw_mark(canvas, mark_scale, inset, bars))
    tile.putalpha(rounded_mask(canvas, radius))
    return tile.resize((size, size), Image.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    rounded = CORNER_RADIUS / GRID
    targets = (
        # Favicon: versão compacta (duas barras) para legibilidade em 32px.
        ("icon-32.png", 32, rounded, 1.08, COMPACT_BARS),
        ("icon-192.png", 192, rounded, 1.0, BARS),
        ("icon-512.png", 512, rounded, 1.0, BARS),
        # iOS aplica a própria máscara: tile sem cantos arredondados próprios.
        ("apple-touch-icon.png", 180, 0.0, 0.92, BARS),
        # Maskable: conteúdo dentro da zona segura central (80%).
        ("icon-maskable-512.png", 512, 0.0, 0.62, BARS),
    )
    for name, size, radius_ratio, mark_scale, bars in targets:
        image = render(size, radius_ratio=radius_ratio, mark_scale=mark_scale, bars=bars)
        image.save(ASSETS / name, optimize=True)
        print(f"{name}: {size}x{size}")


if __name__ == "__main__":
    main()
