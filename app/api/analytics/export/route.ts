import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"
import jsPDF from "jspdf"

interface ExportRequest {
  format: "csv" | "excel" | "pdf"
  dateRange: {
    from: string
    to: string
  }
  includeCharts?: boolean
}

// Helper to format currency
function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Helper to format date
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: ExportRequest = await request.json()
    const { format, dateRange, includeCharts = false } = body

    // Parse dates
    const fromDate = new Date(dateRange.from)
    const toDate = new Date(dateRange.to)
    toDate.setHours(23, 59, 59, 999)

    // Fetch reports for the date range
    const reports = await prisma.report.findMany({
      where: {
        userId: session.user.id,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true,
          },
        },
        client: {
          select: {
            name: true,
            company: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Transform data for export
    const exportData = reports.map((report) => ({
      "Report ID": report.id,
      "Created Date": formatDate(report.createdAt),
      Title: report.title,
      Client: report.client?.name || report.clientName,
      "Hazard Type": report.hazardType || "-",
      "Insurance Type": report.insuranceType || "-",
      Status: report.status,
      Revenue: formatCurrency(
        report.estimates?.[0]?.totalIncGST || report.totalCost || 0
      ),
    }))

    if (format === "csv") {
      return handleCSVExport(exportData)
    } else if (format === "excel") {
      return await handleExcelExport(exportData, reports, fromDate, toDate)
    } else if (format === "pdf") {
      return handlePDFExport(exportData, reports, fromDate, toDate)
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 })
  } catch (error) {
    console.error("Error exporting analytics:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function handleCSVExport(
  data: Array<Record<string, string>>
): NextResponse {
  if (data.length === 0) {
    return NextResponse.json({ error: "No data to export" }, { status: 400 })
  }

  // Get headers from first row
  const headers = Object.keys(data[0])

  // Build CSV
  let csv = headers.join(",") + "\n"
  csv += data
    .map((row) =>
      headers
        .map((header) => {
          const value = row[header]
          // Escape quotes and wrap in quotes if contains comma
          if (value.includes(",") || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(",")
    )
    .join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=analytics-export.csv",
    },
  })
}

async function handleExcelExport(
  data: Array<Record<string, string>>,
  reports: any[],
  fromDate: Date,
  toDate: Date
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook()

  // Summary sheet
  const summarySheet = workbook.addWorksheet("Summary")
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 20 },
  ]

  const totalRevenue = reports.reduce(
    (sum, r) => sum + (r.estimates?.[0]?.totalIncGST || r.totalCost || 0),
    0
  )

  summarySheet.addRows([
    { metric: "Report Period", value: `${formatDate(fromDate)} to ${formatDate(toDate)}` },
    { metric: "Total Reports", value: reports.length },
    { metric: "Total Revenue", value: formatCurrency(totalRevenue) },
    {
      metric: "Average Report Value",
      value: formatCurrency(reports.length > 0 ? totalRevenue / reports.length : 0),
    },
  ])

  // Data sheet
  const dataSheet = workbook.addWorksheet("Reports")
  dataSheet.columns = Object.keys(data[0] || {}).map((key) => ({
    header: key,
    key,
    width: 18,
  }))

  if (data.length > 0) {
    dataSheet.addRows(data)

    // Format header row
    dataSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
    dataSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0066CC" },
    }
  }

  // Hazard distribution sheet
  const hazardSheet = workbook.addWorksheet("Hazard Analysis")
  const hazardCounts = new Map<string, number>()
  reports.forEach((r) => {
    const hazard = r.hazardType || "Other"
    hazardCounts.set(hazard, (hazardCounts.get(hazard) || 0) + 1)
  })

  hazardSheet.columns = [
    { header: "Hazard Type", key: "type", width: 20 },
    { header: "Count", key: "count", width: 12 },
    { header: "Percentage", key: "percentage", width: 15 },
  ]

  const total = reports.length
  const hazardRows = Array.from(hazardCounts.entries()).map(([type, count]) => ({
    type,
    count,
    percentage: `${((count / total) * 100).toFixed(1)}%`,
  }))

  hazardSheet.addRows(hazardRows)
  hazardSheet.getRow(1).font = { bold: true }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=analytics-export.xlsx",
    },
  })
}

function handlePDFExport(
  data: Array<Record<string, string>>,
  reports: any[],
  fromDate: Date,
  toDate: Date
): NextResponse {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPosition = 20

  // Title
  doc.setFontSize(20)
  doc.text("Analytics Report", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 15

  // Date range
  doc.setFontSize(11)
  doc.text(
    `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  )
  yPosition += 15

  // Summary metrics
  doc.setFontSize(12)
  doc.text("Summary Metrics", 20, yPosition)
  yPosition += 8

  const totalRevenue = reports.reduce(
    (sum, r) => sum + (r.estimates?.[0]?.totalIncGST || r.totalCost || 0),
    0
  )

  const summaryText = [
    `Total Reports: ${reports.length}`,
    `Total Revenue: ${formatCurrency(totalRevenue)}`,
    `Average Value: ${formatCurrency(reports.length > 0 ? totalRevenue / reports.length : 0)}`,
  ]

  doc.setFontSize(10)
  summaryText.forEach((text) => {
    doc.text(text, 30, yPosition)
    yPosition += 8
  })

  yPosition += 10

  // Reports table
  if (data.length > 0) {
    doc.setFontSize(12)
    doc.text("Detailed Reports", 20, yPosition)
    yPosition += 10

    const headers = Object.keys(data[0])
    const rows = data.slice(0, 20).map((row) =>
      headers.map((h) => {
        const value = row[h]
        return value.length > 20 ? value.substring(0, 20) + "..." : value
      })
    )

    // Simple table (using text positioning since jsPDF table is complex)
    doc.setFontSize(9)
    const colWidths = Array(headers.length).fill(
      (pageWidth - 40) / headers.length
    )

    headers.forEach((h, i) => {
      doc.text(h.substring(0, 15), 20 + i * colWidths[i], yPosition)
    })

    yPosition += 6

    rows.forEach((row) => {
      if (yPosition > pageHeight - 20) {
        doc.addPage()
        yPosition = 20
      }

      row.forEach((cell, i) => {
        doc.text(cell, 20 + i * colWidths[i], yPosition)
      })

      yPosition += 6
    })

    if (data.length > 20) {
      yPosition += 5
      doc.text(
        `... and ${data.length - 20} more reports`,
        20,
        yPosition
      )
    }
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"))

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=analytics-export.pdf",
    },
  })
}
