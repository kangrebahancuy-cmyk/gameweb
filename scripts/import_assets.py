#!/usr/bin/env python3
"""Import the four owner-supplied asset packs into apps/web/public/assets.

Usage:  python3 scripts/import_assets.py <dir-with-zips> [--out apps/web/public/assets]

The script never downloads anything. It looks for the four archives by name
fragment, extracts them to a temp dir, copies ONLY the files the game uses and
writes docs/ASSET_MANIFEST.json with the real, measured image sizes.
Requires: Python 3.9+, Pillow.
"""
import argparse, json, shutil, sys, tempfile, zipfile
from pathlib import Path
from PIL import Image, ImageDraw

PACKS = {
    "farm_vectoraith": "vectoraith_tileset_farming_sim",
    "farming_set": "farming_stuff",
    "player_boy": "pixel_art_character",
    "slime_mobs": "free-slime-mobs",
}


def find_archives(src: Path):
    found = {}
    for z in sorted(src.rglob("*.zip")):
        low = z.name.lower().replace(" ", "_")
        for key, frag in PACKS.items():
            if frag in low:
                found[key] = z
    return found


def extract(z: Path, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(z) as zf:
        for m in zf.infolist():  # zip-slip guard
            target = (dest / m.filename).resolve()
            if dest.resolve() not in target.parents and target != dest.resolve():
                raise SystemExit(f"unsafe path in {z.name}: {m.filename}")
        zf.extractall(dest)


def first(root: Path, pattern: str) -> Path:
    hits = sorted(root.rglob(pattern))
    if not hits:
        raise SystemExit(f"missing file {pattern!r} under {root}")
    return hits[0]


COIN = [
    "................",
    "....111111......",
    "..1122222211....",
    ".112333333211...",
    ".123344443321...",
    "1233455554332...",
    "1234556655432...",
    "1234565565432...",
    "1234565565432...",
    "1234556655432...",
    "1233455554332...",
    ".123344443321...",
    ".112333333211...",
    "..1122222211....",
    "....111111......",
    "................",
]
GEL = [
    "................",
    "................",
    "......1111......",
    "....11222211....",
    "...1223333221...",
    "..122333333221..",
    "..123334433321..",
    ".12333344433321.",
    ".12333443333321.",
    ".12333333333321.",
    ".12233333333221.",
    "..122333333221..",
    "..111222222111..",
    "...1111111111...",
    "................",
    "................",
]
COIN_PAL = {"1": (110, 70, 10), "2": (200, 140, 20), "3": (245, 200, 60), "4": (255, 225, 110), "5": (255, 245, 180)}
GEL_PAL = {"1": (20, 80, 70), "2": (50, 150, 120), "3": (110, 215, 170), "4": (200, 250, 225)}


def draw_icon(rows, pal):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                px[x, y] = pal[ch] + (255,)
    return im.resize((32, 32), Image.NEAREST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, default=Path("apps/web/public/assets"))
    ap.add_argument("--manifest", type=Path, default=Path("docs/ASSET_MANIFEST.json"))
    a = ap.parse_args()
    arch = find_archives(a.src)
    missing = [k for k in PACKS if k not in arch]
    if missing:
        print("MISSING archives:", missing, file=sys.stderr)
        print("Expected in", a.src, "- see docs/ASSET_CREDITS.md for official download URLs.", file=sys.stderr)
        sys.exit(2)
    out = a.out
    entries = []

    def put(src: Path, rel: str, **meta):
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        with Image.open(dst) as im:
            w, h = im.size
            alpha = "A" in im.getbands()
        entries.append({"file": "/assets/" + rel, "width": w, "height": h, "alpha": alpha, **meta})

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        roots = {}
        for k, z in arch.items():
            roots[k] = td / k
            extract(z, roots[k])
        # nested zip inside Farming Stuff (Slavic Woman)
        nested = first(roots["farming_set"], "Slavic Woman.zip")
        extract(nested, roots["farming_set"] / "_woman")

        v = first(roots["farm_vectoraith"], "16x16").parent  # .../ReShade/16x16 parent
        base = [p for p in roots["farm_vectoraith"].rglob("16x16") if p.parent.name == "ReShade"][0]
        comp = base / "Tilesets (Compact)"
        P = "vectoraith_tileset_farmingsims_"
        src_pack = "farm_vectoraith"
        put(comp / (P + "terrain_spring_expanded_reshade.png"), "tilesets/farm/terrain.png", pack=src_pack, tile=16)
        put(comp / (P + "details_reshade.png"), "tilesets/farm/details.png", pack=src_pack, tile=16)
        put(comp / (P + "buildings_reshade.png"), "tilesets/farm/buildings.png", pack=src_pack, tile=16)
        put(comp / (P + "crops_reshade.png"), "tilesets/farm/crops.png", pack=src_pack, tile=16)
        put(base / "Sprites" / "$farmer_reshade.png", "characters/npc/farmer.png", pack=src_pack, frame=[16, 32], layout="3 cols x 4 rows (verified visually: rows = down,left,right,up)")
        put(base / "Sprites" / "$chicken_hen_reshade.png", "farming/livestock/chicken_hen.png", pack=src_pack, frame=[16, 16])
        put(base / "Sprites" / "$cow_white_reshade.png", "farming/livestock/cow_white.png", pack=src_pack, frame=[24, 24])

        fs = first(roots["farming_set"], "Vegetables.png").parent
        put(fs / "Vegetables.png", "items/vegetables.png", pack="farming_set", grid=32, note="32px icons; pumpkin is 64x64 at cell (0,3)")
        put(fs / "Seeds_Cereals.png", "items/seeds_cereals.png", pack="farming_set", grid=32, note="col 0 = seed packets rows 0-4")
        put(fs / "Stone Axe.png", "items/stone_axe.png", pack="farming_set", frame=[32, 32])
        put(roots["farming_set"] / "_woman" / "Slavic Woman" / "Woman_Idle.png", "characters/npc/woman_idle.png", pack="farming_set", frame=[33, 33], frames=6)

        boy = first(roots["player_boy"], "Boy*wlaking*Idle.png")
        put(boy, "characters/player/boy.png", pack="player_boy", frame=[64, 64], columns=10,
            layout={"cols": {"0": "left", "1": "up", "2": "down", "3": "right"}, "walkRows": [0, 1, 2, 3], "idleRows": [5, 6, 7, 8]})

        sl = roots["slime_mobs"] / "PNG" / "Slime1" / "Without_shadow"
        for anim, n in (("Idle", 6), ("Walk", 8), ("Run", 8), ("Attack", 10), ("Hurt", 5), ("Death", 10)):
            put(sl / f"Slime1_{anim}_without_shadow.png", f"monsters/slime/slime1_{anim.lower()}.png", pack="slime_mobs",
                frame=[64, 64], frames=n, rowOrder=["down", "up", "left", "right"])
        lic = roots["slime_mobs"] / "License.txt"
        Path("docs/licenses").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(lic, "docs/licenses/craftpix-free-slime-mobs-License.txt")

    # original (own) icons: coin + slime gel
    icons = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    icons.alpha_composite(draw_icon(COIN, COIN_PAL), (0, 0))
    icons.alpha_composite(draw_icon(GEL, GEL_PAL), (32, 0))
    p = out / "items/ero_icons.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    icons.save(p)
    entries.append({"file": "/assets/items/ero_icons.png", "width": 64, "height": 32, "alpha": True, "pack": "ORIGINAL", "note": "coin (0,0) and slime gel (1,0), original art by this project"})

    a.manifest.parent.mkdir(parents=True, exist_ok=True)
    a.manifest.write_text(json.dumps({"generatedBy": "scripts/import_assets.py", "assets": entries}, indent=2) + "\n")
    print(f"imported {len(entries)} files -> {out}")


if __name__ == "__main__":
    main()
