import { db } from './db';
import type { CKANOrganization, CKANPackage, CKANResource, IngestionState } from './types';

const CKAN_BASE = 'https://opendata.wonosobokab.go.id';

// ── State management ──────────────────────────────────────
let state: IngestionState = {
  phase: 'idle', current: 0, total: 0, currentItem: '',
  status: '', errors: 0, success: 0, skipped: 0, startedAt: null,
};

function setState(partial: Partial<IngestionState>) {
  state = { ...state, ...partial };
}

export function getState(): IngestionState {
  return { ...state };
}

async function ckanFetch(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${CKAN_BASE}/api/3/action/${action}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.success) throw new Error(`CKAN error: ${JSON.stringify(data.error)}`);
      return data.result;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Organizations ──────────────────────────────────────────
export async function ingestOrganizations() {
  setState({ phase: 'organizations', status: 'Fetching organizations...', current: 0, total: 1 });
  console.log('[ORG] Fetching organizations...');
  const orgs = await ckanFetch('organization_list', { all_fields: 'true', limit: '100' }) as CKANOrganization[];
  console.log(`[ORG] Found ${orgs.length} organizations`);

  for (const org of orgs) {
    await db.organization.upsert({
      where: { name: org.name },
      create: { ckanId: org.id, name: org.name, title: org.title, description: org.description || '', imageUrl: org.image_url || '', packageCount: org.package_count || 0 },
      update: { title: org.title, description: org.description || '', imageUrl: org.image_url || '', packageCount: org.package_count || 0 },
    });
  }
  console.log(`[ORG] Saved ${orgs.length} organizations`);
}

// ── Metadata ───────────────────────────────────────────────
export async function ingestMetadata() {
  setState({ phase: 'metadata', status: 'Fetching dataset list...', current: 0 });
  console.log('[META] Fetching package list...');
  const names = await ckanFetch('package_list', { limit: '5000' }) as string[];
  console.log(`[META] Found ${names.length} datasets`);
  setState({ total: names.length });

  // Detect latest: group by base name, keep most recent year
  const nameMap = new Map<string, string[]>();
  for (const n of names) {
    let base = n.replace(/-tahun-\d{4}(-triwulan(-[ivx]+)?)?$/i, '')
                .replace(/-semester-\d+(-tahun-\d{4})?$/i, '')
                .replace(/-triwulan-[ivx\d]+$/i, '');
    if (base === n) base = n;
    if (!nameMap.has(base)) nameMap.set(base, []);
    nameMap.get(base)!.push(n);
  }

  const latestNames = new Set<string>();
  for (const [, variants] of nameMap) {
    const yearPattern = /(\d{4})/g;
    let best = variants[0], bestYear = 0;
    for (const v of variants) {
      const years = [...v.matchAll(yearPattern)].map(m => parseInt(m[1]));
      const maxYear = years.length > 0 ? Math.max(...years) : 0;
      if (maxYear > bestYear || (maxYear === bestYear && v.length > best.length)) { bestYear = maxYear; best = v; }
    }
    latestNames.add(best);
  }

  let success = 0, errors = 0, skipped = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    setState({ current: i + 1, currentItem: name, status: `Fetching ${i + 1}/${names.length}: ${name.substring(0, 60)}` });

    try {
      const pkg = await ckanFetch('package_show', { id: name }) as CKANPackage;
      if (!pkg.title || pkg.state !== 'active') { skipped++; await sleep(300); continue; }

      const isLatest = latestNames.has(name);
      const orgName = pkg.organization?.name;
      let orgId: string | null = null;
      if (orgName) {
        const org = await db.organization.findUnique({ where: { name: orgName } });
        orgId = org?.id || null;
      }

      // Upsert dataset (without nested creates for speed)
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
        // Upsert resources
        for (const r of pkg.resources) {
          await db.resource.upsert({
            where: { ckanId: r.id },
            create: {
              ckanId: r.id, name: r.name || '', format: (r.format || '').toUpperCase(),
              size: r.size || 0, url: r.url, mimetype: r.mimetype || '',
              hash: r.hash || '', urlType: r.url_type || '', state: r.state || 'active', datasetId: ds.id,
            },
            update: {
              name: r.name || '', format: (r.format || '').toUpperCase(),
              size: r.size || 0, url: r.url, mimetype: r.mimetype || '',
              hash: r.hash || '', urlType: r.url_type || '', state: r.state || 'active',
            },
          });
        }

        // Upsert tags
        for (const t of pkg.tags) {
          const tag = await db.tag.upsert({
            where: { name: t.name },
            create: { name: t.name, displayName: t.display_name || t.name },
            update: { displayName: t.display_name || t.name },
          });
          await db.datasetTag.upsert({
            where: { datasetId_tagId: { datasetId: ds.id, tagId: tag.id } },
            create: { datasetId: ds.id, tagId: tag.id },
            update: {},
          });
        }
      }

      success++;
      if (i % 50 === 0) console.log(`[META] ${i + 1}/${names.length} | ✅${success} ❌${errors} ⏭${skipped}`);
    } catch (err) {
      errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      await db.ingestionLog.create({
        data: { phase: 'metadata', datasetCkanName: name, status: 'error', errorMessage: errMsg.substring(0, 500) },
      });
      if (i % 50 === 0) console.log(`[META] ${i + 1}/${names.length} | ✅${success} ❌${errors} ⏭${skipped}`);
    }
    await sleep(350);
  }

  setState({ errors, success, skipped });
  console.log(`[META] Done! ✅${success} ❌${errors} ⏭${skipped}`);
}