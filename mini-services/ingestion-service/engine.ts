import { db } from './db';
import type { CKANOrganization, CKANPackage, CKANResource, ParsedSheet, IngestionState } from './types';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const CKAN_BASE = 'https://opendata.wonosobokab.go.id';
const DOCS_DIR = '/home/z/my-project/docs';
const RAW_DIR = '/home/z/my-project/data/raw';

// ── State management ──────────────────────────────────────
let state: IngestionState = {
  phase: 'idle',
  current: 0,
  total: 0,
  currentItem: '',
  status: '',
  errors: 0,
  success: 0,
  skipped: 0,
  startedAt: null,
};

function setState(partial: Partial<IngestionState>) {
  state = { ...state, ...partial };
}

export function getState(): IngestionState {
  return { ...state };
}

// ── CKAN API helpers ──────────────────────────────────────
async function ckanFetch(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${CKAN_BASE}/api/3/action/${action}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (!data.success) {
        throw new Error(`CKAN error: ${JSON.stringify(data.error)}`);
      }
      return data.result;
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Phase: Organizations ──────────────────────────────────
async function ingestOrganizations() {
  setState({ phase: 'organizations', status: 'Fetching organizations...', current: 0, total: 1 });
  console.log('[ORG] Fetching organizations...');

  const orgs = await ckanFetch('organization_list', { all_fields: 'true', limit: '100' }) as CKANOrganization[];
  console.log(`[ORG] Found ${orgs.length} organizations`);

  for (const org of orgs) {
    await db.organization.upsert({
      where: { name: org.name },
      create: {
        ckanId: org.id,
        name: org.name,
        title: org.title,
        description: org.description || '',
        imageUrl: org.image_url || '',
        packageCount: org.package_count || 0,
      },
      update: {
        title: org.title,
        description: org.description || '',
        imageUrl: org.image_url || '',
        packageCount: org.package_count || 0,
      },
    });
  }

  console.log(`[ORG] Saved ${orgs.length} organizations`);
}

// ── Phase: Metadata ───────────────────────────────────────
async function ingestMetadata() {
  setState({ phase: 'metadata', status: 'Fetching dataset list...', current: 0 });
  console.log('[META] Fetching package list...');

  const names = await ckanFetch('package_list', { limit: '5000' }) as string[];
  console.log(`[META] Found ${names.length} datasets`);
  setState({ total: names.length });

  // Handle "filter terbaru": group by base name, keep latest
  // Many datasets have pattern: "name" and "name-tahun-2024" 
  // We want to mark which is latest per group
  const nameMap = new Map<string, string[]>(); // base -> [full names]
  for (const n of names) {
    // Try to extract base: remove trailing "-tahun-YYYY", "-semester-X-tahun-YYYY", etc.
    let base = n.replace(/-tahun-\d{4}(-triwulan(-[ivx]+)?)?$/i, '')
                .replace(/-semester-\d+(-tahun-\d{4})?$/i, '')
                .replace(/-triwulan-[ivx\d]+$/i, '');
    // If base is same as name, keep as-is
    if (base === n) base = n;
    if (!nameMap.has(base)) nameMap.set(base, []);
    nameMap.get(base)!.push(n);
  }

  // Build a set of "latest" dataset names (longest name per base = most specific)
  const latestNames = new Set<string>();
  for (const [, variants] of nameMap) {
    // The one with the latest year in the name is the latest
    const yearPattern = /(\d{4})/g;
    let best = variants[0];
    let bestYear = 0;
    for (const v of variants) {
      const years = [...v.matchAll(yearPattern)].map(m => parseInt(m[1]));
      const maxYear = years.length > 0 ? Math.max(...years) : 0;
      if (maxYear > bestYear || (maxYear === bestYear && v.length > best.length)) {
        bestYear = maxYear;
        best = v;
      }
    }
    latestNames.add(best);
  }

  let success = 0, errors = 0, skipped = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    setState({ current: i + 1, currentItem: name, status: `Fetching metadata ${i + 1}/${names.length}` });

    try {
      const pkg = await ckanFetch('package_show', { id: name }) as CKANPackage;

      if (!pkg.title || pkg.state !== 'active') {
        skipped++;
        await sleep(300);
        continue;
      }

      const isLatest = latestNames.has(name);

      // Upsert dataset
      await db.dataset.upsert({
        where: { name: pkg.name },
        create: {
          ckanId: pkg.id,
          name: pkg.name,
          title: pkg.title || pkg.name,
          notes: pkg.notes || '',
          licenseId: pkg.license_id || '',
          licenseTitle: pkg.license_title || '',
          state: pkg.state || 'active',
          author: pkg.author || '',
          metadataCreated: pkg.metadata_created ? new Date(pkg.metadata_created) : null,
          metadataModified: pkg.metadata_modified ? new Date(pkg.metadata_modified) : null,
          ownerOrgCkanId: pkg.owner_org || '',
          organizationId: pkg.organization?.name
            ? (await db.organization.findUnique({ where: { name: pkg.organization.name } }))?.id || null
            : null,
          isLatest,
          resources: {
            create: pkg.resources.map((r: CKANResource) => ({
              ckanId: r.id,
              name: r.name || '',
              format: (r.format || '').toUpperCase(),
              size: r.size || 0,
              url: r.url,
              mimetype: r.mimetype || '',
              hash: r.hash || '',
              urlType: r.url_type || '',
              state: r.state || 'active',
            })),
          },
          tags: {
            create: await Promise.all(
              pkg.tags.map(async (t) => {
                const tag = await db.tag.upsert({
                  where: { name: t.name },
                  create: { name: t.name, displayName: t.display_name || t.name },
                  update: { displayName: t.display_name || t.name },
                });
                return { tagId: tag.id };
              })
            ),
          },
        },
        update: {
          title: pkg.title || pkg.name,
          notes: pkg.notes || '',
          licenseId: pkg.license_id || '',
          licenseTitle: pkg.license_title || '',
          state: pkg.state || 'active',
          author: pkg.author || '',
          metadataCreated: pkg.metadata_created ? new Date(pkg.metadata_created) : null,
          metadataModified: pkg.metadata_modified ? new Date(pkg.metadata_modified) : null,
          ownerOrgCkanId: pkg.owner_org || '',
          organizationId: pkg.organization?.name
            ? (await db.organization.findUnique({ where: { name: pkg.organization.name } }))?.id || null
            : null,
          isLatest,
        },
      });

      // Log success
      await db.ingestionLog.create({
        data: {
          phase: 'metadata',
          datasetCkanName: name,
          status: 'success',
          completedAt: new Date(),
        },
      });

      success++;
      if (i % 50 === 0) {
        console.log(`[META] ${i + 1}/${names.length} | ✅ ${success} ❌ ${errors} ⏭ ${skipped}`);
      }
    } catch (err) {
      errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[META] ERROR ${name}: ${errMsg}`);
      await db.ingestionLog.create({
        data: {
          phase: 'metadata',
          datasetCkanName: name,
          status: 'error',
          errorMessage: errMsg.substring(0, 500),
        },
      });
    }

    await sleep(350); // ~3 req/sec with processing time
  }

  setState({ errors, success, skipped });
  console.log(`[META] Done! ✅ ${success} ❌ ${errors} ⏭ ${skipped}`);
}

// ── Phase: XLSX Download & Parse ──────────────────────────
async function downloadAndParse() {
  setState({ phase: 'download', status: 'Starting download & parse...', current: 0 });

  // Get all datasets with XLSX resources that haven't been parsed
  const datasets = await db.dataset.findMany({
    where: {
      state: 'active',
      resources: { some: { format: { in: ['XLSX', 'XLS'] } } },
      dataTables: { none: {} },
    },
    include: { resources: true, organization: true },
    orderBy: { metadataModified: 'desc' },
  });

  setState({ total: datasets.length });
  console.log(`[XLSX] ${datasets.length} datasets to download and parse`);

  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

  let success = 0, errors = 0, skipped = 0;

  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    const xlsxRes = ds.resources.find(r => r.format === 'XLSX' || r.format === 'XLS');
    if (!xlsxRes) { skipped++; continue; }

    setState({
      current: i + 1,
      currentItem: ds.title,
      status: `Downloading ${i + 1}/${datasets.length}: ${ds.title?.substring(0, 50)}...`,
    });

    try {
      // Download
      const resp = await fetch(xlsxRes.url, { signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);

      const buffer = Buffer.from(await resp.arrayBuffer());

      // Validate it's actually XLSX
      if (buffer.length < 100 || !buffer.toString('hex', 0, 4).startsWith('504b')) {
        // 504b = PK (ZIP) signature, XLSX is a ZIP
        console.log(`[XLSX] SKIP (not XLSX/ZIP) ${ds.name}`);
        skipped++;
        continue;
      }

      // Parse with ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      let totalRowsInserted = 0;

      for (const worksheet of workbook.worksheets) {
        const parsed = parseWorksheet(worksheet);
        if (!parsed || parsed.rowCount === 0) continue;

        // Save to DB
        const dataTable = await db.dataTable.create({
          data: {
            datasetId: ds.id,
            resourceCkanId: xlsxRes.ckanId,
            sheetName: parsed.sheetName,
            rowCount: parsed.rowCount,
            colCount: parsed.colCount,
            headersJson: JSON.stringify(parsed.headers),
            columns: {
              create: parsed.headers.map((h, idx) => ({
                colIndex: idx,
                colName: h,
                colType: parsed.colTypes[idx] || 'string',
              })),
            },
            rows: {
              create: parsed.rows.map(r => ({
                rowIndex: r.rowIndex,
                valuesJson: JSON.stringify(r.values),
              })),
            },
          },
        });

        totalRowsInserted += parsed.rows.length;
      }

      success++;
      if (i % 20 === 0) {
        console.log(`[XLSX] ${i + 1}/${datasets.length} | ✅ ${success} ❌ ${errors} ⏭ ${skipped} | rows: ${totalRowsInserted}`);
      }
    } catch (err) {
      errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[XLSX] ERROR ${ds.name}: ${errMsg}`);
      await db.ingestionLog.create({
        data: { phase: 'download', datasetCkanName: ds.name, status: 'error', errorMessage: errMsg.substring(0, 500) },
      });
    }

    await sleep(800); // Respectful download rate
  }

  setState({ errors, success, skipped });
  console.log(`[XLSX] Done! ✅ ${success} ❌ ${errors} ⏭ ${skipped}`);
}

// ── Smart Worksheet Parser ────────────────────────────────
function parseWorksheet(ws: ExcelJS.Worksheet): ParsedSheet | null {
  const sheetName = ws.name || 'Unknown';
  const rowCount = ws.rowCount;
  const colCount = ws.columnCount;

  if (rowCount < 2 || colCount < 2) return null;

  // Collect all rows as string arrays
  const allRows: (string | null)[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const vals: (string | null)[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const val = cell.value;
      if (val === null || val === undefined) {
        vals.push(null);
      } else if (typeof val === 'number') {
        vals.push(val.toString());
      } else if (typeof val === 'string') {
        vals.push(val.trim());
      } else if (val instanceof Date) {
        vals.push(val.toISOString().split('T')[0]);
      } else if (typeof val === 'object' && val !== null && 'result' in val) {
        // Formula
        const result = (val as { result: unknown }).result;
        vals.push(result !== null && result !== undefined ? String(result) : null);
      } else if (typeof val === 'object' && val !== null && 'richText' in val) {
        const rt = (val as { richText: { text: string }[] }).richText;
        vals.push(rt.map(r => r.text).join(' ').trim() || null);
      } else {
        vals.push(String(val));
      }
    }
    allRows.push(vals);
  });

  // Find the header row: first row with > 2 non-null values that looks like headers
  let headerRowIndex = -1;
  let headerValues: (string | null)[] = [];

  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const row = allRows[i];
    const nonNull = row.filter(v => v !== null && v !== '').length;
    if (nonNull >= 2) {
      // Check if this looks like a header (not all numeric)
      const textCount = row.filter(v => v !== null && v !== '' && isNaN(Number(v))).length;
      if (textCount >= 2 || nonNull >= colCount * 0.5) {
        headerRowIndex = i;
        headerValues = row;
        break;
      }
    }
  }

  if (headerRowIndex === -1) return null;

  // Check if next row is a sub-header (e.g., "JUMLAH", "%")
  let finalHeaders = headerValues.map(h => h || `Col`);
  let dataStartIndex = headerRowIndex + 1;

  if (dataStartIndex < allRows.length) {
    const nextRow = allRows[dataStartIndex];
    const nextNonNull = nextRow.filter(v => v !== null && v !== '').length;
    // If next row has different structure or is sub-header pattern
    if (nextNonNull >= 2) {
      const nextTextCount = nextRow.filter(v => v !== null && v !== '' && isNaN(Number(v))).length;
      if (nextTextCount > nextNonNull * 0.5 && nextTextCount >= 2) {
        // Merge headers: "RT DENGAN AKSES SANITASI" + "JUMLAH" -> "RT DENGAN AKSES SANITASI (JUMLAH)"
        const merged = finalHeaders.map((h, idx) => {
          const sub = nextRow[idx];
          if (sub && sub !== h) return `${h} (${sub})`;
          return h || sub || `Col ${idx + 1}`;
        });
        finalHeaders = merged;
        dataStartIndex++;
      }
    }
  }

  // Clean headers
  finalHeaders = finalHeaders.map(h => {
    if (!h || h === 'null' || h === 'undefined') return `Col`;
    return h.replace(/\s+/g, ' ').trim();
  });

  // Extract data rows
  const dataRows: { rowIndex: number; values: string[] }[] = [];
  for (let i = dataStartIndex; i < allRows.length; i++) {
    const row = allRows[i];
    const nonNull = row.filter(v => v !== null && v !== '').length;
    if (nonNull === 0) continue;

    // Skip summary/total rows at the bottom (heuristic)
    const firstVal = row[0];
    if (typeof firstVal === 'string' && /^(jumlah|total|grand\s*total)/i.test(firstVal)) continue;

    // Ensure row has the right number of columns
    const values = [];
    for (let c = 0; c < finalHeaders.length; c++) {
      const v = row[c] ?? '';
      values.push(v === null ? '' : String(v));
    }

    dataRows.push({ rowIndex: dataRows.length, values });
  }

  if (dataRows.length === 0) return null;

  // Detect column types
  const colTypes = finalHeaders.map((_, colIdx) => {
    const sampleVals = dataRows.slice(0, Math.min(20, dataRows.length)).map(r => r.values[colIdx]);
    const numCount = sampleVals.filter(v => v !== '' && !isNaN(Number(v.replace(/[.,%\s]/g, '')))).length;
    if (numCount / sampleVals.length > 0.7) {
      // Check if it looks like a percentage
      const pctCount = sampleVals.filter(v => /%/.test(v)).length;
      if (pctCount / sampleVals.length > 0.5) return 'percentage';
      const intCount = sampleVals.filter(v => v !== '' && !v.includes('.') && !isNaN(Number(v))).length;
      if (intCount / sampleVals.length > 0.7) return 'integer';
      return 'float';
    }
    return 'string';
  });

  return {
    sheetName,
    headers: finalHeaders,
    rowCount: dataRows.length,
    colCount: finalHeaders.length,
    colTypes,
    rows: dataRows,
  };
}

// ── Phase: Markdown Generation ────────────────────────────
async function generateMarkdown() {
  setState({ phase: 'markdown', status: 'Generating markdown...', current: 0 });

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
  console.log(`[MD] Generating markdown for ${datasets.length} datasets`);

  let success = 0, errors = 0;

  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    setState({ current: i + 1, currentItem: ds.title, status: `Generating MD ${i + 1}/${datasets.length}` });

    try {
      const md = buildMarkdown(ds);
      const orgSlug = ds.organization?.name || '_unorganized';
      const dsSlug = ds.name;

      // Save to filesystem
      const orgDir = join(DOCS_DIR, orgSlug);
      if (!existsSync(orgDir)) mkdirSync(orgDir, { recursive: true });
      const mdPath = `${orgSlug}/${dsSlug}.md`;
      writeFileSync(join(DOCS_DIR, mdPath), md, 'utf-8');

      // Save to DB
      await db.dataset.update({
        where: { id: ds.id },
        data: { markdownPath: mdPath, markdownContent: md },
      });

      success++;
      if (i % 50 === 0) console.log(`[MD] ${i + 1}/${datasets.length} | ✅ ${success}`);
    } catch (err) {
      errors++;
      console.error(`[MD] ERROR ${ds.name}:`, err);
    }
  }

  console.log(`[MD] Done! ✅ ${success} ❌ ${errors}`);
}

function buildMarkdown(ds: typeof import('@prisma/client').Dataset & {
  organization: { name: string; title: string } | null;
  tags: { tag: { name: string } }[];
  dataTables: {
    sheetName: string; rowCount: number; colCount: number; headersJson: string;
    columns: { colIndex: number; colName: string; colType: string }[];
    rows: { rowIndex: number; valuesJson: string }[];
  }[];
  resources: { url: string; format: string; size: number }[];
}): string {
  const lines: string[] = [];

  // YAML frontmatter
  const tagNames = ds.tags.map(t => t.tag.name);
  const tablesMeta = ds.dataTables.map(dt => ({
    sheet: dt.sheetName,
    rows: dt.rowCount,
    columns: dt.colCount,
    headers: dt.columns.map(c => ({ index: c.colIndex, name: c.colName, type: c.colType })),
  }));

  const res = ds.resources[0];
  const yamlLines = [
    `title: "${(ds.title || '').replace(/"/g, '\\"')}"`,
    `slug: ${ds.name}`,
    `organization: ${ds.organization?.title || ''}`,
    `organization_slug: ${ds.organization?.name || ''}`,
    `source_url: https://opendata.wonosobokab.go.id/dataset/${ds.ckanId}`,
    `license: ${ds.licenseId || 'unknown'}`,
    `format: ${res?.format || 'unknown'}`,
    `file_size: ${res?.size || 0}`,
    `download_url: ${res?.url || ''}`,
    `created_at: ${ds.metadataCreated?.toISOString() || ''}`,
    `modified_at: ${ds.metadataModified?.toISOString() || ''}`,
    `is_latest: ${ds.isLatest}`,
    tagNames.length > 0 ? `tags:\n${tagNames.map(t => `  - "${t}"`).join('\n')}` : 'tags: []',
    `tables:`,
    ...tablesMeta.flatMap(t => [
      `  - sheet: "${t.sheet.replace(/"/g, '\\"')}"`,
      `    rows: ${t.rows}`,
      `    columns: ${t.columns}`,
      `    headers:`,
      ...t.headers.map(h => `      - { index: ${h.index}, name: "${h.name.replace(/"/g, '\\"')}", type: "${h.type}" }`),
    ]),
  ];

  lines.push('---');
  lines.push(...yamlLines);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${ds.title || ds.name}`);
  lines.push('');
  lines.push(`> **Sumber:** Open Data Kabupaten Wonosobo${ds.organization ? ` — ${ds.organization.title}` : ''}`);
  lines.push('');

  // Description
  if (ds.notes) {
    lines.push('## Deskripsi');
    lines.push('');
    lines.push(ds.notes);
    lines.push('');
  }

  // For each table
  for (const dt of ds.dataTables) {
    const headers = JSON.parse(dt.headersJson) as string[];
    const sampleRows = dt.rows.map(r => JSON.parse(r.valuesJson) as string[]);

    lines.push(`## Data: ${dt.sheetName}`);
    lines.push('');
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of sampleRows) {
      lines.push(`| ${row.map(v => (v || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
    }
    lines.push('');

    // Column info
    lines.push('### Kolom & Tipe Data');
    lines.push('');
    lines.push('| Kolom | Tipe |');
    lines.push('|-------|------|');
    for (const col of dt.columns) {
      lines.push(`| ${col.colName} | ${col.colType} |`);
    }
    lines.push('');
    lines.push(`*Total: ${dt.rowCount} baris × ${dt.colCount} kolom*`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Data ini diambil dari portal [Open Data Kabupaten Wonosobo](https://opendata.wonosobokab.go.id/) dan dikonversi secara otomatis dari format XLSX.*');

  return lines.join('\n');
}

// ── Main orchestrator ─────────────────────────────────────
export async function runFullIngestion() {
  try {
    setState({ startedAt: new Date().toISOString(), status: 'Starting full ingestion...' });
    console.log('=== FULL INGESTION STARTED ===');

    await ingestOrganizations();
    await ingestMetadata();
    await downloadAndParse();
    await generateMarkdown();

    setState({ phase: 'complete', status: 'Ingestion complete!' });
    console.log('=== FULL INGESTION COMPLETE ===');
  } catch (err) {
    setState({ phase: 'error', status: `Error: ${err}` });
    console.error('=== INGESTION ERROR ===', err);
  }
}

// Run individual phases
export { ingestOrganizations, ingestMetadata, downloadAndParse, generateMarkdown };