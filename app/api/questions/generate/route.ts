import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const reportId = url.searchParams.get('report');

    if (!reportId) {
      return NextResponse.json(
        { error: 'Missing report id parameter' },
        { status: 400 }
      );
    }

    // 1. Get AI-generated questions from report_analysis
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('report_analysis')
      .select('key_findings, service_type')
      .eq('report_upload_id', reportId)
      .single();

    if (analysisError) {
      return NextResponse.json(
        { error: 'Report analysis not found' },
        { status: 404 }
      );
    }

    const aiQuestions = analysis?.key_findings?.questions ?? [];
    const serviceType = analysis?.service_type;
    const reportGrade = analysis?.key_findings?.report_grade ?? 2;

    // 2. Get matching questions from question_bank
    const { data: bankQuestions, error: bankError } = await supabaseAdmin
      .from('question_bank')
      .select('*')
      .or(`service_type.eq.${serviceType},service_type.is.null`)
      .lte('report_grade', reportGrade);

    if (bankError) {
      console.error('Error fetching question bank:', bankError);
    }

    // 3. Merge AI questions with existing bank
    // Match by normalized question text and category
    const merged = aiQuestions.map((aiQ: any) => {
      const normalizedAiQuestion = aiQ.question.toLowerCase().trim();

      // Try to find matching question in bank
      const match = bankQuestions?.find(
        (bankQ: any) =>
          bankQ.question.toLowerCase().trim() === normalizedAiQuestion &&
          bankQ.category === aiQ.category
      );

      if (match) {
        // Use existing bank question with AI metadata
        return {
          ...match,
          source: 'bank',
          ai_generated: false,
          expected_evidence: match.expected_evidence || aiQ.expected_evidence
        };
      } else {
        // New AI-generated question not in bank
        return {
          id: null, // No bank ID
          question: aiQ.question,
          category: aiQ.category,
          service_type: serviceType,
          expected_evidence: aiQ.expected_evidence || [],
          report_grade: aiQ.report_grade || reportGrade,
          standard_ref: null,
          source: 'ai',
          ai_generated: true
        };
      }
    });

    // 4. Add essential questions from bank that weren't AI-generated
    const essentialCategories = ['Safety', 'Documentation'];
    const essentialQuestions = bankQuestions?.filter(
      (bankQ: any) =>
        essentialCategories.includes(bankQ.category) &&
        !merged.some((m: any) => m.id === bankQ.id)
    ) || [];

    const allQuestions = [...merged, ...essentialQuestions.map(q => ({ ...q, source: 'bank', ai_generated: false }))];

    return NextResponse.json({
      report_id: reportId,
      service_type: serviceType,
      report_grade: reportGrade,
      questions: allQuestions,
      count: allQuestions.length,
      ai_generated_count: merged.filter((q: any) => q.ai_generated).length,
      bank_count: allQuestions.filter((q: any) => !q.ai_generated).length
    });

  } catch (error) {
    console.error('Generate questions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
