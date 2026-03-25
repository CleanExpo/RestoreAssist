/**
 * Remotion Lambda Renderer
 *
 * Triggers a cloud render of a Remotion composition via AWS Lambda and
 * returns the Cloudinary URL of the final MP4.
 *
 * Infrastructure setup (SE task — run once):
 *   npx remotion lambda sites create packages/cet-remotion/src/Root.tsx
 *   npx remotion lambda functions deploy --memory=2048 --timeout=120 --region=ap-southeast-2
 *
 * Required env vars:
 *   AWS_REGION                    — default: ap-southeast-2
 *   AWS_ACCESS_KEY_ID             — IAM user with Remotion Lambda permissions
 *   AWS_SECRET_ACCESS_KEY         — IAM user secret
 *   REMOTION_LAMBDA_FUNCTION_NAME — e.g. remotion-render-3-3-82-mem2048mb-disk2048mb-120sec
 *   REMOTION_S3_BUCKET            — e.g. remotionlambda-ap-southeast-2-abc123
 *   REMOTION_SERVE_URL            — e.g. https://remotionlambda-....s3.ap-southeast-2.amazonaws.com/sites/cet-remotion/index.html
 *   CLOUDINARY_*                  — standard Cloudinary env vars
 *
 * Cost: ~$1.50 per video render (AWS Lambda + S3 + Cloudinary transfer)
 */

import { v2 as cloudinary } from 'cloudinary'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RemotionCompositionId = 'StandardSlide' | 'DisclaimerFrame'

export interface RenderOptions {
  compositionId: RemotionCompositionId
  inputProps: Record<string, unknown>
  /** Total number of frames at 30fps. e.g. 90s × 30fps = 2700 frames */
  durationInFrames: number
}

export interface RenderResult {
  /** Cloudinary HTTPS URL for the MP4 video */
  videoUrl: string
  /** Cloudinary HTTPS URL for the thumbnail (first frame JPEG) */
  thumbnailUrl: string
}

// ── Render function ───────────────────────────────────────────────────────────

/**
 * Render a Remotion composition via Lambda and upload to Cloudinary.
 *
 * Polls for completion every 5 seconds — max 5 minutes.
 * Remotion Lambda renders at ~1-4x realtime depending on memory config.
 * A 90-second video should render in ~30-90 seconds with 2048MB Lambda.
 */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { compositionId, inputProps, durationInFrames } = options

  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
  const bucketName = process.env.REMOTION_S3_BUCKET
  const serveUrl = process.env.REMOTION_SERVE_URL
  const region = (process.env.AWS_REGION ?? 'ap-southeast-2') as string

  if (!functionName || !bucketName || !serveUrl) {
    throw new Error(
      'Remotion Lambda is not configured. Set REMOTION_LAMBDA_FUNCTION_NAME, ' +
      'REMOTION_S3_BUCKET, and REMOTION_SERVE_URL in your environment variables. ' +
      'See .capacitor-native-notes/SE-SETUP-INSTRUCTIONS.md for the full setup.'
    )
  }

  // Dynamic import — @remotion/lambda is a server-only package
  const { renderMediaOnLambda, getRenderProgress } = await import('@remotion/lambda/client')

  // Trigger the Lambda render
  const { renderId, bucketName: renderBucket } = await renderMediaOnLambda({
    region: region as 'ap-southeast-2',
    functionName,
    serveUrl,
    composition: compositionId,
    inputProps: { ...inputProps, durationInFrames },
    codec: 'h264',
    imageFormat: 'jpeg',
    framesPerLambda: 20,  // Parallelism — 20 frames per Lambda invocation
    privacy: 'private',  // S3 objects are private, accessed via signed URL
  })

  // Poll for completion (max 5 minutes = 60 attempts × 5 seconds)
  const maxAttempts = 60
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000))

    const progress = await getRenderProgress({
      renderId,
      bucketName: renderBucket,
      functionName,
      region: region as 'ap-southeast-2',
    })

    if (progress.fatalErrorEncountered) {
      throw new Error(
        `Remotion render failed: ${progress.errors?.[0]?.message ?? 'Unknown error'}`
      )
    }

    if (progress.done && progress.outputFile) {
      // Upload the rendered MP4 from S3 to Cloudinary
      const videoUpload = await cloudinary.uploader.upload(progress.outputFile, {
        resource_type: 'video',
        folder: 'restoreassist/cet-videos',
        format: 'mp4',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }, // Cloudinary auto-optimisation
        ],
      })

      // Upload first-frame thumbnail if available
      const thumbnailS3Url = progress.outputFile.replace('.mp4', '.0000000.jpg')
      const thumbnailUpload = await cloudinary.uploader.upload(thumbnailS3Url, {
        resource_type: 'image',
        folder: 'restoreassist/cet-thumbnails',
        format: 'jpg',
      }).catch(() => null)  // Non-fatal if thumbnail generation failed

      return {
        videoUrl: videoUpload.secure_url,
        thumbnailUrl: thumbnailUpload?.secure_url ?? videoUpload.secure_url,
      }
    }
  }

  throw new Error('Remotion render timed out after 5 minutes.')
}
