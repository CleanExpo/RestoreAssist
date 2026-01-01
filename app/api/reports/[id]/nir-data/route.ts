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
    const photoCategoriesJson = formData.get('photoCategories') as string | null
    let photoCategories: Record<string, Array<{ fileName: string; description: string }>> = {}
    
    if (photoCategoriesJson) {
      try {
        photoCategories = JSON.parse(photoCategoriesJson)
      } catch (e) {
        console.error('[NIR Data API] Error parsing photoCategories:', e)
      }
    }
    
    const uploadedPhotos: Array<{
      url: string
      thumbnailUrl?: string
      location?: string
      caption?: string
      category?: string
    }> = []
    
    console.log(`[NIR Data API] Uploading ${photoFiles.length} photos for report ${id}`)
    
    for (const photoFile of photoFiles) {
      if (photoFile && photoFile.size > 0) {
        try {
          // Get category for this photo
          let photoCategory: string | null = null
          let photoDescription: string = ''
          
          // Try to get category from photoCategories JSON
          for (const [category, photos] of Object.entries(photoCategories)) {
            const photoInfo = photos.find(p => p.fileName === photoFile.name)
            if (photoInfo) {
              photoCategory = category
              photoDescription = photoInfo.description || ''
              break
            }
          }
          
          // Fallback: try to get from formData directly
          if (!photoCategory) {
            const categoryFromForm = formData.get(`photoCategory_${photoFile.name}`) as string | null
            if (categoryFromForm) {
              photoCategory = categoryFromForm
            }
            const descFromForm = formData.get(`photoDescription_${photoFile.name}`) as string | null
            if (descFromForm) {
              photoDescription = descFromForm
            }
          }
          
          const arrayBuffer = await photoFile.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          
          console.log(`[NIR Data API] Uploading photo: ${photoFile.name} (${photoFile.size} bytes)`, {
            category: photoCategory,
            description: photoDescription
          })
          
          const uploadResult = await uploadToCloudinary(buffer, {
            folder: `reports/${id}/photos`
          })
          
          // Console log the full Cloudinary response
          console.log(`[NIR Data API] ✅ Cloudinary Upload Result for ${photoFile.name}:`, {
            fullResponse: uploadResult,
            url: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl,
            publicId: uploadResult.publicId,
            secureUrl: uploadResult.secureUrl || uploadResult.url,
            category: photoCategory,
            description: photoDescription
          })
          
          // Ensure we have valid URLs
          if (!uploadResult.url) {
            console.error(`[NIR Data API] ❌ No URL returned from Cloudinary for ${photoFile.name}`)
            throw new Error(`Failed to get URL from Cloudinary for ${photoFile.name}`)
          }
          
          const photoData = {
            url: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl || uploadResult.url,
            location: photoCategory || null,
            caption: photoDescription || photoFile.name,
            category: photoCategory || undefined
          }
          
          console.log(`[NIR Data API] 📸 Photo data to be stored:`, photoData)
          
          uploadedPhotos.push(photoData)
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
    
    console.log(`[NIR Data API] 📊 Photo merge summary:`, {
      existingPhotos: existingNirData.photos?.length || 0,
      newPhotosUploaded: uploadedPhotos.length,
      newPhotosAfterDeduplication: newPhotos.length,
      totalPhotosAfterMerge: allPhotos.length
    })
    
    // Save NIR data to report as JSON
    const nirData = {
      moistureReadings: moistureReadings || [],
      affectedAreas: affectedAreas || [],
      scopeItems: scopeItems || [],
      photos: allPhotos // Include both existing and new photos
    }
    
    // Console log the complete data structure before saving
    console.log(`[NIR Data API] 💾 Complete NIR data structure to be saved:`, {
      reportId: id,
      structure: {
        moistureReadings: nirData.moistureReadings.length,
        affectedAreas: nirData.affectedAreas.length,
        scopeItems: nirData.scopeItems.length,
        photos: nirData.photos.length
      },
      allPhotos: nirData.photos.map((p: any, index: number) => ({
        index,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        category: p.category,
        caption: p.caption,
        location: p.location
      }))
    })
    
    const nirDataJson = JSON.stringify(nirData)
    console.log(`[NIR Data API] 📝 JSON string length: ${nirDataJson.length} characters`)
    
    await prisma.report.update({
      where: { id },
      data: {
        moistureReadings: nirDataJson
      }
    })
    
    // Verify the data was saved correctly
    const savedReport = await prisma.report.findUnique({
      where: { id },
      select: { moistureReadings: true }
    })
    
    if (savedReport?.moistureReadings) {
      try {
        const savedNirData = JSON.parse(savedReport.moistureReadings)
        console.log(`[NIR Data API] ✅ Data saved and verified:`, {
          reportId: id,
          moistureReadings: savedNirData.moistureReadings?.length || 0,
          affectedAreas: savedNirData.affectedAreas?.length || 0,
          scopeItems: savedNirData.scopeItems?.length || 0,
          photos: savedNirData.photos?.length || 0,
          photoUrls: savedNirData.photos?.map((p: any) => p.url) || []
        })
      } catch (e) {
        console.error(`[NIR Data API] ❌ Error verifying saved data:`, e)
      }
    }
    
    console.log(`[NIR Data API] ✅ NIR data saved successfully to database`)
    
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
