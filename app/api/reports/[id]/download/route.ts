import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Fetch the report
    const report = await prisma.report.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        },
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
            company: true
          }
        }
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Parse JSON fields
    const parsedReport = {
      ...report,
      psychrometricReadings: report.psychrometricReadings ? JSON.parse(report.psychrometricReadings) : [],
      moistureReadings: report.moistureReadings ? JSON.parse(report.moistureReadings) : [],
      propertyCover: report.propertyCover ? JSON.parse(report.propertyCover) : null,
      contentsCover: report.contentsCover ? JSON.parse(report.contentsCover) : null,
      liabilityCover: report.liabilityCover ? JSON.parse(report.liabilityCover) : null,
      businessInterruption: report.businessInterruption ? JSON.parse(report.businessInterruption) : null,
      additionalCover: report.additionalCover ? JSON.parse(report.additionalCover) : null,
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4 size
    const { width, height } = page.getSize()

    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Colors
    const primaryColor = rgb(0.2, 0.6, 0.8) // Cyan
    const darkColor = rgb(0.1, 0.1, 0.1) // Dark gray
    const lightColor = rgb(0.4, 0.4, 0.4) // Light gray

    let yPosition = height - 50

    // Header
    page.drawText("WATER DAMAGE RESTORATION REPORT", {
      x: 50,
      y: yPosition,
      size: 20,
      font: titleFont,
      color: primaryColor,
    })
    yPosition -= 30

    page.drawText("IICRC S500 Compliant Assessment", {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: lightColor,
    })
    yPosition -= 40

    // Report Information
    page.drawText("REPORT INFORMATION", {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 20

    const reportInfo = [
      ["Report Number:", parsedReport.reportNumber || parsedReport.id],
      ["Client:", parsedReport.clientName],
      ["Property Address:", parsedReport.propertyAddress],
      ["Hazard Type:", parsedReport.hazardType],
      ["Insurance Type:", parsedReport.insuranceType],
      ["Inspection Date:", parsedReport.inspectionDate ? new Date(parsedReport.inspectionDate).toLocaleDateString() : "N/A"],
      ["Status:", parsedReport.status],
      ["Created:", parsedReport.createdAt ? new Date(parsedReport.createdAt).toLocaleDateString() : "N/A"],
    ]

    reportInfo.forEach(([label, value]) => {
      page.drawText(label, {
        x: 50,
        y: yPosition,
        size: 10,
        font: boldFont,
        color: darkColor,
      })
      page.drawText(safeString(value), {
        x: 200,
        y: yPosition,
        size: 10,
        font: font,
        color: darkColor,
      })
      yPosition -= 15
    })

    yPosition -= 20

    // Water Damage Assessment
    page.drawText("WATER DAMAGE ASSESSMENT", {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 20

    const assessmentInfo = [
      ["Water Category:", parsedReport.waterCategory],
      ["Water Class:", parsedReport.waterClass],
      ["Source of Water:", parsedReport.sourceOfWater],
      ["Affected Area:", parsedReport.affectedArea ? `${parsedReport.affectedArea} sqm` : "N/A"],
      ["HVAC Affected:", parsedReport.hvacAffected ? "Yes" : "No"],
    ]

    assessmentInfo.forEach(([label, value]) => {
      page.drawText(label, {
        x: 50,
        y: yPosition,
        size: 10,
        font: boldFont,
        color: darkColor,
      })
      page.drawText(safeString(value), {
        x: 200,
        y: yPosition,
        size: 10,
        font: font,
        color: darkColor,
      })
      yPosition -= 15
    })

    yPosition -= 20

    // Safety Hazards
    if (parsedReport.safetyHazards) {
      page.drawText("SAFETY HAZARDS", {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: rgb(0.8, 0.4, 0.2), // Orange
      })
      yPosition -= 15

      const safetyText = parsedReport.safetyHazards
      const maxWidth = 500
      const lines = wrapText(safetyText, maxWidth, font, 10)
      
      lines.forEach(line => {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      })
      yPosition -= 10
    }

    // Structural Damage
    if (parsedReport.structuralDamage) {
      page.drawText("STRUCTURAL DAMAGE", {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: rgb(0.8, 0.2, 0.2), // Red
      })
      yPosition -= 15

      const damageText = parsedReport.structuralDamage
      const maxWidth = 500
      const lines = wrapText(damageText, maxWidth, font, 10)
      
      lines.forEach(line => {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      })
      yPosition -= 10
    }

    // Equipment and Drying Plan
    if (parsedReport.dehumidificationCapacity || parsedReport.airmoversCount) {
      page.drawText("EQUIPMENT & DRYING PLAN", {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: darkColor,
      })
      yPosition -= 15

      const equipmentInfo = [
        ["Dehumidification Capacity:", parsedReport.dehumidificationCapacity ? `${parsedReport.dehumidificationCapacity} L/day` : "N/A"],
        ["Airmovers Count:", parsedReport.airmoversCount ? `${parsedReport.airmoversCount}` : "N/A"],
        ["Target Humidity:", parsedReport.targetHumidity ? `${parsedReport.targetHumidity}%` : "N/A"],
        ["Target Temperature:", parsedReport.targetTemperature ? `${parsedReport.targetTemperature}°C` : "N/A"],
        ["Estimated Drying Time:", parsedReport.estimatedDryingTime ? `${parsedReport.estimatedDryingTime} hours` : "N/A"],
      ]

      equipmentInfo.forEach(([label, value]) => {
        page.drawText(label, {
          x: 50,
          y: yPosition,
          size: 10,
          font: boldFont,
          color: darkColor,
        })
        page.drawText(safeString(value), {
          x: 250,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        yPosition -= 15
      })
      yPosition -= 10
    }

    // Insurance Coverage
    if (parsedReport.propertyCover || parsedReport.contentsCover) {
      page.drawText("INSURANCE COVERAGE", {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: darkColor,
      })
      yPosition -= 15

      if (parsedReport.propertyCover) {
        page.drawText("Property Coverage:", {
          x: 50,
          y: yPosition,
          size: 10,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 12

        Object.entries(parsedReport.propertyCover).forEach(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').trim()
          const status = value ? "Covered" : "Not Covered"
          const color = value ? rgb(0.2, 0.8, 0.2) : rgb(0.8, 0.2, 0.2)
          
          page.drawText(`• ${label}:`, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          page.drawText(safeString(status), {
            x: 200,
            y: yPosition,
            size: 9,
            font: font,
            color: color,
          })
          yPosition -= 12
        })
        yPosition -= 5
      }
    }

    // Footer
    const footerY = 50
    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: footerY,
      size: 8,
      font: font,
      color: lightColor,
    })

    page.drawText(`Report ID: ${parsedReport.id}`, {
      x: 450,
      y: footerY,
      size: 8,
      font: font,
      color: lightColor,
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Return PDF as response
    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="water-damage-report-${parsedReport.reportNumber || parsedReport.id}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    })

  } catch (error) {
    console.error("Error generating PDF:", error)
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    )
  }
}

// Helper function to safely convert values to strings
function safeString(value: any): string {
  if (value === null || value === undefined) return "N/A"
  if (typeof value === 'boolean') return value ? "Yes" : "No"
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'string') return value
  return String(value)
}

// Helper function to wrap text
function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word
    const textWidth = font.widthOfTextAtSize(testLine, fontSize)
    
    if (textWidth <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        lines.push(word)
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines
}
