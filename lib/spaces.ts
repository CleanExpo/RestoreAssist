import crypto from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export type SpacesUploadResult = {
  key: string
  url: string
  bucket: string
  region: string
}

type SpacesConfig = {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  cdnDomain?: string
}

function getSpacesConfig(): SpacesConfig {
  const region = process.env.DIGITALOCEAN_SPACES_REGION
  const bucket = process.env.DIGITALOCEAN_SPACES_BUCKET
  const accessKeyId = process.env.DIGITALOCEAN_SPACES_KEY
  const secretAccessKey = process.env.DIGITALOCEAN_SPACES_SECRET
  const endpoint = process.env.DIGITALOCEAN_SPACES_ENDPOINT
  const cdnDomain = process.env.DIGITALOCEAN_SPACES_CDN_DOMAIN

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'DigitalOcean Spaces not configured. Set DIGITALOCEAN_SPACES_REGION, DIGITALOCEAN_SPACES_BUCKET, DIGITALOCEAN_SPACES_KEY, DIGITALOCEAN_SPACES_SECRET.'
    )
  }

  return { region, bucket, accessKeyId, secretAccessKey, endpoint, cdnDomain }
}

export function isSpacesConfigured(): boolean {
  return Boolean(
    process.env.DIGITALOCEAN_SPACES_REGION &&
      process.env.DIGITALOCEAN_SPACES_BUCKET &&
      process.env.DIGITALOCEAN_SPACES_KEY &&
      process.env.DIGITALOCEAN_SPACES_SECRET
  )
}

function getSpacesS3Client(config: SpacesConfig): S3Client {
  const endpoint =
    config.endpoint || `https://${config.region}.digitaloceanspaces.com`

  return new S3Client({
    region: config.region,
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: false,
  })
}

function publicUrlForKey(config: SpacesConfig, key: string): string {
  const normalizedKey = key.replace(/^\/+/, '')

  if (config.cdnDomain) {
    const cdn = config.cdnDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return `https://${cdn}/${normalizedKey}`
  }

  return `https://${config.bucket}.${config.region}.digitaloceanspaces.com/${normalizedKey}`
}

function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export async function uploadPublicObjectToSpaces(params: {
  buffer: Buffer
  contentType: string
  keyPrefix: string
  extension?: string
  cacheControl?: string
}): Promise<SpacesUploadResult> {
  const config = getSpacesConfig()
  const s3 = getSpacesS3Client(config)

  const prefix = params.keyPrefix.replace(/^\/+/, '').replace(/\/+$/, '')
  const ext = params.extension ? params.extension.replace(/^\./, '') : undefined
  const key = `${prefix}/${Date.now()}-${randomId()}${ext ? `.${ext}` : ''}`

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
      ACL: 'public-read',
      CacheControl: params.cacheControl,
    })
  )

  return {
    key,
    url: publicUrlForKey(config, key),
    bucket: config.bucket,
    region: config.region,
  }
}

