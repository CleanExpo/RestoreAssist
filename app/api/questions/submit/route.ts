import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - please sign in' },
        { status: 401 }
      );
    }

    // Get user ID
    const { data: user, error: userError } = await supabaseAdmin
      .from('User')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { report_id, answers } = body;

    if (!report_id || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'Missing report_id or answers array' },
        { status: 400 }
      );
    }

    // 3. Validate report exists
    const { data: report, error: reportError } = await supabaseAdmin
      .from('report_uploads')
      .select('id')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // 4. Prepare response records
    const rows = answers.map((a: any) => ({
      report_id,
      question_id: a.question_id || null,
      question_text: a.question_text || a.question || null,
      answer: a.answer || '',
      evidence_url: a.evidence_url || null,
      verified: a.verified ?? false,
      verified_by: a.verified ? user.id : null,
      verified_at: a.verified ? new Date().toISOString() : null
    }));

    // 5. Delete existing responses for this report (to allow updates)
    const { error: deleteError } = await supabaseAdmin
      .from('report_responses')
      .delete()
      .eq('report_id', report_id);

    if (deleteError) {
      console.error('Error deleting old responses:', deleteError);
    }

    // 6. Insert new responses
    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('report_responses')
      .insert(rows)
      .select('id');

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save responses' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'saved',
      count: insertedRows?.length || 0,
      report_id,
      verified_count: rows.filter((r: any) => r.verified).length
    });

  } catch (error) {
    console.error('Submit responses error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
