import ExcelJS from 'exceljs'

export async function exportToExcel(reports: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Reports')

  // Add headers
  worksheet.columns = [
    { header: 'Report Number', key: 'reportNumber', width: 15 },
    { header: 'Client Name', key: 'clientName', width: 20 },
    { header: 'Property Address', key: 'propertyAddress', width: 30 },
    { header: 'Hazard Type', key: 'hazardType', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created At', key: 'createdAt', width: 15 },
    { header: 'Updated At', key: 'updatedAt', width: 15 },
  ]

  // Add data rows
  reports.forEach((report) => {
    worksheet.addRow({
      reportNumber: report.reportNumber,
      clientName: report.clientName,
      propertyAddress: report.propertyAddress,
      hazardType: report.hazardType,
      status: report.status,
      createdAt: report.createdAt ? new Date(report.createdAt).toLocaleDateString() : '',
      updatedAt: report.updatedAt ? new Date(report.updatedAt).toLocaleDateString() : '',
    })
  })

  // Format header row
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as Buffer
}

export async function generateExcelWorkbook(reports: any[], options?: any): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Reports')

  // Add headers
  worksheet.columns = [
    { header: 'Report Number', key: 'reportNumber', width: 15 },
    { header: 'Client Name', key: 'clientName', width: 20 },
    { header: 'Property Address', key: 'propertyAddress', width: 30 },
    { header: 'Hazard Type', key: 'hazardType', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created At', key: 'createdAt', width: 15 },
    { header: 'Updated At', key: 'updatedAt', width: 15 },
  ]

  // Add optional columns based on options
  if (options?.includeScope) {
    worksheet.addColumn({ header: 'Scope of Works', key: 'scopeOfWorksData', width: 30 })
  }
  if (options?.includeEstimate) {
    worksheet.addColumn({ header: 'Cost Estimation', key: 'costEstimationData', width: 30 })
  }

  // Add data rows
  reports.forEach((report) => {
    const row: any = {
      reportNumber: report.reportNumber,
      clientName: report.clientName,
      propertyAddress: report.propertyAddress,
      hazardType: report.hazardType,
      status: report.status,
      createdAt: report.createdAt ? new Date(report.createdAt).toLocaleDateString() : '',
      updatedAt: report.updatedAt ? new Date(report.updatedAt).toLocaleDateString() : '',
    }

    if (options?.includeScope && report.scopeOfWorksData) {
      row.scopeOfWorksData = JSON.stringify(report.scopeOfWorksData)
    }
    if (options?.includeEstimate && report.costEstimationData) {
      row.costEstimationData = JSON.stringify(report.costEstimationData)
    }

    worksheet.addRow(row)
  })

  // Format header row
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  }

  return workbook
}

export async function saveWorkbookAsBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as Buffer
}
