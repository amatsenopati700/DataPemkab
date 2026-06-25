import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DOCS_DIR = '/home/z/my-project/docs';

export async function POST() {
  try {
    const datasets = await db.dataset.findMany({
      where: { dataTables: { some: {} }, state: 'active', markdownContent: '' },
      include: {
        organization: true,
        tags: { include: { tag: true } },
        dataTables: {
          include: {
            columns: { orderBy: { colIndex: 'asc' } },
            rows: { take: 5, orderBy: { rowIndex: 'asc' } },
          },
        },
        resources: { where: { format: { in: ['XLSX', 'XLS'] } }, take: 1 },
      },
      orderBy: { metadataModified: 'desc' },
      take: 200,
    });

    let generated = 0;
    for (const ds of datasets) {
      const md = buildMarkdown(ds);
      const orgSlug = ds.organization?.name || '_unorganized';
      const orgDir = join(DOCS_DIR, orgSlug);
      if (!existsSync(orgDir)) mkdirSync(orgDir, { recursive: true });
      const mdPath = `${orgSlug}/${ds.name}.md`;
      writeFileSync(join(DOCS_DIR, mdPath), md, 'utf-8');
      await db.dataset.update({ where: { id: ds.id }, data: { markdownPath: mdPath, markdownContent: md } });
      generated++;
    }
    return NextResponse.json({ generated, batch: datasets.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function buildMarkdown(ds: any): string {
  const L: string[] = [];
  const tags = ds.tags.map((t: any) => t.tag.name);
  const res = ds.resources[0];
  L.push('---');
  L.push(`title: "${(ds.title||'').replace(/"/g,'\\"')}"`);
  L.push(`slug: ${ds.name}`);
  L.push(`organization: ${ds.organization?.title||''}`);
  L.push(`organization_slug: ${ds.organization?.name||''}`);
  L.push(`source_url: https://opendata.wonosobokab.go.id/dataset/${ds.ckanId}`);
  L.push(`license: ${ds.licenseId||'unknown'}`);
  L.push(`format: ${res?.format||'unknown'}`);
  L.push(`file_size: ${res?.size||0}`);
  L.push(`download_url: ${res?.url||''}`);
  L.push(`created_at: ${ds.metadataCreated?.toISOString()||''}`);
  L.push(`modified_at: ${ds.metadataModified?.toISOString()||''}`);
  L.push(`is_latest: ${ds.isLatest}`);
  L.push(tags.length ? `tags:\n${tags.map(t=>`  - "${t}"`).join('\n')}` : 'tags: []');
  L.push('tables:');
  ds.dataTables.forEach((dt: any) => {
    L.push(`  - sheet: "${dt.sheetName.replace(/"/g,'\\"')}"`);
    L.push(`    rows: ${dt.rowCount}`);
    L.push(`    columns: ${dt.colCount}`);
    L.push('    headers:');
    dt.columns.forEach((c: any) => L.push(`      - { index: ${c.colIndex}, name: "${c.colName.replace(/"/g,'\\"')}", type: "${c.colType}" }`));
  });
  L.push('---\n');
  L.push(`# ${ds.title||ds.name}\n`);
  L.push(`> **Sumber:** Open Data Kabupaten Wonosobo${ds.organization ? ` — ${ds.organization.title}` : ''}\n`);
  if (ds.notes) { L.push('## Deskripsi\n'); L.push(ds.notes); L.push(''); }
  ds.dataTables.forEach((dt: any) => {
    const h = JSON.parse(dt.headersJson) as string[];
    L.push(`## Data: ${dt.sheetName}\n`);
    L.push(`| ${h.join(' | ')} |`);
    L.push(`| ${h.map(()=>'---').join(' | ')} |`);
    dt.rows.forEach((r: any) => {
      const v = JSON.parse(r.valuesJson) as string[];
      L.push(`| ${v.map(x=>(x||'').replace(/\|/g,'\\|')).join(' | ')} |`);
    });
    L.push(`\n*Total: ${dt.rowCount} baris × ${dt.colCount} kolom*\n`);
  });
  L.push('---\n\n*Data dari [Open Data Kabupaten Wonosobo](https://opendata.wonosobokab.go.id/), dikonversi otomatis dari XLSX.*');
  return L.join('\n');
}