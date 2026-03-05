/**
 * API Route: Get Original Document for Gap Analysis
 * 
 * Serves the original PDF document from Google Drive
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { downloadDriveFile } from '@/lib/google-drive'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fileId } = await params

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 })
    }

    // Download the file from Google Drive
    const { buffer, mimeType } = await downloadDriveFile(fileId)

    // Return the PDF file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename="document.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })

  } catch (error: any) {
    console.error('Error serving document:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to serve document' },
      { status: 500 }
    )
  }
}

