import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { optimizeImage } from '@/lib/image-processing'
import { isSpacesConfigured, uploadPublicObjectToSpaces } from '@/lib/spaces'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

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

    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ]
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed.' },
        { status: 400 }
      )
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const originalSize = buffer.length

    const optimizedBuffer = await optimizeImage(buffer, {
      width: 1920,
      quality: 80,
      format: 'webp',
    })
    const optimizedSize = optimizedBuffer.length

    const shouldUseSpaces =
      process.env.UPLOAD_PROVIDER === 'spaces' ||
      process.env.VERCEL === '1' ||
      process.env.NODE_ENV === 'production'

    let url: string

    if (shouldUseSpaces) {
      if (!isSpacesConfigured()) {
        return NextResponse.json(
          {
            error:
              'Upload storage not configured. Set DigitalOcean Spaces env vars or set UPLOAD_PROVIDER to a configured provider.',
          },
          { status: 500 }
        )
      }

      const uploaded = await uploadPublicObjectToSpaces({
        buffer: optimizedBuffer,
        contentType: 'image/webp',
        keyPrefix: `uploads/${session.user.id}`,
        extension: 'webp',
        cacheControl: 'public, max-age=31536000, immutable',
      })

      url = uploaded.url
    } else {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', session.user.id)
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true })
      }

      const optimizedFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
      await writeFile(path.join(uploadsDir, optimizedFilename), optimizedBuffer)
      url = `/uploads/${session.user.id}/${optimizedFilename}`
    }

    const percentReduction = Math.round((1 - optimizedSize / originalSize) * 100)

    return NextResponse.json({
      success: true,
      url,
      filename: file.name,
      optimization: {
        originalSize,
        optimizedSize,
        percentReduction: `${percentReduction}%`,
        format: 'webp',
      },
    })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}

