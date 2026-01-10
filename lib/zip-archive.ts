import archiver from 'archiver'

interface ZipItem {
  reportNumber: string
  clientName: string
  buffer: Buffer
  pdfType?: string
}

interface Report {
  id: string
  reportNumber: string | null
  clientName: string
}

/**
 * Create a ZIP archive from PDF buffers
 */
export async function createZipArchive(
  pdfBuffers: ZipItem[],
  reports?: Report[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const buffers: Buffer[] = []

    archive.on('data', (chunk: Buffer) => {
      buffers.push(chunk)
    })

    archive.on('end', () => {
      const zipBuffer = Buffer.concat(buffers)
      resolve(zipBuffer)
    })

    archive.on('error', (err) => {
      reject(err)
    })

    // Add each PDF buffer to the archive
    pdfBuffers.forEach((item) => {
      const filename = item.reportNumber
        ? `${item.reportNumber}_${item.clientName.replace(/[^a-z0-9]/gi, '_')}.pdf`
        : `report_${item.clientName.replace(/[^a-z0-9]/gi, '_')}.pdf`
      
      archive.append(item.buffer, { name: filename })
    })

    archive.finalize()
  })
}
