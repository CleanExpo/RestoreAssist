import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getBrandConfig, saveBrandConfig, listTenantBrands } from '@/lib/getBrandConfig';

/**
 * POST /api/brand/update
 * Update brand configuration for report templates (multi-tenant aware)
 *
 * Headers:
 *   x-tenant: Tenant identifier (from middleware)
 *
 * Body: {
 *   company_name: string,
 *   primary_color: string,
 *   accent_color: string,
 *   logo_url: string,
 *   footer_notice: string
 * }
 *
 * Returns: { status: "updated", path: string, data: BrandConfig, tenant: string }
 */
export async function POST(req: Request) {
  try {
    // Authentication check (admin only in production)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    // Get tenant from header (set by middleware)
    const tenant = req.headers.get('x-tenant') || 'default';

    const body = await req.json();
    const {
      company_name,
      primary_color,
      accent_color,
      logo_url,
      footer_notice
    } = body;

    // Basic validation
    if (!company_name || !primary_color) {
      return NextResponse.json(
        { error: 'Missing required fields: company_name and primary_color are required' },
        { status: 400 }
      );
    }

    // Validate color format (hex colors)
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(primary_color)) {
      return NextResponse.json(
        { error: 'Invalid primary_color format. Must be a valid hex color (e.g., #003B73)' },
        { status: 400 }
      );
    }

    if (accent_color && !hexColorRegex.test(accent_color)) {
      return NextResponse.json(
        { error: 'Invalid accent_color format. Must be a valid hex color (e.g., #005FA3)' },
        { status: 400 }
      );
    }

    // Validate logo URL if provided
    if (logo_url) {
      try {
        new URL(logo_url);
      } catch {
        return NextResponse.json(
          { error: 'Invalid logo_url format. Must be a valid URL' },
          { status: 400 }
        );
      }
    }

    // Construct brand data
    const brandData = {
      company_name,
      primary_color,
      accent_color: accent_color || primary_color,
      logo_url: logo_url || '',
      footer_notice: footer_notice || 'Generated using the RestoreAssist Template Framework.',
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
      org_id: tenant !== 'default' ? tenant : undefined
    };

    // Save tenant-specific brand configuration
    const filePath = saveBrandConfig(tenant, brandData);

    console.log(`Brand configuration updated by user ${session.user.id} for tenant: ${tenant}`);

    return NextResponse.json({
      status: 'updated',
      path: filePath,
      data: brandData,
      tenant: tenant,
      message: `Brand configuration saved successfully for tenant: ${tenant}`
    });

  } catch (error: any) {
    console.error('Brand update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update brand configuration' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/brand/update
 * Retrieve current brand configuration (multi-tenant aware)
 *
 * Headers:
 *   x-tenant: Tenant identifier (from middleware)
 *
 * Returns: BrandConfig object with tenant information
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

    // Get tenant from header (set by middleware)
    const tenant = req.headers.get('x-tenant') || 'default';

    // Load tenant-specific brand configuration
    const brandData = getBrandConfig(tenant);

    // Determine if this is a custom config or default
    const isCustom = brandData.org_id === tenant;

    return NextResponse.json({
      status: isCustom ? 'found' : 'default',
      data: brandData,
      tenant: tenant,
      message: isCustom
        ? `Brand configuration loaded for tenant: ${tenant}`
        : `Using default brand configuration for tenant: ${tenant}`
    });

  } catch (error: any) {
    console.error('Brand retrieval error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve brand configuration' },
      { status: 500 }
    );
  }
}
