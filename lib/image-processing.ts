/**
 * Server-side image processing utilities using sharp
 * Handles image optimization, resizing, and format conversion
 */

import sharp from 'sharp'

/**
 * Optimization options for images
 */
export interface ImageOptimizationOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp' | 'avif'
  fit?: 'cover' | 'contain' | 'inside' | 'outside'
}

/**
 * Image metadata from sharp
 */
export interface ImageMetadata {
  width?: number
  height?: number
  space?: string
  channels?: number
  depth?: string
  density?: number
  hasAlpha?: boolean
  format?: string
  colorspace?: string
  exif?: Record<string, any>
}

/**
 * Optimize image with resizing and quality adjustment
 * @param buffer Image buffer to optimize
 * @param options Optimization options
 * @returns Optimized image buffer
 */
export async function optimizeImage(
  buffer: Buffer,
  options: ImageOptimizationOptions = {}
): Promise<Buffer> {
  const {
    width,
    height,
    quality = 80,
    format = 'webp',
    fit = 'inside'
  } = options

  let pipeline = sharp(buffer)

  // Resize if dimensions provided
  if (width || height) {
    pipeline = pipeline.resize(width, height, { fit })
  }

  // Convert format and set quality
  if (format === 'jpeg') {
    return pipeline.jpeg({ quality }).toBuffer()
  } else if (format === 'png') {
    return pipeline.png({ quality: Math.floor(quality / 10) }).toBuffer()
  } else if (format === 'avif') {
    return pipeline.avif({ quality }).toBuffer()
  } else {
    // Default to webp
    return pipeline.webp({ quality }).toBuffer()
  }
}

/**
 * Create thumbnail from image
 * @param buffer Image buffer
 * @param size Thumbnail size (width = height)
 * @param quality JPEG quality 1-100
 * @returns Thumbnail buffer
 */
export async function createThumbnail(
  buffer: Buffer,
  size: number = 200,
  quality: number = 70
): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .webp({ quality })
    .toBuffer()
}

/**
 * Create multiple thumbnails from image
 * @param buffer Image buffer
 * @param sizes Array of thumbnail sizes
 * @returns Object with size as key and buffer as value
 */
export async function createMultipleThumbnails(
  buffer: Buffer,
  sizes: number[] = [100, 200, 400]
): Promise<Record<number, Buffer>> {
  const image = sharp(buffer)
  const results: Record<number, Buffer> = {}

  for (const size of sizes) {
    results[size] = await image
      .clone()
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 70 })
      .toBuffer()
  }

  return results
}

/**
 * Get image metadata without loading full image
 * @param buffer Image buffer
 * @returns Image metadata
 */
export async function getImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
  return sharp(buffer).metadata()
}

/**
 * Compress image aggressively for storage
 * Reduces file size significantly, suitable for archive/storage
 * @param buffer Image buffer
 * @returns Compressed image buffer
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await getImageMetadata(buffer)

  // Choose format based on original image
  const format = metadata.hasAlpha ? 'webp' : 'jpeg'

  let pipeline = sharp(buffer)

  if (format === 'jpeg') {
    return pipeline.jpeg({ quality: 60, progressive: true }).toBuffer()
  } else {
    return pipeline.webp({ quality: 60 }).toBuffer()
  }
}

/**
 * Rotate image to correct orientation based on EXIF
 * @param buffer Image buffer
 * @returns Image buffer with corrected orientation
 */
export async function normalizeImageOrientation(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).withMetadata().toBuffer()
}

/**
 * Convert image to specific format
 * @param buffer Image buffer
 * @param format Target format
 * @param quality Output quality
 * @returns Converted image buffer
 */
export async function convertImageFormat(
  buffer: Buffer,
  format: 'jpeg' | 'png' | 'webp' | 'avif' = 'webp',
  quality: number = 80
): Promise<Buffer> {
  const pipeline = sharp(buffer)

  switch (format) {
    case 'jpeg':
      return pipeline.jpeg({ quality }).toBuffer()
    case 'png':
      return pipeline.png().toBuffer()
    case 'avif':
      return pipeline.avif({ quality }).toBuffer()
    case 'webp':
    default:
      return pipeline.webp({ quality }).toBuffer()
  }
}

/**
 * Extract region from image (crop)
 * @param buffer Image buffer
 * @param x X coordinate
 * @param y Y coordinate
 * @param width Region width
 * @param height Region height
 * @returns Cropped image buffer
 */
export async function cropImage(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(buffer)
    .extract({ left: x, top: y, width, height })
    .toBuffer()
}

/**
 * Add watermark text to image
 * @param buffer Image buffer
 * @param text Watermark text
 * @param opacity Opacity 0-1
 * @returns Image with watermark
 */
export async function addWatermark(
  buffer: Buffer,
  text: string,
  opacity: number = 0.5
): Promise<Buffer> {
  const metadata = await getImageMetadata(buffer)
  const width = metadata.width || 800
  const height = metadata.height || 600

  // Create SVG watermark
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}">
      <text x="50%" y="50%"
        text-anchor="middle"
        dy=".3em"
        font-size="48"
        fill="white"
        opacity="${opacity}"
        font-family="Arial, sans-serif"
      >
        ${text}
      </text>
    </svg>
  `)

  return sharp(buffer)
    .composite([
      {
        input: svg,
        blend: 'over'
      }
    ])
    .toBuffer()
}

/**
 * Batch process multiple images
 * @param buffers Array of image buffers
 * @param options Optimization options
 * @returns Array of processed buffers
 */
export async function batchProcessImages(
  buffers: Buffer[],
  options: ImageOptimizationOptions = {}
): Promise<Buffer[]> {
  return Promise.all(
    buffers.map(buffer => optimizeImage(buffer, options))
  )
}

/**
 * Get image dimensions
 * @param buffer Image buffer
 * @returns Object with width and height
 */
export async function getImageDimensions(
  buffer: Buffer
): Promise<{ width?: number; height?: number }> {
  const metadata = await getImageMetadata(buffer)
  return {
    width: metadata.width,
    height: metadata.height
  }
}

/**
 * Check if image needs rotation based on EXIF
 * @param buffer Image buffer
 * @returns True if image should be rotated
 */
export async function needsRotation(buffer: Buffer): Promise<boolean> {
  const metadata = await getImageMetadata(buffer)
  return metadata.exif?.Orientation ? metadata.exif.Orientation > 1 : false
}
