import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToCloudinary } from "@/lib/cloudinary"

// POST - Upload floor plan image
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
    
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      )
    }
    
    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images are allowed." },
        { status: 400 }
      )
    }
    
    // Upload to Cloudinary
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const uploadResult = await uploadToCloudinary(buffer, {
      folder: `inspections/${id}/floor-plans`,
      resource_type: "image"
    })
    
    if (!uploadResult.url) {
      return NextResponse.json(
        { error: "Failed to upload floor plan" },
        { status: 500 }
      )
    }
    
    // Update inspection with floor plan URL
    await prisma.inspection.update({
      where: { id },
      data: {
        floorPlanImageUrl: uploadResult.url
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Floor plan uploaded",
        entityType: "Inspection",
        entityId: id,
        userId: session.user.id,
        changes: JSON.stringify({
          floorPlanImageUrl: uploadResult.url
        })
      }
    })
    
    return NextResponse.json({ imageUrl: uploadResult.url }, { status: 200 })
  } catch (error) {
    console.error("Error uploading floor plan:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PUT - Update floor plan URL (for when URL is already known)
export async function PUT(
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
    
    const body = await request.json()
    const { imageUrl } = body
    
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 }
      )
    }
    
    // Update inspection with floor plan URL
    await prisma.inspection.update({
      where: { id },
      data: {
        floorPlanImageUrl: imageUrl
      }
    })
    
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("Error updating floor plan:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
