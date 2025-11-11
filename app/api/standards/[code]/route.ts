import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  const code = decodeURIComponent(params.code).toUpperCase(); // e.g., S500

  // Get the standard metadata
  const { data: standard, error: standardError } = await supabaseAdmin
    .from('Standard')
    .select('*')
    .eq('code', code)
    .single();

  if (standardError) {
    if (standardError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Standard not found' }, { status: 404 });
    }
    return NextResponse.json({ error: standardError.message }, { status: 500 });
  }

  // Get all clauses for this standard
  const { data: clauses, error: clausesError } = await supabaseAdmin
    .from('StandardClause')
    .select('*')
    .eq('standardId', standard.id)
    .order('clauseNumber', { ascending: true });

  if (clausesError) {
    return NextResponse.json({ error: clausesError.message }, { status: 500 });
  }

  return NextResponse.json({
    standard,
    clauses: clauses ?? [],
    totalClauses: clauses?.length ?? 0
  });
}
