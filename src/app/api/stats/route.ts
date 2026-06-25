import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const [orgs, totalDatasets, latestDatasets, totalTables, totalRows, tags] = await Promise.all([
    db.organization.findMany({
      include: { _count: { select: { datasets: true } } },
      orderBy: { packageCount: 'desc' },
    }),
    db.dataset.count({ where: { state: 'active' } }),
    db.dataset.count({ where: { state: 'active', isLatest: true } }),
    db.dataTable.count(),
    db.dataRow.count(),
    db.tag.findMany({ orderBy: { datasets: { _count: 'desc' } }, take: 30, include: { _count: { select: { datasets: true } } } }),
  ]);

  const formattedOrgs = orgs.map(o => ({
    id: o.id, name: o.name, title: o.title,
    imageUrl: o.imageUrl,
    datasetCount: o._count.datasets,
  }));

  return NextResponse.json({
    organizations: formattedOrgs,
    totalDatasets,
    latestDatasets,
    totalTables,
    totalRows,
    popularTags: tags.map(t => ({ name: t.name, count: t._count.datasets })),
  });
}