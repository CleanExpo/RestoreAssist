import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * GET: Quick export endpoint for a specific inspection
 * This is a convenience endpoint that forwards to the main export endpoint
 *
 * Query params:
 * - format: 'json' | 'pdf' | 'docx' (default: 'json')
 * - includeScope: 'true' | 'false' (default: 'false')
 * - includeEstimation: 'true' | 'false' (default: 'false')
 * - estimateId: string (optional, defaults to latest estimate)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') || 'json'
    const includeScope = searchParams.get('includeScope') === 'true'
    const includeEstimation = searchParams.get('includeEstimation') === 'true'
    const estimateId = searchParams.get('estimateId') || undefined

    const inspectionId = params.id

    // Forward to main export endpoint
    const exportUrl = new URL('/api/restore-assist/export', req.url)

    const response = await fetch(exportUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        inspectionId,
        format,
        includeScope,
        includeEstimation,
        estimateId,
      }),
    })

    // Get response data
    const contentType = response.headers.get('Content-Type')

    if (contentType?.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      // Binary response (PDF/DOCX)
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment',
          'Content-Length': response.headers.get('Content-Length') || buffer.byteLength.toString(),
        }
      })
    }
  } catch (error) {
    console.error('Error in inspection export shortcut:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export inspection' },
      { status: 500 }
    )
  }
}

/**
 * POST: Export specific inspection with body params
 *
 * Body:
 * - format: 'json' | 'pdf' | 'docx' (default: 'json')
 * - includeScope: boolean (default: false)
 * - includeEstimation: boolean (default: false)
 * - estimateId: string (optional)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const inspectionId = params.id

    // Forward to main export endpoint with inspection ID from params
    const exportUrl = new URL('/api/restore-assist/export', req.url)

    const response = await fetch(exportUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        ...body,
        inspectionId,
      }),
    })

    // Get response data
    const contentType = response.headers.get('Content-Type')

    if (contentType?.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      // Binary response (PDF/DOCX)
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment',
          'Content-Length': response.headers.get('Content-Length') || buffer.byteLength.toString(),
        }
      })
    }
  } catch (error) {
    console.error('Error in inspection export shortcut:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export inspection' },
      { status: 500 }
    )
  }
}
