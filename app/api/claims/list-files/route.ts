/**
 * API Route: List Files from Google Drive Folder
 * 
 * Lists all PDF files in a Google Drive folder for preview
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listDriveItems } from '@/lib/google-drive'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { folderId } = body

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 })
    }

    // List all items in the folder using the same function as standards retrieval
    let items
    try {
      items = await listDriveItems(folderId)
    } catch (error: any) {
      console.error('Error listing files:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response?.data
      })
      
      // Check if it's a permission error
      if (error.message?.includes('insufficientFilePermissions') || 
          error.message?.includes('permission') ||
          error.message?.includes('403') ||
          error.message?.includes('Forbidden') ||
          error.code === 403) {
        const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL
        return NextResponse.json(
          { 
            error: 'Permission denied. The service account does not have access to this folder.',
            details: `Please share the Google Drive folder with the service account email: ${serviceAccountEmail}`,
            serviceAccountEmail,
            instructions: [
              '1. Open the Google Drive folder',
              '2. Click the "Share" button',
              `3. Add the service account email: ${serviceAccountEmail}`,
              '4. Grant "Viewer" or "Editor" permission',
              '5. Click "Send"',
              '6. Try loading files again'
            ]
          },
          { status: 403 }
        )
      }
      
      // Return detailed error for debugging
      return NextResponse.json(
        { 
          error: error.message || 'Failed to list files',
          details: error.response?.data?.error?.message || error.code || 'Unknown error',
          folderId
        },
        { status: 500 }
      )
    }
    
    // Filter for PDF files only
    const pdfFiles = items.files.filter(file => 
      file.mimeType === 'application/pdf' || 
      file.name.toLowerCase().endsWith('.pdf')
    )

    // Sort by name
    pdfFiles.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      success: true,
      files: pdfFiles.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      })),
      totalFiles: pdfFiles.length,
      totalItems: items.files.length + items.folders.length,
    })

  } catch (error: any) {
    console.error('Error listing files:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to list files from Google Drive',
        details: error.details || 'Please check your Google Drive credentials and folder permissions.'
      },
      { status: 500 }
    )
  }
}

