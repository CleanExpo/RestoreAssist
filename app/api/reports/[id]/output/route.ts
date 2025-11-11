import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/reports/[id]/output
 * Retrieve the latest composed report output for a given report ID
 *
 * Query params:
 *   - version (optional): Retrieve a specific version instead of latest
 *
 * Returns: {
 *   id: UUID,
 *   report_id: UUID,
 *   html: string,
 *   pdf_url: string,
 *   docx_url: string | null,
 *   version: number,
 *   generated_at: timestamp,
 *   generated_by: UUID
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const reportId = params.id;
    const url = new URL(req.url);
    const requestedVersion = url.searchParams.get('version');

    if (!reportId) {
      return NextResponse.json(
        { error: 'Missing report ID' },
        { status: 400 }
      );
    }

    // Build query for report output
    let query = supabaseAdmin
      .from('report_outputs')
      .select('*')
      .eq('report_id', reportId);

    if (requestedVersion) {
      // Get specific version
      query = query.eq('version', parseInt(requestedVersion));
    } else {
      // Get latest version
      query = query.order('version', { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Report output not found - report may not have been composed yet' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: data.id,
      report_id: data.report_id,
      html: data.html,
      pdf_url: data.pdf_url,
      docx_url: data.docx_url,
      version: data.version,
      generated_at: data.generated_at,
      generated_by: data.generated_by
    });

  } catch (error: any) {
    console.error('Error retrieving report output:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve report output' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/[id]/output/versions
 * List all versions of composed reports for a given report ID
 *
 * Returns: [{
 *   id: UUID,
 *   version: number,
 *   generated_at: timestamp,
 *   generated_by: UUID
 * }]
 */
export async function OPTIONS(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const reportId = params.id;

    const { data, error } = await supabaseAdmin
      .from('report_outputs')
      .select('id, version, generated_at, generated_by')
      .eq('report_id', reportId)
      .order('version', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to retrieve versions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      versions: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('Error retrieving report versions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve report versions' },
      { status: 500 }
    );
  }
}
