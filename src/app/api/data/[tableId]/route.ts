import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '100');

  const table = await db.dataTable.findUnique({
    where: { id: tableId },
    include: {
      columns: { orderBy: { colIndex: 'asc' } },
      dataset: { select: { title: true, name: true } },
    },
  });

  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [rows, total] = await Promise.all([
    db.dataRow.findMany({
      where: { tableId },
      orderBy: { rowIndex: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.dataRow.count({ where: { tableId } }),
  ]);

  return NextResponse.json({
    table: { id: table.id, sheetName: table.sheetName, rowCount: table.rowCount, colCount: table.colCount, headersJson: table.headersJson, dataset: table.dataset },
    columns: table.columns,
    rows: rows.map(r => ({ ...r, values: JSON.parse(r.valuesJson) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}