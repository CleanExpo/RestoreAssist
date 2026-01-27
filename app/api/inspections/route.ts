import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeString } from "@/lib/sanitize"

// GET - Get inspections (optionally filtered by reportId)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get("reportId")
    
    if (reportId) {
      // Note: reportId column doesn't exist, so find by property address instead
      // First get the report to find property address
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: { propertyAddress: true, propertyPostcode: true }
      })
      
      if (report) {
        const inspection = await prisma.inspection.findFirst({
          where: {
            userId: session.user.id,
            propertyAddress: report.propertyAddress,
            ...(report.propertyPostcode ? { propertyPostcode: report.propertyPostcode } : {})
          },
          include: {
            environmentalData: true,
            moistureReadings: true,
            affectedAreas: true,
            scopeItems: true,
            classifications: true,
            costEstimates: true,
            photos: true
          },
          orderBy: { createdAt: 'desc' }
        })
        
        if (inspection) {
          return NextResponse.json({ inspection })
        }
      }
      
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    // Get all inspections for user
    const inspections = await prisma.inspection.findMany({
      where: { userId: session.user.id },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: true,
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    })
    
    return NextResponse.json({ inspections })
  } catch (error) {
    console.error("Error fetching inspections:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST - Create new inspection
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const body = await request.json()
    
    // Validate required fields
    if (!body.propertyAddress || !body.propertyAddress.trim()) {
      return NextResponse.json(
        { error: "Property address is required" },
        { status: 400 }
      )
    }
    
    if (!body.propertyPostcode || !body.propertyPostcode.trim()) {
      return NextResponse.json(
        { error: "Property postcode is required" },
        { status: 400 }
      )
    }
    
    // Validate reportId if provided
    if (body.reportId) {
      const report = await prisma.report.findUnique({
        where: { id: body.reportId },
        select: { id: true, userId: true }
      })
      
      if (!report) {
        return NextResponse.json(
          { error: "Report not found" },
          { status: 404 }
        )
      }
      
      // Verify the report belongs to the user
      if (report.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Unauthorized: Report does not belong to user" },
          { status: 403 }
        )
      }
    }
    
    // Generate inspection number (NIR-YYYY-MM-XXXX format)
    // Use timestamp + random to ensure uniqueness
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    const sequence = String(timestamp + random).slice(-6)
    const inspectionNumber = `NIR-${year}-${month}-${sequence}`
    
    // Create inspection
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber,
        propertyAddress: sanitizeString(body.propertyAddress, 500),
        propertyPostcode: sanitizeString(body.propertyPostcode, 20),
        technicianName: body.technicianName ? sanitizeString(body.technicianName, 200) : null,
        reportId: body.reportId || null, // Link to report if provided
        userId: session.user.id,
        status: "DRAFT"
      },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: true
      }
    })
    
    // Create audit log (optional - don't fail if this fails)
    try {
      await prisma.auditLog.create({
        data: {
          inspectionId: inspection.id,
          action: "Inspection created",
          entityType: "Inspection",
          entityId: inspection.id,
          userId: session.user.id,
          changes: JSON.stringify({
            propertyAddress: inspection.propertyAddress,
            propertyPostcode: inspection.propertyPostcode
          })
        }
      })
    } catch (auditError) {
      // Log but don't fail the request if audit log creation fails
      console.error("Error creating audit log (non-critical):", auditError)
    }
    
    return NextResponse.json({ inspection }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating inspection:", error)
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      meta: error.meta
    })
    
    // Return more detailed error message for debugging
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error.message || "Failed to create inspection",
        code: error.code || "UNKNOWN_ERROR"
      },
      { status: 500 }
    )
  }
}

