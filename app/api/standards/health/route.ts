import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    // Test database connectivity by querying a single row
    const { data, error } = await supabaseAdmin
      .from('Standard')
      .select('id')
      .limit(1);

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Standards API is healthy',
      standardsAvailable: data ? true : false,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
