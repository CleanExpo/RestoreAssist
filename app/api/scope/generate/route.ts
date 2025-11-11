import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * POST /api/scope/generate
 * Generate scope of works from report analysis and technician responses
 *
 * Headers:
 *   x-tenant: Tenant identifier (from middleware)
 *
 * Body: {
 *   report_id: string
 * }
 *
 * Returns: {
 *   status: "ok",
 *   lines: number,
 *   scope_lines: Array<ScopeLine>
 * }
 *
 * Process:
 * 1. Pull report metadata, analysis, and technician responses
 * 2. Select applicable assemblies based on service type and responses
 * 3. Load pricing tables (labour, equipment, materials, region modifiers)
 * 4. Calculate costs for each assembly
 * 5. Store scope lines in database
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

    const { report_id } = await req.json();

    if (!report_id) {
      return NextResponse.json(
        { error: 'Missing report_id' },
        { status: 400 }
      );
    }

    // ========================================
    // 1) Pull report metadata
    // ========================================
    const { data: report, error: reportError } = await supabaseAdmin
      .from('report_uploads')
      .select('id, org_id, service_type, report_grade')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // Use report's org_id if available, otherwise use tenant
    const org_id = report.org_id || tenant;

    // ========================================
    // 2) Pull analysis and responses
    // ========================================
    const { data: analysis } = await supabaseAdmin
      .from('report_analysis')
      .select('summary, clause_refs, key_terms')
      .eq('report_upload_id', report_id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single();

    const { data: responses } = await supabaseAdmin
      .from('report_responses')
      .select(`
        answer,
        verified,
        question_bank (
          question,
          category
        )
      `)
      .eq('report_id', report_id);

    // ========================================
    // 3) Select applicable assemblies
    // ========================================
    const { data: assemblies, error: assembliesError } = await supabaseAdmin
      .from('scope_assemblies')
      .select('*')
      .eq('org_id', org_id)
      .eq('service_type', report.service_type || 'Water');

    if (assembliesError || !assemblies || assemblies.length === 0) {
      return NextResponse.json(
        { error: 'No assemblies found for service type', service_type: report.service_type },
        { status: 404 }
      );
    }

    // ========================================
    // 4) Filter assemblies based on responses
    // ========================================
    const selected = assemblies.filter((a: any) => {
      // Check for containment requirement
      const needsContainment = (responses || []).some((r: any) =>
        /containment/i.test(r.question_bank?.question || '') &&
        /yes/i.test(r.answer || '')
      );

      if (a.code.includes('CONTAINMENT')) {
        return needsContainment;
      }

      // Check for mould-specific assemblies
      if (a.code.includes('MOULD')) {
        const hasMould = (responses || []).some((r: any) =>
          /mould|mold/i.test(r.question_bank?.question || '') &&
          /yes|present|detected/i.test(r.answer || '')
        );
        return hasMould;
      }

      // Check for odour treatment
      if (a.code.includes('ODOUR') || a.code.includes('HYDROXYL') || a.code.includes('OZONE')) {
        const needsOdour = (responses || []).some((r: any) =>
          /odou?r|smell/i.test(r.question_bank?.question || '') &&
          /yes|strong|present/i.test(r.answer || '')
        );
        return needsOdour;
      }

      // Include standard assemblies by default
      return a.code.includes('STD') || a.code.includes('STANDARD');
    });

    if (selected.length === 0) {
      return NextResponse.json(
        { error: 'No applicable assemblies found based on responses' },
        { status: 404 }
      );
    }

    // ========================================
    // 5) Load pricing tables
    // ========================================
    const { data: profile } = await supabaseAdmin
      .from('pricing_profiles')
      .select('id, is_default')
      .eq('org_id', org_id)
      .eq('is_default', true)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'No pricing profile found' },
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

    const region = regionData?.[0];

    // ========================================
    // 6) Calculate scope lines
    // ========================================
    const lines: any[] = [];

    for (const assembly of selected) {
      const calc: any = {
        labour_hours: 0,
        labour_breakdown: [],
        equipment_days: 0,
        equipment_breakdown: [],
        materials: []
      };

      // Calculate labour costs
      let labour_cents = 0;
      const labourReqs = assembly.labour || [];

      labourReqs.forEach((l: any) => {
        const labourRate = (labour || []).find((x: any) =>
          x.role.toLowerCase() === l.role.toLowerCase()
        );

        const hours = l.hours ?? l.hours_per_room ?? 0.5;
        const rate = labourRate ? labourRate.rate_cents : 0;
        const multiplier = region?.labour_multiplier ?? 1;
        const cost = Math.round(hours * rate * multiplier);

        labour_cents += cost;
        calc.labour_hours += hours;
        calc.labour_breakdown.push({
          role: l.role,
          hours,
          rate_cents: rate,
          multiplier,
          total_cents: cost
        });
      });

      // Calculate equipment costs
      let equipment_cents = 0;
      const equipmentReqs = assembly.equipment || [];

      equipmentReqs.forEach((e: any) => {
        const equipRate = (equipment || []).find((x: any) => x.code === e.code);

        const days = e.days ?? 1;
        const qty = e.qty ?? e.qty_per_room ?? 1;
        const rate = equipRate ? equipRate.rate_cents : 0;
        const multiplier = region?.equipment_multiplier ?? 1;
        const cost = Math.round(qty * days * rate * multiplier);

        equipment_cents += cost;
        calc.equipment_days += qty * days;
        calc.equipment_breakdown.push({
          code: e.code,
          name: equipRate?.name || e.code,
          qty,
          days,
          rate_cents: rate,
          multiplier,
          total_cents: cost
        });
      });

      // Calculate material costs
      let material_cents = 0;
      const materialReqs = assembly.materials || [];

      materialReqs.forEach((m: any) => {
        const matRate = (materials || []).find((x: any) => x.sku === m.sku);

        const qty = m.qty ?? m.qty_per_m2 ?? 0;
        const cost = matRate ? matRate.unit_cost_cents : 0;
        const multiplier = region?.material_multiplier ?? 1;
        const total = Math.round(qty * cost * multiplier);

        material_cents += total;
        calc.materials.push({
          sku: m.sku,
          name: matRate?.name || m.sku,
          qty,
          unit_cost_cents: cost,
          multiplier,
          total_cents: total
        });
      });

      // Get clause citation
      const clauses = assembly.clauses || [];
      const clause = clauses[0];
      const clause_citation = clause
        ? `Per ${clause.standard} §${clause.section}${clause.description ? ': ' + clause.description : ''}`
        : null;

      lines.push({
        org_id,
        report_id,
        assembly_id: assembly.id,
        service_type: report.service_type,
        line_code: assembly.code,
        line_description: assembly.name,
        qty: 1,
        unit: 'EA',
        labour_cost_cents: labour_cents,
        equipment_cost_cents: equipment_cents,
        material_cost_cents: material_cents,
        clause_citation,
        calc_details: calc
      });
    }

    // ========================================
    // 7) Persist scope lines
    // ========================================
    if (lines.length > 0) {
      // Delete existing lines for this report
      await supabaseAdmin
        .from('report_scope_lines')
        .delete()
        .eq('org_id', org_id)
        .eq('report_id', report_id);

      // Insert new lines
      const { error: insertError } = await supabaseAdmin
        .from('report_scope_lines')
        .insert(lines);

      if (insertError) {
        console.error('Error inserting scope lines:', insertError);
        return NextResponse.json(
          { error: 'Failed to store scope lines', details: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      status: 'ok',
      lines: lines.length,
      scope_lines: lines,
      tenant,
      org_id
    });

  } catch (error: any) {
    console.error('Scope generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Scope generation failed' },
      { status: 500 }
    );
  }
}
