import { v2 as cloudinary } from 'cloudinary'

function ensureCloudinaryConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary credentials are not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    )
  }

  const current = cloudinary.config()
  if (!current.cloud_name) {
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
  ensureCloudinaryConfigured()

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
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureCloudinaryConfigured()
  await cloudinary.uploader.destroy(publicId)
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

  const base64 = buffer.toString('base64')
  const dataUri = `data:image/jpeg;base64,${base64}`

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder || 'uploads',
    resource_type: options.resource_type || 'image',
    transformation: [...(options.transformation || []), { quality: 'auto', format: 'auto' }],
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  })

  const thumbnailUrl = cloudinary.url(result.public_id, {
    transformation: [{ width: 300, height: 300, crop: 'limit' }, { quality: 'auto' }],
  })

  return {
    url: result.secure_url,
    thumbnailUrl,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
  }
}

export async function uploadExcelToCloudinary(
  buffer: Buffer,
  filename: string,
  folder: string = 'excel-reports'
): Promise<string> {
  ensureCloudinaryConfigured()

  const base64 = buffer.toString('base64')
  const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'raw',
    public_id: filename.replace(/\.xlsx?$/i, ''),
    format: 'xlsx',
  })

  return result.secure_url
}

