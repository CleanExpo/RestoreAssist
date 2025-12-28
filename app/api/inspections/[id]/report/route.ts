import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateNIRPDF } from "@/lib/nir-report-generation"
import { generateVerificationChecklist } from "@/lib/nir-verification-checklist"

// Dynamic import for ExcelJS to handle cases where it's not installed
let ExcelJS: any = null
try {
  ExcelJS = require("exceljs")
} catch (e) {
  console.warn("ExcelJS not installed. Excel export will use JSON format.")
}

// GET - Generate report in requested format
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
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "json" // json, pdf, excel
    
    // Get inspection with all data
    const inspection = await prisma.inspection.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: {
          where: { isSelected: true }
        },
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        costEstimates: true,
        photos: {
          orderBy: { timestamp: "asc" }
        },
        report: {
          include: {
            user: {
              select: {
                businessName: true,
                businessABN: true,
                businessAddress: true,
                businessPhone: true,
                businessEmail: true
              }
            }
          }
        }
      }
    })
    
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }
    
    if (inspection.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Inspection must be completed before generating report" },
        { status: 400 }
      )
    }
    
    // Generate report based on format
    switch (format.toLowerCase()) {
      case "pdf":
        return await generatePDFReport(inspection)
      
      case "excel":
        return await generateExcelReport(inspection)
      
      case "json":
      default:
        return generateJSONReport(inspection)
    }
  } catch (error) {
    console.error("Error generating report:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Generate JSON report
function generateJSONReport(inspection: any) {
  const report = {
    inspection: {
      id: inspection.id,
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      propertyPostcode: inspection.propertyPostcode,
      inspectionDate: inspection.inspectionDate,
      technicianName: inspection.technicianName,
      status: inspection.status
    },
    environmentalData: inspection.environmentalData,
    moistureReadings: inspection.moistureReadings,
    affectedAreas: inspection.affectedAreas,
    classification: inspection.classifications[0] || null,
    scopeItems: inspection.scopeItems,
    costEstimate: {
      items: inspection.costEstimates,
      subtotal: inspection.costEstimates.reduce((sum: number, item: any) => sum + item.subtotal, 0),
      contingency: inspection.costEstimates.reduce((sum: number, item: any) => sum + (item.contingency || 0), 0),
      total: inspection.costEstimates.reduce((sum: number, item: any) => sum + item.total, 0)
    },
    photos: inspection.photos.map((photo: any) => ({
      url: photo.url,
      location: photo.location,
      timestamp: photo.timestamp
    })),
    verificationChecklist: generateVerificationChecklist(inspection),
    generatedAt: new Date().toISOString()
  }
  
  return NextResponse.json(report)
}

// Generate PDF report
async function generatePDFReport(inspection: any) {
  try {
    const pdfBuffer = await generateNIRPDF(inspection)
    
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber}.pdf"`
      }
    })
  } catch (error) {
    console.error("Error generating PDF:", error)
    return NextResponse.json(
      { error: "Failed to generate PDF report" },
      { status: 500 }
    )
  }
}

// Generate Excel report using ExcelJS
async function generateExcelReport(inspection: any) {
  try {
    // Fallback to JSON if ExcelJS is not installed
    if (!ExcelJS) {
      console.warn("ExcelJS not available, returning JSON format")
      const excelData = {
        Summary: {
          "Inspection Number": inspection.inspectionNumber,
          "Property Address": inspection.propertyAddress,
          "Postcode": inspection.propertyPostcode,
          "Inspection Date": new Date(inspection.inspectionDate).toLocaleDateString(),
          "Technician": inspection.technicianName || "N/A",
          "Category": inspection.classifications?.[0]?.category || "N/A",
          "Class": inspection.classifications?.[0]?.class || "N/A"
        },
        "Environmental Data": inspection.environmentalData || {},
        "Moisture Readings": inspection.moistureReadings || [],
        "Affected Areas": inspection.affectedAreas || [],
        "Scope Items": inspection.scopeItems || [],
        "Cost Estimate": inspection.costEstimates || [],
        "Verification Checklist": generateVerificationChecklist(inspection)
      }
      
      return NextResponse.json(excelData, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber}.json"`
        }
      })
    }
    
    const workbook = new ExcelJS.Workbook()
    
    // Summary Sheet
    const summarySheet = workbook.addWorksheet("Summary")
    summarySheet.columns = [
      { header: "Field", key: "field", width: 30 },
      { header: "Value", key: "value", width: 50 }
    ]
    
    summarySheet.addRow({ field: "Inspection Number", value: inspection.inspectionNumber })
    summarySheet.addRow({ field: "Property Address", value: inspection.propertyAddress })
    summarySheet.addRow({ field: "Postcode", value: inspection.propertyPostcode })
    summarySheet.addRow({ field: "Inspection Date", value: new Date(inspection.inspectionDate).toLocaleDateString() })
    summarySheet.addRow({ field: "Technician", value: inspection.technicianName || "N/A" })
    
    if (inspection.classifications && inspection.classifications.length > 0) {
      const classification = inspection.classifications[0]
      summarySheet.addRow({ field: "Category", value: classification.category })
      summarySheet.addRow({ field: "Class", value: classification.class })
      summarySheet.addRow({ field: "Justification", value: classification.justification })
      summarySheet.addRow({ field: "Standard Reference", value: classification.standardReference })
    }
    
    // Environmental Data Sheet
    if (inspection.environmentalData) {
      const envSheet = workbook.addWorksheet("Environmental Data")
      envSheet.columns = [
        { header: "Parameter", key: "parameter", width: 25 },
        { header: "Value", key: "value", width: 20 },
        { header: "Unit", key: "unit", width: 15 }
      ]
      
      envSheet.addRow({ parameter: "Ambient Temperature", value: inspection.environmentalData.ambientTemperature, unit: "°F" })
      envSheet.addRow({ parameter: "Humidity Level", value: inspection.environmentalData.humidityLevel, unit: "%" })
      envSheet.addRow({ parameter: "Dew Point", value: inspection.environmentalData.dewPoint, unit: "°F" })
      envSheet.addRow({ parameter: "Air Circulation", value: inspection.environmentalData.airCirculation ? "Yes" : "No", unit: "" })
    }
    
    // Moisture Readings Sheet
    if (inspection.moistureReadings && inspection.moistureReadings.length > 0) {
      const moistureSheet = workbook.addWorksheet("Moisture Readings")
      moistureSheet.columns = [
        { header: "Location", key: "location", width: 25 },
        { header: "Surface Type", key: "surfaceType", width: 20 },
        { header: "Moisture Level (%)", key: "moistureLevel", width: 18 },
        { header: "Depth", key: "depth", width: 15 },
        { header: "Recorded At", key: "recordedAt", width: 20 }
      ]
      
      inspection.moistureReadings.forEach((reading: any) => {
        moistureSheet.addRow({
          location: reading.location,
          surfaceType: reading.surfaceType,
          moistureLevel: reading.moistureLevel,
          depth: reading.depth,
          recordedAt: reading.recordedAt ? new Date(reading.recordedAt).toLocaleString() : ""
        })
      })
    }
    
    // Affected Areas Sheet
    if (inspection.affectedAreas && inspection.affectedAreas.length > 0) {
      const areasSheet = workbook.addWorksheet("Affected Areas")
      areasSheet.columns = [
        { header: "Room/Zone", key: "roomZone", width: 25 },
        { header: "Square Footage", key: "squareFootage", width: 18 },
        { header: "Water Source", key: "waterSource", width: 20 },
        { header: "Time Since Loss (hrs)", key: "timeSinceLoss", width: 20 },
        { header: "Category", key: "category", width: 15 },
        { header: "Class", key: "class", width: 15 }
      ]
      
      inspection.affectedAreas.forEach((area: any) => {
        areasSheet.addRow({
          roomZone: area.roomZoneId,
          squareFootage: area.affectedSquareFootage,
          waterSource: area.waterSource,
          timeSinceLoss: area.timeSinceLoss,
          category: area.category || "N/A",
          class: area.class || "N/A"
        })
      })
    }
    
    // Scope Items Sheet
    if (inspection.scopeItems && inspection.scopeItems.length > 0) {
      const scopeSheet = workbook.addWorksheet("Scope Items")
      scopeSheet.columns = [
        { header: "Item Type", key: "itemType", width: 30 },
        { header: "Description", key: "description", width: 40 },
        { header: "Quantity", key: "quantity", width: 15 },
        { header: "Unit", key: "unit", width: 15 },
        { header: "Justification", key: "justification", width: 50 },
        { header: "Standard Reference", key: "standardReference", width: 30 }
      ]
      
      inspection.scopeItems.forEach((item: any) => {
        scopeSheet.addRow({
          itemType: item.itemType,
          description: item.description,
          quantity: item.quantity || "",
          unit: item.unit || "",
          justification: item.justification || "",
          standardReference: item.standardReference || ""
        })
      })
    }
    
    // Cost Estimate Sheet
    if (inspection.costEstimates && inspection.costEstimates.length > 0) {
      const costSheet = workbook.addWorksheet("Cost Estimate")
      costSheet.columns = [
        { header: "Category", key: "category", width: 20 },
        { header: "Description", key: "description", width: 40 },
        { header: "Quantity", key: "quantity", width: 15 },
        { header: "Unit", key: "unit", width: 15 },
        { header: "Rate", key: "rate", width: 15 },
        { header: "Subtotal", key: "subtotal", width: 15 },
        { header: "Contingency", key: "contingency", width: 15 },
        { header: "Total", key: "total", width: 15 }
      ]
      
      inspection.costEstimates.forEach((item: any) => {
        costSheet.addRow({
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          subtotal: item.subtotal,
          contingency: item.contingency || 0,
          total: item.total
        })
      })
      
      // Add totals row
      const subtotal = inspection.costEstimates.reduce((sum: number, item: any) => sum + item.subtotal, 0)
      const contingency = inspection.costEstimates.reduce((sum: number, item: any) => sum + (item.contingency || 0), 0)
      const total = inspection.costEstimates.reduce((sum: number, item: any) => sum + item.total, 0)
      
      costSheet.addRow({})
      const totalsRow = costSheet.addRow({ 
        description: "TOTALS", 
        subtotal, 
        contingency, 
        total 
      })
      totalsRow.font = { bold: true }
    }
    
    // Verification Checklist Sheet
    const checklist = generateVerificationChecklist(inspection)
    const checklistSheet = workbook.addWorksheet("Verification Checklist")
    checklistSheet.columns = [
      { header: "Item", key: "item", width: 50 },
      { header: "Verified", key: "verified", width: 15 },
      { header: "Notes", key: "notes", width: 60 }
    ]
    
    checklistSheet.addRow({ item: "VERIFICATION CHECKLIST", verified: "", notes: "For Insurance Adjuster / Client Review" })
    checklistSheet.addRow({ item: "", verified: "", notes: "This checklist is auto-generated for verification purposes only." })
    checklistSheet.addRow({ item: "", verified: "", notes: "It is not for the technician to complete." })
    checklistSheet.addRow({})
    
    checklist.items.forEach((checklistItem) => {
      checklistSheet.addRow({
        item: checklistItem.item,
        verified: checklistItem.verified ? "✓ Yes" : "□ No",
        notes: checklistItem.notes || ""
      })
    })
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber}.xlsx"`
      }
    })
  } catch (error) {
    console.error("Error generating Excel:", error)
    return NextResponse.json(
      { error: "Failed to generate Excel report" },
      { status: 500 }
    )
  }
}

