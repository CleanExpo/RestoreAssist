import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST - Add or update environmental data
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
    const body = await request.json()
    
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
    
    // Validate data ranges
    if (body.ambientTemperature !== undefined) {
      if (body.ambientTemperature < -20 || body.ambientTemperature > 130) {
        return NextResponse.json(
          { error: "Temperature must be between -20°F and 130°F" },
          { status: 400 }
        )
      }
    }
    
    if (body.humidityLevel !== undefined) {
      if (body.humidityLevel < 0 || body.humidityLevel > 100) {
        return NextResponse.json(
          { error: "Humidity must be between 0% and 100%" },
          { status: 400 }
        )
      }
    }
    
    // Upsert environmental data
    const environmentalData = await prisma.environmentalData.upsert({
      where: { inspectionId: id },
      update: {
        ambientTemperature: body.ambientTemperature,
        humidityLevel: body.humidityLevel,
        dewPoint: body.dewPoint,
        airCirculation: body.airCirculation ?? false,
        weatherConditions: body.weatherConditions || null,
        notes: body.notes || null
      },
      create: {
        inspectionId: id,
        ambientTemperature: body.ambientTemperature,
        humidityLevel: body.humidityLevel,
        dewPoint: body.dewPoint,
        airCirculation: body.airCirculation ?? false,
        weatherConditions: body.weatherConditions || null,
        notes: body.notes || null
      }
    })
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        inspectionId: id,
        action: "Environmental data added/updated",
        entityType: "EnvironmentalData",
        entityId: environmentalData.id,
        userId: session.user.id,
        changes: JSON.stringify(body)
      }
    })
    
    return NextResponse.json({ environmentalData })
  } catch (error) {
    console.error("Error saving environmental data:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

