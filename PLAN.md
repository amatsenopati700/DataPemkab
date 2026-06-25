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
| Struktur XLSX | Multi-sheet, ada letterh
## 🔑 GitHub

Repo: https://github.com/amatsenopati700/DataPemkab.git
PAT: Disimpan di git credential-store (bukan di repo)

## ❓ Pertanyaan untuk Revisi

1. **Apakah semua 2,289 dataset harus di-ingest sekaligus**, atau cukup sample dulu (misal per-organization)?
2. **Apakah file .md harus disimpan di filesystem**, atau cukup di-generate on-the-fly dari DB?
3. **Apakah perlu fitur download CSV** dari data yang sudah di-parse?
4. **Apakah perlu dark mode?**
5. **Priority: data lengkap dulu** atau **UI cantik dulu**?