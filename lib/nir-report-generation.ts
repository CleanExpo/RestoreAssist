/**
 * NIR Report Generation
 * Generates PDF reports for NIR inspections
 */

import { jsPDF } from "jspdf"
import { generateVerificationChecklist } from "./nir-verification-checklist"

// ── Photo fetch helper ─────────────────────────────────────────────────────
// Fetches a photo URL and returns a base64 data URI string, or null on failure.

async function fetchPhotoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get("content-type") ?? "image/jpeg"
    return `data:${mime};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

// ── Main PDF generator ─────────────────────────────────────────────────────

export async function generateNIRPDF(inspection: any): Promise<Buffer> {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    })

    const pageWidth  = doc.internal.pageSize.width
    const pageHeight = doc.internal.pageSize.height
    const margin     = 20
    const contentW   = pageWidth - 2 * margin
    const lineHeight = 7
    let yPosition    = margin

    // ── Helpers ──────────────────────────────────────────────────────────

    const checkNewPage = (requiredSpace: number = lineHeight) => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        doc.addPage()
        yPosition = margin
      }
    }

    const addText = (text: string, fontSize: number = 11, isBold: boolean = false, align: "left" | "center" | "right" = "left") => {
      checkNewPage()
      doc.setFontSize(fontSize)
      doc.setFont("helvetica", isBold ? "bold" : "normal")
      const x = align === "center" ? pageWidth / 2 : align === "right" ? pageWidth - margin : margin
      const lines = doc.splitTextToSize(text, contentW)
      doc.text(lines, x, yPosition, { align })
      yPosition += lines.length * (fontSize * 0.4) + 2
    }

    const addHRule = (thickness = 0.3, color = [200, 210, 220] as [number, number, number]) => {
      doc.setDrawColor(...color)
      doc.setLineWidth(thickness)
      doc.line(margin, yPosition, pageWidth - margin, yPosition)
      yPosition += 4
    }

    const addSectionHeader = (title: string) => {
      checkNewPage(14)
      yPosition += 3
      doc.setFillColor(15, 23, 42)  // slate-900
      doc.rect(margin, yPosition, contentW, 8, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text(title.toUpperCase(), margin + 4, yPosition + 5.5)
      doc.setTextColor(0, 0, 0)
      yPosition += 12
    }

    // ── COVER PAGE ────────────────────────────────────────────────────────
    // Brand header bar
    doc.setFillColor(6, 182, 212)  // cyan-500
    doc.rect(0, 0, pageWidth, 18, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text("RestoreAssist", margin, 12)
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.text("IICRC S500:2021 Compliant Inspection Report", pageWidth - margin, 12, { align: "right" })
    doc.setTextColor(0, 0, 0)

    yPosition = 28

    // Report title
    doc.setFontSize(24)
    doc.setFont("helvetica", "bold")
    doc.text("National Inspection Report", margin, yPosition)
    yPosition += 10
    doc.setFontSize(13)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(100, 116, 139)  // slate-500
    doc.text("Water Damage Restoration — IICRC S500:2021", margin, yPosition)
    doc.setTextColor(0, 0, 0)
    yPosition += 8
    addHRule(0.5, [6, 182, 212])  // cyan rule

    // Report metadata table
    const metaRows = [
      ["Inspection Number",  inspection.inspectionNumber ?? "—"],
      ["Property Address",   inspection.propertyAddress ?? "—"],
      ["Postcode",           inspection.propertyPostcode ?? "—"],
      ["Inspection Date",    new Date(inspection.inspectionDate ?? inspection.createdAt ?? Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })],
      ["Technician",         inspection.technicianName ?? "Not recorded"],
      ["Status",             inspection.status ?? "DRAFT"],
      ["Report Generated",   new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })],
    ]

    metaRows.forEach(([label, value]) => {
      checkNewPage(8)
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text(label + ":", margin, yPosition)
      doc.setFont("helvetica", "normal")
      doc.text(value, margin + 52, yPosition)
      yPosition += 7
    })
    yPosition += 6

    // Company info footer on cover page
    const companyName = (inspection as any).user?.name ?? inspection.technicianName ?? "RestoreAssist Technician"
    const abn = (inspection as any).user?.abn ?? ""
    checkNewPage(18)
    doc.setFillColor(248, 250, 252)  // slate-50
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, yPosition, contentW, abn ? 18 : 12, 2, 2, "FD")
    yPosition += 5
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text(companyName, margin + 4, yPosition)
    if (abn) {
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text(`ABN: ${abn}`, margin + 4, yPosition + 6)
      yPosition += 6
    }
    doc.setTextColor(0, 0, 0)
    yPosition += 10

    // Start new page for report body
    doc.addPage()
    yPosition = margin
    
    // Property Information
    addSectionHeader("Property Information")
    addText(`Address: ${inspection.propertyAddress}`, 11)
    addText(`Postcode: ${inspection.propertyPostcode}`, 11)
    addText(`Inspection Date: ${new Date(inspection.inspectionDate ?? inspection.createdAt ?? Date.now()).toLocaleDateString("en-AU")}`, 11)
    if (inspection.technicianName) addText(`Technician: ${inspection.technicianName}`, 11)
    yPosition += 5
    
    // Environmental Data
    if (inspection.environmentalData) {
      addSectionHeader("Environmental Data")
      // Australian standard units: °C not °F
      addText(`Dry Bulb Temperature: ${inspection.environmentalData.ambientTemperature}°C`, 11)
      addText(`Relative Humidity: ${inspection.environmentalData.humidityLevel}%`, 11)
      if (inspection.environmentalData.dewPoint) {
        addText(`Dew Point: ${inspection.environmentalData.dewPoint}°C`, 11)
      }
      if (inspection.environmentalData.gpp) {
        addText(`Grains Per Pound (GPP): ${inspection.environmentalData.gpp}`, 11)
      }
      addText(`Air Circulation Active: ${inspection.environmentalData.airCirculation ? "Yes" : "No"}`, 11)
      yPosition += 5
    }
    
    // Classification
    if (inspection.classifications && inspection.classifications.length > 0) {
      const classification = inspection.classifications[0]
      addSectionHeader("IICRC S500 Classification")
      addText(`Category: ${classification.category}`, 11)
      addText(`Class: ${classification.class}`, 11)
      yPosition += 2
      addText("Justification:", 10, true)
      addText(classification.justification, 9)
      addText(`Standard Reference: ${classification.standardReference}`, 9)
      yPosition += 5
    }
    
    // Moisture Readings
    if (inspection.moistureReadings && inspection.moistureReadings.length > 0) {
      addSectionHeader("Moisture Reading Log")
      // Table header
      const colW = [50, 38, 22, 22, 30, 28]
      const colX = colW.reduce((acc: number[], w, i) => { acc.push((i === 0 ? margin : acc[i - 1] + colW[i - 1])); return acc }, [] as number[])
      const headers = ["Location", "Material", "Reading", "Depth", "Recorded", "Status"]
      checkNewPage(8)
      doc.setFillColor(226, 232, 240)
      doc.rect(margin, yPosition - 2, contentW, 7, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      headers.forEach((h, i) => doc.text(h, colX[i] + 1, yPosition + 3))
      yPosition += 8
      addHRule(0.2)
      doc.setFont("helvetica", "normal")
      inspection.moistureReadings.forEach((r: any, idx: number) => {
        checkNewPage(7)
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(margin, yPosition - 2, contentW, 6.5, "F")
        }
        const status = r.moistureLevel <= 19 ? "Dry" : r.moistureLevel <= 25 ? "Drying" : "Wet"
        const statusColor = status === "Dry" ? [16, 185, 129] : status === "Drying" ? [245, 158, 11] : [239, 68, 68]
        const row = [
          (r.location ?? "—").substring(0, 22),
          (r.surfaceType ?? "—").substring(0, 18),
          `${r.moistureLevel}%`,
          r.depth ?? "—",
          r.recordedAt ? new Date(r.recordedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" }) : "—",
          status,
        ]
        doc.setFontSize(8)
        row.forEach((cell, i) => {
          if (i === 5) {
            doc.setTextColor(...statusColor as [number, number, number])
            doc.setFont("helvetica", "bold")
          } else {
            doc.setTextColor(0, 0, 0)
            doc.setFont("helvetica", "normal")
          }
          doc.text(cell, colX[i] + 1, yPosition + 2.5)
        })
        doc.setTextColor(0, 0, 0)
        yPosition += 6.5
      })
      yPosition += 5
    }

    // Affected Areas
    if (inspection.affectedAreas && inspection.affectedAreas.length > 0) {
      addSectionHeader("Affected Areas")
      inspection.affectedAreas.forEach((area: any, index: number) => {
        addText(`${index + 1}. ${area.roomZoneId}: ${area.affectedSquareFootage} sq ft`, 10)
        addText(`   Water Source: ${area.waterSource}`, 10)
        if (area.category && area.class) {
          addText(`   Classification: Category ${area.category}, Class ${area.class}`, 10)
        }
        yPosition += 2
      })
      yPosition += 3
    }
    
    // Equipment Items (V2: autoDetermined=true — IICRC S500 ratio-calculated)
    const equipmentItems = (inspection.scopeItems ?? []).filter((item: any) => item.autoDetermined)
    if (equipmentItems.length > 0) {
      addSectionHeader("Drying Equipment — IICRC S500:2021")
      addText("All quantities calculated from measured affected area per IICRC S500:2021 §9.3–9.5.", 8)
      yPosition += 3
      equipmentItems.forEach((item: any) => {
        addText(`• ${item.quantity ?? ""}× ${item.description.split(" — ")[0]}`, 10, true)
        if (item.specification) {
          addText(`   ${item.specification}`, 9)
        }
        addText(`   ${item.justification}`, 9)
        yPosition += 1
      })
      yPosition += 4
    }

    // Scope Narrative (V2: autoDetermined=false — AI-generated 7-section format)
    const narrativeItems = (inspection.scopeItems ?? []).filter((item: any) => !item.autoDetermined)
    if (narrativeItems.length > 0) {
      addSectionHeader("Scope of Works")
      addText("Generated per IICRC S500:2021 — 7-section standard format.", 8)
      yPosition += 3
      narrativeItems.forEach((item: any, index: number) => {
        addText(`${index + 1}. ${item.description}`, 10, true)
        if (item.justification && item.justification !== "AI-generated per IICRC S500:2021") {
          addText(`   Ref: ${item.justification}`, 9)
        }
        yPosition += 2
      })
      yPosition += 3
    } else if (equipmentItems.length === 0 && inspection.scopeItems?.length > 0) {
      // Legacy: show all scope items without V2 separation
      addSectionHeader("Scope of Works")
      inspection.scopeItems.forEach((item: any, index: number) => {
        addText(`${index + 1}. ${item.description}`, 10)
        if (item.quantity && item.unit) {
          addText(`   Quantity: ${item.quantity} ${item.unit}`, 10)
        }
        if (item.justification) {
          addText(`   Justification: ${item.justification}`, 9)
        }
        yPosition += 2
      })
      yPosition += 3
    }

    // Drying Goal Certificate (V2: IICRC S500:2021 §11.4)
    if (inspection.dryingGoalRecord) {
      const dg = inspection.dryingGoalRecord
      if (dg.goalAchieved) {
        checkNewPage(30)
        addText("Drying Validation Certificate", 16, true)
        yPosition += 2
        // Certificate box — draw a light border via text rules
        doc.setDrawColor(0, 120, 60) // green border
        doc.setLineWidth(0.5)
        doc.rect(margin, yPosition, doc.internal.pageSize.width - 2 * margin, 22)
        yPosition += 5
        doc.setTextColor(0, 120, 60)
        addText("✓  DRYING GOAL: ACHIEVED", 13, true, "center")
        doc.setTextColor(0, 0, 0)
        addText(
          `All materials at or below IICRC S500:2021 §11.4 target EMC.`,
          9, false, "center"
        )
        addText(
          `${dg.totalDryingDays} day(s) drying — Achieved: ${new Date(dg.goalAchievedAt).toLocaleDateString("en-AU")}` +
          (dg.signedOffBy ? ` — Signed off by: ${dg.signedOffBy}` : ""),
          9, false, "center"
        )
        yPosition += 5
        addText(`IICRC Reference: ${dg.iicrcReference}`, 8, false, "center")
        yPosition += 8
      } else {
        addText("Drying Validation", 16, true)
        addText(`Status: IN PROGRESS — ${dg.iicrcReference}`, 10)
        addText("Not all moisture readings are at or below target EMC.", 9)
        yPosition += 4
      }
    }
    
    // Cost Estimate — formatted table
    if (inspection.costEstimates && inspection.costEstimates.length > 0) {
      addSectionHeader("Cost Summary")

      // Table header
      const costColW  = [72, 18, 18, 24, 26, 32]
      const costColX  = costColW.reduce((acc: number[], w, i) => { acc.push((i === 0 ? margin : acc[i - 1] + costColW[i - 1])); return acc }, [] as number[])
      const costHdrs  = ["Description", "Qty", "Unit", "Rate (AUD)", "Sub (AUD)", "Total (AUD)"]
      checkNewPage(10)
      doc.setFillColor(15, 23, 42)
      doc.rect(margin, yPosition - 2, contentW, 8, "F")
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(255, 255, 255)
      costHdrs.forEach((h, i) => {
        doc.text(h, costColX[i] + 1, yPosition + 3.5, { align: i > 0 ? "left" : "left" })
      })
      doc.setTextColor(0, 0, 0)
      yPosition += 10

      let subtotal = 0, contingencyTotal = 0, totalAll = 0
      inspection.costEstimates.forEach((item: any, idx: number) => {
        checkNewPage(8)
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252)
          doc.rect(margin, yPosition - 2, contentW, 7, "F")
        }
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        const desc = (item.description ?? "—").substring(0, 38)
        const qty  = String(item.quantity ?? "—")
        const unit = (item.unit ?? "—").substring(0, 6)
        const rate = `$${(item.rate ?? 0).toFixed(2)}`
        const sub  = `$${(item.subtotal ?? 0).toFixed(2)}`
        const tot  = `$${(item.total ?? item.subtotal ?? 0).toFixed(2)}`
        ;[desc, qty, unit, rate, sub, tot].forEach((cell, i) => {
          doc.text(cell, costColX[i] + 1, yPosition + 2.5)
        })
        yPosition += 7
        subtotal += item.subtotal ?? 0
        contingencyTotal += item.contingency ?? 0
        totalAll += item.total ?? item.subtotal ?? 0
      })

      // Totals row
      yPosition += 2
      addHRule(0.3)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.text("Subtotal:", pageWidth - margin - 60, yPosition)
      doc.text(`$${subtotal.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: "right" })
      yPosition += 6
      if (contingencyTotal > 0) {
        doc.text("Contingency:", pageWidth - margin - 60, yPosition)
        doc.text(`$${contingencyTotal.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: "right" })
        yPosition += 6
      }
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text("TOTAL (AUD):", pageWidth - margin - 60, yPosition)
      doc.text(`$${totalAll.toFixed(2)}`, pageWidth - margin - 2, yPosition, { align: "right" })
      doc.setFont("helvetica", "normal")
      yPosition += 8
    }

    // ── Photo Appendix ────────────────────────────────────────────────────
    const photos = (inspection.photos ?? []).filter((p: any) => p?.url || p?.photoUrl)
    if (photos.length > 0) {
      doc.addPage()
      yPosition = margin
      addSectionHeader("Photo Documentation")
      addText("All photos captured during field inspection. Timestamps and locations as recorded by technician.", 8)
      yPosition += 4

      const photoColWidth = (contentW - 6) / 2
      const photoHeight   = 60
      let col = 0

      for (const photo of photos.slice(0, 12)) {
        const photoUrl = photo.url ?? photo.photoUrl
        if (!photoUrl) continue

        // Try to fetch and embed
        const b64 = await fetchPhotoBase64(photoUrl)

        checkNewPage(photoHeight + 18)
        const x = margin + col * (photoColWidth + 6)

        if (b64) {
          try {
            doc.addImage(b64, "JPEG", x, yPosition, photoColWidth, photoHeight, undefined, "FAST")
          } catch {
            // If image add fails, draw placeholder
            doc.setFillColor(241, 245, 249)
            doc.setDrawColor(203, 213, 225)
            doc.rect(x, yPosition, photoColWidth, photoHeight, "FD")
            doc.setFontSize(8)
            doc.setTextColor(148, 163, 184)
            doc.text("Photo unavailable", x + photoColWidth / 2, yPosition + photoHeight / 2, { align: "center" })
            doc.setTextColor(0, 0, 0)
          }
        } else {
          // Placeholder
          doc.setFillColor(241, 245, 249)
          doc.setDrawColor(203, 213, 225)
          doc.rect(x, yPosition, photoColWidth, photoHeight, "FD")
          doc.setFontSize(8)
          doc.setTextColor(148, 163, 184)
          doc.text("Photo unavailable", x + photoColWidth / 2, yPosition + photoHeight / 2, { align: "center" })
          doc.setTextColor(0, 0, 0)
        }

        // Caption below photo
        doc.setFontSize(8)
        doc.setFont("helvetica", "normal")
        const caption = photo.caption ?? photo.notes ?? "Inspection photo"
        const ts = photo.createdAt ? new Date(photo.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : ""
        const captionText = doc.splitTextToSize(`${caption}${ts ? " · " + ts : ""}`, photoColWidth)
        doc.text(captionText, x, yPosition + photoHeight + 4)

        col++
        if (col >= 2) {
          col = 0
          yPosition += photoHeight + 18
        }
      }

      if (col === 1) yPosition += photoHeight + 18
      yPosition += 6
    }
    
    // Verification Checklist
    yPosition += 5
    addSectionHeader("Verification Checklist")
    addText("For Insurance Adjuster / Client Review", 10, false, "center")
    yPosition += 3
    addText("This checklist is auto-generated for verification purposes only.", 8, false, "center")
    addText("It is not for the technician to complete.", 8, false, "center")
    yPosition += 5
    
    const checklist = generateVerificationChecklist(inspection)
    checklist.items.forEach((checklistItem, index) => {
      const checkmark = checklistItem.verified ? "✓" : "□"
      addText(`${checkmark} ${checklistItem.item}`, 10)
      if (checklistItem.notes) {
        addText(`   ${checklistItem.notes}`, 8)
      }
      yPosition += 1
    })
    
    yPosition += 5
    
    // Signature Block
    checkNewPage(20)
    addSectionHeader("Technician Sign-Off")
    yPosition += 5
    addText("Technician:", 11, true)
    addText("_________________________", 11)
    if (inspection.technicianName) {
      addText(inspection.technicianName, 10)
    }
    addText(`Date: ${new Date(inspection.inspectionDate || new Date()).toLocaleDateString()}`, 10)
    yPosition += 5
    addText("Reviewer:", 11, true)
    addText("_________________________", 11)
    addText(`Date: ${new Date().toLocaleDateString()}`, 10)
    
    // Footer
    checkNewPage(15)
    addText(`Report generated on ${new Date().toLocaleString()}`, 8, false, "center")
    addText("This report was generated automatically based on IICRC S500 standards and Australian building codes.", 8, false, "center")
    
    // Generate PDF buffer
    const pdfBlob = doc.output("blob")
    return Buffer.from(await pdfBlob.arrayBuffer())
  } catch (error) {
    console.error("Error generating PDF:", error)
    throw error
  }
}

