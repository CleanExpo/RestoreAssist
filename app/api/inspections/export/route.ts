import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const status = searchParams.get('status');

  const where: Record<string, unknown> = { userId: session.user.id };
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(from);
    if (to) {
      // Include the full end date by setting to end-of-day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      createdAt.lte = toDate;
    }
    where.createdAt = createdAt;
  }
  if (status && status !== 'ALL') where.status = status;

  const inspections = await prisma.inspection.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
      status: true,
      createdAt: true,
      technicianName: true,
      _count: { select: { moistureReadings: true, photos: true } },
    },
  });

  // Build CSV
  const headers = [
    'ID',
    'Inspection Number',
    'Address',
    'Postcode',
    'Status',
    'Technician',
    'Moisture Readings',
    'Photos',
    'Created At',
  ];

  const rows = inspections.map((i) =>
    [
      i.id,
      i.inspectionNumber ?? '',
      `"${(i.propertyAddress ?? '').replace(/"/g, '""')}"`,
      i.propertyPostcode ?? '',
      i.status,
      `"${(i.technicianName ?? '').replace(/"/g, '""')}"`,
      i._count?.moistureReadings ?? 0,
      i._count?.photos ?? 0,
      new Date(i.createdAt).toISOString(),
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="inspections-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
