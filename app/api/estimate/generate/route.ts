import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * POST /api/estimate/generate
 * Generate final estimate with OH&P, contingency, and GST
 *
 * Headers:
 *   x-tenant: Tenant identifier (from middleware)
 *
 * Body: {
 *   report_id: string,
 *   overrides?: {
 *     overhead_pct?: number,
 *     profit_pct?: number,
 *     contingency_pct?: number,
 *     gst_pct?: number
 *   }
 * }
 *
 * Returns: {
 *   status: "ok",
 *   totals_cents: {
 *     subtotal: number,
 *     before_gst: number,
 *     gst: number,
 *     total: number
 *   },
 *   breakdown: object
 * }
 *
 * Process:
 * 1. Pull all scope lines for report
 * 2. Calculate subtotal (labour + equipment + materials)
 * 3. Apply overhead percentage
 * 4. Apply profit percentage on (subtotal + overhead)
 * 5. Apply contingency percentage on subtotal
 * 6. Calculate GST on (subtotal + OH&P + contingency)
 * 7. Store estimate in database
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

    // Get tenant from header
    const tenant = req.headers.get('x-tenant') || 'default';

    const { report_id, overrides } = await req.json();

    if (!report_id) {
      return NextResponse.json(
        { error: 'Missing report_id' },
        { status: 400 }
      );
    }

    // ========================================
    // 1) Get report metadata
    // ========================================
    const { data: report, error: reportError } = await supabaseAdmin
      .from('report_uploads')
      .select('org_id')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    const org_id = report.org_id || tenant;

    // ========================================
    // 2) Get all scope lines for this report
    // ========================================
    const { data: lines, error: linesError } = await supabaseAdmin
      .from('report_scope_lines')
      .select('labour_cost_cents, equipment_cost_cents, material_cost_cents, calc_details')
      .eq('org_id', org_id)
      .eq('report_id', report_id);

    if (linesError) {
      return NextResponse.json(
        { error: 'Failed to fetch scope lines', details: linesError.message },
        { status: 500 }
      );
    }

    if (!lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'No scope lines found. Generate scope first using /api/scope/generate' },
        { status: 404 }
      );
    }

    // ========================================
    // 3) Calculate subtotal
    // ========================================
    const subtotal = lines.reduce((sum: number, line: any) => {
      return sum +
        (line.labour_cost_cents || 0) +
        (line.equipment_cost_cents || 0) +
        (line.material_cost_cents || 0);
    }, 0);

    // ========================================
    // 4) Get percentages (with overrides)
    // ========================================
    const overhead_pct = overrides?.overhead_pct ?? 15;
    const profit_pct = overrides?.profit_pct ?? 20;
    const contingency_pct = overrides?.contingency_pct ?? 10;
    const gst_pct = overrides?.gst_pct ?? 10;

    // Validate percentages
    if (overhead_pct < 0 || overhead_pct > 100 ||
        profit_pct < 0 || profit_pct > 100 ||
        contingency_pct < 0 || contingency_pct > 100 ||
        gst_pct < 0 || gst_pct > 100) {
      return NextResponse.json(
        { error: 'Invalid percentage values. Must be between 0 and 100.' },
        { status: 400 }
      );
    }

    // ========================================
    // 5) Calculate components
    // ========================================

    // Overhead: % of subtotal
    const overhead = Math.round(subtotal * (overhead_pct / 100));

    // Profit: % of (subtotal + overhead)
    const profit = Math.round((subtotal + overhead) * (profit_pct / 100));

    // Contingency: % of subtotal
    const contingency = Math.round(subtotal * (contingency_pct / 100));

    // Total before GST
    const before_gst = subtotal + overhead + profit + contingency;

    // GST: % of before_gst
    const gst = Math.round(before_gst * (gst_pct / 100));

    // Final total
    const total = before_gst + gst;

    // ========================================
    // 6) Build breakdown for audit trail
    // ========================================
    const breakdown = {
      subtotal_cents: subtotal,
      overhead_pct,
      overhead_cents: overhead,
      profit_pct,
      profit_cents: profit,
      contingency_pct,
      contingency_cents: contingency,
      gst_pct,
      gst_cents: gst,
      total_before_gst_cents: before_gst,
      total_inc_gst_cents: total,
      line_count: lines.length,
      calculated_at: new Date().toISOString(),
      calculated_by: session.user.id,
      components: {
        overhead,
        profit,
        contingency,
        gst
      }
    };

    // ========================================
    // 7) Store estimate (replace existing)
    // ========================================

    // Delete existing estimate for this report
    await supabaseAdmin
      .from('report_estimates')
      .delete()
      .eq('org_id', org_id)
      .eq('report_id', report_id);

    // Insert new estimate
    const { error: insertError } = await supabaseAdmin
      .from('report_estimates')
      .insert({
        org_id,
        report_id,
        subtotal_cents: subtotal,
        overhead_pct,
        profit_pct,
        contingency_pct,
        gst_pct,
        total_before_gst_cents: before_gst,
        gst_cents: gst,
        total_inc_gst_cents: total,
        breakdown
      });

    if (insertError) {
      console.error('Error inserting estimate:', insertError);
      return NextResponse.json(
        { error: 'Failed to store estimate', details: insertError.message },
        { status: 500 }
      );
    }

    // ========================================
    // 8) Return result
    // ========================================
    return NextResponse.json({
      status: 'ok',
      totals_cents: {
        subtotal,
        before_gst,
        gst,
        total
      },
      breakdown,
      tenant,
      org_id
    });

  } catch (error: any) {
    console.error('Estimate generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Estimate generation failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/estimate/generate?report_id=xxx
 * Retrieve existing estimate for a report
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const report_id = searchParams.get('report_id');

    if (!report_id) {
      return NextResponse.json(
        { error: 'Missing report_id parameter' },
        { status: 400 }
      );
    }

    const { data: estimate, error } = await supabaseAdmin
      .from('report_estimates')
      .select('*')
      .eq('report_id', report_id)
      .single();

    if (error || !estimate) {
      return NextResponse.json(
        { error: 'No estimate found. Generate one first using POST /api/estimate/generate' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'found',
      estimate
    });

  } catch (error: any) {
    console.error('Estimate retrieval error:', error);
    return NextResponse.json(
      { error: error.message || 'Estimate retrieval failed' },
      { status: 500 }
    );
  }
}
