import type { CKANOrganization, CKANPackage } from '@/types';

const CKAN_BASE = 'https://opendata.wonosobokab.go.id';

async function ckanFetch(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${CKAN_BASE}/api/3/action/${action}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`CKAN API error: ${resp.status} ${resp.statusText} for ${action}`);
  }

  const data = await resp.json();
  if (!data.success) {
    throw new Error(`CKAN API failure: ${JSON.stringify(data.error)}`);
  }

  return data.result;
}

export async function getOrganizations(): Promise<CKANOrganization[]> {
  return ckanFetch('organization_list', { all_fields: 'true', limit: '100' }) as Promise<CKANOrganization[]>;
}

export async function getPackageList(): Promise<string[]> {
  return ckanFetch('package_list', { limit: '5000' }) as Promise<string[]>;
}

export async function getPackage(id: string): Promise<CKANPackage> {
  return ckanFetch('package_show', { id }) as Promise<CKANPackage>;
}

export async function getAllPackages(
  onProgress?: (current: number, total: number, name: string) => void,
  delayMs = 500
): Promise<CKANPackage[]> {
  const names = await getPackageList();
  const total = names.length;
  const packages: CKANPackage[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    onProgress?.(i + 1, total, name);
    try {
      const pkg = await getPackage(name);
      packages.push(pkg);
    } catch (err) {
      console.error(`Failed to fetch package ${name}:`, err);
    }
    if (delayMs > 0 && i < names.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return packages;
}