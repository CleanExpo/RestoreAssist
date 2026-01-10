import { v2 as cloudinary } from 'cloudinary'
import { optimizeImage, createThumbnail, ImageOptimizationOptions } from './image-processing'

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

/**
 * Upload image with optimization (sharp pre-processing)
 * Reduces file size before uploading to Cloudinary, saving bandwidth and API costs
 * @param buffer Image buffer
 * @param folder Cloudinary folder
 * @param optimizationOptions Sharp optimization options
 * @param uploadOptions Cloudinary upload options
 * @returns Upload result
 */
export async function uploadOptimizedImage(
  buffer: Buffer,
  folder: string = 'reports',
  optimizationOptions: ImageOptimizationOptions = { width: 1920, quality: 80 },
  uploadOptions: {
    resource_type?: 'image' | 'video' | 'raw' | 'auto'
    transformation?: any[]
    public_id?: string
  } = {}
): Promise<UploadResult> {
  try {
    // Optimize image before upload
    const optimizedBuffer = await optimizeImage(buffer, optimizationOptions)

    // Convert buffer to base64 data URL
    const dataUrl = `data:image/webp;base64,${optimizedBuffer.toString('base64')}`

    // Upload optimized image
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder,
      resource_type: uploadOptions.resource_type || 'image',
      transformation: uploadOptions.transformation,
      public_id: uploadOptions.public_id,
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
    console.error('Optimized image upload error:', error)
    throw new Error('Failed to upload optimized image to Cloudinary')
  }
}

/**
 * Upload image and create thumbnail
 * @param buffer Image buffer
 * @param folder Cloudinary folder
 * @param thumbnailSize Thumbnail size (default: 200x200)
 * @returns Object with main image and thumbnail URLs
 */
export async function uploadImageWithThumbnail(
  buffer: Buffer,
  folder: string = 'reports',
  thumbnailSize: number = 200
): Promise<{
  image: UploadResult
  thumbnail: UploadResult
}> {
  try {
    // Upload main image (optimized)
    const imageResult = await uploadOptimizedImage(buffer, folder, {
      width: 1920,
      quality: 80,
    })

    // Create and upload thumbnail
    const thumbnailBuffer = await createThumbnail(buffer, thumbnailSize, 70)
    const thumbnailDataUrl = `data:image/webp;base64,${thumbnailBuffer.toString('base64')}`

    const thumbnailResult = await cloudinary.uploader.upload(thumbnailDataUrl, {
      folder: `${folder}/thumbnails`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: `${imageResult.public_id}_thumb`,
    })

    return {
      image: imageResult,
      thumbnail: {
        secure_url: thumbnailResult.secure_url,
        public_id: thumbnailResult.public_id,
        width: thumbnailResult.width,
        height: thumbnailResult.height,
        format: thumbnailResult.format,
      },
    }
  } catch (error) {
    console.error('Image and thumbnail upload error:', error)
    throw new Error('Failed to upload image and thumbnail to Cloudinary')
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

