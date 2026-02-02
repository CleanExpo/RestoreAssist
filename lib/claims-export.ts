/**
 * Claims Analysis Export — CSV and PDF download
 */

import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

interface ExportIssue {
  category: string
  elementName: string
  description: string
  severity: string
  standardReference?: string
  isBillable?: boolean
  estimatedCost?: number
  estimatedHours?: number
  suggestedLineItem?: string
}

interface ExportResult {
  fileName: string
  fileId: string
  issues: ExportIssue[]
  missingElements: Record<string, number>
  scores: Record<string, number>
  estimatedMissingRevenue?: number
}

interface ExportSummary {
  totalFiles: number
  totalIssues: number
  totalEstimatedMissingRevenue: number
  averageScores: Record<string, number>
  topIssues?: Array<{
    elementName: string
    severity: string
    count: number
    totalCost: number
  }>
}

/**
 * Export analysis results as CSV and trigger download
 */
export function exportClaimsCSV(results: ExportResult[], summary: ExportSummary) {
  const headers = [
    'File',
    'Category',
    'Severity',
    'Element',
    'Description',
    'Standard Reference',
    'Billable',
    'Estimated Cost',
    'Estimated Hours',
    'Suggested Line Item',
  ]

  const rows: string[][] = []

  // Summary rows
  rows.push(['=== CLAIMS ANALYSIS SUMMARY ===', '', '', '', '', '', '', '', '', ''])
  rows.push(['Total Files', String(summary.totalFiles), '', '', '', '', '', '', '', ''])
  rows.push(['Total Issues', String(summary.totalIssues), '', '', '', '', '', '', '', ''])
  rows.push([
    'Total Missing Revenue',
    '',
    '',
    '',
    '',
    '',
    '',
    `$${summary.totalEstimatedMissingRevenue.toFixed(2)}`,
    '',
    '',
  ])
  if (summary.averageScores) {
    Object.entries(summary.averageScores).forEach(([key, value]) => {
      rows.push([`Avg ${key}`, `${(value as number).toFixed(1)}%`, '', '', '', '', '', '', '', ''])
    })
  }
  rows.push(['', '', '', '', '', '', '', '', '', ''])
  rows.push(['=== DETAILED RESULTS ===', '', '', '', '', '', '', '', '', ''])
  rows.push(headers)

  // Data rows
  for (const result of results) {
    for (const issue of result.issues) {
      rows.push([
        result.fileName,
        issue.category.replace(/_/g, ' '),
        issue.severity,
        issue.elementName,
        (issue.description || '').replace(/"/g, '""'),
        issue.standardReference || '',
        issue.isBillable ? 'Yes' : 'No',
        issue.estimatedCost ? `$${issue.estimatedCost.toFixed(2)}` : '',
        issue.estimatedHours ? `${issue.estimatedHours.toFixed(1)}` : '',
        issue.suggestedLineItem || '',
      ])
    }
  }

  const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `claims-analysis-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Build the claims report HTML (shared by PDF and print)
 */
function buildClaimsReportHTML(
  results: ExportResult[],
  summary: ExportSummary,
  folderName?: string
): string {
  return `
    <style>
      @media print {
        body > *:not(#claims-print-container) { display: none !important; }
        #claims-print-container { display: block !important; }
      }
      #claims-print-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 40px;
        max-width: 900px;
        margin: 0 auto;
        color: #111;
        font-size: 12px;
        line-height: 1.5;
      }
      #claims-print-container h1 { font-size: 24px; margin-bottom: 4px; }
      #claims-print-container h2 { font-size: 18px; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
      #claims-print-container h3 { font-size: 14px; margin-top: 16px; margin-bottom: 4px; }
      #claims-print-container table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      #claims-print-container th, #claims-print-container td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      #claims-print-container th { background: #f5f5f5; font-weight: 600; }
      #claims-print-container .severity-critical { color: #dc2626; font-weight: 600; }
      #claims-print-container .severity-high { color: #ea580c; font-weight: 600; }
      #claims-print-container .severity-medium { color: #ca8a04; }
      #claims-print-container .severity-low { color: #2563eb; }
      #claims-print-container .metric { display: inline-block; margin-right: 24px; }
      #claims-print-container .metric-value { font-size: 20px; font-weight: 700; }
      #claims-print-container .metric-label { font-size: 11px; color: #666; }
      #claims-print-container .page-break { page-break-before: always; }
    </style>

    <h1>Claims Analysis Report</h1>
    <p style="color: #666; margin-bottom: 16px;">
      Generated: ${new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}
      ${folderName ? ` | Folder: ${folderName}` : ''}
    </p>

    <h2>Executive Summary</h2>
    <div style="margin: 12px 0;">
      <span class="metric">
        <span class="metric-value">${summary.totalFiles}</span>
        <br /><span class="metric-label">Documents</span>
      </span>
      <span class="metric">
        <span class="metric-value">${summary.totalIssues}</span>
        <br /><span class="metric-label">Issues Found</span>
      </span>
      <span class="metric">
        <span class="metric-value">$${summary.totalEstimatedMissingRevenue.toFixed(2)}</span>
        <br /><span class="metric-label">Revenue Recovery</span>
      </span>
    </div>

    ${summary.averageScores ? `
    <table>
      <tr>
        ${Object.entries(summary.averageScores).map(([k, v]) => `<th>${k.replace(/([A-Z])/g, ' $1').trim()}</th>`).join('')}
      </tr>
      <tr>
        ${Object.entries(summary.averageScores).map(([, v]) => `<td>${(v as number).toFixed(1)}%</td>`).join('')}
      </tr>
    </table>
    ` : ''}

    ${summary.topIssues && summary.topIssues.length > 0 ? `
    <h2>Top Issues</h2>
    <table>
      <tr><th>Element</th><th>Severity</th><th>Count</th><th>Total Cost</th></tr>
      ${summary.topIssues.slice(0, 10).map(i => `
        <tr>
          <td>${i.elementName}</td>
          <td class="severity-${i.severity.toLowerCase()}">${i.severity}</td>
          <td>${i.count}</td>
          <td>$${i.totalCost.toFixed(2)}</td>
        </tr>
      `).join('')}
    </table>
    ` : ''}

    ${results.map((r, idx) => `
    <div class="${idx > 0 ? 'page-break' : ''}">
      <h2>${r.fileName}</h2>
      <p>Issues: ${r.issues.length} | Revenue: $${(r.estimatedMissingRevenue || 0).toFixed(2)}</p>
      ${r.issues.length > 0 ? `
      <table>
        <tr><th>Severity</th><th>Element</th><th>Standard</th><th>Cost</th></tr>
        ${r.issues.map(i => `
          <tr>
            <td class="severity-${i.severity.toLowerCase()}">${i.severity}</td>
            <td>${i.elementName}</td>
            <td>${i.standardReference || '-'}</td>
            <td>${i.estimatedCost ? '$' + i.estimatedCost.toFixed(2) : '-'}</td>
          </tr>
        `).join('')}
      </table>
      ` : '<p>No issues found.</p>'}
    </div>
    `).join('')}
  `
}

/**
 * Generate PDF and trigger download (no print dialog)
 */
export async function exportClaimsPDF(
  results: ExportResult[],
  summary: ExportSummary,
  folderName?: string
): Promise<void> {
  const container = document.createElement('div')
  container.id = 'claims-print-container'
  container.innerHTML = buildClaimsReportHTML(results, summary, folderName)
  container.setAttribute(
    'style',
    'position:fixed;left:-9999px;top:0;width:900px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:40px;color:#111;font-size:12px;line-height:1.5;background:#fff;'
  )
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })
    const imgData = canvas.toDataURL('image/png')
    const pageW = 210
    const margin = 10
    const contentW = pageW - margin * 2
    const imgW = contentW
    const imgH = (canvas.height * contentW) / canvas.width
    const pageH = 297
    const contentH = pageH - margin * 2
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const scalePxPerMm = canvas.width / contentW
    const sliceHeightPx = contentH * scalePxPerMm
    const totalPages = Math.ceil(canvas.height / sliceHeightPx) || 1
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage()
      const sourceY = i * sliceHeightPx
      const sourceH = Math.min(sliceHeightPx, canvas.height - sourceY)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sourceH
      const ctx = sliceCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH)
        const sliceData = sliceCanvas.toDataURL('image/png')
        const sliceHMm = sourceH / scalePxPerMm
        pdf.addImage(sliceData, 'PNG', margin, margin, imgW, sliceHMm, undefined, 'FAST')
      }
    }
    const filename = `claims-analysis-${new Date().toISOString().split('T')[0]}.pdf`
    pdf.save(filename)
  } finally {
    const el = document.getElementById('claims-print-container')
    if (el) document.body.removeChild(el)
  }
}
