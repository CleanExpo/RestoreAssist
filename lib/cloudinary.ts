import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dnkn6bcad',
  api_key: process.env.CLOUDINARY_API_KEY || '956572481469639',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'UcL6hB3Lzu4WHtaz8UlAkoQNZV0',
})

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
  } catch (error) {
    console.error('Cloudinary delete error:', error)
    throw new Error('Failed to delete image from Cloudinary')
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

    return {
      url: result.secure_url,
      thumbnailUrl,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    }
  } catch (error) {
    console.error('Cloudinary upload error:', error)
    throw new Error('Failed to upload image to Cloudinary')
  }
}

