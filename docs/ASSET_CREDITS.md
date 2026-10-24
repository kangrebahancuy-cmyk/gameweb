# Kredit & Lisensi Aset

Lisensi di bawah ini diverifikasi dari halaman sumber resmi pada 2026-10-23. Periksa ulang sebelum rilis komersial karena halaman dapat berubah.

| Pack | Sumber | Lisensi | Dipakai untuk |
|---|---|---|---|
| Farming Sim Asset Pack (essentials) | vectoraith, https://vectoraith.itch.io/farming-sim-asset-pack | Boleh untuk proyek gratis dan komersial, boleh dimodifikasi. **Dilarang** redistribusi/jual ulang file aslinya atau turunannya apa adanya; dilarang NFT dan pelatihan AI. Kredit tidak diwajibkan. | Tileset medan, bangunan, detail, tanaman; sprite petani dan ternak |
| Farming Set (pixel art) | ScratchIO, https://opengameart.org/content/farming-set-pixel-art | CC0 | Ikon sayur, bibit, kapak; NPC wanita |
| Pixel Art Character | acasas (rilis dari TheGameAssetsMine), https://opengameart.org/content/pixel-art-character | CC0 | Sprite pemain |
| Free Basic Pixel Art UI for RPG | CraftPix, https://craftpix.net/freebies/free-basic-pixel-art-ui-for-rpg/ | CraftPix freebie license, https://craftpix.net/file-licenses/ (salinan: `docs/licenses/craftpix-free-basic-pixel-art-ui-License.txt`) | Seluruh skin UI web: panel, tombol, slot, bar HUD, tombol tutup, papan kayu |
| Free Slime Mobs | CraftPix, https://craftpix.net/freebies/free-slime-mobs-pixel-art-top-down-sprite-pack/ | CraftPix freebie license, https://craftpix.net/file-licenses/ (salinan: `docs/licenses/`) | Slime (saat ini Slime1) |

Catatan: ZIP Farming Set berisi font latar dari dafont (hanya untuk preview, tidak dipakai).

## Mengapa file gambar tidak di-commit

Repo ini publik, dan lisensi vectoraith melarang redistribusi file mentah. `.gitignore` mengecualikan `apps/web/public/assets/{tilesets,farming,monsters}` dan sprite petani. Pemilik membuat ulang file tersebut dengan:

```bash
python3 scripts/import_assets.py assets-import/original-archives
```

Script tidak mengunduh apa pun, hanya mengekstrak ZIP yang Anda sediakan, menyalin berkas yang dipakai game, dan menulis `docs/ASSET_MANIFEST.json` dengan ukuran gambar yang diukur.

ZIP yang diharapkan di `assets-import/original-archives/` (pencocokan berdasarkan fragmen nama):

- `*vectoraith_tileset_farming_sim*.zip`
- `*Farming_Stuff*.zip`
- `*Pixel_Art_Character*.zip`
- `*free-slime-mobs*.zip`

## Aset orisinal

`apps/web/public/assets/items/ero_icons.png` (koin dan Slime Gel) dibuat oleh script import dari pola piksel sendiri, bukan bagian dari pack mana pun.

## Keterbatasan aset yang diketahui

- Pack pemain hanya berisi satu sheet jalan/idle; hanya animasi yang ada di sheet itu yang dipakai.
- Hanya Slime1 yang terhubung ke gameplay. Slime2 dan Slime3 ada di ZIP dan dapat dijadikan definisi monster baru setelah frame-nya divalidasi.
- Hanya sebagian ternak yang diimpor (ayam, sapi putih) dan belum ada sistem peternakan.

## Penempatan aset (diaudit 2026-10-24)

`all-assets/` (di root repo, tidak diserve game) adalah hasil ekstraksi gabungan keempat ZIP. Game hanya memuat file di `apps/web/public/assets/`. Seluruh 19 file di sana ada, ukurannya cocok dengan `docs/ASSET_MANIFEST.json`, dan layout frame yang dipakai kode (slime 64x64: idle 6, walk 8, run 8, attack 10, hurt 5, death 10 frame x 4 arah) cocok dengan gambarnya.

| Dipakai game | Sumber di `all-assets/` |
|---|---|
| `tilesets/farm/*` | `ReShade/16x16/Tilesets (Compact)/` (terrain_spring_expanded, details, buildings, crops) |
| `characters/npc/farmer.png`, `farming/livestock/*` | `ReShade/16x16/Sprites/` |
| `items/*`, `characters/npc/woman_idle.png` | `Vegetables.png`, `Seeds_Cereals.png`, `Stone Axe.png`, `Slavic Woman/Woman_Idle.png` |
| `characters/player/boy.png` | `Pixel Art Character-TheGameAssetsMine-/PNG/` |
| `monsters/slime/slime1_*` | `PNG/Slime1/Without_shadow/` |

Belum dipakai (tersedia untuk fitur berikutnya): Slime2 dan Slime3, varian bayangan, ternak lain (sapi, domba, kambing, kucing, anak sapi), kuda (`Horse/`), buah/hay/peti (`Fruits.png`, `Hay.png`, `Crates And Sacks.png`), kapak besi/berlian, tileset musim lain dan kebun buah, serta varian 32px/48px. Berkas `.aseprite`, `.psd`, dan `__MACOSX` hanya sumber edit, tidak perlu diserve.

**Peringatan lisensi:** repo ini publik dan sekarang memuat seluruh pack vectoraith serta CraftPix di `all-assets/` dan `public/assets/`. Lisensi vectoraith melarang redistribusi file asli. Jadikan repo privat, atau hapus file tersebut dari Git (`git rm -r --cached`) dan simpan hanya lokal.

## Skin UI

Potongan UI dibuat oleh `python3 scripts/import_ui.py <zip UI>` ke `apps/web/public/assets/ui/` (kotak potong terukur, tanpa scaling; daftar di `docs/UI_MANIFEST.json`). `apps/web/src/styles.css` memakainya sebagai 9-slice (`border-image`). Font piksel Silkscreen dimuat dari Google Fonts di `index.html`; jika offline, jatuh ke monospace. Potret HUD memakai sprite pemain (Pixel Art Character), bukan potret bawaan pack.
