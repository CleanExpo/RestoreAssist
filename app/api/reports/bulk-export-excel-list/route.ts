import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import archiver from 'archiver'
import { Readable } from 'stream'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ids, zip = false } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'ids must be a non-empty array' },
        { status: 400 }
      )
    }

    // Fetch reports with Excel URLs
    const reports = await prisma.report.findMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
        excelReportUrl: { not: null }
      },
      select: {
        id: true,
        reportNumber: true,
        title: true,
        clientName: true,
        propertyAddress: true,
        excelReportUrl: true,
      },
    })

    if (reports.length === 0) {
      return NextResponse.json(
        { error: 'No Excel reports found', message: 'None of the selected reports have Excel files available' },
        { status: 404 }
      )
    }

    // If zip is requested, create a zip file
    if (zip) {
      return new Promise<NextResponse>(async (resolve, reject) => {
        try {
          const archive = archiver('zip', { zlib: { level: 9 } })
          const buffers: Buffer[] = []

          archive.on('data', (chunk: Buffer) => {
            buffers.push(chunk)
          })

          archive.on('end', () => {
            const zipBuffer = Buffer.concat(buffers)
            resolve(new NextResponse(zipBuffer, {
              status: 200,
              headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="Excel_Reports_${new Date().toISOString().split('T')[0]}.zip"`,
                'Content-Length': zipBuffer.length.toString(),
              },
            }))
          })

          archive.on('error', (err) => {
            reject(err)
          })

          // Download and add each Excel file to the zip (one by one from Cloudinary)
          console.log(`[Bulk Excel Export] Starting download of ${reports.length} Excel files from Cloudinary...`)
          
          for (const report of reports) {
            if (report.excelReportUrl) {
              try {
                console.log(`[Bulk Excel Export] Downloading Excel for report ${report.id} from: ${report.excelReportUrl}`)
                const response = await fetch(report.excelReportUrl)
                
                if (response.ok) {
                  const buffer = Buffer.from(await response.arrayBuffer())
                  const filename = `${report.reportNumber || report.id}.xlsx`
                  archive.append(buffer, { name: filename })
                  console.log(`[Bulk Excel Export] ✓ Added ${filename} to ZIP (${buffer.length} bytes)`)
                } else {
                  console.error(`[Bulk Excel Export] ✗ Failed to download Excel for report ${report.id}: HTTP ${response.status}`)
                }
              } catch (error) {
                console.error(`[Bulk Excel Export] ✗ Error downloading Excel for report ${report.id}:`, error)
              }
            } else {
              console.warn(`[Bulk Excel Export] Report ${report.id} has no Excel URL`)
            }
          }
          
          console.log(`[Bulk Excel Export] Finished downloading files, finalizing ZIP...`)

          await archive.finalize()
        } catch (error) {
          reject(error)
        }
      })
    }

    // Return list of Excel URLs
    return NextResponse.json({
      reports: reports.map(report => ({
        id: report.id,
        reportNumber: report.reportNumber,
        title: report.title,
        clientName: report.clientName,
        propertyAddress: report.propertyAddress,
        excelUrl: report.excelReportUrl,
      })),
      count: reports.length,
    })
  } catch (error) {
    console.error('Error in bulk-export-excel-list:', error)
    return NextResponse.json(
      { error: 'Export failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
