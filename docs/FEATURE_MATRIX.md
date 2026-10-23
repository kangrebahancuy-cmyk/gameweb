# Feature Matrix

Status: **Complete** (berfungsi dan ada test), **Partial**, **Not implemented**, **Not verified** (kode ada, belum dijalankan di lingkungan build ini).

## Vertical slice

| Fitur | Status | Catatan |
|---|---|---|
| Dunia 2D desa + pertanian dari aset asli | Partial | Dibangun dari tileset vectoraith; belum diverifikasi visual di browser |
| Pemain (sprite Pixel Art Character) | Partial | Hanya animasi jalan/idle yang ada di sheet |
| WASD, lari, interaksi, menu keyboard | Partial | Keybinding ada di `game/input.ts` (belum bisa diubah lewat UI) |
| Joystick Android + tombol | Partial | Kode ada, belum diuji di perangkat |
| Pertanian: olah, tanam, panen, 4 tanaman, ekspansi | Complete (logika) | 20 test di `packages/shared`; waktu server |
| Musim | Partial | Musim dihitung dari jam server; musim memengaruhi tanaman yang boleh ditanam |
| Slime: AI, damage, mati, respawn, loot, XP | Complete (logika) | Semua di server |
| Quest "Slime Trouble" + NPC Old Bram | Complete (logika) | |
| Toko (Mira) beli/jual | Complete (logika) | |
| Inventaris 28 slot | Complete (logika) | |
| Chat publik | Complete (logika) | Disanitasi dan rate-limited |
| Multiplayer shard (Durable Object) | Not verified | Butuh `wrangler dev` dan dua tab |
| Auth Supabase | Not verified | Verifikasi JWT (JWKS/HS256) ada; butuh proyek Supabase |
| Persistensi Neon | Partial | Migrasi + store + test PGlite; butuh Hyperdrive nyata |
| Anti duplikasi / validasi server | Complete (logika) | Rate limit, ukuran pesan, skema Zod, versi karakter |

## Belum diimplementasikan

Skill selain Attack, Strength, Defence, Hitpoints, Farming (18 skill lain hanya terdaftar namanya di `ALL_SKILLS`), equipment, bank, crafting/cooking, quest tambahan (hanya 1 dari 5), pesan privat, teman, party, clan, trading, marketplace, PvP, dungeon, boss, raid, minigame, peternakan, rumah pemain, pet, collection log, achievement, panel admin, leaderboard, halaman berita, penyimpanan avatar Supabase, peta Tiled multi-region.

Fitur-fitur ini tidak memiliki tombol atau menu kosong di game; ditambahkan sebagai sistem nyata satu per satu.

## Lingkungan build sesi ini

Registry npm tidak dapat dijangkau dari sandbox, sehingga `npm install`, build Vite, typecheck web/worker, dan test worker belum dijalankan. Yang dijalankan: typecheck dan 20 test `packages/shared`, serta impor aset dari ZIP asli (hasil identik dengan aset yang ada).
