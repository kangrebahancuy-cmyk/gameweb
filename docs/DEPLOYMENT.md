# Deployment

Tidak ada deployment produksi yang sudah dijalankan atau diverifikasi. Langkah berikut harus Anda jalankan sendiri.

## 1. Supabase (auth)

1. Buat proyek Supabase. Aktifkan Email auth.
2. Salin `Project URL` dan `anon key` ke `apps/web/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Jangan pernah memakai service-role key di browser.
3. Untuk Worker: set `SUPABASE_URL`. Jika proyek memakai JWT legacy HS256, set juga secret `SUPABASE_JWT_SECRET`; jika memakai signing key asimetris, JWKS dipakai otomatis.

## 2. Neon (database)

1. Buat proyek Neon, ambil connection string.
2. Jalankan migrasi: `DATABASE_URL=... npm run db:migrate -w @ero/worker`.

## 3. Cloudflare

1. Buat Hyperdrive: `npx wrangler hyperdrive create ero-neon --connection-string="<neon url>"`, salin ID ke `apps/worker/wrangler.prod.jsonc`.
2. Set `ALLOWED_ORIGINS` di `wrangler.prod.jsonc` ke domain Pages Anda. `DEV_AUTH` harus `false` di produksi (sudah dipaksa di file prod).
3. Deploy Worker: `npm run deploy -w @ero/worker`. Set secret: `npx wrangler secret put SUPABASE_JWT_SECRET -c wrangler.prod.jsonc` bila perlu.
4. Build frontend dengan `VITE_WS_URL=wss://<worker-domain>/ws`, `VITE_DEV_AUTH=false`, lalu deploy ke Pages: `npx wrangler pages deploy apps/web/dist --project-name <nama>`.

## 4. Aset

Aset gambar tidak ada di Git (lihat `docs/ASSET_CREDITS.md`). Jalankan `scripts/import_assets.py` sebelum `npm run build` pada mesin yang memiliki ZIP aslinya, lalu deploy dari mesin itu. CI hanya memeriksa kode, bukan membangun situs dengan aset.

## 5. GitHub Actions

`.github/workflows/ci.yml` menjalankan typecheck dan test pada setiap push/PR. Deploy Worker otomatis (`deploy-worker.yml`) hanya berjalan manual (`workflow_dispatch`) dan butuh secret `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`.

## 6. Backup

Aktifkan point-in-time restore Neon dan ekspor berkala: `pg_dump "$DATABASE_URL" > backup.sql`. Pulihkan dengan `psql "$DATABASE_URL" < backup.sql` ke branch Neon baru.
