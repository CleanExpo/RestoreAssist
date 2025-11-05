import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id } = await params

    // Fetch the report with all related data
    const report = await prisma.report.findFirst({
      where: {
        id: id,
        userId: userId
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

    // Fetch scope with ALL fields
    let scope = null
    try {
      const scopeData = await prisma.scope.findFirst({
        where: { reportId: id }
      })
      if (scopeData) {
        scope = {
          ...scopeData,
          siteVariables: scopeData.siteVariables ? JSON.parse(scopeData.siteVariables) : null,
          labourParameters: scopeData.labourParameters ? JSON.parse(scopeData.labourParameters) : null,
          equipmentParameters: scopeData.equipmentParameters ? JSON.parse(scopeData.equipmentParameters) : null,
          chemicalApplication: scopeData.chemicalApplication ? JSON.parse(scopeData.chemicalApplication) : null,
          timeCalculations: scopeData.timeCalculations ? JSON.parse(scopeData.timeCalculations) : null,
        }
      }
    } catch (err) {
      console.log("No scope found")
    }

    // Fetch estimate with ALL fields including lineItems
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
          ...estimateData,
          rateTables: estimateData.rateTables ? JSON.parse(estimateData.rateTables) : null,
          commercialParams: estimateData.commercialParams ? JSON.parse(estimateData.commercialParams) : null,
        }
      }
    } catch (err) {
      console.log("No estimate found")
    }

    // Parse ALL JSON fields from report
    const parsedReport = {
      ...report,
      psychrometricReadings: report.psychrometricReadings ? JSON.parse(report.psychrometricReadings) : null,
      moistureReadings: report.moistureReadings ? JSON.parse(report.moistureReadings) : null,
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

    // Professional colors - Cyan theme for RestoreAssist
    const headerBlue = rgb(0.0, 0.63, 0.8) // RestoreAssist Cyan
    const darkColor = rgb(0.0, 0.0, 0.0) // Black text
    const lightGray = rgb(0.7, 0.7, 0.7) // Light gray for lines
    const white = rgb(1, 1, 1) // White

    // Helper function to add new page if needed
    const checkPageBreak = (requiredSpace: number): void => {
      if (yPosition < requiredSpace + 50) {
        page = pdfDoc.addPage([595.28, 841.89])
        yPosition = height - 60
      }
    }

    // Helper function to format date
    const formatDate = (date: Date | string | null): string => {
      if (!date) return "N/A"
      const d = typeof date === 'string' ? new Date(date) : date
      return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    // Helper function to format time
    const formatTime = (date: Date | string | null): string => {
      if (!date) return "N/A"
      const d = typeof date === 'string' ? new Date(date) : date
      return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
    }

    // Helper function to sanitize text for WinAnsi encoding
    const sanitizeText = (text: string): string => {
      if (!text) return ""
      // Replace newlines with spaces, remove other problematic characters
      return text
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII characters except space
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
    }

    // Helper function to wrap text
    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      if (!text) return ['']
      // Sanitize text first
      const sanitizedText = sanitizeText(text)
      const words = sanitizedText.split(' ').filter(w => w.length > 0)
      const lines: string[] = []
      let currentLine = ''

      words.forEach((word) => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word
        try {
          const textWidth = font.widthOfTextAtSize(testLine, fontSize)
          
          if (textWidth > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
          } else {
            currentLine = testLine
          }
        } catch (e) {
          // If encoding fails, try to sanitize further
          const sanitizedWord = sanitizeText(word)
          if (sanitizedWord) {
            currentLine = currentLine + (currentLine ? ' ' : '') + sanitizedWord
          }
        }
      })

      if (currentLine) {
        lines.push(currentLine)
      }

      return lines.length > 0 ? lines : ['']
    }

    // Helper function to draw text with line wrapping
    const drawWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number, color: any = darkColor): number => {
      const lines = wrapText(text, maxWidth, fontSize)
      let currentY = y
      lines.forEach((line) => {
        page.drawText(line, {
          x: x,
          y: currentY,
          size: fontSize,
          font: font,
          color: color,
        })
        currentY -= fontSize + 2
      })
      return currentY
    }

    // Helper function to draw checkbox
    const drawCheckbox = (x: number, y: number, checked: boolean): void => {
      // Draw checkbox with better styling
      page.drawRectangle({
        x: x,
        y: y - 10,
        width: 10,
        height: 10,
        borderColor: darkColor,
        borderWidth: 1.5,
      })
      if (checked) {
        // Draw checkmark (X for WinAnsi compatibility)
        page.drawText("X", {
          x: x + 2,
          y: y - 7,
          size: 9,
          font: boldFont,
          color: darkColor,
        })
      }
    }

    let yPosition = height - 50

    // Header - Professional Blue bar (taller for better presence)
    const headerHeight = 70
    page.drawRectangle({
      x: 0,
      y: yPosition,
      width: width,
      height: headerHeight,
      color: headerBlue,
    })

    // Logo area on left (simulated with circles)
    const logoX = 50
    const logoY = yPosition + headerHeight - 25
    // Draw three overlapping circles (simulated logo) - white circles on blue background
    page.drawCircle({ x: logoX + 15, y: logoY, size: 6, color: white, borderColor: white, borderWidth: 1 })
    page.drawCircle({ x: logoX + 23, y: logoY, size: 6, color: white, borderColor: white, borderWidth: 1 })
    page.drawCircle({ x: logoX + 31, y: logoY, size: 6, color: white, borderColor: white, borderWidth: 1 })
    
    // "RestoreAssist" text next to circles (white on blue background)
    page.drawText("RestoreAssist", {
      x: logoX + 45,
      y: logoY - 3,
      size: 14,
      font: boldFont,
      color: white,
    })

    // Tagline and RESET FORM button on right side
    page.drawText("Insurance Claims made easier", {
      x: width - 220,
      y: logoY + 5,
      size: 10,
      font: boldFont,
      color: white,
    })

    // RESET FORM button (styled as a button)
    const resetButtonX = width - 110
    const resetButtonY = logoY - 10
    page.drawRectangle({
      x: resetButtonX - 5,
      y: resetButtonY - 5,
      width: 80,
      height: 15,
      borderColor: white,
      borderWidth: 1,
      color: rgb(0.9, 0.9, 0.9),
    })
    page.drawText("RESET FORM", {
      x: resetButtonX,
      y: resetButtonY,
      size: 8,
      font: font,
      color: darkColor,
    })

    yPosition -= headerHeight + 20

    // Main Title - larger and centered
    const titleText = "INITIAL ASSESSMENT / QUOTE REPORT"
    const titleWidth = titleFont.widthOfTextAtSize(titleText, 20)
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 20,
      font: titleFont,
      color: darkColor,
    })

    yPosition -= 45

    // REPORT DETAILS Section
    page.drawText("REPORT DETAILS:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    const reportDetails = [
      { label: "Date:", value: formatDate(report.inspectionDate || report.createdAt) },
      { label: "Job Supplier:", value: report.user?.name || "RestoreAssist" },
      { label: "Insurance Company:", value: report.insuranceType || "N/A" },
      { label: "Clients Name:", value: report.clientName || "N/A" },
      { label: "Address:", value: report.propertyAddress || "N/A" },
      { label: "Supervisor:", value: report.user?.name || "N/A" },
      { label: "Order Number:", value: report.reportNumber || report.id.slice(0, 8) },
      { label: "Date On-Site:", value: formatDate(report.inspectionDate || report.createdAt) },
      { label: "Time On-Site:", value: formatTime(report.inspectionDate || report.createdAt) },
      { label: "Meeting On-Site:", value: report.clientName || "N/A" },
      { label: "Phone Number:", value: report.client?.phone || "N/A" },
    ]

    let leftColY = yPosition
    let rightColY = yPosition
    const colWidth = 250
    const labelWidth = 100

    reportDetails.forEach((detail, index) => {
      const isLeftCol = index % 2 === 0
      const currentY = isLeftCol ? leftColY : rightColY

      checkPageBreak(22) // Better spacing

      // Label - fixed width for alignment
      page.drawText(sanitizeText(`${detail.label}`), {
        x: isLeftCol ? 50 : 50 + colWidth,
        y: currentY,
        size: 10,
        font: font,
        color: darkColor,
      })

      const valueX = isLeftCol ? 50 + labelWidth : 50 + colWidth + labelWidth
      const valueWidth = isLeftCol ? colWidth - labelWidth - 20 : width - valueX - 50
      
      // Draw underline (thicker, more visible, consistent length)
      const underlineY = currentY - 4
      const underlineLength = Math.min(valueWidth, 200) // Consistent max length
      page.drawLine({
        start: { x: valueX, y: underlineY },
        end: { x: valueX + underlineLength, y: underlineY },
        thickness: 0.8,
        color: darkColor,
      })

      // Draw value text (sanitize first) - positioned on underline, no overlap
      const sanitizedValue = sanitizeText(detail.value)
      const valueLines = wrapText(sanitizedValue, valueWidth, 10)
      let valueY = currentY
      for (let i = 0; i < valueLines.length; i++) {
        if (valueY < 50) break // Prevent overlap with footer
        page.drawText(sanitizeText(valueLines[i]), {
          x: valueX,
          y: valueY,
          size: 10,
          font: font,
          color: darkColor,
        })
        valueY -= 13
      }

      // Update column positions with consistent spacing
      if (isLeftCol) {
        leftColY = Math.min(leftColY, valueY - 8)
      } else {
        rightColY = Math.min(rightColY, valueY - 8)
      }
    })

    yPosition = Math.min(leftColY, rightColY) - 30

    // CONTACT AND INSPECTION DETAILS Section
    checkPageBreak(150)
    page.drawText("CONTACT AND INSPECTION DETAILS:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    const contactDetails = [
      { label: "Phone Number (Client):", value: report.client?.phone || "N/A", checkbox: false },
      { label: "Date Contacted:", value: formatDate(report.inspectionDate || report.createdAt), checkbox: false },
      { label: "Time Contacted:", value: formatTime(report.inspectionDate || report.createdAt), checkbox: false },
      { label: "Present @ Inspection:", value: report.clientName || "N/A", checkbox: false },
      { label: "Claim Covered:", value: report.insuranceType ? "Yes" : "No", checkbox: true },
      { label: "Photos Taken:", value: "Yes", checkbox: true },
      { label: "Make Safe Completed:", value: report.safetyHazards ? "Yes" : "No", checkbox: true },
      { label: "Cause of Loss:", value: report.sourceOfWater || "N/A", checkbox: false },
    ]

    leftColY = yPosition
    rightColY = yPosition

    contactDetails.forEach((detail, index) => {
      const isLeftCol = index % 2 === 0
      const currentY = isLeftCol ? leftColY : rightColY

      checkPageBreak(20)

      page.drawText(sanitizeText(`${detail.label}`), {
        x: isLeftCol ? 50 : 50 + colWidth,
        y: currentY,
        size: 10,
        font: font,
        color: darkColor,
      })

      if (detail.checkbox) {
        const checkboxX = isLeftCol ? 50 + labelWidth : 50 + colWidth + labelWidth
        drawCheckbox(checkboxX, currentY, detail.value === "Yes")
        page.drawText(sanitizeText(detail.value), {
          x: checkboxX + 15,
          y: currentY,
          size: 10,
          font: font,
          color: darkColor,
        })
        if (detail.value === "Yes") {
          // Also draw "No" checkbox unchecked
          drawCheckbox(checkboxX + 50, currentY, false)
          page.drawText("No", {
            x: checkboxX + 65,
            y: currentY,
            size: 10,
            font: font,
            color: darkColor,
          })
        }
      } else {
        const valueX = isLeftCol ? 50 + labelWidth : 50 + colWidth + labelWidth
        const valueWidth = isLeftCol ? colWidth - labelWidth - 20 : width - valueX - 50
        const sanitizedValue = sanitizeText(detail.value)
        const valueLines = wrapText(sanitizedValue, valueWidth, 10)
        let valueY = currentY
        for (let i = 0; i < valueLines.length; i++) {
          if (valueY < 50) break // Prevent overlap with footer
          if (i > 0) valueY -= 12 // Prevent overlap
          page.drawText(sanitizeText(valueLines[i]), {
            x: valueX,
            y: valueY,
            size: 10,
            font: font,
            color: darkColor,
          })
        }
        if (isLeftCol) {
          leftColY = Math.min(leftColY, valueY - 8)
        } else {
          rightColY = Math.min(rightColY, valueY - 8)
        }
      }

      if (!detail.checkbox) {
        if (isLeftCol) {
          leftColY -= 20
        } else {
          rightColY -= 20
        }
      } else {
        if (isLeftCol) {
          leftColY -= 20
        } else {
          rightColY -= 20
        }
      }
    })

    yPosition = Math.min(leftColY, rightColY) - 30

    // MOISTURE READINGS Table
    checkPageBreak(200)
    page.drawText("MOISTURE READINGS:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    // Table header - improved styling
    const tableHeaderY = yPosition
    page.drawRectangle({
      x: 50,
      y: tableHeaderY - 18,
      width: width - 100,
      height: 22,
      color: headerBlue,
    })

    const tableCols = [
      { label: "ROOMS", width: 130 },
      { label: "RH %", width: 60 },
      { label: "Air Temp C", width: 80 },
      { label: "WME %", width: 80 },
      { label: "Area Tested", width: 150 },
      { label: "Bench Mark", width: 80 },
    ]

    let colX = 55
    tableCols.forEach((col) => {
      page.drawText(col.label, {
        x: colX + 5,
        y: tableHeaderY - 7,
        size: 10,
        font: boldFont,
        color: white,
      })
      colX += col.width
    })

    yPosition -= 35

    // Table rows - use actual moisture readings or create from scope data
    let moistureReadings: any[] = []
    if (parsedReport.moistureReadings && Array.isArray(parsedReport.moistureReadings) && parsedReport.moistureReadings.length > 0) {
      moistureReadings = parsedReport.moistureReadings
    } else if (scope?.siteVariables) {
      // Create moisture readings from scope data
      moistureReadings = [
        {
          room: scope.siteVariables.structure || "Residential - Single Family Home",
          rh: "",
          airTemp: "",
          wme: "100%",
          areaTested: scope.siteVariables.materials || "Gypsum board walls, carpet, hardwood flooring, concrete subfloor",
          benchmark: "N/A"
        },
        {
          room: "Downstairs lounge room",
          rh: "",
          airTemp: "",
          wme: "15-17%",
          areaTested: "Ceiling",
          benchmark: "14%"
        }
      ]
    }

    // Add at least 10 rows (empty rows if needed)
    for (let i = 0; i < Math.max(10, moistureReadings.length); i++) {
      checkPageBreak(20)

      const reading = moistureReadings[i] || {}
      colX = 55
      const values = [
        reading.room || reading.location || "",
        reading.rh || reading.relativeHumidity || "",
        reading.airTemp || reading.temperature || "",
        reading.wme || reading.moistureContent || "",
        reading.areaTested || reading.area || "",
        reading.benchmark || reading.benchMark || "",
      ]

      values.forEach((value, idx) => {
        const valueText = String(value || "")
        const sanitizedValue = sanitizeText(valueText)
        const maxWidth = tableCols[idx].width - 10 // Padding to prevent overlap
        const lines = wrapText(sanitizedValue, maxWidth, 9)
        let valueY = yPosition
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) valueY -= 10 // Prevent overlap
          page.drawText(sanitizeText(lines[i]), {
            x: colX + 5, // Padding from left
            y: valueY,
            size: 9,
            font: font,
            color: darkColor,
          })
        }
        colX += tableCols[idx].width
      })

      yPosition -= 18
    }

    yPosition -= 20

    // Other Comments Section
    checkPageBreak(80)
    page.drawText("Other Comments:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 20

    // Draw text area box
    const commentsBoxHeight = 60
    page.drawRectangle({
      x: 50,
      y: yPosition - commentsBoxHeight,
      width: width - 100,
      height: commentsBoxHeight,
      borderColor: lightGray,
      borderWidth: 1,
    })

    // Add comments if available
    const comments = scope?.timeCalculations?.notes || scope?.assumptions || report.safetyHazards || ""
    if (comments) {
      const sanitizedComments = sanitizeText(comments)
      const commentLines = wrapText(sanitizedComments, width - 120, 10)
      let commentY = yPosition - 15
      commentLines.slice(0, 3).forEach((line) => {
        page.drawText(sanitizeText(line), {
          x: 55,
          y: commentY,
          size: 10,
          font: font,
          color: darkColor,
        })
        commentY -= 12
      })
    }

    yPosition -= commentsBoxHeight + 20

    // ASSESSMENT REPORT Section
    checkPageBreak(100)
    page.drawText("ASSESSMENT REPORT:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    const assessmentFields = [
      { label: "Main Roof Damaged:", value: report.structuralDamage ? "Yes" : "No" },
      { label: "Asbestos On Site:", value: "No" },
      { label: "Other Hazards:", value: report.safetyHazards || report.electricalHazards || report.microbialGrowth || "N/A" },
    ]

    assessmentFields.forEach((field) => {
      checkPageBreak(25)

      page.drawText(sanitizeText(`${field.label}`), {
        x: 50,
        y: yPosition,
        size: 10,
        font: font,
        color: darkColor,
      })

      if (field.label.includes("Main Roof") || field.label.includes("Asbestos")) {
        const checkboxX = 180
        drawCheckbox(checkboxX, yPosition, field.value === "Yes")
        page.drawText("Yes", {
          x: checkboxX + 15,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        drawCheckbox(checkboxX + 40, yPosition, field.value === "No")
        page.drawText("No", {
          x: checkboxX + 55,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
      } else {
        const valueX = 180
        const valueWidth = width - valueX - 50
        const sanitizedValue = sanitizeText(field.value)
        const valueLines = wrapText(sanitizedValue, valueWidth, 10)
        let valueY = yPosition
        valueLines.forEach((line) => {
          page.drawText(sanitizeText(line), {
            x: valueX,
            y: valueY,
            size: 10,
            font: font,
            color: darkColor,
          })
          valueY -= 12
        })
        yPosition = valueY - 5
      }

      yPosition -= 20
    })

    yPosition -= 20

    // RESULTANT DAMAGE Section
    checkPageBreak(150)
    page.drawText("RESULTANT DAMAGE:", {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    const damageQuestions = [
      report.contentsDamage ? `Has there been any content damaged? If so what? ${report.contentsDamage}` : "Has there been any content damaged? If so what? Make sure to take photos and provide detailed list including make,model and serial number where possible",
      report.structuralDamage ? `Is there structural damage to premises? If so, what? ${report.structuralDamage}` : "Is there structural damage to premises? If so, what? Take photos",
      `Where has the water travelled? ${scope?.siteVariables?.floors || report.affectedArea ? `${report.affectedArea} sqm affected` : ""}`,
      report.microbialGrowth ? `Has water wicked up walls etc? ${report.microbialGrowth}` : "Has water wicked up walls etc?",
      "Photos of any visible damage to flooring taken?",
    ]

    damageQuestions.forEach((question) => {
      checkPageBreak(40)
      const sanitizedQuestion = sanitizeText(question)
      const lines = wrapText(sanitizedQuestion, width - 100, 10)
      lines.forEach((line) => {
        page.drawText(sanitizeText(line), {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        yPosition -= 12
      })
      yPosition -= 5
    })

    yPosition -= 20

    // AREAS AFFECTED Table (if scope data exists)
    if (scope?.siteVariables) {
      checkPageBreak(200)
      page.drawText("AREAS AFFECTED:", {
        x: 50,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: darkColor,
      })
      yPosition -= 25

      // Table header
      const areaHeaderY = yPosition
      page.drawRectangle({
        x: 50,
        y: areaHeaderY - 15,
        width: width - 100,
        height: 20,
        color: headerBlue,
      })

      const areaCols = [
        { label: "ROOMS", width: 100 },
        { label: "SIZE", width: 100 },
        { label: "FLOORING TYPE", width: 100 },
        { label: "SUB FLOOR", width: 80 },
        { label: "AGE", width: 60 },
        { label: "INSULATION", width: 80 },
        { label: "UNDERLAY", width: 70 },
        { label: "RES/NR", width: 60 },
      ]

      colX = 55
      areaCols.forEach((col) => {
        page.drawText(col.label, {
          x: colX,
          y: areaHeaderY - 5,
          size: 8,
          font: boldFont,
          color: white,
        })
        colX += col.width
      })

      yPosition -= 35

      // Extract areas from scope data - use actual data when available
      const areas = [
        {
          room: scope.siteVariables?.structure || report.propertyAddress || "Residential Property",
          size: scope.siteVariables?.floors || (report.affectedArea ? `${report.affectedArea} sqm` : "N/A"),
          flooringType: scope.siteVariables?.materials || report.structuralDamage || "N/A",
          subFloor: scope.siteVariables?.subFloor || report.structuralDamage || "N/A",
          age: scope.siteVariables?.age || (report.completionDate ? `Built ${new Date(report.completionDate).getFullYear()}` : "N/A"),
          insulation: scope.siteVariables?.insulation || report.structuralDamage || "N/A",
          underlay: scope.siteVariables?.underlay || "N/A",
          resNr: scope.siteVariables?.resNr || (report.hazardType === "Water" ? "Res" : "NR"),
        }
      ]

      areas.forEach((area) => {
        checkPageBreak(20)
        colX = 55
        const values = [
          area.room,
          area.size,
          area.flooringType,
          area.subFloor,
          area.age,
          area.insulation,
          area.underlay,
          area.resNr,
        ]

        values.forEach((value, idx) => {
          const valueText = String(value || "")
          const sanitizedValue = sanitizeText(valueText)
          const maxWidth = areaCols[idx].width - 8 // Padding to prevent overlap
          const lines = wrapText(sanitizedValue, maxWidth, 8)
          let valueY = yPosition
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) valueY -= 9 // Prevent overlap
            page.drawText(sanitizeText(lines[i]), {
              x: colX + 3, // Padding from left
              y: valueY,
              size: 8,
              font: font,
              color: darkColor,
            })
          }
          colX += areaCols[idx].width
        })

        yPosition -= 18
      })

      // Add empty rows to fill table
      for (let i = areas.length; i < 5; i++) {
        checkPageBreak(20)
        colX = 55
        areaCols.forEach(() => {
          colX += 100 // Approximate width
        })
        yPosition -= 18
      }
    }

    // RECOMMENDATIONS Section - clean and professional
    checkPageBreak(100)
    yPosition -= 20
    
    page.drawText("RECOMMENDATIONS", {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: darkColor,
    })
    yPosition -= 25

    // Generate recommendations based on data
    const recommendations: string[] = []
    
    if (report.affectedArea && report.affectedArea > 50) {
      recommendations.push("Implement comprehensive drying strategy with multiple dehumidifiers and air movers to address the extensive affected area.")
    }
    
    if (report.microbialGrowth) {
      recommendations.push("Immediate microbial remediation required to prevent further contamination and ensure occupant safety.")
    }
    
    if (report.hvacAffected) {
      recommendations.push("HVAC system requires inspection and cleaning to prevent cross-contamination.")
    }
    
    if (estimate && estimate.totalIncGST) {
      recommendations.push(`Estimated remediation cost: $${estimate.totalIncGST.toFixed(2)} including GST. This estimate is based on current market rates.`)
    }
    
    recommendations.push("Continue monitoring until dry standards per IICRC S500 guidelines are met.")
    
    if (scope?.complianceNotes) {
      recommendations.push(`Compliance: ${scope.complianceNotes}`)
    }

    // Draw recommendations with proper spacing
    recommendations.forEach((rec, index) => {
      checkPageBreak(20)
      const recText = `${index + 1}. ${rec}`
      const recLines = wrapText(recText, width - 100, 10)
      recLines.forEach((line) => {
        page.drawText(sanitizeText(line), {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: darkColor,
        })
        yPosition -= 14
      })
      yPosition -= 5 // Extra spacing between recommendations
    })

    yPosition -= 30

    // SIGNATURE SECTION - professional layout
    checkPageBreak(80)
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: width - 50, y: yPosition },
      thickness: 0.5,
      color: lightGray,
    })
    yPosition -= 25
    
    // Signature line
    page.drawText("Prepared by:", {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: darkColor,
    })
    
    // Signature line (underline for signature)
    const signatureY = yPosition - 25
    page.drawLine({
      start: { x: 50, y: signatureY },
      end: { x: 250, y: signatureY },
      thickness: 1,
      color: darkColor,
    })
    
    page.drawText(report.user?.name || "RestoreAssist", {
      x: 50,
      y: signatureY - 15,
      size: 11,
      font: boldFont,
      color: darkColor,
    })
    
    // Date
    const dateText = report.inspectionDate ? formatDate(report.inspectionDate) : formatDate(new Date())
    page.drawText(dateText, {
      x: 50,
      y: signatureY - 30,
      size: 10,
      font: font,
      color: darkColor,
    })

    // Footer - Professional Blue bar (thicker for better visibility)
    checkPageBreak(35)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: 35,
      color: headerBlue,
    })
    
    // Optional: Add page number or footer text
    const pageNumber = pdfDoc.getPageCount()
    page.drawText(`Page ${pageNumber}`, {
      x: width - 80,
      y: 12,
      size: 9,
      font: font,
      color: white,
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Return PDF as response (pdfBytes is Uint8Array which NextResponse accepts)
    return new NextResponse(pdfBytes as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="initial-assessment-report-${report.reportNumber || report.id}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    })

  } catch (error) {
    console.error("Error generating detailed report:", error)
    return NextResponse.json(
      { error: "Failed to generate detailed report" },
      { status: 500 }
    )
  }
}

// Generate comprehensive assessment report from expert perspective
function generateComprehensiveAssessment(report: any, scope: any, estimate: any, formatDate: (date: any) => string, formatTime: (date: any) => string): string {
  let assessment = "PROFESSIONAL ASSESSMENT AND RECOMMENDATIONS\n\n"
  
  // Executive Summary - concise and scannable
  assessment += "EXECUTIVE SUMMARY\n\n"
  assessment += `Property: ${report.propertyAddress || "Not specified"}\n`
  assessment += `Client: ${report.clientName || "Not specified"}\n`
  assessment += `Inspection Date: ${report.inspectionDate ? formatDate(report.inspectionDate) : "Not specified"}\n`
  assessment += `Hazard Type: ${report.hazardType || "Water"}\n`
  assessment += `Insurance: ${report.insuranceType || "Not specified"}\n`
  assessment += `Report Number: ${report.reportNumber || report.id.slice(0, 8)}\n\n`
  
  // Incident Details - bullet format
  assessment += "INCIDENT DETAILS\n\n"
  if (report.waterCategory) {
    assessment += `• Water Category: ${report.waterCategory}\n`
  }
  if (report.waterClass) {
    assessment += `• Water Class: ${report.waterClass}\n`
  }
  if (report.sourceOfWater) {
    assessment += `• Source: ${report.sourceOfWater}\n`
  }
  if (report.affectedArea) {
    assessment += `• Affected Area: ${report.affectedArea} sqm\n`
  }
  assessment += "\n"
  
  // Property Assessment - bullet format
  assessment += "PROPERTY ASSESSMENT\n\n"
  if (report.structuralDamage) {
    assessment += `• Structural Damage: ${report.structuralDamage}\n`
  }
  if (report.contentsDamage) {
    assessment += `• Contents Damage: ${report.contentsDamage}\n`
  }
  if (report.hvacAffected !== null && report.hvacAffected !== undefined) {
    assessment += `• HVAC Affected: ${report.hvacAffected ? "Yes" : "No"}\n`
  }
  if (report.electricalHazards) {
    assessment += `• Electrical Hazards: ${report.electricalHazards}\n`
  }
  if (report.microbialGrowth !== null && report.microbialGrowth !== undefined) {
    assessment += `• Microbial Growth: ${report.microbialGrowth ? "Yes" : "No"}\n`
  }
  if (report.safetyHazards) {
    assessment += `• Safety Hazards: ${report.safetyHazards}\n`
  }
  assessment += "\n"
  
  // Moisture Readings - table-like format
  if (report.moistureReadings && Array.isArray(report.moistureReadings) && report.moistureReadings.length > 0) {
    assessment += "MOISTURE READINGS\n\n"
    report.moistureReadings.forEach((reading: any, index: number) => {
      assessment += `${index + 1}. ${reading.location || reading.room || "Location " + (index + 1)}: `
      const parts: string[] = []
      if (reading.moistureContent || reading.wme) parts.push(`WME: ${reading.moistureContent || reading.wme}`)
      if (reading.relativeHumidity || reading.rh) parts.push(`RH: ${reading.relativeHumidity || reading.rh}%`)
      if (reading.temperature || reading.airTemp) parts.push(`Temp: ${reading.temperature || reading.airTemp}C`)
      assessment += parts.join(", ") + "\n"
    })
    assessment += "\n"
  }
  
  // Psychrometric Readings - concise format
  if (report.psychrometricReadings && Array.isArray(report.psychrometricReadings) && report.psychrometricReadings.length > 0) {
    assessment += "PSYCHROMETRIC READINGS\n\n"
    report.psychrometricReadings.forEach((reading: any, index: number) => {
      assessment += `${index + 1}. ${reading.location || "Location " + (index + 1)}: `
      const parts: string[] = []
      if (reading.temperature) parts.push(`Temp: ${reading.temperature}C`)
      if (reading.humidity) parts.push(`RH: ${reading.humidity}%`)
      assessment += parts.join(", ") + "\n"
    })
    assessment += "\n"
  }
  
  // Equipment & Drying Plan - bullet format
  if (report.equipmentUsed || report.dryingPlan || report.dehumidificationCapacity || report.airmoversCount) {
    assessment += "EQUIPMENT & DRYING PLAN\n\n"
    if (report.equipmentUsed) {
      assessment += `• Equipment: ${report.equipmentUsed}\n`
    }
    if (report.dryingPlan) {
      assessment += `• Drying Plan: ${report.dryingPlan}\n`
    }
    if (report.dehumidificationCapacity) {
      assessment += `• Dehumidifiers: ${report.dehumidificationCapacity}\n`
    }
    if (report.airmoversCount) {
      assessment += `• Air Movers: ${report.airmoversCount}\n`
    }
    if (report.targetHumidity) {
      assessment += `• Target Humidity: ${report.targetHumidity}%\n`
    }
    if (report.targetTemperature) {
      assessment += `• Target Temperature: ${report.targetTemperature}C\n`
    }
    if (report.estimatedDryingTime) {
      assessment += `• Estimated Drying Time: ${report.estimatedDryingTime}\n`
    }
    assessment += "\n"
  }
  
  // Scope of Work - structured format
  if (scope) {
    assessment += "SCOPE OF WORK\n\n"
    if (scope.scopeType) {
      assessment += `Type: ${scope.scopeType}\n\n`
    }
    
    if (scope.siteVariables) {
      assessment += "Site Variables:\n"
      if (scope.siteVariables.structure) {
        assessment += `• Structure: ${scope.siteVariables.structure}\n`
      }
      if (scope.siteVariables.floors) {
        assessment += `• Floors: ${scope.siteVariables.floors}\n`
      }
      if (scope.siteVariables.materials) {
        assessment += `• Materials: ${scope.siteVariables.materials}\n`
      }
      assessment += "\n"
    }
    
    if (scope.labourParameters) {
      assessment += "Labour:\n"
      if (scope.labourParameters.crewSize) {
        assessment += `• Crew Size: ${scope.labourParameters.crewSize}\n`
      }
      if (scope.labourParameters.hoursPerDay) {
        assessment += `• Hours Per Day: ${scope.labourParameters.hoursPerDay}\n`
      }
      assessment += "\n"
    }
    
    if (scope.complianceNotes) {
      assessment += "Compliance:\n"
      const notes = scope.complianceNotes.split(/[-•]/).filter((n: string) => n.trim())
      notes.forEach((note: string) => {
        if (note.trim()) {
          assessment += `• ${note.trim()}\n`
        }
      })
      assessment += "\n"
    }
    
    if (scope.assumptions) {
      assessment += "Assumptions:\n"
      const assumptions = scope.assumptions.split(/[0-9]+\./).filter((a: string) => a.trim())
      assumptions.forEach((assumption: string, idx: number) => {
        if (assumption.trim()) {
          assessment += `${idx + 1}. ${assumption.trim()}\n`
        }
      })
      assessment += "\n"
    }
  }
  
  // Cost Estimate - structured format
  if (estimate) {
    assessment += "COST ESTIMATE\n\n"
    
    if (estimate.lineItems && Array.isArray(estimate.lineItems) && estimate.lineItems.length > 0) {
      estimate.lineItems.forEach((item: any, index: number) => {
        const desc = item.description || item.code || `Item ${index + 1}`
        const qty = item.qty ? `${item.qty}${item.unit ? " " + item.unit : ""}` : ""
        const rate = item.rate ? `@ $${item.rate}` : ""
        const subtotal = item.subtotal ? `= $${item.subtotal}` : ""
        assessment += `${index + 1}. ${desc} ${qty} ${rate} ${subtotal}\n`.replace(/\s+/g, " ").trim() + "\n"
      })
      assessment += "\n"
    }
    
    // Summary totals
    const totals: string[] = []
    if (estimate.labourSubtotal) totals.push(`Labour: $${estimate.labourSubtotal.toFixed(2)}`)
    if (estimate.equipmentSubtotal) totals.push(`Equipment: $${estimate.equipmentSubtotal.toFixed(2)}`)
    if (estimate.chemicalsSubtotal) totals.push(`Chemicals: $${estimate.chemicalsSubtotal.toFixed(2)}`)
    if (estimate.subcontractorSubtotal) totals.push(`Subcontractors: $${estimate.subcontractorSubtotal.toFixed(2)}`)
    if (totals.length > 0) {
      assessment += "Subtotals:\n"
      totals.forEach(t => assessment += `• ${t}\n`)
      assessment += "\n"
    }
    
    if (estimate.overheads) assessment += `• Overheads: $${estimate.overheads.toFixed(2)}\n`
    if (estimate.profit) assessment += `• Profit: $${estimate.profit.toFixed(2)}\n`
    if (estimate.contingency) assessment += `• Contingency: $${estimate.contingency.toFixed(2)}\n`
    if (estimate.subtotalExGST) assessment += `• Subtotal Ex GST: $${estimate.subtotalExGST.toFixed(2)}\n`
    if (estimate.gst) assessment += `• GST: $${estimate.gst.toFixed(2)}\n`
    if (estimate.totalIncGST) assessment += `\nTOTAL: $${estimate.totalIncGST.toFixed(2)}\n`
    assessment += "\n"
    
    if (estimate.assumptions) {
      assessment += "Estimate Assumptions:\n"
      const assumptions = estimate.assumptions.split(/[0-9]+\./).filter((a: string) => a.trim())
      assumptions.forEach((assumption: string, idx: number) => {
        if (assumption.trim()) {
          assessment += `${idx + 1}. ${assumption.trim()}\n`
        }
      })
      assessment += "\n"
    }
    
    if (estimate.inclusions) {
      assessment += "Inclusions:\n"
      const inclusions = estimate.inclusions.split(/[-•]/).filter((i: string) => i.trim())
      inclusions.forEach((inclusion: string) => {
        if (inclusion.trim()) {
          assessment += `• ${inclusion.trim()}\n`
        }
      })
      assessment += "\n"
    }
    
    if (estimate.exclusions) {
      assessment += "Exclusions:\n"
      const exclusions = estimate.exclusions.split(/[-•]/).filter((e: string) => e.trim())
      exclusions.forEach((exclusion: string) => {
        if (exclusion.trim()) {
          assessment += `• ${exclusion.trim()}\n`
        }
      })
      assessment += "\n"
    }
    
    if (estimate.allowances) {
      assessment += `Allowances: ${estimate.allowances}\n\n`
    }
  }
  
  // Insurance Information - concise
  if (report.propertyCover || report.contentsCover) {
    assessment += "INSURANCE COVERAGE\n\n"
    if (report.propertyCover) {
      assessment += `• Property: ${typeof report.propertyCover === 'object' ? JSON.stringify(report.propertyCover) : report.propertyCover}\n`
    }
    if (report.contentsCover) {
      assessment += `• Contents: ${typeof report.contentsCover === 'object' ? JSON.stringify(report.contentsCover) : report.contentsCover}\n`
    }
    assessment += "\n"
  }
  
  // Compliance and Safety - bullet format
  if (report.safetyPlan || report.containmentSetup || report.decontaminationProcedures) {
    assessment += "COMPLIANCE & SAFETY\n\n"
    if (report.safetyPlan) assessment += `• Safety Plan: ${report.safetyPlan}\n`
    if (report.containmentSetup) assessment += `• Containment: ${report.containmentSetup}\n`
    if (report.decontaminationProcedures) assessment += `• Decontamination: ${report.decontaminationProcedures}\n`
    if (report.postRemediationVerification) assessment += `• Verification: ${report.postRemediationVerification}\n`
    assessment += "\n"
  }
  
  // Recommendations - numbered list
  assessment += "RECOMMENDATIONS\n\n"
  let recNum = 1
  if (report.microbialGrowth) {
    assessment += `${recNum}. Immediate microbial remediation required.\n`
    recNum++
  }
  if (report.affectedArea && report.affectedArea > 50) {
    assessment += `${recNum}. Comprehensive drying strategy with multiple dehumidifiers and air movers.\n`
    recNum++
  }
  if (report.hvacAffected) {
    assessment += `${recNum}. HVAC system inspection and cleaning required.\n`
    recNum++
  }
  if (estimate && estimate.totalIncGST) {
    assessment += `${recNum}. Estimated remediation cost: $${estimate.totalIncGST.toFixed(2)} including GST.\n`
    recNum++
  }
  assessment += `${recNum}. Continue monitoring until dry standards per IICRC S500 are met.\n\n`
  
  // Conclusion - concise
  assessment += "CONCLUSION\n\n"
  assessment += `This assessment complies with Australian restoration industry standards and IICRC S500 guidelines. `
  if (report.completionDate) {
    assessment += `Expected completion: ${formatDate(report.completionDate)}. `
  }
  assessment += `For questions or clarifications, please contact our office.\n\n`
  
  assessment += `${report.user?.name || "RestoreAssist"}\n`
  if (report.inspectionDate) {
    assessment += `${formatDate(report.inspectionDate)}`
  }
  
  return assessment
}
