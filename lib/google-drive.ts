/**
 * Google Drive Service
 * 
 * Handles authentication and file operations with Google Drive
 * Uses service account credentials for server-side access
 */

import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

// Initialize Google Drive client with service account
function getDriveClient() {
  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google Drive service account credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env')
  }

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
  })

  return google.drive({ version: 'v3', auth })
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
}

export interface DriveFolder {
  id: string
  name: string
}

export interface DriveItems {
  files: DriveFile[]
  folders: DriveFolder[]
}

/**
 * List all items (files and folders) in a Google Drive folder
 */
export async function listDriveItems(folderId: string = 'root'): Promise<DriveItems> {
  try {
    const drive = getDriveClient()
    
    const files: DriveFile[] = []
    const folders: DriveFolder[] = []
    
    // List files in the folder
    const query = folderId === 'root' 
      ? "trashed=false and 'root' in parents"
      : `trashed=false and '${folderId}' in parents`
    
    let nextPageToken: string | undefined
    
    do {
      const response = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 1000,
        pageToken: nextPageToken,
        orderBy: 'name'
      })
      
      if (response.data.files) {
        for (const file of response.data.files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            folders.push({
              id: file.id!,
              name: file.name!
            })
          } else {
            files.push({
              id: file.id!,
              name: file.name!,
              mimeType: file.mimeType!,
              size: file.size
            })
          }
        }
      }
      
      nextPageToken = response.data.nextPageToken || undefined
    } while (nextPageToken)
    
    return { files, folders }
  } catch (error: any) {
    // Preserve the original error message for better debugging
    const errorMessage = error.message || 'Unknown error'
    const errorCode = error.code || error.response?.status
    
    // Check for specific permission errors
    if (errorCode === 403 || errorMessage.includes('insufficientFilePermissions') || errorMessage.includes('Forbidden')) {
      throw new Error(`Permission denied: The service account does not have access to this folder. Please share the folder with ${process.env.GOOGLE_CLIENT_EMAIL || 'your-service-account@project.iam.gserviceaccount.com'}`)
    }
    
    if (errorCode === 404 || errorMessage.includes('not found')) {
      throw new Error(`Folder not found: The folder ID "${folderId}" does not exist or is not accessible.`)
    }
    
    throw new Error(`Failed to list Drive items: ${errorMessage}`)
  }
}

/**
 * Search for files in Google Drive by keyword
 */
export async function searchDriveFiles(
  keyword: string,
  mimeTypes?: string[],
  folderId?: string
): Promise<DriveFile[]> {
  try {
    const drive = getDriveClient()
    
    // Escape single quotes in keyword for query safety
    const escapedKeyword = keyword.replace(/'/g, "\\'")
    
    // Build query - only use name contains (fullText requires different permissions and can cause errors)
    let query = `trashed=false and name contains '${escapedKeyword}'`
    
    // If folderId is provided, search within that folder
    if (folderId) {
      query += ` and '${folderId}' in parents`
    }
    
    // Add mimeType filter if provided
    if (mimeTypes && mimeTypes.length > 0) {
      const mimeTypeQuery = mimeTypes.map(mt => `mimeType='${mt}'`).join(' or ')
      query += ` and (${mimeTypeQuery})`
    }
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 50,
      orderBy: 'name' // Changed from 'relevance' as it may not be supported
    })
    
    if (!response.data.files) {
      return []
    }
    
    return response.data.files.map(file => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      size: file.size
    }))
  } catch (error: any) {
    // Log the actual error for debugging
    console.error(`[Google Drive Search] Error searching for "${keyword}":`, error.message)
    // Return empty array instead of throwing to allow graceful degradation
    return []
  }
}

/**
 * Download a file from Google Drive
 * Returns buffer and mimeType
 */
export async function downloadDriveFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const drive = getDriveClient()
    
    // Get file metadata
    const fileMetadata = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size'
    })
    
    const mimeType = fileMetadata.data.mimeType || 'application/octet-stream'
    
    // Handle Google Workspace files (Docs, Sheets, etc.) - export as text
    let exportMimeType = mimeType
    if (mimeType === 'application/vnd.google-apps.document') {
      exportMimeType = 'text/plain'
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      exportMimeType = 'text/csv'
    }
    
    // Download file
    let response
    if (mimeType.startsWith('application/vnd.google-apps.')) {
      // Export Google Workspace files
      response = await drive.files.export({
        fileId,
        mimeType: exportMimeType
      }, {
        responseType: 'arraybuffer'
      })
    } else {
      // Download regular files
      response = await drive.files.get({
        fileId,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      })
    }
    
    const buffer = Buffer.from(response.data as ArrayBuffer)
    
    return { buffer, mimeType: exportMimeType }
  } catch (error: any) {
    throw new Error(`Failed to download Drive file: ${error.message}`)
  }
}

/**
 * Get the IICRC Standards folder ID from environment
 * Default: 1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1
 */
export function getStandardsFolderId(): string {
  return process.env.GOOGLE_DRIVE_STANDARDS_FOLDER_ID || '1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1'
}

