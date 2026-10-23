# Kredit & Lisensi Aset

Lisensi di bawah ini diverifikasi dari halaman sumber resmi pada 2026-10-23. Periksa ulang sebelum rilis komersial karena halaman dapat berubah.

| Pack | Sumber | Lisensi | Dipakai untuk |
|---|---|---|---|
| Farming Sim Asset Pack (essentials) | vectoraith, https://vectoraith.itch.io/farming-sim-asset-pack | Boleh untuk proyek gratis dan komersial, boleh dimodifikasi. **Dilarang** redistribusi/jual ulang file aslinya atau turunannya apa adanya; dilarang NFT dan pelatihan AI. Kredit tidak diwajibkan. | Tileset medan, bangunan, detail, tanaman; sprite petani dan ternak |
| Farming Set (pixel art) | ScratchIO, https://opengameart.org/content/farming-set-pixel-art | CC0 | Ikon sayur, bibit, kapak; NPC wanita |
| Pixel Art Character | acasas (rilis dari TheGameAssetsMine), https://opengameart.org/content/pixel-art-character | CC0 | Sprite pemain |
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
