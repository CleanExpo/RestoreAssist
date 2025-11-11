import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import fs from "fs/promises"
import path from "path"
import Anthropic from "@anthropic-ai/sdk"

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

    // Fetch scope if exists - include ALL fields
    let scope = null
    try {
      const scopeData = await prisma.scope.findFirst({
        where: { reportId: id }
      })
      if (scopeData) {
        scope = {
          id: scopeData.id,
          reportId: scopeData.reportId,
          scopeType: scopeData.scopeType,
          siteVariables: scopeData.siteVariables ? JSON.parse(scopeData.siteVariables) : null,
          labourParameters: scopeData.labourParameters ? JSON.parse(scopeData.labourParameters) : null,
          equipmentParameters: scopeData.equipmentParameters ? JSON.parse(scopeData.equipmentParameters) : null,
          chemicalApplication: scopeData.chemicalApplication ? JSON.parse(scopeData.chemicalApplication) : null,
          timeCalculations: scopeData.timeCalculations ? JSON.parse(scopeData.timeCalculations) : null,
          labourCostTotal: scopeData.labourCostTotal,
          equipmentCostTotal: scopeData.equipmentCostTotal,
          chemicalCostTotal: scopeData.chemicalCostTotal,
          totalDuration: scopeData.totalDuration,
          complianceNotes: scopeData.complianceNotes,
          assumptions: scopeData.assumptions,
          createdAt: scopeData.createdAt,
          updatedAt: scopeData.updatedAt,
          createdBy: scopeData.createdBy,
          updatedBy: scopeData.updatedBy,
          userId: scopeData.userId
        }
      }
    } catch (err) {
      console.log("No scope found")
    }

    // Fetch estimate if exists - include ALL fields
    let estimate = null
    try {
      const estimateData = await prisma.estimate.findFirst({
        where: { reportId: id },
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: {
            orderBy: { displayOrder: "asc" }
          }
        }
      })
      if (estimateData) {
        estimate = {
          id: estimateData.id,
          reportId: estimateData.reportId,
          scopeId: estimateData.scopeId,
          status: estimateData.status,
          version: estimateData.version,
          rateTables: estimateData.rateTables ? JSON.parse(estimateData.rateTables) : null,
          commercialParams: estimateData.commercialParams ? JSON.parse(estimateData.commercialParams) : null,
          lineItems: estimateData.lineItems.map(item => ({
            id: item.id,
            estimateId: item.estimateId,
            code: item.code,
            category: item.category,
            description: item.description,
            qty: item.qty,
            unit: item.unit,
            rate: item.rate,
            formula: item.formula,
            subtotal: item.subtotal,
            isScopeLinked: item.isScopeLinked,
            isEstimatorAdded: item.isEstimatorAdded,
            displayOrder: item.displayOrder,
            createdBy: item.createdBy,
            modifiedBy: item.modifiedBy,
            modifiedAt: item.modifiedAt,
            changeReason: item.changeReason,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          })),
          labourSubtotal: estimateData.labourSubtotal,
          equipmentSubtotal: estimateData.equipmentSubtotal,
          chemicalsSubtotal: estimateData.chemicalsSubtotal,
          subcontractorSubtotal: estimateData.subcontractorSubtotal,
          travelSubtotal: estimateData.travelSubtotal,
          wasteSubtotal: estimateData.wasteSubtotal,
          overheads: estimateData.overheads,
          profit: estimateData.profit,
          contingency: estimateData.contingency,
          escalation: estimateData.escalation,
          subtotalExGST: estimateData.subtotalExGST,
          gst: estimateData.gst,
          totalIncGST: estimateData.totalIncGST,
          assumptions: estimateData.assumptions,
          inclusions: estimateData.inclusions,
          exclusions: estimateData.exclusions,
          allowances: estimateData.allowances,
          complianceStatement: estimateData.complianceStatement,
          disclaimer: estimateData.disclaimer,
          approverName: estimateData.approverName,
          approverRole: estimateData.approverRole,
          approverSignature: estimateData.approverSignature,
          approvedAt: estimateData.approvedAt,
          estimatedDuration: estimateData.estimatedDuration,
          createdAt: estimateData.createdAt,
          updatedAt: estimateData.updatedAt,
          createdBy: estimateData.createdBy,
          updatedBy: estimateData.updatedBy,
          userId: estimateData.userId
        }
      }
    } catch (err) {
      console.log("No estimate found")
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
    let page = pdfDoc.addPage([595.28, 841.89]) // A4 size
    const { width, height } = page.getSize()

    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Colors & Brand
    const primaryColor = rgb(0.0, 0.63, 0.8) // RestoreAssist Cyan
    const darkColor = rgb(0.08, 0.09, 0.11) // Dark slate
    const lightColor = rgb(0.5, 0.53, 0.58) // Light slate
    const accentColor = rgb(0.0, 0.8, 0.67) // Teal accent

    // Helpers to add header/footer per page
    const drawHeader = (p: any) => {
      // Brand bar
      p.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: rgb(0.02, 0.04, 0.06) })
      p.drawText("RestoreAssist — Professional Water Damage Report", {
        x: 50,
        y: height - 28,
        size: 12,
        font: boldFont,
        color: rgb(1, 1, 1),
      })
    }

    const drawFooter = (p: any) => {
      const footerY = 30
      p.drawRectangle({ x: 0, y: 0, width, height: 40, color: rgb(0.02, 0.04, 0.06) })
      p.drawText(`Generated by RestoreAssist • ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: footerY - 8,
        size: 9,
        font: font,
        color: rgb(1, 1, 1),
      })
      p.drawText(`Report ID: ${parsedReport.id}`, {
        x: width - 200,
        y: footerY - 8,
        size: 9,
        font: font,
        color: rgb(1, 1, 1),
      })
    }

    const addNewPage = () => {
      page = pdfDoc.addPage([595.28, 841.89])
      drawHeader(page)
      return page
    }

    // Cover Page
    drawHeader(page)
    let yPosition = height - 100

    // Try to embed logo
    try {
      const logoPath = path.join(process.cwd(), "public", "placeholder-logo.png")
      const logoBytes = await fs.readFile(logoPath)
      const logoImage = await pdfDoc.embedPng(logoBytes)
      const logoDims = logoImage.scale(0.2)
      page.drawImage(logoImage, {
        x: width - logoDims.width - 40,
        y: height - logoDims.height - 50,
        width: logoDims.width,
        height: logoDims.height,
      })
    } catch {}

    // Title
    page.drawText("RestoreAssist", { x: 50, y: yPosition, size: 26, font: titleFont, color: primaryColor })
    yPosition -= 24
    page.drawText("Water Damage Restoration Report", { x: 50, y: yPosition, size: 16, font: boldFont, color: darkColor })
    yPosition -= 20
    page.drawText("IICRC S500 Compliant • Evidence-based • Audit-ready", { x: 50, y: yPosition, size: 10, font: font, color: lightColor })
    yPosition -= 30

    // Cover info panel
    page.drawRectangle({ x: 45, y: yPosition - 90, width: width - 90, height: 90, color: rgb(0.96, 0.97, 0.98) })
    page.drawRectangle({ x: 45, y: yPosition - 90, width: width - 90, height: 90, borderWidth: 1, color: rgb(0, 0, 0), opacity: 0, borderColor: lightColor })
    const coverInfo = [
      ["Report #", parsedReport.reportNumber || parsedReport.id],
      ["Client", parsedReport.client?.name || parsedReport.clientName],
      ["Property", parsedReport.propertyAddress],
      ["Inspection Date", parsedReport.inspectionDate ? new Date(parsedReport.inspectionDate).toLocaleDateString() : "N/A"],
    ]
    let infoY = yPosition - 20
    coverInfo.forEach(([label, value]) => {
      page.drawText(String(label), { x: 60, y: infoY, size: 10, font: boldFont, color: darkColor })
      page.drawText(safeString(value), { x: 160, y: infoY, size: 10, font: font, color: darkColor })
      infoY -= 18
    })
    yPosition -= 110

    // Optional AI Executive Summary
    let executiveSummary: string | null = null
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4500)
        const { tryClaudeModels } = await import('@/lib/anthropic-models')
        const anthropicClient = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        })
        
        const message = await tryClaudeModels(
          anthropicClient,
          {
          max_tokens: 400,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: `You are generating a concise, professional executive summary (5-8 sentences) for a water damage restoration report. Use the following JSON data to inform specifics (category/class of water, affected areas, key risks, scope highlights, estimate totals, duration). Keep it factual, evidence-based, and audit-ready. Use Australian context.

Report: ${JSON.stringify(parsedReport)}
Scope: ${JSON.stringify(scope)}
Estimate: ${JSON.stringify(estimate)}`,
            },
          ],
        }
        )
        
        const resp = {
          ok: true,
          json: async () => ({
            content: [{
              type: 'text',
              text: message.content[0].type === 'text' ? message.content[0].text : JSON.stringify(message.content[0])
            }]
          })
        } as Response
        clearTimeout(timeout)
        if (resp.ok) {
          const json = await resp.json()
          const text = json?.content?.[0]?.text || json?.content?.[0]?.content?.[0]?.text
          if (text) executiveSummary = sanitizeText(text)
        }
      }
    } catch {}

    page.drawText("Executive Summary", { x: 50, y: yPosition, size: 12, font: boldFont, color: darkColor })
    yPosition -= 16
    const summaryText = executiveSummary || "This report summarizes the water damage incident, assessment findings, scope of works, and cost estimate prepared by RestoreAssist. All calculations are based on IICRC S500 methodology and Australian standards."
    const summaryLines = wrapText(summaryText, 490, font, 10)
    summaryLines.forEach((line) => {
      page.drawText(line, { x: 50, y: yPosition, size: 10, font: font, color: darkColor })
      yPosition -= 12
    })

    // Move to next page for details
    drawFooter(page)
    addNewPage()
    yPosition = height - 70

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

      const safetyText = safeString(parsedReport.safetyHazards)
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

      const damageText = safeString(parsedReport.structuralDamage)
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

    // Check if new page needed before Scope
    if (yPosition < 150) {
      drawFooter(page)
      addNewPage()
      yPosition = height - 70
    }

    // Scope of Work
    if (scope) {
      page.drawText("SCOPE OF WORK", {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: primaryColor,
      })
      yPosition -= 20

      const scopeInfo = [
        ["Scope Type:", scope.scopeType],
        ["Total Duration:", scope.totalDuration ? `${scope.totalDuration} days` : "N/A"],
      ]
      scopeInfo.forEach(([label, value]) => {
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

      yPosition -= 10

      // Cost Summary
      if (scope.labourCostTotal || scope.equipmentCostTotal || scope.chemicalCostTotal) {
        page.drawText("Cost Summary:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15

        if (scope.labourCostTotal) {
          page.drawText(`Labour: $${scope.labourCostTotal.toFixed(2)}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
        if (scope.equipmentCostTotal) {
          page.drawText(`Equipment: $${scope.equipmentCostTotal.toFixed(2)}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
        if (scope.chemicalCostTotal) {
          page.drawText(`Chemicals: $${scope.chemicalCostTotal.toFixed(2)}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
        const totalScope = (scope.labourCostTotal || 0) + (scope.equipmentCostTotal || 0) + (scope.chemicalCostTotal || 0)
        page.drawText(`Total: $${totalScope.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: boldFont,
          color: primaryColor,
        })
        yPosition -= 15
      }

      // Site Variables
      if (scope.siteVariables) {
        const sv = scope.siteVariables
        page.drawText("Site Variables:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15

        if (sv.structure) {
          const structureText = safeString(sv.structure)
          const lines = wrapText(`Structure: ${structureText}`, 500, font, 10)
          lines.forEach(line => {
            if (yPosition < 100) {
              page = pdfDoc.addPage([595.28, 841.89])
              yPosition = height - 50
            }
            page.drawText(line, {
              x: 70,
              y: yPosition,
              size: 9,
              font: font,
              color: darkColor,
            })
            yPosition -= 12
          })
        }
        if (sv.materials) {
          const materialsText = safeString(sv.materials)
          const lines = wrapText(`Materials: ${materialsText}`, 500, font, 10)
          lines.forEach(line => {
            if (yPosition < 100) {
              page = pdfDoc.addPage([595.28, 841.89])
              yPosition = height - 50
            }
            page.drawText(line, {
              x: 70,
              y: yPosition,
              size: 9,
              font: font,
              color: darkColor,
            })
            yPosition -= 12
          })
        }
        yPosition -= 10
      }

      // Compliance Notes
      if (scope.complianceNotes) {
        if (yPosition < 150) {
          drawFooter(page)
          addNewPage()
          yPosition = height - 70
        }
        page.drawText("Compliance Notes:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15
        const complianceText = safeString(scope.complianceNotes)
        const lines = wrapText(complianceText, 500, font, 10)
        lines.forEach(line => {
          if (yPosition < 100) {
            drawFooter(page)
            addNewPage()
            yPosition = height - 70
          }
          page.drawText(line, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        })
        yPosition -= 10
      }
    }

    // Check if new page needed before Estimate
    if (yPosition < 150) {
      drawFooter(page)
      addNewPage()
      yPosition = height - 70
    }

    // Cost Estimate
    if (estimate) {
      page.drawText("COST ESTIMATE", {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: primaryColor,
      })
      yPosition -= 20

      const estimateInfo = [
        ["Status:", estimate.status],
        ["Version:", estimate.version ? `v${estimate.version}` : "N/A"],
      ]
      estimateInfo.forEach(([label, value]) => {
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

      yPosition -= 10

      // Cost Breakdown
      page.drawText("Cost Breakdown:", {
        x: 50,
        y: yPosition,
        size: 11,
        font: boldFont,
        color: darkColor,
      })
      yPosition -= 15

      const costItems = [
        ["Labour Subtotal:", estimate.labourSubtotal],
        ["Equipment Subtotal:", estimate.equipmentSubtotal],
        ["Chemicals Subtotal:", estimate.chemicalsSubtotal],
        ["Subcontractors Subtotal:", estimate.subcontractorSubtotal],
        ["Travel Subtotal:", estimate.travelSubtotal],
        ["Waste Subtotal:", estimate.wasteSubtotal],
      ]

      costItems.forEach(([label, value]) => {
        if (value) {
          page.drawText(label, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          page.drawText(`$${value.toFixed(2)}`, {
            x: 200,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
      })

      yPosition -= 5

      if (estimate.overheads) {
        page.drawText(`Overheads: $${estimate.overheads.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 9,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      }
      if (estimate.profit) {
        page.drawText(`Profit: $${estimate.profit.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 9,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      }
      if (estimate.contingency) {
        page.drawText(`Contingency: $${estimate.contingency.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 9,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      }
      if (estimate.escalation) {
        page.drawText(`Escalation: $${estimate.escalation.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 9,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      }

      yPosition -= 10

      // Grand Total
      if (estimate.totalIncGST) {
        page.drawText("GRAND TOTAL", {
          x: 50,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: primaryColor,
        })
        yPosition -= 15
        if (estimate.subtotalExGST) {
          page.drawText(`Subtotal Ex-GST: $${estimate.subtotalExGST.toFixed(2)}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
        if (estimate.gst) {
          page.drawText(`GST (10%): $${estimate.gst.toFixed(2)}`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: font,
            color: darkColor,
          })
          yPosition -= 12
        }
        page.drawText(`Total Inc-GST: $${estimate.totalIncGST.toFixed(2)}`, {
          x: 70,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: primaryColor,
        })
        yPosition -= 15
      }

      // Assumptions, Inclusions, Exclusions
      if (estimate.assumptions) {
        if (yPosition < 200) {
          drawFooter(page)
          addNewPage()
          yPosition = height - 70
        }
        page.drawText("Assumptions:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15
        const assumptionsText = safeString(estimate.assumptions)
        const lines = wrapText(assumptionsText, 500, font, 9)
        lines.forEach(line => {
          if (yPosition < 100) {
            drawFooter(page)
            addNewPage()
            yPosition = height - 70
          }
          page.drawText(line, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          yPosition -= 11
        })
        yPosition -= 10
      }

      if (estimate.inclusions) {
        if (yPosition < 200) {
          drawFooter(page)
          addNewPage()
          yPosition = height - 70
        }
        page.drawText("Inclusions:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15
        const inclusionsText = safeString(estimate.inclusions)
        const lines = wrapText(inclusionsText, 500, font, 9)
        lines.forEach(line => {
          if (yPosition < 100) {
            drawFooter(page)
            addNewPage()
            yPosition = height - 70
          }
          page.drawText(line, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          yPosition -= 11
        })
        yPosition -= 10
      }

      if (estimate.exclusions) {
        if (yPosition < 200) {
          drawFooter(page)
          addNewPage()
          yPosition = height - 70
        }
        page.drawText("Exclusions:", {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
          color: darkColor,
        })
        yPosition -= 15
        const exclusionsText = safeString(estimate.exclusions)
        const lines = wrapText(exclusionsText, 500, font, 9)
        lines.forEach(line => {
          if (yPosition < 100) {
            drawFooter(page)
            addNewPage()
            yPosition = height - 70
          }
          page.drawText(line, {
            x: 70,
            y: yPosition,
            size: 9,
            font: font,
            color: darkColor,
          })
          yPosition -= 11
        })
        yPosition -= 10
      }
    }

    // Footer on last page
    drawFooter(page)

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

// Helper function to sanitize text for PDF encoding (WinAnsi)
function sanitizeText(text: string): string {
  if (!text) return ""
  // Replace newlines and carriage returns with spaces
  let sanitized = text.replace(/[\r\n]+/g, ' ')
  // Remove or replace non-WinAnsi characters
  // Keep only ASCII printable characters (32-126) and common extended chars
  sanitized = sanitized.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, ' ')
  return sanitized.trim()
}

// Helper function to safely get text width
function getTextWidth(text: string, font: any, fontSize: number): number {
  try {
    return font.widthOfTextAtSize(text, fontSize)
  } catch (error) {
    // If encoding fails, try with sanitized text
    const sanitized = sanitizeText(text)
    try {
      return font.widthOfTextAtSize(sanitized, fontSize)
    } catch {
      // Fallback: estimate width based on character count
      return sanitized.length * fontSize * 0.6
    }
  }
}

// Helper function to wrap text
function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  // Sanitize text first
  const sanitized = sanitizeText(text)
  if (!sanitized) return []
  
  const words = sanitized.split(' ').filter(w => w.length > 0)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word
    
    try {
      const textWidth = getTextWidth(testLine, font, fontSize)
      
      if (textWidth <= maxWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          // Word is too long, split it
          let remainingWord = word
          while (remainingWord.length > 0) {
            let chunk = ''
            for (let i = 0; i < remainingWord.length; i++) {
              const testChunk = chunk + remainingWord[i]
              try {
                const chunkWidth = getTextWidth(testChunk, font, fontSize)
                if (chunkWidth <= maxWidth) {
                  chunk = testChunk
                } else {
                  break
                }
              } catch {
                // If measurement fails, take up to 80% of max width in chars
                if (chunk.length < maxWidth / fontSize * 1.6) {
                  chunk = testChunk
                } else {
                  break
                }
              }
            }
            if (chunk) {
              lines.push(chunk)
              remainingWord = remainingWord.substring(chunk.length)
            } else {
              // Single character that's too wide, add anyway
              lines.push(remainingWord[0] || '')
              remainingWord = remainingWord.substring(1)
            }
            if (remainingWord.length === 0) {
              currentLine = ''
              break
            }
          }
          currentLine = remainingWord
        }
      }
    } catch (error) {
      // If encoding fails completely, fallback to simple character count
      if (testLine.length * fontSize * 0.6 <= maxWidth) {
        currentLine = testLine
      } else {
        if (currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          // Split long word
          const chunkSize = Math.floor(maxWidth / (fontSize * 0.6))
          for (let i = 0; i < word.length; i += chunkSize) {
            lines.push(word.substring(i, i + chunkSize))
          }
          currentLine = ''
        }
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines.filter(line => line.length > 0)
}
