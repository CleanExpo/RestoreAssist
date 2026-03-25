/**
 * Google Drive Backup Service
 *
 * Backs up inspection data to the user's own Google Drive using their OAuth token
 * (stored in their Integration record with drive.file scope).
 *
 * Folder structure created in user's Drive:
 *   RestoreAssist/
 *     Inspections/
 *       {inspectionId}_{inspectionNumber}/
 *         inspection.json      — full inspection data
 *         photos/              — folder (photos uploaded separately)
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const ROOT_FOLDER_NAME = 'RestoreAssist'
const INSPECTIONS_FOLDER_NAME = 'Inspections'

interface DriveFile {
  id: string
  name: string
  mimeType: string
}

async function driveRequest(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return res
}

/** Find a folder by name within a parent (or root). Returns folder ID or null. */
async function findFolder(name: string, token: string, parentId = 'root'): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  const res = await driveRequest(`/files?q=${q}&fields=files(id,name)`, token)
  if (!res.ok) return null
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

/** Create a folder inside a parent. Returns the new folder ID. */
async function createFolder(name: string, token: string, parentId = 'root'): Promise<string> {
  const res = await driveRequest('/files', token, {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create Drive folder "${name}": ${res.status}`)
  }
  const data = await res.json()
  return data.id
}

/** Get or create a folder. Returns folder ID. */
async function ensureFolder(name: string, token: string, parentId = 'root'): Promise<string> {
  const existing = await findFolder(name, token, parentId)
  if (existing) return existing
  return createFolder(name, token, parentId)
}

/** Upload or replace a JSON file in a Drive folder. Returns file ID. */
async function upsertJsonFile(
  name: string,
  content: object,
  token: string,
  parentId: string
): Promise<string> {
  const jsonString = JSON.stringify(content, null, 2)

  // Check if file already exists
  const q = encodeURIComponent(
    `name='${name}' and '${parentId}' in parents and trashed=false`
  )
  const searchRes = await driveRequest(`/files?q=${q}&fields=files(id)`, token)
  const searchData = searchRes.ok ? await searchRes.json() : { files: [] }
  const existingId: string | undefined = searchData.files?.[0]?.id

  const metadata = existingId
    ? undefined // PATCH doesn't re-send parent metadata
    : { name, mimeType: 'application/json', parents: [parentId] }

  const boundary = '---RestoreAssistBoundary'
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata ? JSON.stringify(metadata) : JSON.stringify({ name, mimeType: 'application/json' }),
    '',
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    jsonString,
    `--${boundary}--`,
  ].join('\r\n')

  const url = existingId
    ? `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive file upload failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.id
}

export interface BackupResult {
  success: boolean
  folderId?: string
  fileId?: string
  error?: string
}

/**
 * Back up a single inspection to the user's Google Drive.
 *
 * @param token - User's Drive OAuth access token (stored in Integration)
 * @param inspection - The full inspection object to back up
 */
export async function backupInspectionToDrive(
  token: string,
  inspection: {
    id: string
    inspectionNumber: string
    [key: string]: unknown
  }
): Promise<BackupResult> {
  try {
    // Ensure RestoreAssist/Inspections/ folders exist
    const rootId = await ensureFolder(ROOT_FOLDER_NAME, token)
    const inspectionsId = await ensureFolder(INSPECTIONS_FOLDER_NAME, token, rootId)

    // Create/find inspection-specific folder
    const folderName = `${inspection.inspectionNumber}_${inspection.id}`.replace(/[^a-zA-Z0-9_-]/g, '_')
    const inspectionFolderId = await ensureFolder(folderName, token, inspectionsId)

    // Upload inspection JSON
    const fileId = await upsertJsonFile('inspection.json', inspection, token, inspectionFolderId)

    return { success: true, folderId: inspectionFolderId, fileId }
  } catch (err: any) {
    console.error('[DriveBackup] Backup failed:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Get the user's Drive backup OAuth token from their stored Integration.
 * Returns null if not connected.
 */
export async function getDriveBackupToken(userId: string): Promise<string | null> {
  const { prisma } = await import('./prisma')

  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      status: 'CONNECTED',
      OR: [
        { name: { contains: 'Google Drive' } },
        { name: { contains: 'Drive Backup' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  return integration?.apiKey ?? null
}
