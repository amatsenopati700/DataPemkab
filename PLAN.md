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
| Struktur XLSX | Multi-sheet, ada letterhead kop surat, merged cells, header di baris 2-3 |

### Top 5 Organisasi (dataset terbanyak)
1. DINAS KESEHATAN — 299 datasets
2. Dinas Pangan, Pertanian dan Perikanan — 215 datasets
3. Dinas Pariwisata dan Kebudayaan — 140 datasets
4. DISDAGKOPUKM — 135 datasets
5. DINSOSPMD — 127 datasets

---

## 🗺️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                    NEXT.JS 16 APP (Port 3000)            │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Frontend UI  │  │  API Routes  │  │  Mini Service  │  │
│  │  (React/TS)   │  │  (/api/*)    │  │  (Ingestion)   │  │
│  └───────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│          │                 │                   │          │
│          └────────────┬────┘───────────────────┘          │
│                       ▼                                  │
│              ┌─────────────────┐                          │
│              │  SQLite (Prisma) │                          │
│              │  - organizations │                          │
│              │  - datasets      │                          │
│              │  - resources     │                          │
│              │  - data_tables   │                          │
│              │  - columns       │                          │
│              │  - data_rows     │                          │
│              └─────────────────┘                          │
└─────────────────────────────────────────────────────────┘
         ▲
         │  CKAN API (opendata.wonosobokab.go.id/api/3/)
         │  + XLSX Download
         ▼
┌────────────────────────┐
│  Sumber Data Eksternal  │
│  2,289 datasets XLSX    │
└────────────────────────┘
```

---

## 📋 PHASE 1: Foundation & Database Schema

**Tujuan:** Setup project Next.js + Prisma schema lengkap + dasar UI

### 1.1 Prisma Schema Design
- `Organization` — id, name, title, description, image_url, package_count
- `Dataset` — id, name, title, notes, organization_id, license_id, metadata_created, metadata_modified, state
- `Resource` — id, dataset_id, name, format, size, url, mimetype, hash
- `DataTable` — id, resource_id, dataset_id, sheet_name, row_count, col_count, headers_json
- `DataColumn` — id, table_id, col_index, col_name, col_type
- `DataRow` — id, table_id, row_index, values_json (JSON string of all values per row)
- `Tag` — id, name, display_name
- `DatasetTag` — dataset_id, tag_id
- `IngestionLog` — id, dataset_name, status, error_message, started_at, completed_at

### 1.2 Project Structure
```
src/
  app/
    page.tsx              ← Homepage
    api/
      datasets/route.ts   ← List/search datasets
      datasets/[id]/route.ts ← Dataset detail
      organizations/route.ts
      data/[tableId]/route.ts ← Table data with pagination
      ingestion/status/route.ts ← Ingestion progress
  components/
    ui/                   ← shadcn/ui
    dataset-card.tsx
    organization-card.tsx
    data-table-viewer.tsx
    search-bar.tsx
    stats-overview.tsx
    ingestion-progress.tsx
  lib/
    db.ts                 ← Prisma client
    ckan.ts               ← CKAN API client
  types/
    index.ts
mini-services/
  ingestion-service/      ← Port 3001
    index.ts
    ckan-crawler.ts       ← Crawl metadata
    xlsx-downloader.ts    ← Download XLSX files
    xlsx-parser.ts        ← Parse XLSX → structured data
    csv-converter.ts      → Convert to CSV
    md-generator.ts       → Generate .md with YAML frontmatter
```

### 1.3 Deliverables
- [ ] Prisma schema final
- [ ] `bun run db:push` berhasil
- [ ] Project structure terbentuk

---

## 📋 PHASE 2: CKAN Metadata Ingestion (Mini Service)

**Tujuan:** Tarik semua metadata 2,289 dataset dari CKAN API, simpan ke SQLite

### 2.1 Mini Service: Ingestion Service (Port 3001)
- Service standalone dengan `bun --hot`
- Endpoints: `/api/start-ingestion`, `/api/status`, `/api/stop`

### 2.2 CKAN Crawler Module
- `GET /api/3/action/organization_list?all_fields=true` → simpan 25 orgs
- `GET /api/3/action/package_list?limit=2289` → dapat semua dataset names
- Loop: `GET /api/3/action/package_show?id={name}` → simpan dataset + resources + tags
- Rate limiting: 2 req/sec (respectful)
- Progress tracking via IngestionLog
- Resumable: skip yang sudah ter-ingest

### 2.3 Batch Strategy
- Process 50 datasets per batch
- Simpan progress ke DB setiap batch
- Error handling: log error, lanjut ke next

### 2.4 Deliverables
- [ ] Ingestion service berjalan di port 3001
- [ ] 25 organizations tersimpan di DB
- [ ] 2,289 dataset metadata tersimpan di DB
- [ ] Resource metadata (URL, format, size) tersimpan
- [ ] Tags tersimpan dengan relasi

---

## 📋 PHASE 3: XLSX Download & Smart Parsing

**Tujuan:** Download semua file XLSX, parse jadi data terstruktur, simpan ke SQLite

### 3.1 XLSX Downloader
- Download file dari resource URL
- Simpan sementara ke `data/raw/` (opsional, untuk debug)
- Validate: cek file size, cek mimetype, cek bisa dibuka
- Skip non-XLSX (PDF, dll) — log saja
- Rate limiting: 1 download/2 detik

### 3.2 Smart XLSX Parser
Ini bagian **kritis** karena data XLSX Pemkab punya pola khusus:

**Pola yang terdeteksi:**
- Sheet 1-2: Letterhead kop surat (PEMERINTAH KABUPATEN WONOSOBO...)
- Sheet 3+: Data sebenarnya
- Baris 1-3: Header merged cells, baris kosong
- Baris 3-4: Header kolom sebenarnya (NO, NAMA, JUMLAH, dll)
- Data mulai baris setelah header

**Strategi Parsing:**
1. Scan semua sheets, identifikasi sheet dengan data terbanyak kolom+baris
2. Untuk sheet terpilih: skip baris kosong di atas
3. Deteksi header: baris pertama yang punya > 2 kolom non-null
4. Handle merged cells: ambil value dari cell kiri-atas
5. Deteksi tipe data kolom: number, string, percentage, date
6. Simpan: DataTable (metadata sheet), DataColumn (header + type), DataRow (values)

### 3.3 Data Storage Strategy
- Setiap sheet XLSX → 1 DataTable record
- Values per baris disimpan sebagai JSON string di `values_json`
- Ini efisien untuk query dan pagination
- Contoh: `{["1", "WADASLINTANG", "18097", "18097", "100.0", "17674", "97.66"]}`

### 3.4 Deliverables
- [ ] Semua XLSX berhasil didownload (est. ~2,200 files)
- [ ] Parsing berhasil dengan smart header detection
- [ ] Data terstruktur tersimpan di DataTable, DataColumn, DataRow
- [ ] Error log untuk file yang gagal parse

---

## 📋 PHASE 4: Markdown Metadata Generation (.md dengan YAML frontmatter)

**Tujuan:** Untuk setiap dataset, generate file `.md` dengan YAML frontmatter yang enak dibaca

### 4.1 Format Markdown Output
Setiap dataset menghasilkan 1 file `.md`:

```markdown
---
title: "AKSES SANITASI LAYAK KABUPATEN WONOSOBO TAHUN 2024 TRIWULAN"
slug: akses-sanitasi-layak-kabupaten-wonosobo-tahun-2024-triwulan
organization: Dinas Pekerjaan Umum dan Penataan Ruang
organization_slug: dinas-pekerjaan-umum-dan-penataan-ruang
source_url: https://opendata.wonosobokab.go.id/dataset/0fc3683a-...
license: cc-by
format: XLSX
file_size: 58985
download_url: https://opendata.wonosobokab.go.id/id/dataset/.../download/...
created_at: 2024-08-15T10:30:00Z
modified_at: 2026-02-24T02:39:27Z
tags:
  - sanitasi
  - infrastruktur
tables:
  - sheet: "Table 3"
    rows: 18
    columns: 7
    headers:
      - { index: 0, name: "NO", type: "integer" }
      - { index: 1, name: "KECAMATAN", type: "string" }
      - { index: 2, name: "JUMLAH KK", type: "integer" }
      - { index: 3, name: "JUMLAH (RT AKSES SANITASI)", type: "integer" }
      - { index: 4, name: "% (RT AKSES SANITASI)", type: "float" }
      - { index: 5, name: "JUMLAH (AIR LIMBAH)", type: "integer" }
      - { index: 6, name: "% (AIR LIMBAH)", type: "float" }
---

# AKSES SANITASI LAYAK KABUPATEN WONOSOBO TAHUN 2024 TRIWULAN

> **Sumber:** Open Data Kabupaten Wonosobo — Dinas Pekerjaan Umum dan Penataan Ruang

## Deskripsi

AKSES SANITASI LAYAK KABUPATEN WONOSOBO TAHUN 2024 TRIWULAN

## Statistik

| Metrik | Nilai |
|--------|-------|
| Total Baris | 18 |
| Total Kolom | 7 |
| Kecamatan Tercakup | 15 |
| Rata-rata Akses Sanitasi | 100% |

## Pratinjau Data (5 Baris Pertama)

| NO | KECAMATAN | JUMLAH KK | JUMLAH (SANITASI) | % | JUMLAH (AIR LIMBAH) | % |
|----|-----------|-----------|-------------------|---|---------------------|---|
| 1 | WADASLINTANG | 18,097 | 18,097 | 100.0 | 17,674 | 97.66 |
| 2 | KEPIL | 18,624 | 18,624 | 100.0 | 13,240 | 71.09 |
| 3 | SAPURAN | 18,811 | 18,811 | 100.0 | 12,373 | 65.77 |
| 4 | KALIBAWANG | 7,462 | 7,462 | 100.0 | 5,553 | 74.42 |
| 5 | KALIWIRO | 14,303 | 14,303 | 100.0 | 10,182 | 71.19 |

## Kolom & Tipe Data

| Kolom | Tipe | Contoh |
|-------|------|--------|
| NO | integer | 1, 2, 3 |
| KECAMATAN | string | WADASLINTANG, KEPIL |
| JUMLAH KK | integer | 18097, 18624 |
| JUMLAH (RT AKSES SANITASI) | integer | 18097, 18624 |
| % (RT AKSES SANITASI) | float | 100.0, 71.09 |
| JUMLAH (AIR LIMBAH) | integer | 17674, 13240 |
| % (AIR LIMBAH) | float | 97.66, 71.09 |

---

*Data ini diambil dari portal Open Data Kabupaten Wonosobo dan dikonversi secara otomatis dari format XLSX.*
```

### 4.2 Storage
- File `.md` disimpan di `data/markdown/{org-slug}/{dataset-slug}.md`
- Juga bisa di-generate on-the-fly dari DB (lebih fleksibel)
- **Opsi:** Simpan di DB saja (markdown_content field), generate on-demand
- **Opsi:** Export batch ke filesystem

### 4.3 Deliverables
- [ ] Generator MD berfungsi
- [ ] Semua dataset punya MD representation
- [ ] YAML frontmatter valid & lengkap
- [ ] Tabel data terformat rapi di MD

---

## 📋 PHASE 5: Frontend Website — Homepage & Navigasi

**Tujuan:** Website utama yang ringan, responsif, menampilkan semua dataset

### 5.1 Homepage (`/`)
- **Hero Section**: Judul "Data Wonosobo", deskripsi singkat, search bar
- **Stats Overview**: Total datasets, organizations, records, kecamatan
- **Organization Grid**: Card grid 25 OPD dengan jumlah dataset
- **Recent Datasets**: 12 dataset terbaru yang di-update
- **Popular Tags**: Tag cloud dari tag terpopuler

### 5.2 Organization View (Tab/Filter)
- Klik organization → filter dataset per OPD
- Breadcrumb: Home > Dinas Kesehatan
- Stats: jumlah dataset, total records

### 5.3 Dataset List View
- Card grid/list view toggle
- Pagination (50 per halaman)
- Sort by: nama, tanggal update, jumlah data
- Filter by: organization, tag, format, tahun (dari nama)

### 5.4 Deliverables
- [ ] Homepage responsif & ringan
- [ ] Organization grid
- [ ] Search berfungsi (server-side)
- [ ] Pagination & filter

---

## 📋 PHASE 6: Frontend — Dataset Detail & Data Viewer

**Tujuan:** Halaman detail dataset dengan preview data terstruktur

### 6.1 Dataset Detail Page
- **Header**: Title, organization badge, tags, license, last modified
- **Metadata Card**: Format, file size, source URL, download button
- **Markdown Content**: Render MD yang di-generate (deskripsi, stats, preview)
- **Data Table Viewer**: 
  - Interactive table dengan shadcn Table
  - Pagination client-side (100 baris/page)
  - Sortable columns
  - Search within table
  - Export CSV button
- **Schema Info**: Daftar kolom + tipe data

### 6.2 Organization Detail Page
- Organization info, logo, description
- Daftar semua dataset dalam organization
- Filter & search dalam org

### 6.3 Full-text Search
- Search bar di header
- Cari di: title, notes, organization name, tags, column names
- Server-side search via Prisma

### 6.4 Deliverables
- [ ] Dataset detail page dengan data viewer
- [ ] Markdown content terrender rapi
- [ ] Table viewer interaktif
- [ ] Organization detail page
- [ ] Full-text search

---

## 📋 PHASE 7: Ingestion Dashboard & Admin

**Tujuan:** UI untuk monitoring dan menjalankan proses ingestion

### 7.1 Ingestion Dashboard
- Status: Not started / In progress / Complete
- Progress bar: X/2289 datasets
- Log: real-time log dari ingestion service
- Stats: berhasil, gagal, skip (PDF), total data rows
- Tombol: "Mulai Ingestion", "Resume", "Hentikan"

### 7.2 Error Report
- Tabel dataset yang gagal
- Error message per dataset
- Tombol "Retry" per item

### 7.3 Deliverables
- [ ] Ingestion dashboard di UI
- [ ] Real-time progress via polling
- [ ] Error report dengan retry

---

## 📋 PHASE 8: Polish, Performance & Deployment

**Tujuan:** Optimasi, dark mode, aksesibilitas, akhir

### 8.1 Performance
- Virtual scrolling untuk data table (jika > 1000 baris)
- Caching API responses
- Image optimization untuk logo OPD
- Static generation untuk homepage

### 8.2 UI/UX
- Dark mode (next-themes)
- Loading skeletons
- Error boundaries
- Sticky footer
- Mobile-first responsive

### 8.3 SEO & Metadata
- Meta tags per halaman
- Open Graph images
- Sitemap (opsional)

### 8.4 Deliverables
- [ ] Dark mode
- [ ] Loading states
- [ ] Responsive sempurna
- [ ] Lint clean

---

## ⚠️ Catatan Teknis Penting

1. **Rate Limiting**: CKAN server mungkin limit. Gunakan 1-2 req/sec
2. **Waktu Ingestion**: 2,289 datasets × ~2 detik = ~76 menit untuk metadata saja. XLSX download bisa 2-4 jam
3. **Storage**: XLSX files bisa 50-500KB each. Total est. 500MB-1GB raw files
4. **Memory**: Parse XLSX satu per satu, jangan batch besar
5. **Smart Parsing**: XLSX punya kop surat, merged cells, multi-sheet. Parser harus robust
6. **PDF Files**: Skip saja (butuh OCR, terlalu kompleks)
7. **CKAN API**: Publik, no auth. Tapi tetap respectful

---

## 📐 Estimasi Waktu

| Phase | Estimasi | Keterangan |
|-------|----------|------------|
| Phase 1: Foundation | Singkat | Schema + setup |
| Phase 2: Metadata Ingestion | Sedang | Mini service + crawler |
| Phase 3: XLSX Parse | Lama | Download 2,200 files + parse |
| Phase 4: MD Generation | Sedang | Generator + rendering |
| Phase 5: Homepage | Sedang | UI + search + filter |
| Phase 6: Detail Pages | Sedang | Table viewer + MD render |
| Phase 7: Ingestion UI | Singkat | Dashboard + monitoring |
| Phase 8: Polish | Singkat | Dark mode + responsive |

**Total: Proyek besar, multi-phase, estimated 6-8 jam kerja penuh**

---

## ❓ Pertanyaan untuk Revisi

1. **Apakah semua 2,289 dataset harus di-ingest sekaligus**, atau cukup sample dulu (misal per-organization)?
2. **Apakah file .md harus disimpan di filesystem**, atau cukup di-generate on-the-fly dari DB?
3. **Apakah perlu fitur download CSV** dari data yang sudah di-parse?
4. **Apakah perlu dark mode?**
5. **Priority: data lengkap dulu** atau **UI cantik dulu**?