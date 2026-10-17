"""Draws the command cursors (attack, guard, gather, build, ...) in the style of the Tiny Swords pointers.

    python tools/gen_cursors.py                 # writes the PNGs next to the pack's pointers
    python tools/gen_cursors.py --preview p.png # also an 8x preview sheet beside the original arrow

The original pointers (UI/Pointers/01.png ... 06.png) use exactly five colours, a 2px dark outline, no
anti-aliasing, and light from the top-left: white along the top/left inner edges, cream faces, tan and
brown toward the bottom-right. Each icon here is drawn as flat shapes of a few "materials"; the
lighting and the outline are then applied the same way to every icon so the set stays consistent.
"""

import argparse
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
POINTERS = ROOT / "Tiny Swords" / "Tiny Swords (Update 010)" / "UI" / "Pointers"
SIZE = 32

# The pack's pointer palette.
OUTLINE = (0x16, 0x1C, 0x2E)
CREAM = (0xEF, 0xE1, 0xAB)
TAN = (0xD5, 0xB5, 0x83)
BROWN = (0x97, 0x7B, 0x6B)
WHITE = (0xFF, 0xFF, 0xFF)

# Materials: (highlight on top/left edges, face, shade on bottom/right edges).
METAL = (WHITE, CREAM, TAN)  # blades, shield face, hammer head
WOOD = (CREAM, TAN, BROWN)  # handles, trim
DARK = (TAN, BROWN, BROWN)  # grips, meat, deep parts
INK = "ink"  # outline colour drawn inside a shape (separating lines, details)


class Canvas:
    def __init__(self, size=SIZE):
        self.size = size
        self.mat = [[None] * size for _ in range(size)]

    def _put(self, x, y, m):
        if 0 <= x < self.size and 0 <= y < self.size:
            self.mat[y][x] = m

    def fill(self, inside, m):
        """Paints every pixel whose centre satisfies inside(x, y)."""
        for y in range(self.size):
            for x in range(self.size):
                if inside(x + 0.5, y + 0.5):
                    self._put(x, y, m)

    def line(self, p0, p1, width, m, cap=True):
        """A thick segment (square-ish ends unless cap)."""
        (x0, y0), (x1, y1) = p0, p1
        dx, dy = x1 - x0, y1 - y0
        length2 = dx * dx + dy * dy or 1

        def inside(x, y):
            t = ((x - x0) * dx + (y - y0) * dy) / length2
            if not cap and not 0 <= t <= 1:
                return False
            t = min(1, max(0, t))
            px, py = x0 + t * dx, y0 + t * dy
            return math.hypot(x - px, y - py) <= width / 2

        self.fill(inside, m)

    def poly(self, points, m):
        def inside(x, y):
            hit = False
            for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
                if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
                    hit = not hit
            return hit

        self.fill(inside, m)

    def circle(self, cx, cy, r, m):
        self.fill(lambda x, y: math.hypot(x - cx, y - cy) <= r, m)

    def ring(self, cx, cy, r_out, r_in, m):
        self.fill(lambda x, y: r_in <= math.hypot(x - cx, y - cy) <= r_out, m)

    def render(self):
        """Lighting per material region, then a 2px outline with rounded corners around everything."""
        n = self.size
        mat = self.mat
        img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        same = lambda x, y, m: 0 <= x < n and 0 <= y < n and mat[y][x] is m
        for y in range(n):
            for x in range(n):
                m = mat[y][x]
                if m is None:
                    continue
                if m == INK:
                    img.putpixel((x, y), OUTLINE + (255,))
                    continue
                hi, face, shade = m
                # Light from the top-left: a 1px highlight, and a shading band two pixels wide on the
                # bottom/right (deep shade right at the edge), like the pack's arrow.
                if not same(x, y - 1, m) or not same(x - 1, y, m):
                    color = hi
                elif not same(x, y + 1, m) or not same(x + 1, y, m) or not same(x + 1, y + 1, m):
                    color = shade
                elif m is METAL and (not same(x, y + 2, m) or not same(x + 2, y, m)):
                    color = TAN
                else:
                    color = face
                img.putpixel((x, y), color + (255,))
        # Outline: every empty pixel within a rounded 5x5 neighbourhood of the drawing.
        reach = [(dx, dy) for dx in range(-2, 3) for dy in range(-2, 3) if abs(dx) + abs(dy) < 4]
        for y in range(n):
            for x in range(n):
                if mat[y][x] is None and any(
                        0 <= x + dx < n and 0 <= y + dy < n and mat[y + dy][x + dx] is not None for dx, dy in reach):
                    img.putpixel((x, y), OUTLINE + (255,))
        return img


def sword(c, tip, blade=16, flip=False, width=5.0, guard=5.5, grip=5.5):
    """A sword whose point is at `tip`, pointing up-left (or up-right when flipped)."""
    sx = -1 if flip else 1
    ux, uy = sx / math.sqrt(2), 1 / math.sqrt(2)  # from tip toward the hilt
    px, py = uy, -ux  # across the blade
    tx, ty = tip
    gx, gy = tx + ux * blade, ty + uy * blade
    # Blade: straight edges narrowing to the point.
    w = width / 2
    c.poly([(tx, ty),
            (tx + ux * 3 + px * w, ty + uy * 3 + py * w),
            (gx + px * w, gy + py * w),
            (gx - px * w, gy - py * w),
            (tx + ux * 3 - px * w, ty + uy * 3 - py * w)], METAL)
    # Cross-guard, then grip and pommel.
    c.line((gx - px * guard, gy - py * guard), (gx + px * guard, gy + py * guard), 3.4, WOOD)
    end = (gx + ux * grip, gy + uy * grip)
    c.line((gx + ux * 1.8, gy + uy * 1.8), end, 3.0, DARK)
    c.circle(end[0] + ux * 1.6, end[1] + uy * 1.6, 2.4, WOOD)


def icon_attack():
    c = Canvas()
    sword(c, (2.5, 2.5), blade=17)
    return c, (3, 3)


def icon_attack_move():
    c = Canvas()
    # Two swords crossing in the middle, points up, hilts in the bottom corners.
    sword(c, (3, 3), blade=20.5, width=3.8, guard=3.8, grip=3.6)
    sword(c, (29, 3), blade=20.5, width=3.8, guard=3.8, grip=3.6, flip=True)
    return c, (16, 16)


def icon_guard():
    c = Canvas()
    # A heater shield: straight top, curved sides meeting at a point.
    top, bottom, left, right = 4, 28, 6, 26
    mid = (left + right) / 2

    def shield(x, y, inset=0.0):
        if y < top + inset or y > bottom - inset:
            return False
        if y < 15:
            return left + inset <= x <= right - inset
        # Lower half narrows toward the point.
        t = (y - 15) / (bottom - 15)
        half = (right - left) / 2 * math.cos(t * math.pi / 2) - inset
        return abs(x - mid) <= half

    c.fill(shield, WOOD)  # rim
    c.fill(lambda x, y: shield(x, y, 2.2), METAL)  # face
    # Emblem: a cross in the rim's colour.
    c.fill(lambda x, y: shield(x, y, 2.2) and abs(x - mid) < 1.6 and 8 <= y <= 23, WOOD)
    c.fill(lambda x, y: shield(x, y, 2.2) and abs(y - 13) < 1.6 and 9 <= x <= 23, WOOD)
    return c, (16, 16)


def icon_axe():
    c = Canvas()
    c.line((26, 29), (12, 4), 3.6, WOOD)  # handle, poking out above the head
    # Head: a wedge on the handle's left that flares into a wide curved cutting edge.
    def head(x, y):
        if not (2.5 <= x <= 15 and 4 <= y <= 20):
            return False
        # Between the eye (at the handle) and the curved edge on the left.
        edge = 3 + 0.06 * (y - 12) ** 2
        top = 9 - (14 - x) * 0.45
        bottom = 13 + (14 - x) * 0.55
        return x >= edge and top <= y <= bottom
    c.fill(head, METAL)
    c.line((12.6, 7.5), (15.2, 12), 3.2, DARK)  # the eye, where the handle passes through
    return c, (4, 12)


def icon_pickaxe():
    c = Canvas()
    c.line((26, 28), (14, 8), 3.2, WOOD)
    # A curved head across the top of the handle, with points at both ends.
    def head(x, y):
        cx, cy, r = 14, 24, 19
        d = math.hypot(x - cx, y - cy)
        return r - 2.2 <= d <= r + 1.2 and y < 13 and 2 <= x <= 28
    c.fill(head, METAL)
    c.circle(14.5, 6.5, 2.2, DARK)  # the collar where the handle goes through
    return c, (3, 11)


def icon_meat():
    c = Canvas()
    # A drumstick: bone sticking out to the bottom-left, meat at the top-right.
    c.line((7, 25), (14, 18), 3, METAL)
    c.circle(5.2, 24.2, 2.3, METAL)
    c.circle(7.8, 26.8, 2.3, METAL)

    # The meat: a teardrop that swells from the bone toward the top-right.
    def drop(x, y, grow=0.0):
        (ax, ay), (bx, by) = (12.5, 19.5), (20.5, 11.5)
        dx, dy = bx - ax, by - ay
        t = min(1, max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        r = 3.2 + 5.6 * math.sin(t * math.pi / 2) + grow
        return math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= r

    c.fill(drop, DARK)
    c.fill(lambda x, y: drop(x + 1.6, y + 1.6, -2.4), WOOD)  # the lit, browned top
    c.circle(16.8, 9.8, 1.2, METAL)  # a glint
    return c, (16, 16)


def icon_build():
    c = Canvas()
    c.line((26, 29), (13, 13), 3.6, WOOD)  # handle
    # Head: a mallet block lying across the top of the handle (perpendicular to it).
    ux, uy = 1 / math.sqrt(2), 1 / math.sqrt(2)  # along the handle
    px, py = uy, -ux  # across it
    cx, cy = 11, 11
    hl, hw = 8.5, 4.2  # half length (across the handle) and half width (along it)
    c.poly([(cx + px * hl - ux * hw, cy + py * hl - uy * hw),
            (cx + px * hl + ux * hw, cy + py * hl + uy * hw),
            (cx - px * hl + ux * hw, cy - py * hl + uy * hw),
            (cx - px * hl - ux * hw, cy - py * hl - uy * hw)], METAL)
    # Bands near both ends of the head.
    for s in (5.2, -5.2):
        bx, by = cx + px * s, cy + py * s
        c.line((bx - ux * hw, by - uy * hw), (bx + ux * hw, by + uy * hw), 1.3, WOOD, cap=False)
    return c, (7, 7)


def icon_invalid():
    c = Canvas()
    c.ring(16, 16, 12.5, 9.2, METAL)
    c.line((9.5, 9.5), (22.5, 22.5), 3.4, METAL, cap=False)
    return c, (16, 16)


ICONS = {
    "cursor-attack": icon_attack,
    "cursor-attack-move": icon_attack_move,
    "cursor-guard": icon_guard,
    "cursor-wood": icon_axe,
    "cursor-gold": icon_pickaxe,
    "cursor-meat": icon_meat,
    "cursor-build": icon_build,
    "cursor-invalid": icon_invalid,
}


def preview(images, out, scale=8):
    """The original arrow followed by every new cursor, enlarged, on two backgrounds, plus 1x copies."""
    arrow = Image.open(POINTERS / "01.png").convert("RGBA")
    tiles = [("01.png", arrow)] + list(images.items())
    cell = SIZE * scale + 16
    sheet = Image.new("RGBA", (cell * len(tiles), cell * 2 + 64), (0x47, 0xAB, 0xA9, 255))
    sheet.paste((0x8A, 0xB0, 0x4E, 255), (0, cell, sheet.width, cell * 2))
    for i, (_, img) in enumerate(tiles):
        big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        sheet.alpha_composite(big, (i * cell + 8, 8))
        sheet.alpha_composite(big, (i * cell + 8, cell + 8))
        sheet.alpha_composite(img, (i * cell + 8, cell * 2 + 16))
    sheet.save(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", default=str(POINTERS))
    parser.add_argument("--preview", help="write an 8x preview sheet here")
    args = parser.parse_args()

    allowed = {OUTLINE, CREAM, TAN, BROWN, WHITE}
    images = {}
    for name, draw in ICONS.items():
        canvas, hotspot = draw()
        img = canvas.render()
        used = {px[:3] for px in img.getdata() if px[3]}
        assert used <= allowed, f"{name} uses colours outside the palette: {used - allowed}"
        images[name] = img
        img.save(Path(args.out_dir) / f"{name}.png")
        print(f"{name}.png  hotspot {hotspot}")
    if args.preview:
        preview(images, args.preview)


if __name__ == "__main__":
    main()
