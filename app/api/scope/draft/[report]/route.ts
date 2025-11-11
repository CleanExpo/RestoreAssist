import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/scope/draft/[report]
 * Get or create draft for a report
 *
 * Returns: Draft object with { id, org_id, report_id, payload, overrides, created_at, updated_at }
 */
export async function GET(
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

    // Get report metadata
    const { data: report, error: reportError } = await supabaseAdmin
      .from('report_uploads')
      .select('id, org_id, service_type')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // Check for existing draft
    const { data: draft } = await supabaseAdmin
      .from('report_scope_drafts')
      .select('*')
      .eq('org_id', report.org_id)
      .eq('report_id', report_id)
      .single();

    if (draft) {
      return NextResponse.json(draft);
    }

    // Create new draft
    const emptyPayload = {
      lines: [],
      metadata: {
        service_type: report.service_type,
        created_by: session.user.id
      }
    };

    const { data: newDraft, error: createError } = await supabaseAdmin
      .from('report_scope_drafts')
      .insert({
        org_id: report.org_id,
        report_id: report_id,
        payload: emptyPayload,
        overrides: null
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating draft:', createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(newDraft);

  } catch (error: any) {
    console.error('Draft GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get draft' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/scope/draft/[report]
 * Update draft with new payload and/or overrides
 *
 * Body: { payload?, overrides? }
 *
 * Returns: Updated draft object
 */
export async function PATCH(
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
    const body = await req.json();

    // Get report metadata for org_id
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

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (body.payload !== undefined) {
      updateData.payload = body.payload;
    }

    if (body.overrides !== undefined) {
      updateData.overrides = body.overrides;
    }

    // Update draft
    const { data: updatedDraft, error: updateError } = await supabaseAdmin
      .from('report_scope_drafts')
      .update(updateData)
      .eq('org_id', report.org_id)
      .eq('report_id', report_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating draft:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedDraft);

  } catch (error: any) {
    console.error('Draft PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update draft' },
      { status: 500 }
    );
  }
}
