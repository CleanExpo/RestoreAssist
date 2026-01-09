import { v2 as cloudinary } from 'cloudinary'

// Get Cloudinary credentials from environment variables
const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

// Configure Cloudinary if credentials are available (non-blocking at module load)
if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })
  console.log('[Cloudinary] ✅ Configuration initialized with cloud_name:', cloudName)
} else {
  console.warn('[Cloudinary] ⚠️ Credentials not fully configured at module load - will validate on first use')
}

// Helper function to validate and configure if needed
function ensureCloudinaryConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[Cloudinary] ❌ Missing Cloudinary credentials in environment variables:')
    console.error('  - CLOUDINARY_CLOUD_NAME:', cloudName ? '✅ Set' : '❌ Missing')
    console.error('  - CLOUDINARY_API_KEY:', apiKey ? '✅ Set' : '❌ Missing')
    console.error('  - CLOUDINARY_API_SECRET:', apiSecret ? '✅ Set' : '❌ Missing')
    throw new Error('Cloudinary credentials are not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.')
  }

  if (!cloudinary.config().cloud_name) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    })
  }
}

export { cloudinary }

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
  try {
    await cloudinary.uploader.destroy(publicId)
  } catch (error: any) {
    console.error('[Cloudinary] ❌ Delete error:', {
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
  try {
    // Convert buffer to base64 data URI
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

    // Generate thumbnail URL
    const thumbnailUrl = cloudinary.url(result.public_id, {
      transformation: [
        { width: 300, height: 300, crop: 'limit' },
        { quality: 'auto' }
      ]
    })

    // Console log the full Cloudinary response
    console.log(`[Cloudinary] ✅ Upload successful:`, {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      url: result.url,
      thumbnailUrl,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      folder: result.folder,
      createdAt: result.created_at,
      fullResponse: {
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        folder: result.folder,
        created_at: result.created_at
      }
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
    console.error('[Cloudinary] ❌ Upload error:', {
      message: error?.message,
      http_code: error?.http_code,
      name: error?.name,
      error: error
    })
    
    // Provide more specific error messages
    if (error?.http_code === 401) {
      throw new Error(`Cloudinary authentication failed. Please check your CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables. Error: ${error?.message}`)
    } else if (error?.http_code === 400) {
      throw new Error(`Cloudinary upload failed: ${error?.message}`)
    } else {
      throw new Error(`Failed to upload image to Cloudinary: ${error?.message || 'Unknown error'}`)
    }
  }
}

