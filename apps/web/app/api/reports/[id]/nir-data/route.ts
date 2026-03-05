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
      } catch (error) {
        // Error parsing NIR data
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
        // Error parsing photoCategories
      }
    }
    
    const uploadedPhotos: Array<{
      url: string
      thumbnailUrl?: string
      location?: string
      caption?: string
      category?: string
    }> = []
    
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
          
          const uploadResult = await uploadToCloudinary(buffer, {
            folder: `reports/${id}/photos`
          })
          
          // Ensure we have valid URLs
          if (!uploadResult.url) {
            throw new Error(`Failed to get URL from Cloudinary for ${photoFile.name}`)
          }
          
          const photoData = {
            url: uploadResult.url,
            thumbnailUrl: uploadResult.thumbnailUrl || uploadResult.url,
            location: photoCategory || null,
            caption: photoDescription || photoFile.name,
            category: photoCategory || undefined
          }
          
          uploadedPhotos.push(photoData)
        } catch (error) {
          // Continue with other photos even if one fails
        }
      }
    }
    
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
      moistureReadings: moistureReadings || [],
      affectedAreas: affectedAreas || [],
      scopeItems: scopeItems || [],
      photos: allPhotos // Include both existing and new photos
    }
    
    const nirDataJson = JSON.stringify(nirData)
    
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
      } catch (e) {
        // Error verifying saved data
      }
    }
    
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
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
