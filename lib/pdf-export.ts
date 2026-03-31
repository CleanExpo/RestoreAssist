// Client-side PDF generation utility
// IMPORTANT: This module uses browser APIs (document, html2canvas, jsPDF).
// It must only be used in "use client" components or via dynamic import.

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export interface InspectionReportData {
  inspection: {
    inspectionNumber: string
    status: string
    propertyAddress: string
    createdAt: string
    completedAt?: string | null
    technician?: { name: string; licenceNumber?: string | null } | null
    damageCategory?: string | null
    damageClass?: string | null
    affectedAreaM2?: number | null
    notes?: string | null
  }
  areas?: Array<{
    roomName: string
    material: string
    damageCategory: string
    areaM2?: number | null
  }>
  moistureReadings?: Array<{
    readingDate: string
    location: string
    material: string
    moistureContent: number
    status?: string
  }>
  scopeItems?: Array<{
    description: string
    quantity?: number | null
    unit?: string | null
    iicrcReference?: string | null
    itemType: string
  }>
}

export async function exportInspectionPdf(data: InspectionReportData): Promise<void> {
  // 1. Create hidden div with report HTML
  const container = document.createElement('div')
  container.style.cssText = [
    'visibility:hidden',
    'position:absolute',
    'top:0',
    'left:0',
    'width:794px',
    'background:#ffffff',
    'z-index:-9999',
    'font-family:Arial,Helvetica,sans-serif',
  ].join(';')
  container.innerHTML = buildReportHtml(data)
  document.body.appendChild(container)

  try {
    // 2. Capture with html2canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    // 3. Calculate A4 dimensions in pt (jsPDF uses pt by default)
    // A4: 595.28 x 841.89 pt
    const pageWidthPt = 595.28
    const pageHeightPt = 841.89
    const imgWidthPt = pageWidthPt
    const imgHeightPt = (canvas.height * pageWidthPt) / canvas.width

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)

    // 4. Handle multi-page: slice canvas into page-height chunks
    let yOffset = 0
    while (yOffset < imgHeightPt) {
      if (yOffset > 0) doc.addPage()
      doc.addImage(imgData, 'JPEG', 0, -yOffset, imgWidthPt, imgHeightPt)
      yOffset += pageHeightPt
    }

    // 5. Save PDF with naming convention INR-{number}-report-{YYYY-MM-DD}.pdf
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `INR-${data.inspection.inspectionNumber}-report-${dateStr}.pdf`
    doc.save(filename)
  } finally {
    // 6. Always remove the hidden div
    document.body.removeChild(container)
  }
}

function buildReportHtml(data: InspectionReportData): string {
  const { inspection, areas, moistureReadings, scopeItems } = data

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

  const statusColour = (s: string): string => {
    switch (s.toUpperCase()) {
      case 'COMPLETED': return '#059669'
      case 'ESTIMATED': return '#0284c7'
      case 'SCOPED':    return '#7c3aed'
      case 'CLASSIFIED':return '#d97706'
      case 'SUBMITTED': return '#6366f1'
      case 'REJECTED':  return '#dc2626'
      default:          return '#6b7280'
    }
  }

  // ── Section helpers ────────────────────────────────────────────────────────

  const sectionHeading = (title: string): string =>
    `<div style="background:#0e7490;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:0;">${title}</div>`

  const table = (head: string[], rows: string[][]): string => {
    const thCells = head.map(h => `<th style="padding:6px 10px;text-align:left;font-size:10px;color:#374151;font-weight:700;border-bottom:1px solid #e5e7eb;background:#f9fafb;">${h}</th>`).join('')
    const bodyRows = rows.map(row => {
      const cells = row.map(c => `<td style="padding:6px 10px;font-size:10px;color:#111827;border-bottom:1px solid #f3f4f6;">${c}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><thead><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>`
  }

  // ── 1. Header ───────────────────────────────────────────────────────────────
  const header = `
<div style="background:#0e7490;color:#fff;padding:24px 32px 20px;display:flex;justify-content:space-between;align-items:flex-start;">
  <div>
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:2px;">RestoreAssist</div>
    <div style="font-size:11px;opacity:0.85;">National Inspection Report</div>
  </div>
  <div style="text-align:right;font-size:10px;opacity:0.9;line-height:1.6;">
    <div style="font-size:14px;font-weight:700;">${inspection.inspectionNumber}</div>
    <div>${fmt(inspection.createdAt)}</div>
    <div>${inspection.propertyAddress}</div>
    ${inspection.technician ? `<div>Technician: ${inspection.technician.name}${inspection.technician.licenceNumber ? ` (Lic: ${inspection.technician.licenceNumber})` : ''}</div>` : ''}
  </div>
</div>`

  // ── 2. Job Summary ──────────────────────────────────────────────────────────
  const statusBadge = `<span style="display:inline-block;background:${statusColour(inspection.status)};color:#fff;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:0.5px;">${inspection.status}</span>`

  const summaryItems: [string, string][] = [
    ['Status', statusBadge],
    ...(inspection.damageCategory ? [['IICRC Category', `Category ${inspection.damageCategory}`] as [string, string]] : []),
    ...(inspection.damageClass    ? [['IICRC Class',    `Class ${inspection.damageClass}`]    as [string, string]] : []),
    ...(inspection.affectedAreaM2 != null ? [['Affected Area', `${inspection.affectedAreaM2} m²`] as [string, string]] : []),
    ...(inspection.completedAt    ? [['Completed', fmt(inspection.completedAt)]            as [string, string]] : []),
  ]

  const summaryGrid = summaryItems.map(([label, value]) =>
    `<div style="padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;">
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-bottom:3px;">${label}</div>
      <div style="font-size:11px;color:#111827;font-weight:600;">${value}</div>
    </div>`
  ).join('')

  const jobSummaryHtml = `
${sectionHeading('Job Summary')}
<div style="padding:16px 16px 8px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
  ${summaryGrid}
</div>
${inspection.notes ? `<div style="padding:0 16px 16px;font-size:10px;color:#374151;"><strong>Notes:</strong> ${inspection.notes}</div>` : ''}`

  // ── 3. Affected Areas ───────────────────────────────────────────────────────
  let areasHtml = ''
  if (areas && areas.length > 0) {
    const rows = areas.map(a => [
      a.roomName,
      a.material,
      a.damageCategory,
      a.areaM2 != null ? `${a.areaM2} m²` : '—',
    ])
    areasHtml = `
${sectionHeading('Affected Areas')}
<div style="padding:12px 16px 4px;">
  ${table(['Room / Zone', 'Material', 'Category', 'Area (m²)'], rows)}
</div>`
  }

  // ── 4. Moisture Readings ────────────────────────────────────────────────────
  let moistureHtml = ''
  if (moistureReadings && moistureReadings.length > 0) {
    const cappedReadings = moistureReadings.slice(0, 20)
    const moistureStatusColour = (s?: string): string => {
      if (!s) return '#6b7280'
      const lower = s.toLowerCase()
      if (lower.includes('dry') || lower.includes('normal')) return '#059669'
      if (lower.includes('warn') || lower.includes('elevated')) return '#d97706'
      return '#dc2626'
    }
    const rows = cappedReadings.map(r => [
      fmt(r.readingDate),
      r.location,
      r.material,
      `${r.moistureContent}%`,
      r.status
        ? `<span style="color:${moistureStatusColour(r.status)};font-weight:600;">${r.status}</span>`
        : '—',
    ])
    moistureHtml = `
${sectionHeading('Moisture Readings' + (moistureReadings.length > 20 ? ` (showing 20 of ${moistureReadings.length})` : ''))}
<div style="padding:12px 16px 4px;">
  ${table(['Date', 'Location', 'Material', 'Moisture %', 'Status'], rows)}
</div>`
  }

  // ── 5. Scope of Works ───────────────────────────────────────────────────────
  const workItems = (scopeItems ?? []).filter(
    i => i.itemType !== 'equipment' && i.itemType !== 'dehumidifier' && i.itemType !== 'air_mover'
  )
  let scopeHtml = ''
  if (workItems.length > 0) {
    const rows = workItems.map(item => [
      item.description + (item.iicrcReference ? ` <span style="color:#0e7490;font-size:9px;">[${item.iicrcReference}]</span>` : ''),
      item.quantity != null ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` : '—',
    ])
    scopeHtml = `
${sectionHeading('Scope of Works')}
<div style="padding:12px 16px 4px;">
  ${table(['Description', 'Quantity'], rows)}
</div>`
  }

  // ── 6. Equipment Summary ────────────────────────────────────────────────────
  const equipmentItems = (scopeItems ?? []).filter(
    i => i.itemType === 'equipment' || i.itemType === 'dehumidifier' || i.itemType === 'air_mover'
  )
  let equipmentHtml = ''
  if (equipmentItems.length > 0) {
    const rows = equipmentItems.map(item => [
      item.description,
      item.itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      item.quantity != null ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` : '—',
    ])
    equipmentHtml = `
${sectionHeading('Equipment Summary')}
<div style="padding:12px 16px 4px;">
  ${table(['Equipment', 'Type', 'Quantity'], rows)}
</div>`
  }

  // ── 7. Sign-off ─────────────────────────────────────────────────────────────
  const signOffDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
  const techName = inspection.technician?.name ?? '___________________________'

  const signOffHtml = `
${sectionHeading('Technician Sign-off')}
<div style="padding:16px 16px 24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
  <div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Technician Name</div>
    <div style="font-size:12px;font-weight:600;color:#111827;border-bottom:1px solid #111827;padding-bottom:4px;">${techName}</div>
  </div>
  <div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Date</div>
    <div style="font-size:12px;font-weight:600;color:#111827;border-bottom:1px solid #111827;padding-bottom:4px;">${signOffDate}</div>
  </div>
  <div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Signature</div>
    <div style="font-size:12px;color:#111827;border-bottom:1px solid #111827;padding-bottom:4px;min-height:32px;">&nbsp;</div>
  </div>
  <div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Licence Number</div>
    <div style="font-size:12px;color:#111827;border-bottom:1px solid #111827;padding-bottom:4px;">${inspection.technician?.licenceNumber ?? '___________________________'}</div>
  </div>
</div>
<div style="padding:8px 16px 16px;font-size:8px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
  Generated by RestoreAssist &bull; ${inspection.inspectionNumber} &bull; ${signOffDate} &bull; This document is confidential and intended for the named recipient only.
</div>`

  // ── Assemble ────────────────────────────────────────────────────────────────
  return `
<div style="width:794px;background:#ffffff;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;">
  ${header}
  <div style="padding:0;">
    ${jobSummaryHtml}
    <div style="height:1px;background:#e5e7eb;margin:0 16px;"></div>
    ${areasHtml}
    ${moistureHtml}
    ${scopeHtml}
    ${equipmentHtml}
    ${signOffHtml}
  </div>
</div>`
}
