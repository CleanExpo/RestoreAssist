import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToCloudinary } from "@/lib/cloudinary"

// POST - Upload photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const { id } = await params
    
    // Validate inspection exists and belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    const formData = await request.formData()
    const file = formData.get("file") as File
    const location = formData.get("location") as string | null
    
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      )
    }
    
    // Upload to Cloudinary
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const uploadResult = await uploadToCloudinary(buffer, {
      folder: `inspections/${id}`,
      resource_type: "image"
    })
    
    if (!uploadResult.url) {
      return NextResponse.json(
        { error: "Failed to upload photo" },
        { status: 500 }
      )
    }
    
    // Create photo record
    const photo = await prisma.inspectionPhoto.create({
      data: {
        inspectionId: id,
        url: uploadResult.url,
        thumbnailUrl: uploadResult.thumbnailUrl || null,
        location: location || null,
        fileSize: file.size,
        mimeType: file.type,
        timestamp: new Date()
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Photo uploaded",
        entityType: "InspectionPhoto",
        entityId: photo.id,
        userId: session.user.id,
        changes: JSON.stringify({
          location: photo.location,
          url: photo.url
        })
      }
    })
    
    return NextResponse.json({ photo }, { status: 201 })
  } catch (error) {
    console.error("Error uploading photo:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

