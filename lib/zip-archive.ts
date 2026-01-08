import archiver from 'archiver'
import { Readable } from 'stream'

export async function createZipArchive(files: Array<{ name: string; content: Buffer | string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('data', (chunk) => {
      chunks.push(chunk)
    })

    archive.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    archive.on('error', (err) => {
      reject(err)
    })

    // Add files to archive
    files.forEach((file) => {
      const content = typeof file.content === 'string' ? Buffer.from(file.content) : file.content
      archive.append(content, { name: file.name })
    })

    archive.finalize()
  })
}
