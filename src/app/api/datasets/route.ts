import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const q = searchParams.get('q') || '';
  const org = searchParams.get('org') || '';
  const tag = searchParams.get('tag') || '';
  const latest = searchParams.get('latest') === 'true';
  const hasData = searchParams.get('hasData') === 'true';

  const where: any = { state: 'active' };
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { notes: { contains: q } },
      { name: { contains: q } },
    ];
  }
  if (org) where.organizationId = org;
  if (tag) where.tags = { some: { tag: { name: { contains: tag } } } };
  if (latest) where.isLatest = true;
  if (hasData) where.dataTables = { some: {} };

  const [datasets, total] = await Promise.all([
    db.dataset.findMany({
      where,
      include: {
        organization: { select: { name: true, title: true, imageUrl: true } },
        tags: { include: { tag: { select: { name: true } } } },
        dataTables: { select: { id: true, rowCount: true, colCount: true } },
        resources: { where: { format: { in: ['XLSX', 'XLS'] } }, select: { format: true, size: true }, take: 1 },
      },
      orderBy: { metadataModified: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.dataset.count({ where }),
  ]);

  return NextResponse.json({
    datasets,
    pagination: {
      page, limit, total,
      pages: Math.ceil(total / limit),
    },
  });
}