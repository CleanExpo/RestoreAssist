import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * POST /api/scope/draft/[report]/totals
 * Calculate live totals from draft without persisting to database
 *
 * Body: { payload, overrides }
 *
 * Returns: {
 *   lineTotals: Array<{id, labour_cents, equip_cents, material_cents, total_cents}>,
 *   summary_cents: {subtotal, overhead, profit, contingency, before_gst, gst, total},
 *   overrides: {overhead_pct, profit_pct, contingency_pct, gst_pct}
 * }
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
    const { payload, overrides } = await req.json();

    // Get report metadata
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

    const org_id = report.org_id;

    // Load pricing tables
    const { data: profile } = await supabaseAdmin
      .from('pricing_profiles')
      .select('id, is_default')
      .eq('org_id', org_id)
      .eq('is_default', true)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'No default pricing profile found' },
        { status: 404 }
      );
    }

    const { data: labour } = await supabaseAdmin
      .from('labour_rates')
      .select('*')
      .eq('org_id', org_id)
      .eq('profile_id', profile.id);

    const { data: equipment } = await supabaseAdmin
      .from('equipment_rates')
      .select('*')
      .eq('org_id', org_id)
      .eq('profile_id', profile.id);

    const { data: materials } = await supabaseAdmin
      .from('material_catalog')
      .select('*')
      .eq('org_id', org_id);

    const { data: regionData } = await supabaseAdmin
      .from('region_modifiers')
      .select('*')
      .eq('org_id', org_id)
      .limit(1);

    const region = regionData?.[0] || {
      labour_multiplier: 1.0,
      equipment_multiplier: 1.0,
      material_multiplier: 1.0
    };

    // Calculate line totals
    let subtotal = 0;
    const lineTotals = (payload?.lines || []).map((line: any) => {
      let labour_cents = 0;
      let equipment_cents = 0;
      let material_cents = 0;

      // Calculate labour costs
      (line.labour || []).forEach((l: any) => {
        const labourRate = (labour || []).find(
          (x: any) => x.role.toLowerCase() === l.role.toLowerCase()
        );
        if (!labourRate) return;

        const hours = ((l.hours || l.hours_per_room || 0) * (line.qty || 1));
        labour_cents += Math.round(
          hours * labourRate.rate_cents * region.labour_multiplier
        );
      });

      // Calculate equipment costs
      (line.equipment || []).forEach((e: any) => {
        const equipmentRate = (equipment || []).find(
          (x: any) => x.code === e.code
        );
        if (!equipmentRate) return;

        const days = e.days || line.days || 1;
        const qty = (e.qty || e.qty_per_room || 1) * (line.qty || 1);
        equipment_cents += Math.round(
          qty * days * equipmentRate.rate_cents * region.equipment_multiplier
        );

        // Add setup fee if present
        if (equipmentRate.setup_fee_cents) {
          equipment_cents += equipmentRate.setup_fee_cents * qty;
        }
      });

      // Calculate material costs
      (line.materials || []).forEach((m: any) => {
        const materialRate = (materials || []).find(
          (x: any) => x.sku === m.sku
        );
        if (!materialRate) return;

        const qty = (m.qty || m.qty_per_m2 || 0) * (line.qty || 1);
        material_cents += Math.round(
          qty * materialRate.unit_cost_cents * region.material_multiplier
        );
      });

      const total = labour_cents + equipment_cents + material_cents;
      subtotal += total;

      return {
        id: line.id,
        labour_cents,
        equip_cents: equipment_cents,
        material_cents,
        total_cents: total
      };
    });

    // Apply OH&P percentages
    const overhead_pct = overrides?.overhead_pct ?? 15;
    const profit_pct = overrides?.profit_pct ?? 20;
    const contingency_pct = overrides?.contingency_pct ?? 10;
    const gst_pct = overrides?.gst_pct ?? 10;

    const overhead = Math.round(subtotal * (overhead_pct / 100));
    const profit = Math.round((subtotal + overhead) * (profit_pct / 100));
    const contingency = Math.round(subtotal * (contingency_pct / 100));
    const before_gst = subtotal + overhead + profit + contingency;
    const gst = Math.round(before_gst * (gst_pct / 100));
    const total = before_gst + gst;

    return NextResponse.json({
      lineTotals,
      summary_cents: {
        subtotal,
        overhead,
        profit,
        contingency,
        before_gst,
        gst,
        total
      },
      overrides: {
        overhead_pct,
        profit_pct,
        contingency_pct,
        gst_pct
      }
    });

  } catch (error: any) {
    console.error('Totals calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate totals' },
      { status: 500 }
    );
  }
}
