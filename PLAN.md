# 🏗️ PLAN: Website Dataset Publik Kabupaten Wonosobo

## 📊 Hasil Eksplorasi Sumber Data

| Metrik | Nilai |
|--------|-------|
| Platform | CKAN 2.10.4 |
| Total Dataset | **2,289** |
| Total Organisasi (OPD) | **25** |
| Format Dominan | **XLSX (99%)**, CSV (1%) |
| API Akses | Publik, tanpa auth, rate-limit perlu hati-hati |
| Download Langsung | ✅ Bisa via resource URL |
| Struktur XLSX | Multi-sheet, ada letterhead di sheet pertama |

## 🔑 GitHub

Repo: https://github.com/amatsenopati700/DataPemkab.git
PAT: Disimpan di git credential-store (bukan di repo)

## ✅ Keputusan User

1. Semua 2,289 dataset di-ingest
2. File .md disimpan di filesystem `/docs` **dan** di DB (`markdownContent`)
3. Filter data terbaru (`isLatest = true`)
4. Dark mode: Ya
5. Priority: Data lengkap dulu, baru UI

## 🚀 Deployment (Vercel + PostgreSQL)

### Arsitektur

```
┌─────────────────────────────────────────────────┐
│                   VERCEL                        │
│  ┌─────────────────────────────────────────┐    │
│  │         Next.js 16 App Router            │    │
│  │  ┌───────────┐  ┌────────────────────┐  │    │
│  │  │ Frontend   │  │ API Routes         │  │    │
│  │  │ (React)   │  │ /api/stats         │  │    │
│  │  │           │  │ /api/datasets      │  │    │
│  │  │ Dark Mode │  │ /api/datasets/[id] │  │    │
│  │  │ Responsive│  │ /api/data/[tableId]│  │    │
│  │  └───────────┘  └────────┬───────────┘  │    │
│  └─────────────────────────┼───────────────┘    │
│                            │                     │
└────────────────────────────┼─────────────────────┘
                             │ Prisma + pg adapter
                             │ (connection pooling)
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    │  (Neon/Supabase/│
                    │   Vercel Postgres│
                    │   /any PG)      │
                    └─────────────────┘

┌─────────────────────────────────────────────────┐
│            LOKAL (Ingestion Only)                │
│  ┌─────────────────────────────────────────┐    │
│  │   mini-services/ingestion-service        │    │
│  │   - Crawl CKAN metadata (2,289 datasets) │    │
│  │   - Download & parse XLSX files          │    │
│  │   - Generate .md files to /docs          │    │
│  │   - Push all data to PostgreSQL          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Cara Deploy ke Vercel

#### 1. Siapkan Database PostgreSQL

Pilih salah satu (semua gratis tier):
- **[Neon](https://neon.tech)** — Recommended, serverless, auto-scaling
- **[Supabase](https://supabase.com)** — Free 500MB
- **[Vercel Postgres](https://vercel.com/storage/postgres)** — Terintegrasi langsung

Setelah buat database, catat 2 connection string:
- **Pooled URL** (port 6543 / `-pooler` hostname) → `DATABASE_URL`
- **Direct URL** (port 5432) → `DIRECT_URL`

#### 2. Set Environment Variables di Vercel

Di **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Value | Keterangan |
|----------|-------|------------|
| `DATABASE_URL` | `postgresql://user:pass@host-pooler:6543/db?sslmode=require` | Pooled connection |
| `DIRECT_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | Direct connection (untuk migrasi) |

#### 3. Deploy

```bash
# Pertama kali: push ke GitHub, lalu connect repo di Vercel
git push origin main
```

Vercel otomatis:
1. `bun install` → trigger `postinstall: prisma generate`
2. Build → `prisma db push` (auto-create tables) → `next build`
3. Deploy → Serverless functions siap melayani request

#### 4. Ingest Data (Lokal, sekali saja)

```bash
# Di lokal, set DATABASE_URL di .env.local
cp .env.example .env.local
# Edit .env.local, isi DATABASE_URL dan DIRECT_URL

# Push schema & jalankan ingestion
bun run db:push
cd mini-services/ingestion-service
bun install
DATABASE_URL="..." bun run dev
```

### Kenapa Arsitektur Ini?

| Aspek | Solusi | Alasan |
|-------|--------|--------|
| **DB** | PostgreSQL (bukan SQLite) | Vercel filesystem read-only, butuh DB external |
| **Connection Pooling** | `@prisma/adapter-pg` + `pg` Pool | Mencegah connection exhaustion di serverless |
| **Schema Migrasi** | `prisma db push` di build | Auto-create tables saat deploy |
| **Ingestion** | Lokal saja (mini-service) | Proses berat 2000+ file, tidak cocok di serverless |
| **.md Files** | DB (`markdownContent`) + `/docs` lokal | Di Vercel baca dari DB, di simpan juga lokal via ingestion service |

### Contoh DATABASE_URL per Provider

**Neon:**
```
DATABASE_URL=postgresql://neondb_owner:xxx@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://neondb_owner:xxx@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
```
> Neon sudah built-in pooling, jadi kedua URL bisa sama.

**Supabase:**
```
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
```

**Vercel Postgres:**
> Otomatis di-set oleh Vercel, tidak perlu manual.