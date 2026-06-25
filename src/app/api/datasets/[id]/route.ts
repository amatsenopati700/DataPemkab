import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const dataset = await db.dataset.findUnique({
    where: { id },
    include: {
      organization: true,
      tags: { include: { tag: true } },
      resources: true,
      dataTables: {
        include: {
          columns: { orderBy: { colIndex: 'asc' } },
          rows: { orderBy: { rowIndex: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!dataset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(dataset);
}