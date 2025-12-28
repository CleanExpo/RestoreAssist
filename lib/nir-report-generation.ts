/**
 * NIR Report Generation
 * Generates PDF reports for NIR inspections
 */

import { jsPDF } from "jspdf"
import { generateVerificationChecklist } from "./nir-verification-checklist"

export async function generateNIRPDF(inspection: any): Promise<Buffer> {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    })
    
    let yPosition = 20
    const pageHeight = doc.internal.pageSize.height
    const margin = 20
    const lineHeight = 7
    
    // Helper to add new page if needed
    const checkNewPage = (requiredSpace: number = lineHeight) => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        doc.addPage()
        yPosition = margin
      }
    }
    
    // Helper to add text with word wrap
    const addText = (text: string, fontSize: number = 11, isBold: boolean = false, align: "left" | "center" | "right" = "left") => {
      checkNewPage()
      doc.setFontSize(fontSize)
      doc.setFont(undefined, isBold ? "bold" : "normal")
      const lines = doc.splitTextToSize(text, doc.internal.pageSize.width - 2 * margin)
      doc.text(lines, margin, yPosition, { align })
      yPosition += lines.length * (fontSize * 0.4) + 2
    }
      
    // Header
    addText("National Inspection Report (NIR)", 20, true, "center")
    yPosition += 5
    addText(`Inspection Number: ${inspection.inspectionNumber}`, 12, false, "center")
    yPosition += 10
    
    // Property Information
    addText("Property Information", 16, true)
    addText(`Address: ${inspection.propertyAddress}`, 11)
    addText(`Postcode: ${inspection.propertyPostcode}`, 11)
    addText(`Inspection Date: ${new Date(inspection.inspectionDate).toLocaleDateString()}`, 11)
    if (inspection.technicianName) {
      addText(`Technician: ${inspection.technicianName}`, 11)
    }
    yPosition += 5
    
    // Environmental Data
    if (inspection.environmentalData) {
      addText("Environmental Data", 16, true)
      addText(`Ambient Temperature: ${inspection.environmentalData.ambientTemperature}°F`, 11)
      addText(`Humidity Level: ${inspection.environmentalData.humidityLevel}%`, 11)
      if (inspection.environmentalData.dewPoint) {
        addText(`Dew Point: ${inspection.environmentalData.dewPoint}°F`, 11)
      }
      addText(`Air Circulation: ${inspection.environmentalData.airCirculation ? "Yes" : "No"}`, 11)
      yPosition += 5
    }
    
    // Classification
    if (inspection.classifications && inspection.classifications.length > 0) {
      const classification = inspection.classifications[0]
      addText("IICRC Classification", 16, true)
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
      addText("Moisture Readings", 16, true)
      inspection.moistureReadings.forEach((reading: any, index: number) => {
        addText(`${index + 1}. ${reading.location} - ${reading.surfaceType}: ${reading.moistureLevel}% (${reading.depth})`, 10)
      })
      yPosition += 5
    }
    
    // Affected Areas
    if (inspection.affectedAreas && inspection.affectedAreas.length > 0) {
      addText("Affected Areas", 16, true)
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
    
    // Scope Items
    if (inspection.scopeItems && inspection.scopeItems.length > 0) {
      addText("Scope of Works", 16, true)
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
    
    // Cost Estimate
    if (inspection.costEstimates && inspection.costEstimates.length > 0) {
      addText("Cost Estimate", 16, true)
      const subtotal = inspection.costEstimates.reduce((sum: number, item: any) => sum + item.subtotal, 0)
      const contingency = inspection.costEstimates.reduce((sum: number, item: any) => sum + (item.contingency || 0), 0)
      const total = inspection.costEstimates.reduce((sum: number, item: any) => sum + item.total, 0)
      
      inspection.costEstimates.forEach((item: any) => {
        addText(`${item.description}: ${item.quantity} ${item.unit} @ $${item.rate.toFixed(2)} = $${item.subtotal.toFixed(2)}`, 10)
      })
      
      yPosition += 3
      addText(`Subtotal: $${subtotal.toFixed(2)}`, 11)
      addText(`Contingency: $${contingency.toFixed(2)}`, 11)
      addText(`Total: $${total.toFixed(2)}`, 12, true)
      yPosition += 5
    }
    
    // Verification Checklist
    yPosition += 5
    addText("Verification Checklist", 16, true)
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
    addText("Signatures", 16, true)
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

