import { db } from './db';
import type { CKANOrganization, CKANPackage, CKANResource } from './types';

const CKAN_BASE = 'https://opendata.wonosobokab.go.id';

async function ckanFetch(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${CKAN_BASE}/api/3/action/${action}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error(`CKAN error`);
  return data.result;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const names = await ckanFetch('package_list', { limit: '5000' }) as string[];
  console.log(`Total: ${names.length} datasets`);

  // Detect latest
  const nameMap = new Map<string, string[]>();
  for (const n of names) {
    let base = n.replace(/-tahun-\d{4}(-triwulan(-[ivx]+)?)?$/i, '').replace(/-semester-\d+(-tahun-\d{4})?$/i, '').replace(/-triwulan-[ivx\d]+$/i, '');
    if (base === n) base = n;
    if (!nameMap.has(base)) nameMap.set(base, []);
    nameMap.get(base)!.push(n);
  }
  const latestNames = new Set<string>();
  for (const [, variants] of nameMap) {
    const yearP = /(\d{4})/g;
    let best = variants[0], bestYear = 0;
    for (const v of variants) { const yrs = [...v.matchAll(yearP)].map(m => parseInt(m[1])); const mx = yrs.length ? Math.max(...yrs) : 0; if (mx > bestYear || (mx === bestYear && v.length > best.length)) { bestYear = mx; best = v; } }
    latestNames.add(best);
  }

  // Check what we already have
  const existingNames = new Set((await db.dataset.findMany({ select: { name: true } })).map(d => d.name));
  const toFetch = names.filter(n => !existingNames.has(n));
  console.log(`Already have: ${existingNames.size}, Need to fetch: ${toFetch.length}`);

  let success = 0, errors = 0, skipped = 0;
  const BATCH = 100; // Process 100 at a time, then exit

  for (let i = 0; i < Math.min(toFetch.length, BATCH); i++) {
    const name = toFetch[i];
    try {
      const pkg = await ckanFetch('package_show', { id: name }) as CKANPackage;
      if (!pkg.title || pkg.state !== 'active') { skipped++; continue; }
      const isLatest = latestNames.has(name);
      const orgName = pkg.organization?.name;
      let orgId: string | null = null;
      if (orgName) { const org = await db.organization.findUnique({ where: { name: orgName } }); orgId = org?.id || null; }

      await db.dataset.upsert({
        where: { name: pkg.name },
        create: {
          ckanId: pkg.id, name: pkg.name, title: pkg.title || pkg.name,
          notes: (pkg.notes || '').substring(0, 5000), licenseId: pkg.license_id || '',
          licenseTitle: pkg.license_title || '', state: pkg.state || 'active',
          author: pkg.author || '', isLatest,
          metadataCreated: pkg.metadata_created ? new Date(pkg.metadata_created) : null,
          metadataModified: pkg.metadata_modified ? new Date(pkg.metadata_modified) : null,
          ownerOrgCkanId: pkg.owner_org || '', organizationId: orgId,
        },
        update: {
          title: pkg.title || pkg.name,
          notes: (pkg.notes || '').substring(0, 5000), licenseId: pkg.license_id || '',
          licenseTitle: pkg.license_title || '', state: pkg.state || 'active',
          author: pkg.author || '', isLatest,
          metadataCreated: pkg.metadata_created ? new Date(pkg.metadata_created) : null,
          metadataModified: pkg.metadata_modified ? new Date(pkg.metadata_modified) : null,
          ownerOrgCkanId: pkg.owner_org || '', organizationId: orgId,
        },
      });

      const ds = await db.dataset.findUnique({ where: { name: pkg.name } });
      if (ds) {
        for (const r of pkg.resources) {
          await db.resource.upsert({
            where: { ckanId: r.id },
            create: { ckanId: r.id, name: r.name || '', format: (r.format || '').toUpperCase(), size: r.size || 0, url: r.url, mimetype: r.mimetype || '', hash: r.hash || '', urlType: r.url_type || '', state: r.state || 'active', datasetId: ds.id },
            update: { name: r.name || '', format: (r.format || '').toUpperCase(), size: r.size || 0, url: r.url, mimetype: r.mimetype || '', hash: r.hash || '', urlType: r.url_type || '', state: r.state || 'active' },
          });
        }
        for (const t of pkg.tags) {
          const tag = await db.tag.upsert({ where: { name: t.name }, create: { name: t.name, displayName: t.display_name || t.name }, update: { displayName: t.display_name || t.name } });
          await db.datasetTag.upsert({ where: { datasetId_tagId: { datasetId: ds.id, tagId: tag.id } }, create: { datasetId: ds.id, tagId: tag.id }, update: {} });
        }
      }
      success++;
    } catch (err) {
      errors++;
    }
    await sleep(350);
    if ((i + 1) % 20 === 0) console.log(`[${i + 1}/${Math.min(toFetch.length, BATCH)}] ✅${success} ❌${errors} ⏭${skipped}`);
  }

  console.log(`Batch done: ✅${success} ❌${errors} ⏭${skipped} | Remaining: ${Math.max(0, toFetch.length - BATCH)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });