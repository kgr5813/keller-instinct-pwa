"""
Generer PWA-ikoner fra keller_instinct_icon.svg.
Kjør én gang: python generate_icons.py
Krever: pip install Pillow
"""
from PIL import Image, ImageDraw
import os

def draw_icon(size):
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Bakgrunn: avrundet rektangel (#0a0a0f)
    radius = int(s * 80 / 680)
    d.rounded_rectangle([0, 0, s-1, s-1], radius=radius, fill=(10, 10, 15, 255))

    # Knivblokk (lys grå, x=170..510, y=0..500 i 680-koordinatsystem)
    bx1 = int(s * 170 / 680)
    bx2 = int(s * 510 / 680)
    by2 = int(s * 500 / 680)
    d.rectangle([bx1, 0, bx2, by2], fill=(226, 226, 226, 255))

    # Vertikale spor
    for nx in [227, 283, 340, 397, 453]:
        lx = int(s * nx / 680)
        d.line([lx, 0, lx, by2], fill=(170, 170, 170, 255), width=max(1, int(s * 5 / 680)))

    # Base på knivblokken
    bby1 = int(s * 400 / 680)
    d.rectangle([bx1 - int(s*5/680), bby1, bx2 + int(s*5/680), by2],
                fill=(232, 232, 232, 255))
    d.line([bx1 - int(s*5/680), bby1, bx2 + int(s*5/680), bby1],
           fill=(170, 170, 170, 255), width=max(1, int(s * 5 / 680)))

    # Rødt øye (radial gradient-simulasjon)
    cx = int(s * 422 / 680)
    cy = int(s * 568 / 680)
    max_r = int(s * 62 / 680)

    glow_stops = [
        (1.0,  (10, 10, 15,   0)),
        (0.55, (10, 10, 15,   0)),
        (0.55, (153, 0, 0,  200)),
        (0.20, (255, 68, 34, 230)),
        (0.0,  (255, 170, 136, 255)),
    ]

    for i in range(max_r, 0, -1):
        t = i / max_r
        r2, g2, b2, a2 = 10, 10, 15, 0
        for j in range(len(glow_stops) - 1):
            t1, c1 = glow_stops[j]
            t2, c2 = glow_stops[j+1]
            if t2 <= t <= t1:
                frac = (t - t2) / (t1 - t2) if (t1 - t2) > 0 else 0
                r2 = int(c1[0] * frac + c2[0] * (1 - frac))
                g2 = int(c1[1] * frac + c2[1] * (1 - frac))
                b2 = int(c1[2] * frac + c2[2] * (1 - frac))
                a2 = int(c1[3] * frac + c2[3] * (1 - frac))
                break
        if a2 > 0:
            d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(r2, g2, b2, a2))

    return img

out_dir = os.path.dirname(os.path.abspath(__file__))
for sz in [180, 192, 512]:
    img = draw_icon(sz)
    path = os.path.join(out_dir, f"icon-{sz}.png")
    img.save(path, "PNG")
    print(f"Lagret {path}")

print("Ferdig!")
