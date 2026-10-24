#!/usr/bin/env python3
"""Cut the pieces of the CraftPix "Free Basic Pixel Art UI for RPG" pack that the web UI uses.

Usage:  python3 scripts/import_ui.py <dir-with-the-ui-zip-or-the-zip> [--out apps/web/public/assets/ui]

Never downloads anything. Crops fixed, measured rectangles from the pack's PNG sheets (lossless, no scaling)
and writes docs/UI_MANIFEST.json. Requires Python 3.9+, Pillow, numpy.
"""
import argparse, json, shutil, sys, tempfile, zipfile
from pathlib import Path
import numpy as np
from PIL import Image

FRAGMENT = "free-basic-pixel-art-ui"

# name -> (sheet, (x, y, w, h)). Rectangles were measured from the original PNGs (connected components of non-transparent pixels).
PIECES = {
    "panel":        ("Inventory.png", (7, 0, 98, 101)),      # parchment window, green title bar, 9-slice
    "btn":          ("Buttons.png", (212, 142, 42, 13)),     # blank wide button: normal
    "btn_down":     ("Buttons.png", (260, 143, 42, 12)),     # pressed
    "btn_hover":    ("Buttons.png", (308, 142, 42, 13)),     # hover
    "btn_off":      ("Buttons.png", (356, 143, 42, 12)),     # light/disabled-looking
    "sq":           ("Buttons.png", (13, 12, 22, 23)),       # square button: normal
    "sq_down":      ("Buttons.png", (61, 13, 22, 22)),
    "sq_hover":     ("Buttons.png", (109, 12, 22, 23)),
    "close":        ("Main_tiles.png", (355, 290, 11, 11)),  # cream square with an X
    "slot_dark":    ("Inventory.png", (177, 113, 15, 14)),
    "slot_light":   ("Inventory.png", (192, 113, 15, 14)),
    "board":        ("Action_panel.png", (13, 13, 166, 19)), # wooden bar, 9-slice
    "icons":        ("Icons.png", None),                      # whole sheet, for future item/skill icons
}
HUD_SHEET = "character_panel.png"
HUD_ROW = (34, 63)      # y range of the 2nd row (empty portrait circle, empty bars)
HUD_LEFT_X, HUD_RIGHT_X, HUD_W = 1, 97, 86


def find_zip(src: Path) -> Path:
    if src.is_file():
        return src
    for z in sorted(src.rglob("*.zip")):
        if FRAGMENT in z.name.lower().replace(" ", "-").replace("_", "-"):
            return z
    raise SystemExit(f"UI archive (*{FRAGMENT}*.zip) not found in {src}")


def extract(z: Path, dest: Path):
    with zipfile.ZipFile(z) as zf:
        for m in zf.infolist():  # zip-slip guard
            t = (dest / m.filename).resolve()
            if dest.resolve() not in t.parents and t != dest.resolve():
                raise SystemExit(f"unsafe path in {z.name}: {m.filename}")
        zf.extractall(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, default=Path("apps/web/public/assets/ui"))
    ap.add_argument("--manifest", type=Path, default=Path("docs/UI_MANIFEST.json"))
    a = ap.parse_args()
    z = find_zip(a.src)
    a.out.mkdir(parents=True, exist_ok=True)
    entries = []
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        extract(z, root)
        png = next(root.rglob("Inventory.png")).parent
        for name, (sheet, box) in PIECES.items():
            im = Image.open(png / sheet).convert("RGBA")
            if box:
                x, y, w, h = box
                im = im.crop((x, y, x + w, y + h))
            # pad shorter button states to the height of the tallest of their group so border-image slices line up
            if name in ("btn_down", "btn_off"):
                pad = Image.new("RGBA", (im.width, 13), (0, 0, 0, 0)); pad.alpha_composite(im, (0, 0)); im = pad
            if name == "sq_down":
                pad = Image.new("RGBA", (im.width, 23), (0, 0, 0, 0)); pad.alpha_composite(im, (0, 0)); im = pad
            im.save(a.out / f"{name}.png")
            entries.append({"file": f"/assets/ui/{name}.png", "width": im.width, "height": im.height, "sheet": sheet, "box": box})

        # HUD frame: empty portrait circle + empty bar troughs. Bar rectangles are measured from the pack's filled variant.
        sheet = Image.open(png / HUD_SHEET).convert("RGBA")
        y0, y1 = HUD_ROW
        hud = sheet.crop((HUD_LEFT_X, y0, HUD_LEFT_X + HUD_W, y1 + 1))
        hud.save(a.out / "hud.png")
        filled = np.array(sheet.crop((HUD_RIGHT_X, y0, HUD_RIGHT_X + HUD_W, y1 + 1)))
        r, g, b, al = (filled[:, :, i].astype(int) for i in range(4))
        masks = {
            "hp": (r > 190) & (g < 90) & (al > 0),
            "en": (b > 170) & (r < 90) & (g > 110) & (al > 0),
            "xp": (g > 130) & (r < 90) & (b < 90) & (al > 0),
        }
        bars = {}
        for k, m in masks.items():
            ys, xs = np.where(m)
            bars[k] = {"x": int(xs.min()), "y": int(ys.min()), "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1),
                       "color": "#%02x%02x%02x" % tuple(int(v) for v in filled[ys[len(ys) // 2], xs[len(xs) // 2]][:3])}
        # circle (portrait window): the transparent hole is not fully transparent in the sheet, so report the frame size only
        entries.append({"file": "/assets/ui/hud.png", "width": hud.width, "height": hud.height, "sheet": HUD_SHEET, "bars": bars})
        (a.out / "hud.json").write_text(json.dumps(bars, indent=2) + "\n")
        lic = root / "License.txt"
        if lic.exists():
            Path("docs/licenses").mkdir(parents=True, exist_ok=True)
            shutil.copyfile(lic, "docs/licenses/craftpix-free-basic-pixel-art-ui-License.txt")
    a.manifest.parent.mkdir(parents=True, exist_ok=True)
    a.manifest.write_text(json.dumps({"generatedBy": "scripts/import_ui.py", "pack": "craftpix free-basic-pixel-art-ui-for-rpg", "assets": entries}, indent=2) + "\n")
    print(f"imported {len(entries)} UI pieces -> {a.out}")


if __name__ == "__main__":
    main()
