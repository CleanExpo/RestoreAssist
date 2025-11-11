import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { renderToString } from 'react-dom/server';
import ReportComposer from '@/components/ReportComposer';
import { toPDFWithStyle } from '@/lib/pdf';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * POST /api/reports/compose
 * Compose a professional HTML/PDF report from analysis and responses (multi-tenant aware)
 *
 * Headers:
 *   x-tenant: Tenant identifier (from middleware)
 *
 * Body: { report_id: UUID, customCSS?: string }
 * Returns: { status: "generated", html: string, pdf_url: string, output_id: UUID, tenant: string }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant from header (set by middleware)
    const tenant = req.headers.get('x-tenant') || 'default';

    const { report_id, customCSS } = await req.json();

    if (!report_id) {
      return NextResponse.json(
        { error: 'Missing report_id' },
        { status: 400 }
      );
    }

    // 1. Fetch report metadata
    const { data: report, error: reportError } = await supabaseAdmin
      .from('report_uploads')
      .select('*')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // 2. Fetch AI analysis
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('report_analysis')
      .select('*')
      .eq('report_upload_id', report_id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single();

    if (analysisError) {
      return NextResponse.json(
        { error: 'Analysis not found - report may not be processed yet' },
        { status: 404 }
      );
    }

    // 3. Fetch technician responses with question bank data
    const { data: responses, error: responsesError } = await supabaseAdmin
      .from('report_responses')
      .select(`
        *,
        question_bank (
          question,
          category,
          expected_evidence,
          standard_ref
        )
      `)
      .eq('report_id', report_id);

    if (responsesError) {
      console.error('Error fetching responses:', responsesError);
      // Continue even if no responses (technician may not have answered yet)
    }

    // 4. Fetch scope lines (if generated)
    const { data: scopeLines } = await supabaseAdmin
      .from('report_scope_lines')
      .select('*')
      .eq('report_id', report_id)
      .order('created_at', { ascending: true });

    // 5. Fetch estimate (if generated)
    const { data: estimate } = await supabaseAdmin
      .from('report_estimates')
      .select('*')
      .eq('report_id', report_id)
      .single();

    // 6. Render HTML using ReportComposer component
    const html = renderToString(
      ReportComposer({
        report,
        analysis,
        responses: responses || [],
        scopeLines: scopeLines || [],
        estimate: estimate || undefined
      })
    );

    // 7. Generate PDF from HTML with tenant-specific branding
    const pdf = await toPDFWithStyle(html, report_id, customCSS, true, tenant);

    // 8. Check for existing outputs to determine version
    const { data: existingOutputs } = await supabaseAdmin
      .from('report_outputs')
      .select('version')
      .eq('report_id', report_id)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existingOutputs && existingOutputs.length > 0
      ? (existingOutputs[0].version || 0) + 1
      : 1;

    // 9. Store output in database with tenant information
    const { data: output, error: outputError } = await supabaseAdmin
      .from('report_outputs')
      .insert({
        report_id,
        html,
        pdf_url: pdf.url,
        version: nextVersion,
        generated_by: session.user.id,
        generated_at: new Date().toISOString(),
        org_id: tenant !== 'default' ? tenant : null
      })
      .select()
      .single();

    if (outputError) {
      console.error('Error storing output:', outputError);
      return NextResponse.json(
        { error: 'Failed to store report output' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'generated',
      html,
      pdf_url: pdf.url,
      output_id: output.id,
      version: nextVersion,
      tenant: tenant
    });

  } catch (error: any) {
    console.error('Report composition error:', error);
    return NextResponse.json(
      { error: error.message || 'Report composition failed' },
      { status: 500 }
    );
  }
}
