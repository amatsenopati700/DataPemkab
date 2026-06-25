import { db } from './db';
import ExcelJS from 'exceljs';
import type { ParsedSheet } from './types';

const DOCS_DIR = '/home/z/my-project/docs';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
      if (val === null || val === undefined) vals.push(null);
      else if (typeof val === 'number') vals.push(val.toString());
      else if (typeof val === 'string') vals.push(val.trim() || null);
      else if (val instanceof Date) vals.push(val.toISOString().split('T')[0]);
      else if (typeof val === 'object' && val !== null && 'result' in val) {
        const r2 = (val as { result: unknown }).result;
        vals.push(r2 !== null && r2 !== undefined ? String(r2) : null);
      } else if (typeof val === 'object' && val !== null && 'richText' in val) {
        const rt = (val as { richText: { text: string }[] }).richText;
        vals.push(rt.map(r3 => r3.text).join(' ').trim() || null);
      } else vals.push(String(val));
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

async function main() {
  const BATCH = 20;

  const datasets = await db.dataset.findMany({
    where: { state: 'active', resources: { some: { format: { in: ['XLSX', 'XLS'] } } }, dataTables: { none: {} } },
    include: { resources: true },
    orderBy: { metadataModified: 'desc' },
    take: BATCH,
  });

  console.log(`Found ${datasets.length} datasets to process (this batch)`);

  let success = 0, errors = 0, skipped = 0;

  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i];
    const xlsxRes = ds.resources.find(r => r.format === 'XLSX' || r.format === 'XLS');
    if (!xlsxRes) { skipped++; continue; }

    try {
      const resp = await fetch(xlsxRes.url, { signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 100 || buffer.toString('hex', 0, 4) !== '504b0304') { skipped++; continue; }

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
      console.log(`[${i + 1}/${datasets.length}] ✅ ${ds.title?.substring(0, 50)}`);
    } catch (err) {
      errors++;
      console.error(`[${i + 1}/${datasets.length}] ❌ ${ds.name}: ${(err as Error).message.substring(0, 80)}`);
    }
    await sleep(1000);
  }

  // Stats
  const remaining = await db.dataset.count({
    where: { state: 'active', resources: { some: { format: { in: ['XLSX', 'XLS'] } } }, dataTables: { none: {} } },
  });
  const totalTables = await db.dataTable.count();
  const totalRows = await db.dataRow.count();

  console.log(`\nBatch done: ✅${success} ❌${errors} ⏭${skipped}`);
  console.log(`Remaining to process: ${remaining}`);
  console.log(`Total tables: ${totalTables}, Total rows: ${totalRows}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });