import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * POST /api/scope/draft/[report]/finalize
 * Finalize draft: persist scope lines, generate estimate, compose PDF
 *
 * Process:
 * 1. Get draft
 * 2. Delete existing scope lines
 * 3. Insert new scope lines from draft
 * 4. Call /api/estimate/generate with overrides
 * 5. Call /api/reports/compose to generate PDF
 *
 * Returns: { status: "finalized", pdf_url: string, output_id: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { report: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const report_id = params.report;

    // 1. Get draft
    const { data: draft, error: draftError } = await supabaseAdmin
      .from('report_scope_drafts')
      .select('*')
      .eq('report_id', report_id)
      .single();

    if (draftError || !draft) {
      return NextResponse.json(
        { error: 'No draft found for this report' },
        { status: 404 }
      );
    }

    // Get report metadata for service type
    const { data: report } = await supabaseAdmin
      .from('report_uploads')
      .select('service_type')
      .eq('id', report_id)
      .single();

    const service_type = report?.service_type || 'Water';

    // 2. Delete existing scope lines
    await supabaseAdmin
      .from('report_scope_lines')
      .delete()
      .eq('org_id', draft.org_id)
      .eq('report_id', report_id);

    // 3. Insert new scope lines from draft
    const lines = (draft.payload?.lines || []).map((line: any) => ({
      org_id: draft.org_id,
      report_id,
      assembly_id: line.assembly_id || null,
      service_type: line.service_type || service_type,
      line_code: line.code,
      line_description: line.desc,
      qty: line.qty || 1,
      unit: line.unit || 'EA',
      labour_cost_cents: 0, // Will be calculated by estimate
      equipment_cost_cents: 0,
      material_cost_cents: 0,
      clause_citation: line.clause || null,
      calc_details: line.calc || {
        labour: line.labour || [],
        equipment: line.equipment || [],
        materials: line.materials || [],
        notes: line.notes || null
      }
    }));

    if (lines.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('report_scope_lines')
        .insert(lines);

      if (insertError) {
        console.error('Error inserting scope lines:', insertError);
        return NextResponse.json(
          { error: 'Failed to persist scope lines', details: insertError.message },
          { status: 500 }
        );
      }
    }

    // 4. Generate estimate with overrides
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

    const estimateResponse = await fetch(`${baseUrl}/api/estimate/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('Cookie') || ''
      },
      body: JSON.stringify({
        report_id,
        overrides: draft.overrides || {}
      })
    });

    if (!estimateResponse.ok) {
      const estimateError = await estimateResponse.json();
      console.error('Estimate generation failed:', estimateError);
      return NextResponse.json(
        { error: 'Failed to generate estimate', details: estimateError.error },
        { status: 500 }
      );
    }

    // 5. Compose final PDF
    const composeResponse = await fetch(`${baseUrl}/api/reports/compose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('Cookie') || ''
      },
      body: JSON.stringify({ report_id })
    });

    if (!composeResponse.ok) {
      const composeError = await composeResponse.json();
      console.error('Compose failed:', composeError);
      return NextResponse.json(
        { error: 'Failed to compose PDF', details: composeError.error },
        { status: 500 }
      );
    }

    const composeData = await composeResponse.json();

    return NextResponse.json({
      status: 'finalized',
      pdf_url: composeData.pdf_url,
      output_id: composeData.output_id,
      lines_count: lines.length
    });

  } catch (error: any) {
    console.error('Finalize error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to finalize draft' },
      { status: 500 }
    );
  }
}
