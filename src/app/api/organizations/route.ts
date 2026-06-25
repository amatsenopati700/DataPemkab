import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const orgs = await db.organization.findMany({
    include: { _count: { select: { datasets: true } } },
    orderBy: { packageCount: 'desc' },
  });

  const formatted = orgs.map(o => ({
    id: o.id,
    name: o.name,
    title: o.title,
    description: o.description,
    imageUrl: o.imageUrl,
    datasetCount: o._count.datasets,
  }));

  return NextResponse.json(formatted);
}