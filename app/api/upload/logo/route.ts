import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadImage } from '@/lib/cloudinary'
import { optimizeImage } from '@/lib/image-processing'
import { isSpacesConfigured, uploadPublicObjectToSpaces } from '@/lib/spaces'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.' },
        { status: 400 }
      )
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const originalSize = buffer.length

    const optimizedBuffer = await optimizeImage(buffer, {
      width: 800,
      height: 800,
      quality: 85,
      format: 'webp',
    })
    const optimizedSize = optimizedBuffer.length
    const percentReduction = Math.round((1 - optimizedSize / originalSize) * 100)

    const base64 = optimizedBuffer.toString('base64')
    const dataUri = `data:image/webp;base64,${base64}`

    const logoProvider =
      process.env.LOGO_UPLOAD_PROVIDER || process.env.UPLOAD_PROVIDER || 'cloudinary'

    let url: string
    let publicId: string | undefined

    if (logoProvider === 'spaces') {
      if (!isSpacesConfigured()) {
        return NextResponse.json(
          { error: 'DigitalOcean Spaces not configured for logo uploads.' },
          { status: 500 }
        )
      }

      const uploaded = await uploadPublicObjectToSpaces({
        buffer: optimizedBuffer,
        contentType: 'image/webp',
        keyPrefix: `business-logos/${session.user.id}`,
        extension: 'webp',
        cacheControl: 'public, max-age=31536000, immutable',
      })

      url = uploaded.url
    } else {
      const result = await uploadImage(dataUri, 'business-logos', {
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto' },
          { format: 'auto' },
        ],
      })

      url = result.secure_url
      publicId = result.public_id
    }

    return NextResponse.json({
      success: true,
      url,
      publicId,
      optimization: {
        originalSize,
        optimizedSize,
        percentReduction: `${percentReduction}%`,
        format: 'webp',
      },
    })
  } catch (error) {
    console.error('Error uploading logo:', error)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}

