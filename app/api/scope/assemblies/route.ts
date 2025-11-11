import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/scope/assemblies
 * List available scope assemblies (filtered by service type and org)
 *
 * Query params:
 *   service: Service type filter (Water, Mould, Fire, Bio)
 *   org: Organization ID filter
 *
 * Returns: { assemblies: Array<Assembly> }
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const tenant = req.headers.get('x-tenant') || 'default';
    const service = url.searchParams.get('service');
    const org = url.searchParams.get('org') || tenant;

    // Build query
    let query = supabaseAdmin
      .from('scope_assemblies')
      .select('*')
      .eq('org_id', org)
      .order('service_type', { ascending: true })
      .order('name', { ascending: true });

    // Filter by service type if provided
    if (service) {
      query = query.eq('service_type', service);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching assemblies:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      assemblies: data || [],
      tenant,
      org
    });

  } catch (error: any) {
    console.error('Assemblies fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch assemblies' },
      { status: 500 }
    );
  }
}
