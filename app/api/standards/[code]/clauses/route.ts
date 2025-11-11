import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const url = new URL(req.url);
  const contains = url.searchParams.get('contains')?.trim() ?? ''; // optional, filter by clause content
  const code = decodeURIComponent(params.code).toUpperCase();

  // First, get the standard ID
  const { data: standard, error: standardError } = await supabaseAdmin
    .from('Standard')
    .select('id')
    .eq('code', code)
    .single();

  if (standardError) {
    if (standardError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Standard not found' }, { status: 404 });
    }
    return NextResponse.json({ error: standardError.message }, { status: 500 });
  }

  // Get clauses for this standard
  let query = supabaseAdmin
    .from('StandardClause')
    .select('id,clauseNumber,content,category,importance,updatedAt')
    .eq('standardId', standard.id)
    .order('clauseNumber', { ascending: true });

  if (contains) {
    query = query.ilike('content', `%${contains}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    code,
    standardId: standard.id,
    results: data ?? [],
    count: data?.length ?? 0
  });
}
