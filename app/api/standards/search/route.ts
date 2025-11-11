import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);

  if (!q) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  // Search across StandardClause content
  // TODO: Add full-text search index (tsvector) for better performance
  const { data, error } = await supabaseAdmin
    .from('StandardClause')
    .select(`
      id,
      clauseNumber,
      content,
      category,
      importance,
      updatedAt,
      Standard!inner(code,title,publisher)
    `)
    .ilike('content', `%${q}%`)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform the results to include standard info
  const results = data?.map(clause => ({
    id: clause.id,
    clauseNumber: clause.clauseNumber,
    content: clause.content,
    category: clause.category,
    importance: clause.importance,
    updatedAt: clause.updatedAt,
    standard: {
      code: (clause.Standard as any).code,
      title: (clause.Standard as any).title,
      publisher: (clause.Standard as any).publisher
    }
  })) ?? [];

  return NextResponse.json({ results, count: results.length });
}
