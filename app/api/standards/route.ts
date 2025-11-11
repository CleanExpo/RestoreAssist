import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 25), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin.from('Standard')
    .select('id,code,title,edition,publisher,version,updatedAt', { count: 'exact' })
    .order('updatedAt', { ascending: false })
    .range(from, to);

  if (q) {
    // Search across code, title, and publisher
    query = query.or(`code.ilike.%${q}%,title.ilike.%${q}%,publisher.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ page, limit, total: count ?? 0, results: data });
}
