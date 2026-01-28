import { v2 as cloudinary } from 'cloudinary'

// Lazy initialization to prevent build-time errors
let isConfigured = false

function ensureCloudinaryConfigured() {
  if (isConfigured) return

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[Cloudinary] Missing Cloudinary credentials in environment variables:')
    console.error('  - CLOUDINARY_CLOUD_NAME:', cloudName ? 'Set' : 'Missing')
    console.error('  - CLOUDINARY_API_KEY:', apiKey ? 'Set' : 'Missing')
    console.error('  - CLOUDINARY_API_SECRET:', apiSecret ? 'Set' : 'Missing')
    throw new Error('Cloudinary credentials are not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.')
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })

  isConfigured = true
}

export { cloudinary, ensureCloudinaryConfigured }

export interface UploadResult {
  secure_url: string
  public_id: string
  width: number
  height: number
  format: string
}

export async function uploadImage(
  file: Buffer | string,
  folder: string = 'business-logos',
  options: {
    resource_type?: 'image' | 'video' | 'raw' | 'auto'
    transformation?: any[]
  } = {}
): Promise<UploadResult> {
  ensureCloudinaryConfigured()
  try {
    const result = await cloudinary.uploader.upload(file as string, {
      folder,
      resource_type: options.resource_type || 'image',
      transformation: options.transformation,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    })

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    }
  } catch (error) {
    console.error('Cloudinary upload error:', error)
    throw new Error('Failed to upload image to Cloudinary')
  }
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureCloudinaryConfigured()
  try {
    await cloudinary.uploader.destroy(publicId)
  } catch (error: any) {
    console.error('[Cloudinary] Delete error:', {
      message: error?.message,
      http_code: error?.http_code,
      name: error?.name,
      error: error
    })
    throw new Error(`Failed to delete image from Cloudinary: ${error?.message || 'Unknown error'}`)
  }
}

export interface CloudinaryUploadResult {
  url: string
  thumbnailUrl?: string
  publicId: string
  width: number
  height: number
  format: string
}

export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string
    resource_type?: 'image' | 'video' | 'raw' | 'auto'
    transformation?: any[]
  } = {}
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfigured()
  try {
    const base64 = buffer.toString('base64')
    const dataUri = `data:image/jpeg;base64,${base64}`

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: options.folder || 'uploads',
      resource_type: options.resource_type || 'image',
      transformation: [
        ...(options.transformation || []),
        { quality: 'auto', format: 'auto' }
      ],
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    })

    const thumbnailUrl = cloudinary.url(result.public_id, {
      transformation: [
        { width: 300, height: 300, crop: 'limit' },
        { quality: 'auto' }
      ]
    })

    return {
      url: result.secure_url,
      thumbnailUrl,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    }
  } catch (error: any) {
    console.error('[Cloudinary] Upload error:', error)
    if (error?.http_code === 401) {
      throw new Error(`Cloudinary authentication failed. Error: ${error?.message}`)
    } else if (error?.http_code === 400) {
      throw new Error(`Cloudinary upload failed: ${error?.message}`)
    } else {
      throw new Error(`Failed to upload image to Cloudinary: ${error?.message || 'Unknown error'}`)
    }
  }
}

export async function uploadExcelToCloudinary(
  buffer: Buffer,
  filename: string,
  folder: string = 'excel-reports'
): Promise<string> {
  ensureCloudinaryConfigured()
  try {
    const base64 = buffer.toString('base64')
    const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'raw',
      public_id: filename.replace(/.xlsx?\$/i, ''),
      format: 'xlsx',
    })

    return result.secure_url
  } catch (error: any) {
    console.error('[Cloudinary] Excel upload error:', error)
    if (error?.http_code === 401) {
      throw new Error(`Cloudinary authentication failed. Error: ${error?.message}`)
    } else if (error?.http_code === 400) {
      throw new Error(`Cloudinary upload failed: ${error?.message}`)
    } else {
      throw new Error(`Failed to upload Excel file to Cloudinary: ${error?.message || 'Unknown error'}`)
    }
  }
}

/**
 * Upload PDF file to Cloudinary
 */
export async function uploadPDFToCloudinary(
  buffer: Buffer,
  filename: string,
  folder: string = 'pdf-documents',
  options: {
    ttl?: number // Time to live in seconds (for auto-expiry)
    tags?: string[] // Tags for categorization and cleanup
  } = {}
): Promise<{ url: string; publicId: string }> {
  ensureCloudinaryConfigured()
  try {
    const base64 = buffer.toString('base64')
    const dataUri = `data:application/pdf;base64,${base64}`

    const uploadOptions: any = {
      folder,
      resource_type: 'raw',
      public_id: filename.replace(/\.pdf$/i, ''),
      format: 'pdf',
    }

    // Add tags if provided
    if (options.tags && options.tags.length > 0) {
      uploadOptions.tags = options.tags
    }

    // Add context for TTL if provided
    if (options.ttl) {
      const expiryDate = new Date(Date.now() + options.ttl * 1000)
      uploadOptions.context = `ttl=${options.ttl}|expires_at=${expiryDate.toISOString()}`
    }

    const result = await cloudinary.uploader.upload(dataUri, uploadOptions)

    return {
      url: result.secure_url,
      publicId: result.public_id
    }
  } catch (error: any) {
    console.error('[Cloudinary] PDF upload error:', error)
    if (error?.http_code === 401) {
      throw new Error(`Cloudinary authentication failed. Error: ${error?.message}`)
    } else if (error?.http_code === 400) {
      throw new Error(`Cloudinary upload failed: ${error?.message}`)
    } else {
      throw new Error(`Failed to upload PDF to Cloudinary: ${error?.message || 'Unknown error'}`)
    }
  }
}

/**
 * Upload generic file to Cloudinary (documents, attachments, etc.)
 */
export async function uploadFileToCloudinary(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folder: string = 'uploads',
  options: {
    ttl?: number
    tags?: string[]
    resourceType?: 'image' | 'video' | 'raw' | 'auto'
  } = {}
): Promise<{ url: string; publicId: string; format: string }> {
  ensureCloudinaryConfigured()
  try {
    const base64 = buffer.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64}`

    const uploadOptions: any = {
      folder,
      resource_type: options.resourceType || 'auto',
      public_id: filename.replace(/\.[^/.]+$/, ''), // Remove extension
    }

    if (options.tags && options.tags.length > 0) {
      uploadOptions.tags = options.tags
    }

    if (options.ttl) {
      const expiryDate = new Date(Date.now() + options.ttl * 1000)
      uploadOptions.context = `ttl=${options.ttl}|expires_at=${expiryDate.toISOString()}`
    }

    const result = await cloudinary.uploader.upload(dataUri, uploadOptions)

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format
    }
  } catch (error: any) {
    console.error('[Cloudinary] File upload error:', error)
    if (error?.http_code === 401) {
      throw new Error(`Cloudinary authentication failed. Error: ${error?.message}`)
    } else if (error?.http_code === 400) {
      throw new Error(`Cloudinary upload failed: ${error?.message}`)
    } else {
      throw new Error(`Failed to upload file to Cloudinary: ${error?.message || 'Unknown error'}`)
    }
  }
}

/**
 * Generate signed URL for secure file access
 * @param publicId - The Cloudinary public ID of the file
 * @param expiresIn - Time in seconds until URL expires (default: 1 hour)
 * @param resourceType - Type of resource (image, video, raw)
 */
export function generateSignedUrl(
  publicId: string,
  expiresIn: number = 3600,
  resourceType: 'image' | 'video' | 'raw' = 'raw'
): string {
  ensureCloudinaryConfigured()

  const expiryTimestamp = Math.floor(Date.now() / 1000) + expiresIn

  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    expires_at: expiryTimestamp,
    secure: true
  })
}

/**
 * Delete file from Cloudinary by public ID
 * @param publicId - The Cloudinary public ID
 * @param resourceType - Type of resource to delete
 */
export async function deleteFile(
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'raw'
): Promise<void> {
  ensureCloudinaryConfigured()
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    })
  } catch (error: any) {
    console.error('[Cloudinary] Delete error:', {
      message: error?.message,
      http_code: error?.http_code,
      publicId
    })
    throw new Error(`Failed to delete file from Cloudinary: ${error?.message || 'Unknown error'}`)
  }
}

/**
 * Delete multiple files by tag (useful for cleanup)
 * @param tag - Tag to delete all files with
 */
export async function deleteFilesByTag(tag: string): Promise<{ deleted: string[] }> {
  ensureCloudinaryConfigured()
  try {
    const result = await cloudinary.api.delete_resources_by_tag(tag)
    return {
      deleted: Object.keys(result.deleted || {})
    }
  } catch (error: any) {
    console.error('[Cloudinary] Batch delete error:', error)
    throw new Error(`Failed to delete files by tag: ${error?.message || 'Unknown error'}`)
  }
}

/**
 * Get files with specific tag (for cleanup cron jobs)
 * @param tag - Tag to search for
 * @param resourceType - Type of resource
 */
export async function getFilesByTag(
  tag: string,
  resourceType: 'image' | 'video' | 'raw' = 'raw'
): Promise<Array<{ publicId: string; createdAt: string; context?: any }>> {
  ensureCloudinaryConfigured()
  try {
    const result = await cloudinary.api.resources_by_tag(tag, {
      resource_type: resourceType,
      context: true,
      max_results: 500
    })

    return result.resources.map((resource: any) => ({
      publicId: resource.public_id,
      createdAt: resource.created_at,
      context: resource.context
    }))
  } catch (error: any) {
    console.error('[Cloudinary] Get files by tag error:', error)
    throw new Error(`Failed to get files by tag: ${error?.message || 'Unknown error'}`)
  }
}
