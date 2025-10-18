import { Router, Request, Response } from 'express';
import { db } from '../services/databaseService';
import { ExportService, ExportFormat } from '../services/exportService';

export const exportRoutes = Router();
const exportService = new ExportService();

// POST /api/reports/:id/export - Export report to DOCX or PDF
exportRoutes.post('/:id/export', async (req: Request, res: Response) => {
  try {
    const reportId = req.params.id;
    const { format, email, includeCharts, includeBranding } = req.body;

    // Validation
    if (!format || !['docx', 'pdf'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format. Must be "docx" or "pdf"',
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        error: 'Invalid email address',
      });
    }

    // Get report from database
    let report;
    if (db.isUsingPostgres()) {
      report = await db.findByIdAsync(reportId);
    } else {
      report = db.findById(reportId);
    }

    if (!report) {
      return res.status(404).json({
        error: 'Report not found',
      });
    }

    // Export report
    const result = await exportService.exportReport(report, {
      format: format as ExportFormat,
      email,
      includeCharts: includeCharts === true,
      includeBranding: includeBranding !== false, // default true
    });

    res.json(result);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export report',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/exports/:fileName - Download exported file
exportRoutes.get('/:fileName', (req: Request, res: Response) => {
  try {
    const fileName = req.params.fileName;

    // Validate file name (security check)
    if (!isValidFileName(fileName)) {
      return res.status(400).json({
        error: 'Invalid file name',
      });
    }

    const filePath = exportService.getExportedFile(fileName);

    if (!filePath) {
      return res.status(404).json({
        error: 'File not found or expired',
      });
    }

    // Set appropriate headers
    const extension = fileName.split('.').pop();
    const contentType = extension === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: 'Failed to download file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Helper: Validate email
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: Validate file name (prevent path traversal)
function isValidFileName(fileName: string): boolean {
  // Only allow alphanumeric, underscores, hyphens, and dots
  const fileNameRegex = /^[a-zA-Z0-9_\-\.]+$/;

  // Must not contain path separators
  if (fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }

  // Must have valid extension
  if (!fileName.endsWith('.docx') && !fileName.endsWith('.pdf')) {
    return false;
  }

  return fileNameRegex.test(fileName);
}
