import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToCloudinary } from "@/lib/cloudinary"

// GET - Fetch NIR data from report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params

    // Verify report belongs to user
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Parse NIR data from Report.moistureReadings JSON field
    let nirData = null
    if (report.moistureReadings) {
      try {
        nirData = JSON.parse(report.moistureReadings)
        console.log(`[NIR Data API GET] NIR data found for report ${id}:`, {
          moistureReadings: nirData.moistureReadings?.length || 0,
          affectedAreas: nirData.affectedAreas?.length || 0,
          scopeItems: nirData.scopeItems?.length || 0,
          photos: nirData.photos?.length || 0
        })
      } catch (error) {
        console.error(`[NIR Data API GET] Error parsing NIR data:`, error)
      }
    }

    return NextResponse.json({ 
      success: true,
      nirData: nirData || {
        moistureReadings: [],
        affectedAreas: [],
        scopeItems: [],
        photos: []
      }
    })
  } catch (error: any) {
    console.error("Error fetching NIR data:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

// POST - Save NIR inspection data to report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { id } = await params

    // Verify report belongs to user
    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    const formData = await request.formData()
    
    // Parse JSON data
    const moistureReadingsJson = formData.get('moistureReadings') as string
    const affectedAreasJson = formData.get('affectedAreas') as string
    const scopeItemsJson = formData.get('scopeItems') as string
    
    const moistureReadings = moistureReadingsJson ? JSON.parse(moistureReadingsJson) : []
    const affectedAreas = affectedAreasJson ? JSON.parse(affectedAreasJson) : []
    const scopeItems = scopeItemsJson ? JSON.parse(scopeItemsJson) : []
    
    // Upload photos to Cloudinary
    const photoFiles = formData.getAll('photos') as File[]
    const uploadedPhotos: Array<{
      url: string
      thumbnailUrl?: string
      location?: string
      caption?: string
    }> = []
    
    console.log(`[NIR Data API] Uploading ${photoFiles.length} photos for report ${id}`)
    
    for (const photoFile of photoFiles) {
      if (photoFile && photoFile.size > 0) {
        try {
          const arrayBuffer = await photoFile.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          
          console.log(`[NIR Data API] Uploading photo: ${photoFile.name} (${photoFile.size} bytes)`)
          
          const uploadResult = await uploadToCloudinary(buffer, {
            folder: `reports/${id}/photos`
          })
          
          console.log(`[NIR Data API] Photo uploaded successfully:`, {
            url: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl,
            publicId: uploadResult.publicId
          })
          
          uploadedPhotos.push({
            url: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl,
            location: null,
            caption: photoFile.name
          })
        } catch (error) {
          console.error(`[NIR Data API] Error uploading photo ${photoFile.name}:`, error)
          // Continue with other photos even if one fails
        }
      }
    }
    
    console.log(`[NIR Data API] Total photos uploaded: ${uploadedPhotos.length}`)
    
    // Get existing NIR data to preserve existing photos
    let existingNirData = {
      moistureReadings: [],
      affectedAreas: [],
      scopeItems: [],
      photos: []
    }
    
    if (report.moistureReadings) {
      try {
        existingNirData = JSON.parse(report.moistureReadings)
      } catch (e) {
        // If parsing fails, use empty structure
      }
    }
    
    // Merge new photos with existing photos (avoid duplicates)
    const existingPhotoUrls = new Set(existingNirData.photos?.map((p: any) => p.url) || [])
    const newPhotos = uploadedPhotos.filter(p => !existingPhotoUrls.has(p.url))
    const allPhotos = [...(existingNirData.photos || []), ...newPhotos]
    
    // Save NIR data to report as JSON
    const nirData = {
      moistureReadings,
      affectedAreas,
      scopeItems,
      photos: allPhotos // Include both existing and new photos
    }
    
    await prisma.report.update({
      where: { id },
      data: {
        moistureReadings: JSON.stringify(nirData)
      }
    })
    
    console.log(`[NIR Data API] NIR data saved successfully:`, {
      reportId: id,
      moistureReadings: moistureReadings.length,
      affectedAreas: affectedAreas.length,
      scopeItems: scopeItems.length,
      totalPhotos: allPhotos.length,
      newPhotos: newPhotos.length,
      photoUrls: allPhotos.map((p: any) => p.url)
    })
    
    return NextResponse.json({ 
      success: true,
      nirData: {
        moistureReadings: moistureReadings.length,
        affectedAreas: affectedAreas.length,
        scopeItems: scopeItems.length,
        photos: allPhotos.length,
        photoUrls: allPhotos.map((p: any) => p.url) // Include URLs in response for debugging
      }
    })
  } catch (error: any) {
    console.error("Error saving NIR data:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
