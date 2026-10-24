# Elder Realms Online

Game MMORPG farming 2D pixel-art berbasis browser. Repo ini berisi **vertical slice** yang bisa dimainkan: desa kecil, pertanian, slime sebagai musuh pertama, satu NPC quest, satu toko, chat, dan multiplayer real-time.

| Lapisan | Teknologi |
|---|---|
| Game client | Vite, React, TypeScript, Phaser 3, Zustand |
| Logika game bersama | `packages/shared` (TypeScript murni + Zod), dipakai client dan server |
| Server | Cloudflare Worker + Durable Objects (WebSocket, otoritatif) |
| Database | Neon PostgreSQL via Hyperdrive, Drizzle ORM, migrasi SQL |
| Auth | Supabase Auth (JWT diverifikasi di Worker) |

## Struktur

```
apps/web      Frontend (Vite + React + Phaser)
apps/worker   Cloudflare Worker, Durable Object WorldRoom, penyimpanan Neon
packages/shared  Aturan game, konten, simulasi otoritatif, protokol
scripts/import_assets.py  Mengimpor 4 asset pack dari ZIP milik Anda
docs/         Manifest aset, kredit & lisensi, matriks fitur, panduan deploy
```

## Prinsip desain

- **Server otoritatif.** Gerak, serangan, panen, loot, XP, toko, dan quest dihitung server. Client hanya mengirim niat (input), bukan hasil.
- **Waktu server.** Pertumbuhan tanaman dan musim memakai jam server, tidak bisa dipercepat lewat jam browser.
- **Persisten.** Progres tersimpan di Neon dengan versi (optimistic locking). Tidak ada progres di `localStorage`.
- **Shard.** Dunia dibagi menjadi shard Durable Object dengan batas pemain per shard.

## Menjalankan secara lokal

Prasyarat: Node 22+, Python 3.9+ dengan Pillow.

```bash
npm install                      # membuat package-lock.json pertama kali; commit file itu
# 1. Impor aset (ZIP asli Anda, tidak di-download oleh script)
mkdir -p assets-import/original-archives   # taruh 4 ZIP di sini, lihat docs/ASSET_CREDITS.md
python3 scripts/import_assets.py assets-import/original-archives
python3 scripts/import_ui.py assets-import/original-archives   # skin UI (ZIP Free-Basic-Pixel-Art-UI-for-RPG)
# 2. Konfigurasi client + worker (login tamu lokal TANPA Supabase)
cp apps/web/.env.example apps/web/.env.local     # kosongkan VITE_SUPABASE_*, biarkan VITE_DEV_AUTH=true
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # DEV_AUTH=true
# 3. Jalankan (dua terminal)
npm run dev:worker               # ws://localhost:8787/ws (DEV_AUTH aktif, tanpa Neon: penyimpanan di Durable Object)
npm run dev:web                  # http://localhost:5173
```

Jika game menampilkan **"Authentication failed"**: pesan sekarang menyebut penyebabnya. Cek `http://localhost:8787/api/health`; field `auth` menunjukkan mode Worker (`devGuests`, `supabaseUrl`, `hs256Secret`). Aturan: client tamu (`VITE_DEV_AUTH=true`, tanpa kunci Supabase) butuh Worker `DEV_AUTH=true`; client dengan login Supabase butuh Worker dengan `SUPABASE_URL` dari proyek yang sama (dan `SUPABASE_JWT_SECRET` bila proyek memakai HS256).

Buka dua tab browser untuk melihat dua pemain di dunia yang sama. Tombol `VITE_DEV_AUTH=true` memungkinkan bermain sebagai tamu tanpa Supabase (hanya untuk lokal).

## Kontrol

| Aksi | Desktop | Android |
|---|---|---|
| Bergerak | WASD / panah | Joystick kiri-bawah |
| Lari | Shift | Tombol lari |
| Interaksi / olah tanah / tanam / panen | E atau klik | Tombol kanan-bawah |
| Serang | Spasi / F | Tombol serang |
| Inventaris / Skill / Jurnal / Peta | I / K / J / M | Tombol menu |
| Chat | Enter | Tombol chat |
| Tutup panel | Esc | Tombol tutup |

## Pengujian

```bash
npm run typecheck
npm test
npm run build
```

`packages/shared` memiliki 20 test (simulasi, aturan, peta). Test worker memakai PGlite untuk memverifikasi migrasi dan penyimpanan.

## Status

Lihat [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) untuk daftar jujur apa yang sudah ada dan apa yang belum. Panduan produksi ada di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Aset pihak ketiga

Berkas gambar pihak ketiga **tidak** di-commit karena lisensi salah satu pack melarang redistribusi file mentahnya. Lihat [docs/ASSET_CREDITS.md](docs/ASSET_CREDITS.md).
