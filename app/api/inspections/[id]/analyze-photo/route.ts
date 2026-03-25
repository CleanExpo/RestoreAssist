/**
 * POST /api/inspections/[id]/analyze-photo
 *
 * Accepts a meter display photo and uses Claude Vision to extract structured readings.
 * Does NOT save the photo to Cloudinary — this is a transient OCR call only.
 * The extracted data is returned to the frontend confirm modal for user review before saving.
 *
 * extractionType:
 *   'moisture'       — moisture meter (Tramex MEP, Delmhorst BD-2100)
 *   'environmental'  — thermo-hygrometer (Testo 605-H1, Vaisala HM70)
 *   'measurement'    — laser distance measure (Leica Disto, Bosch GLM)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAnthropicApiKey } from '@/lib/ai-provider'
import { extractMeterReading, type ExtractionType } from '@/lib/nir-vision-ocr'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id } = await params

  // ── Verify inspection ownership ─────────────────────────────────────────────
  const inspection = await prisma.inspection.findFirst({
    where: { id, report: { userId: session.user.id } },
    select: { id: true },
  })
  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

  // ── Parse multipart form ────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const extractionType = formData.get('extractionType') as string | null

  if (!file || !extractionType) {
    return NextResponse.json(
      { error: 'file and extractionType are required' },
      { status: 400 }
    )
  }

  const validTypes: ExtractionType[] = ['moisture', 'environmental', 'measurement']
  if (!validTypes.includes(extractionType as ExtractionType)) {
    return NextResponse.json(
      { error: 'extractionType must be one of: moisture | environmental | measurement' },
      { status: 400 }
    )
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    return NextResponse.json(
      { error: 'Image must be JPEG, PNG, or WebP' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'Image must be under 10 MB' },
      { status: 400 }
    )
  }

  // ── Get user's Anthropic API key ─────────────────────────────────────────────
  // Uses the existing BYOK helper — throws a user-friendly error if no key configured
  let apiKey: string
  try {
    apiKey = await getAnthropicApiKey(session.user.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No API key configured'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  // ── Base64-encode the image (transient — NOT saved to Cloudinary) ───────────
  const buffer = Buffer.from(await file.arrayBuffer())
  const imageBase64 = buffer.toString('base64')

  // ── Extract readings via Claude Vision ──────────────────────────────────────
  const result = await extractMeterReading(
    imageBase64,
    file.type as AllowedMimeType,
    extractionType as ExtractionType,
    apiKey
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ extraction: result.extraction })
}
