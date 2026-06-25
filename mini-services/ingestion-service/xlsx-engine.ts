import { db } from './db';
import type { CKANResource, ParsedSheet, IngestionState } from './types';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CKAN_BASE = 'https://opendata.wonosobokab.go.id';
const DOCS_DIR = '/home/z/my-project/docs';

let state: IngestionState = {
  phase: 'idle', current: 0, total: 0, currentItem: '',
  status: '', errors: 0, success: 0, skipped: 0, startedAt: null,
};

function setState(partial: Partial<IngestionState>) {
  state = { ...state, ...partial };
}

export function getState(): IngestionState { return { ...state }; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Download & Parse ──────────────────────────────────────
export async function downloadAndParse() {
  setState({ phase: 'download', status: 'Starting...', current: 0 });

  const datasets = await db.dataset.findMany({
    where: { state: 'active', resources: { some: { format: { in: ['XLSX', 'XLS'] } } }, dataTables: { none: {} } },
    include: { resources: true, organization: true },
    orderBy: { metadataModified: 'desc' },
  });

  setState({ total: datasets.length });
  console.log(`[XLSX] ${datasets.length} datasets to download`);

  let success = 0, errors = 0, skipped = 0;

  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    const xlsxRes = ds.resources.find(r => r.format === 'XLSX' || r.format === 'XLS');
    if (!xlsxRes) { skipped++; continue; }

    setState({ current: i + 1, currentItem: ds.title || ds.name, status: `Downloading ${i + 1}/${datasets.length}` });

    try {
      const resp = await fetch(xlsxRes.url, { signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`Download ${resp.status}`);

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 100 || buffer.toString('hex', 0, 4) !== '504b0304') {
        skipped++;
        continue;
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      for (const worksheet of workbook.worksheets) {
        const parsed = parseWorksheet(worksheet);
        if (!parsed || parsed.rowCount === 0) continue;

        await db.dataTable.create({
          data: {
            datasetId: ds.id, resourceCkanId: xlsxRes.ckanId,
            sheetName: parsed.sheetName, rowCount: parsed.rowCount, colCount: parsed.colCount,
            headersJson: JSON.stringify(parsed.headers),
            columns: { create: parsed.headers.map((h, idx) => ({ colIndex: idx, colName: h, colType: parsed.colTypes[idx] || 'string' })) },
            rows: { create: parsed.rows.map(r => ({ rowIndex: r.rowIndex, valuesJson: JSON.stringify(r.values) })) },
          },
        });
      }

      success++;
      if (i % 20 === 0) console.log(`[XLSX] ${i + 1}/${datasets.length} | ✅${success} ❌${errors} ⏭${skipped}`);
    } catch (err) {
      errors++;
      console.error(`[XLSX] ERR ${ds.name}: ${(err as Error).message}`);
      await db.ingestionLog.create({ data: { phase: 'download', datasetCkanName: ds.name, status: 'error', errorMessage: (err as Error).message.substring(0, 500) } });
    }
    await sleep(800);
  }

  setState({ errors, success, skipped });
  console.log(`[XLSX] Done! ✅${success} ❌${errors} ⏭${skipped}`);
}

function parseWorksheet(ws: ExcelJS.Worksheet): ParsedSheet | null {
  const sheetName = ws.name || 'Unknown';
  const colCount = ws.columnCount;
  if (ws.rowCount < 2 || colCount < 2) return null;

  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals: (string | null)[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const val = cell.value;
      if (val === null || val === undefined) { vals.push(null); }
      else if (typeof val === 'number') { vals.push(val.toString()); }
      else if (typeof val === 'string') { vals.push(val.trim() || null); }
      else if (val instanceof Date) { vals.push(val.toISOString().split('T')[0]); }
      else if (typeof val === 'object' && val !== null && 'result' in val) {
        const r2 = (val as { result: unknown }).result;
        vals.push(r2 !== null && r2 !== undefined ? String(r2) : null);
      }
      else if (typeof val === 'object' && val !== null && 'richText' in val) {
        const rt = (val as { richText: { text: string }[] }).richText;
        vals.push(rt.map(r2 => r2.text).join(' ').trim() || null);
      }
      else { vals.push(String(val)); }
    }
    allRows.push(vals);
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i];
    const nonNull = row.filter(v => v !== null).length;
    if (nonNull >= 2) {
      const textCount = row.filter(v => v !== null && isNaN(Number(v))).length;
      if (textCount >= 2 || nonNull >= colCount * 0.5) { headerRowIndex = i; break; }
    }
  }
  if (headerRowIndex === -1) return null;

  let finalHeaders = allRows[headerRowIndex].map(h => h || `Col`);
  let dataStartIndex = headerRowIndex + 1;

  // Check sub-header row
  if (dataStartIndex < allRows.length) {
    const nextRow = allRows[dataStartIndex];
    const nextTextCount = nextRow.filter(v => v !== null && isNaN(Number(v))).length;
    if (nextTextCount >= 2) {
      finalHeaders = finalHeaders.map((h, idx) => {
        const sub = nextRow[idx];
        if (sub && sub !== h) return `${h} (${sub})`;
        return h || sub || `Col ${idx + 1}`;
      });
      dataStartIndex++;
    }
  }

  finalHeaders = finalHeaders.map(h => (!h || h === 'null' ? `Col` : h.replace(/\s+/g, ' ').trim()));

  const dataRows: { rowIndex: number; values: string[] }[] = [];
  for (let i = dataStartIndex; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.filter(v => v !== null).length === 0) continue;
    const firstVal = row[0];
    if (typeof firstVal === 'string' && /^(jumlah|total|grand\s*total)/i.test(firstVal)) continue;
    dataRows.push({ rowIndex: dataRows.length, values: finalHeaders.map((_, c) => row[c] == null ? '' : String(row[c])) });
  }

  if (dataRows.length === 0) return null;

  const colTypes = finalHeaders.map((_, colIdx) => {
    const samples = dataRows.slice(0, 20).map(r => r.values[colIdx]);
    const numCount = samples.filter(v => v !== '' && !isNaN(Number(v.replace(/[.,%\s]/g, '')))).length;
    if (numCount / samples.length > 0.7) {
      if (samples.filter(v => /%/.test(v)).length / samples.length > 0.5) return 'percentage';
      if (samples.filter(v => v !== '' && !v.includes('.')).length / samples.length > 0.7) return 'integer';
      return 'float';
    }
    return 'string';
  });

  return { sheetName, headers: finalHeaders, rowCount: dataRows.length, colCount: finalHeaders.length, colTypes, rows: dataRows };
}

// ── Markdown Generation ────────────────────────────────────
export async function generateMarkdown() {
  setState({ phase: 'markdown', status: 'Generating...', current: 0 });

  const datasets = await db.dataset.findMany({
    where: { dataTables: { some: {} }, state: 'active' },
    include: {
      organization: true,
      tags: { include: { tag: true } },
      dataTables: { include: { columns: true, rows: { take: 5, orderBy: { rowIndex: 'asc' } } } },
      resources: { where: { format: { in: ['XLSX', 'XLS'] } }, take: 1 },
    },
    orderBy: { metadataModified: 'desc' },
  });

  setState({ total: datasets.length });
  console.log(`[MD] Generating for ${datasets.length} datasets`);

  let success = 0, errors = 0;

  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    setState({ current: i + 1, status: `MD ${i + 1}/${datasets.length}` });

    try {
      const md = buildMarkdown(ds as any);
      const orgSlug = ds.organization?.name || '_unorganized';
      const orgDir = join(DOCS_DIR, orgSlug);
      if (!existsSync(orgDir)) mkdirSync(orgDir, { recursive: true });
      const mdPath = `${orgSlug}/${ds.name}.md`;
      writeFileSync(join(DOCS_DIR, mdPath), md, 'utf-8');
      await db.dataset.update({ where: { id: ds.id }, data: { markdownPath: mdPath, markdownContent: md } });
      success++;
      if (i % 50 === 0) console.log(`[MD] ${i + 1}/${datasets.length} | ✅${success}`);
    } catch (err) {
      errors++;
      console.error(`[MD] ERR ${ds.name}:`, err);
    }
  }

  console.log(`[MD] Done! ✅${success} ❌${errors}`);
}

function buildMarkdown(ds: any): string {
  const lines: string[] = [];
  const tagNames = ds.tags.map((t: any) => t.tag.name);
  const res = ds.resources[0];

  lines.push('---');
  lines.push(`title: "${(ds.title || '').replace(/"/g, '\\"')}"`);
  lines.push(`slug: ${ds.name}`);
  lines.push(`organization: ${ds.organization?.title || ''}`);
  lines.push(`organization_slug: ${ds.organization?.name || ''}`);
  lines.push(`source_url: https://opendata.wonosobokab.go.id/dataset/${ds.ckanId}`);
  lines.push(`license: ${ds.licenseId || 'unknown'}`);
  lines.push(`format: ${res?.format || 'unknown'}`);
  lines.push(`file_size: ${res?.size || 0}`);
  lines.push(`download_url: ${res?.url || ''}`);
  lines.push(`created_at: ${ds.metadataCreated?.toISOString() || ''}`);
  lines.push(`modified_at: ${ds.metadataModified?.toISOString() || ''}`);
  lines.push(`is_latest: ${ds.isLatest}`);
  if (tagNames.length > 0) {
    lines.push('tags:');
    tagNames.forEach((t: string) => lines.push(`  - "${t}"`));
  } else { lines.push('tags: []'); }
  lines.push(`tables:`);
  ds.dataTables.forEach((dt: any) => {
    lines.push(`  - sheet: "${dt.sheetName.replace(/"/g, '\\"')}"`);
    lines.push(`    rows: ${dt.rowCount}`);
    lines.push(`    columns: ${dt.colCount}`);
    lines.push(`    headers:`);
    dt.columns.forEach((c: any) => lines.push(`      - { index: ${c.colIndex}, name: "${c.colName.replace(/"/g, '\\"')}", type: "${c.colType}" }`));
  });
  lines.push('---');
  lines.push('');
  lines.push(`# ${ds.title || ds.name}`);
  lines.push('');
  lines.push(`> **Sumber:** Open Data Kabupaten Wonosobo${ds.organization ? ` — ${ds.organization.title}` : ''}`);
  lines.push('');
  if (ds.notes) { lines.push('## Deskripsi'); lines.push(''); lines.push(ds.notes); lines.push(''); }

  ds.dataTables.forEach((dt: any) => {
    const headers = JSON.parse(dt.headersJson) as string[];
    lines.push(`## Data: ${dt.sheetName}`);
    lines.push('');
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    dt.rows.forEach((r: any) => {
      const vals = JSON.parse(r.valuesJson) as string[];
      lines.push(`| ${vals.map(v => (v || '').replace(/\|/g, '\\|')).join(' | ')} |`);
    });
    lines.push('');
    lines.push(`*Total: ${dt.rowCount} baris × ${dt.colCount} kolom*`);
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('*Data diambil dari portal [Open Data Kabupaten Wonosobo](https://opendata.wonosobokab.go.id/) dan dikonversi otomatis dari format XLSX.*');
  return lines.join('\n');
}