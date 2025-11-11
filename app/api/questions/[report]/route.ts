import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: { report: string } }
) {
  try {
    const reportId = params.report;

    // Get all responses for this report
    const { data: responses, error } = await supabaseAdmin
      .from('report_responses')
      .select(`
        id,
        question_id,
        question_text,
        answer,
        evidence_url,
        verified,
        verified_at,
        created_at,
        question_bank (
          question,
          category,
          service_type,
          expected_evidence,
          report_grade,
          standard_ref
        )
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch responses error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Calculate statistics
    const stats = {
      total: responses?.length || 0,
      verified: responses?.filter((r: any) => r.verified).length || 0,
      pending: responses?.filter((r: any) => !r.verified).length || 0,
      with_evidence: responses?.filter((r: any) => r.evidence_url).length || 0
    };

    return NextResponse.json({
      report_id: reportId,
      responses: responses || [],
      stats
    });

  } catch (error) {
    console.error('Get responses error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
