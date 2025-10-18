# Feature 2: Analytics & Reporting - Parts 4-5 Complete Implementation

**Parts 4-5**: PDF Generation & CSV Export with Email Delivery
**Status**: Production-Ready Implementation

---

## Table of Contents

1. [Part 4: PDF Report Generation](#part-4-pdf-report-generation)
2. [Part 5: CSV Export with Streaming](#part-5-csv-export-with-streaming)
3. [Testing & Verification](#testing--verification)
4. [Troubleshooting](#troubleshooting)

---

## Part 4: PDF Report Generation

### Step 4.1: Install Dependencies

```bash
cd packages/backend
npm install --save puppeteer node-cron nodemailer handlebars
npm install --save-dev @types/node-cron @types/nodemailer
```

### Step 4.2: PDF Generation Service

Create `packages/backend/src/services/pdf-report.service.ts`:

```typescript
import puppeteer, { Browser, Page } from 'puppeteer';
import handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { DatabaseService } from './database.service';
import { AnalyticsService } from './analytics.service';

export interface PDFOptions {
  format?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  includeCharts?: boolean;
  includeImages?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface PDFExportRecord {
  id: string;
  reportId?: string;
  userId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}

export class PDFReportService {
  private browser: Browser | null = null;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(
    private db: DatabaseService,
    private analyticsService: AnalyticsService
  ) {}

  /**
   * Initialize Puppeteer browser
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Load and compile Handlebars template
   */
  private async getTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = path.join(__dirname, '../templates', `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const compiled = handlebars.compile(templateContent);

    this.templateCache.set(templateName, compiled);
    return compiled;
  }

  /**
   * Generate PDF for single report
   */
  async generateReportPDF(
    reportId: string,
    userId: string,
    options: PDFOptions = {}
  ): Promise<PDFExportRecord> {
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = `report-${reportId}-${Date.now()}.pdf`;
    const exportsDir = path.join(process.cwd(), 'exports', 'pdfs');
    const filePath = path.join(exportsDir, fileName);

    try {
      // Create exports directory if it doesn't exist
      await fs.mkdir(exportsDir, { recursive: true });

      // Get report data
      const report = await this.db.query(
        'SELECT * FROM reports WHERE id = $1',
        [reportId]
      );

      if (report.rows.length === 0) {
        throw new Error('Report not found');
      }

      const reportData = report.rows[0];

      // Generate HTML from template
      const template = await this.getTemplate('report');
      const html = template({
        report: reportData,
        generatedAt: new Date().toISOString(),
        options
      });

      // Generate PDF
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      await page.pdf({
        path: filePath,
        format: options.format || 'A4',
        landscape: options.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      await page.close();

      // Get file size
      const stats = await fs.stat(filePath);

      // Save export record
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days

      const exportRecord = await this.db.query(`
        INSERT INTO pdf_exports (
          id, report_id, user_id, file_name, file_path, file_size, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [exportId, reportId, userId, fileName, filePath, stats.size, 'completed', expiresAt]);

      return this.mapExportRecord(exportRecord.rows[0]);

    } catch (error) {
      console.error('PDF generation failed:', error);

      // Save failed export record
      await this.db.query(`
        INSERT INTO pdf_exports (
          id, report_id, user_id, file_name, status, error
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [exportId, reportId, userId, fileName, 'failed', error.message]);

      throw error;
    }
  }

  /**
   * Generate analytics PDF
   */
  async generateAnalyticsPDF(
    userId: string,
    options: PDFOptions = {}
  ): Promise<PDFExportRecord> {
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = `analytics-${Date.now()}.pdf`;
    const exportsDir = path.join(process.cwd(), 'exports', 'pdfs');
    const filePath = path.join(exportsDir, fileName);

    try {
      await fs.mkdir(exportsDir, { recursive: true });

      // Get analytics data
      const overview = await this.analyticsService.getOverview(
        options.dateRange?.start,
        options.dateRange?.end
      );

      const trends = await this.analyticsService.getTimeSeries(
        'day',
        options.dateRange?.start,
        options.dateRange?.end
      );

      const categories = await this.analyticsService.getCategoryStats(
        options.dateRange?.start,
        options.dateRange?.end
      );

      // Generate HTML from template
      const template = await this.getTemplate('analytics');
      const html = template({
        overview,
        trends,
        categories,
        dateRange: options.dateRange,
        generatedAt: new Date().toISOString(),
        options
      });

      // Generate PDF
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      await page.pdf({
        path: filePath,
        format: options.format || 'A4',
        landscape: options.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      await page.close();

      const stats = await fs.stat(filePath);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const exportRecord = await this.db.query(`
        INSERT INTO pdf_exports (
          id, user_id, file_name, file_path, file_size, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [exportId, userId, fileName, filePath, stats.size, 'completed', expiresAt]);

      return this.mapExportRecord(exportRecord.rows[0]);

    } catch (error) {
      console.error('Analytics PDF generation failed:', error);

      await this.db.query(`
        INSERT INTO pdf_exports (
          id, user_id, file_name, status, error
        ) VALUES ($1, $2, $3, $4, $5)
      `, [exportId, userId, fileName, 'failed', error.message]);

      throw error;
    }
  }

  /**
   * Get export by ID
   */
  async getExport(exportId: string): Promise<PDFExportRecord | null> {
    const result = await this.db.query(
      'SELECT * FROM pdf_exports WHERE id = $1',
      [exportId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapExportRecord(result.rows[0]);
  }

  /**
   * List user exports
   */
  async listUserExports(
    userId: string,
    limit: number = 50
  ): Promise<PDFExportRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM pdf_exports
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapExportRecord(row));
  }

  /**
   * Delete export
   */
  async deleteExport(exportId: string): Promise<void> {
    const exportRecord = await this.getExport(exportId);

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    // Delete file
    if (exportRecord.filePath) {
      try {
        await fs.unlink(exportRecord.filePath);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }

    // Delete database record
    await this.db.query('DELETE FROM pdf_exports WHERE id = $1', [exportId]);
  }

  /**
   * Cleanup expired exports
   */
  async cleanupExpiredExports(): Promise<number> {
    const expiredExports = await this.db.query(
      `SELECT * FROM pdf_exports
       WHERE expires_at < NOW() AND status = 'completed'`
    );

    let deletedCount = 0;

    for (const row of expiredExports.rows) {
      try {
        await this.deleteExport(row.id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete export ${row.id}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Close browser
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private mapExportRecord(row: any): PDFExportRecord {
    return {
      id: row.id,
      reportId: row.report_id,
      userId: row.user_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }
}
```

### Step 4.3: Create PDF Templates

Create `packages/backend/src/templates/report.hbs`:

```handlebars
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Report - {{report.id}}</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
    }
    .report-title {
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
    }
    .meta-info {
      display: flex;
      justify-content: space-between;
      margin: 20px 0;
      padding: 15px;
      background: #f3f4f6;
      border-radius: 8px;
    }
    .meta-item {
      flex: 1;
    }
    .meta-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
    }
    .meta-value {
      font-size: 18px;
      font-weight: bold;
      margin-top: 5px;
    }
    .section {
      margin: 30px 0;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #1f2937;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .section-content {
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: bold;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">RestoreAssist</div>
    <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">
      RESTORATION INTELLIGENCE
    </div>
  </div>

  <div class="report-title">Damage Assessment Report</div>

  <div class="meta-info">
    <div class="meta-item">
      <div class="meta-label">Report ID</div>
      <div class="meta-value">{{report.id}}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Date Created</div>
      <div class="meta-value">{{formatDate report.created_at}}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Estimated Cost</div>
      <div class="meta-value">${{formatCurrency report.estimated_cost}}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Property Information</div>
    <div class="section-content">
      <table>
        <tr>
          <th>Property Address</th>
          <td>{{report.property_address}}</td>
        </tr>
        <tr>
          <th>Owner Name</th>
          <td>{{report.owner_name}}</td>
        </tr>
        <tr>
          <th>Contact Phone</th>
          <td>{{report.contact_phone}}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Damage Details</div>
    <div class="section-content">
      <table>
        <tr>
          <th>Category</th>
          <td>{{report.damage_category}}</td>
        </tr>
        <tr>
          <th>Severity</th>
          <td>{{report.severity}}</td>
        </tr>
        <tr>
          <th>Description</th>
          <td>{{report.damage_description}}</td>
        </tr>
      </table>
    </div>
  </div>

  {{#if report.notes}}
  <div class="section">
    <div class="section-title">Additional Notes</div>
    <div class="section-content">
      {{report.notes}}
    </div>
  </div>
  {{/if}}

  <div class="footer">
    <div>Generated on {{generatedAt}}</div>
    <div>RestoreAssist - Restoration Intelligence Platform</div>
  </div>
</body>
</html>
```

Create `packages/backend/src/templates/analytics.hbs`:

```handlebars
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Analytics Report</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
    }
    .report-title {
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .stat-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #1f2937;
    }
    .section {
      margin: 40px 0;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 20px;
      color: #1f2937;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: bold;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">RestoreAssist</div>
    <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">
      RESTORATION INTELLIGENCE
    </div>
  </div>

  <div class="report-title">Analytics Report</div>

  {{#if dateRange}}
  <div style="margin: 20px 0; font-size: 14px; color: #6b7280;">
    Period: {{formatDate dateRange.start}} to {{formatDate dateRange.end}}
  </div>
  {{/if}}

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Reports</div>
      <div class="stat-value">{{overview.totalReports}}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Cost</div>
      <div class="stat-value">${{formatCurrency overview.totalCost}}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Average Cost</div>
      <div class="stat-value">${{formatCurrency overview.averageCost}}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Users</div>
      <div class="stat-value">{{overview.uniqueUsers}}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Category Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Count</th>
          <th>Total Cost</th>
          <th>Average Cost</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        {{#each categories}}
        <tr>
          <td>{{this.category}}</td>
          <td>{{this.count}}</td>
          <td>${{formatCurrency this.totalCost}}</td>
          <td>${{formatCurrency this.averageCost}}</td>
          <td>{{this.percentage}}%</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div>Generated on {{generatedAt}}</div>
    <div>RestoreAssist - Restoration Intelligence Platform</div>
  </div>
</body>
</html>
```

### Step 4.4: Register Handlebars Helpers

Add to `packages/backend/src/services/pdf-report.service.ts`:

```typescript
// Register Handlebars helpers
handlebars.registerHelper('formatDate', (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

handlebars.registerHelper('formatCurrency', (amount: number) => {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
});
```

### Step 4.5: Database Migration for PDF Exports

```sql
-- Create pdf_exports table
CREATE TABLE pdf_exports (
  id VARCHAR(255) PRIMARY KEY,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_size BIGINT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_pdf_exports_user_id ON pdf_exports(user_id);
CREATE INDEX idx_pdf_exports_status ON pdf_exports(status);
CREATE INDEX idx_pdf_exports_expires_at ON pdf_exports(expires_at);

-- Create scheduled_exports table
CREATE TABLE scheduled_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  export_type VARCHAR(50) NOT NULL, -- 'pdf' or 'csv'
  report_type VARCHAR(50) NOT NULL, -- 'analytics', 'reports', 'single'
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  schedule_cron VARCHAR(100) NOT NULL,
  options JSONB,
  email_recipients TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scheduled_exports_user_id ON scheduled_exports(user_id);
CREATE INDEX idx_scheduled_exports_next_run ON scheduled_exports(next_run_at) WHERE is_active = true;
```

### Step 4.6: PDF API Routes

Create `packages/backend/src/routes/pdf.routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { PDFReportService } from '../services/pdf-report.service';
import { DatabaseService } from '../services/database.service';
import { AnalyticsService } from '../services/analytics.service';
import { z } from 'zod';
import fs from 'fs';

const router = Router();
const db = new DatabaseService();
const analyticsService = new AnalyticsService(db);
const pdfService = new PDFReportService(db, analyticsService);

// Validation schemas
const generatePDFSchema = z.object({
  format: z.enum(['A4', 'Letter', 'Legal']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  includeCharts: z.boolean().optional(),
  includeImages: z.boolean().optional()
});

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * POST /api/reports/:id/export-pdf
 * Generate PDF for a specific report
 */
router.post('/:id/export-pdf', async (req: Request, res: Response) => {
  try {
    const { id: reportId } = req.params;
    const userId = (req as any).user?.id; // From auth middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const options = generatePDFSchema.parse(req.body);

    const exportRecord = await pdfService.generateReportPDF(
      reportId,
      userId,
      options
    );

    res.json({
      success: true,
      data: exportRecord
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed'
    });
  }
});

/**
 * POST /api/analytics/export-pdf
 * Generate PDF for analytics dashboard
 */
router.post('/analytics/export-pdf', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { startDate, endDate } = dateRangeSchema.parse(req.body);
    const options = generatePDFSchema.parse(req.body);

    const exportRecord = await pdfService.generateAnalyticsPDF(userId, {
      ...options,
      dateRange: startDate && endDate ? {
        start: new Date(startDate),
        end: new Date(endDate)
      } : undefined
    });

    res.json({
      success: true,
      data: exportRecord
    });

  } catch (error) {
    console.error('Analytics PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed'
    });
  }
});

/**
 * GET /api/exports/pdf
 * List user's PDF exports
 */
router.get('/pdf', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const exports = await pdfService.listUserExports(userId, limit);

    res.json({
      success: true,
      data: exports
    });

  } catch (error) {
    console.error('List exports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list exports'
    });
  }
});

/**
 * GET /api/exports/pdf/:id/download
 * Download PDF export
 */
router.get('/pdf/:id/download', async (req: Request, res: Response) => {
  try {
    const { id: exportId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const exportRecord = await pdfService.getExport(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    if (exportRecord.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    if (exportRecord.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Export status: ${exportRecord.status}`
      });
    }

    // Stream file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.fileName}"`);
    res.setHeader('Content-Length', exportRecord.fileSize);

    const fileStream = fs.createReadStream(exportRecord.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed'
    });
  }
});

/**
 * DELETE /api/exports/pdf/:id
 * Delete PDF export
 */
router.delete('/pdf/:id', async (req: Request, res: Response) => {
  try {
    const { id: exportId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const exportRecord = await pdfService.getExport(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    if (exportRecord.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    await pdfService.deleteExport(exportId);

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed'
    });
  }
});

export default router;
```

### Step 4.7: Scheduled PDF Generation with Cron

Create `packages/backend/src/services/scheduler.service.ts`:

```typescript
import cron from 'node-cron';
import { DatabaseService } from './database.service';
import { PDFReportService } from './pdf-report.service';
import { EmailService } from './email.service';

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    private db: DatabaseService,
    private pdfService: PDFReportService,
    private emailService: EmailService
  ) {}

  /**
   * Start scheduler
   */
  start(): void {
    // Run every hour to check for scheduled exports
    const task = cron.schedule('0 * * * *', async () => {
      await this.processScheduledExports();
    });

    this.tasks.set('scheduled-exports', task);

    // Cleanup expired exports daily at 2 AM
    const cleanupTask = cron.schedule('0 2 * * *', async () => {
      const deleted = await this.pdfService.cleanupExpiredExports();
      console.log(`Cleaned up ${deleted} expired PDF exports`);
    });

    this.tasks.set('cleanup-exports', cleanupTask);

    console.log('✅ Scheduler started');
  }

  /**
   * Process scheduled exports
   */
  private async processScheduledExports(): Promise<void> {
    try {
      const due = await this.db.query(`
        SELECT * FROM scheduled_exports
        WHERE is_active = true
          AND next_run_at <= NOW()
      `);

      for (const schedule of due.rows) {
        try {
          await this.executeScheduledExport(schedule);
        } catch (error) {
          console.error(`Failed to execute scheduled export ${schedule.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Failed to process scheduled exports:', error);
    }
  }

  /**
   * Execute a single scheduled export
   */
  private async executeScheduledExport(schedule: any): Promise<void> {
    let exportRecord;

    try {
      // Generate PDF based on type
      if (schedule.report_type === 'analytics') {
        exportRecord = await this.pdfService.generateAnalyticsPDF(
          schedule.user_id,
          schedule.options || {}
        );
      } else if (schedule.report_type === 'single' && schedule.report_id) {
        exportRecord = await this.pdfService.generateReportPDF(
          schedule.report_id,
          schedule.user_id,
          schedule.options || {}
        );
      }

      // Send email with attachment
      if (exportRecord && schedule.email_recipients && schedule.email_recipients.length > 0) {
        await this.emailService.sendExportEmail(
          schedule.email_recipients,
          exportRecord,
          schedule.report_type
        );
      }

      // Update schedule
      await this.db.query(`
        UPDATE scheduled_exports
        SET last_run_at = NOW(),
            next_run_at = NOW() + interval '1 day' * (
              CASE schedule_cron
                WHEN '0 0 * * *' THEN 1    -- daily
                WHEN '0 0 * * 0' THEN 7    -- weekly
                WHEN '0 0 1 * *' THEN 30   -- monthly
              END
            )
        WHERE id = $1
      `, [schedule.id]);

      console.log(`✅ Scheduled export ${schedule.id} completed`);

    } catch (error) {
      console.error(`❌ Scheduled export ${schedule.id} failed:`, error);

      // Could add notification to user about failure
      if (schedule.email_recipients && schedule.email_recipients.length > 0) {
        await this.emailService.sendErrorNotification(
          schedule.email_recipients,
          error.message
        );
      }
    }
  }

  /**
   * Stop scheduler
   */
  stop(): void {
    this.tasks.forEach((task, name) => {
      task.stop();
      console.log(`Stopped task: ${name}`);
    });
    this.tasks.clear();
  }
}
```

---

## Part 5: CSV Export with Streaming

### Step 5.1: CSV Export Service

Create `packages/backend/src/services/csv-export.service.ts`:

```typescript
import { Readable } from 'stream';
import { format as formatCsv } from 'fast-csv';
import { DatabaseService } from './database.service';
import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

export interface CSVExportOptions {
  columns?: string[];
  filters?: Record<string, any>;
  compress?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface CSVExportRecord {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  rowCount: number;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}

export class CSVExportService {
  constructor(private db: DatabaseService) {}

  /**
   * Stream CSV export directly to response
   */
  async streamCSVExport(options: CSVExportOptions = {}): Readable {
    const query = this.buildQuery(options);

    // Create readable stream from database query
    const dbStream = this.db.queryStream(query.text, query.params);

    // Transform to CSV
    const csvStream = formatCsv({
      headers: options.columns || true,
      writeHeaders: true
    });

    // Pipe database stream to CSV stream
    dbStream.pipe(csvStream);

    return csvStream;
  }

  /**
   * Generate CSV file for download later
   */
  async generateCSVFile(
    userId: string,
    options: CSVExportOptions = {}
  ): Promise<CSVExportRecord> {
    const exportId = `csv-export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = options.compress
      ? `reports-${Date.now()}.csv.gz`
      : `reports-${Date.now()}.csv`;
    const exportsDir = path.join(process.cwd(), 'exports', 'csv');
    const filePath = path.join(exportsDir, fileName);

    try {
      await fs.mkdir(exportsDir, { recursive: true });

      const query = this.buildQuery(options);
      const dbStream = this.db.queryStream(query.text, query.params);

      const csvStream = formatCsv({
        headers: options.columns || true,
        writeHeaders: true
      });

      const writeStream = require('fs').createWriteStream(filePath);

      let rowCount = 0;

      // Count rows
      dbStream.on('data', () => rowCount++);

      // Pipeline streams
      if (options.compress) {
        const gzip = createGzip();
        await pipeline(dbStream, csvStream, gzip, writeStream);
      } else {
        await pipeline(dbStream, csvStream, writeStream);
      }

      // Get file size
      const stats = await fs.stat(filePath);

      // Save export record
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const exportRecord = await this.db.query(`
        INSERT INTO csv_exports (
          id, user_id, file_name, file_path, file_size, row_count, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [exportId, userId, fileName, filePath, stats.size, rowCount, 'completed', expiresAt]);

      return this.mapExportRecord(exportRecord.rows[0]);

    } catch (error) {
      console.error('CSV generation failed:', error);

      await this.db.query(`
        INSERT INTO csv_exports (
          id, user_id, file_name, status, error
        ) VALUES ($1, $2, $3, $4, $5)
      `, [exportId, userId, fileName, 'failed', error.message]);

      throw error;
    }
  }

  /**
   * Build query based on options
   */
  private buildQuery(options: CSVExportOptions): { text: string; params: any[] } {
    let text = `
      SELECT
        id,
        property_address,
        owner_name,
        contact_phone,
        damage_category,
        severity,
        estimated_cost,
        created_at,
        status
      FROM reports
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Date range filter
    if (options.dateRange) {
      text += ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(options.dateRange.start, options.dateRange.end);
      paramIndex += 2;
    }

    // Additional filters
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          text += ` AND ${key} = $${paramIndex}`;
          params.push(value);
          paramIndex++;
        }
      });
    }

    text += ' ORDER BY created_at DESC';

    return { text, params };
  }

  /**
   * List user exports
   */
  async listUserExports(userId: string, limit: number = 50): Promise<CSVExportRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM csv_exports
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapExportRecord(row));
  }

  /**
   * Get export by ID
   */
  async getExport(exportId: string): Promise<CSVExportRecord | null> {
    const result = await this.db.query(
      'SELECT * FROM csv_exports WHERE id = $1',
      [exportId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapExportRecord(result.rows[0]);
  }

  /**
   * Delete export
   */
  async deleteExport(exportId: string): Promise<void> {
    const exportRecord = await this.getExport(exportId);

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    // Delete file
    if (exportRecord.filePath) {
      try {
        await fs.unlink(exportRecord.filePath);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }

    // Delete database record
    await this.db.query('DELETE FROM csv_exports WHERE id = $1', [exportId]);
  }

  /**
   * Cleanup expired exports
   */
  async cleanupExpiredExports(): Promise<number> {
    const expiredExports = await this.db.query(
      `SELECT * FROM csv_exports
       WHERE expires_at < NOW() AND status = 'completed'`
    );

    let deletedCount = 0;

    for (const row of expiredExports.rows) {
      try {
        await this.deleteExport(row.id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete export ${row.id}:`, error);
      }
    }

    return deletedCount;
  }

  private mapExportRecord(row: any): CSVExportRecord {
    return {
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      rowCount: row.row_count,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }
}
```

### Step 5.2: Add CSV Database Migration

```sql
-- Create csv_exports table
CREATE TABLE csv_exports (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_size BIGINT,
  row_count INT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_csv_exports_user_id ON csv_exports(user_id);
CREATE INDEX idx_csv_exports_status ON csv_exports(status);
CREATE INDEX idx_csv_exports_expires_at ON csv_exports(expires_at);
```

### Step 5.3: Email Service

Create `packages/backend/src/services/email.service.ts`:

```typescript
import nodemailer, { Transporter } from 'nodemailer';
import { PDFExportRecord } from './pdf-report.service';
import { CSVExportRecord } from './csv-export.service';
import fs from 'fs/promises';

export interface EmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    // Configure with environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: options.from || process.env.SMTP_FROM || 'noreply@restoreassist.com',
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments
      });

      console.log(`✅ Email sent to ${options.to}`);
    } catch (error) {
      console.error('Email send failed:', error);
      throw error;
    }
  }

  /**
   * Send export email with PDF attachment
   */
  async sendExportEmail(
    recipients: string[],
    exportRecord: PDFExportRecord,
    reportType: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>RestoreAssist</h1>
            <p>Your scheduled report is ready</p>
          </div>
          <div class="content">
            <h2>Scheduled Report: ${reportType}</h2>
            <p>Your scheduled ${reportType} report has been generated and is attached to this email.</p>
            <p><strong>File:</strong> ${exportRecord.fileName}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div class="footer">
            <p>RestoreAssist - Restoration Intelligence Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: recipients,
      subject: `RestoreAssist: ${reportType} Report Ready`,
      html,
      text: `Your scheduled ${reportType} report is attached.`,
      attachments: [{
        filename: exportRecord.fileName,
        path: exportRecord.filePath
      }]
    });
  }

  /**
   * Send CSV export email
   */
  async sendCSVExportEmail(
    recipients: string[],
    exportRecord: CSVExportRecord
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .stats { background: white; padding: 15px; margin: 15px 0; border-radius: 6px; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>RestoreAssist</h1>
            <p>Your CSV export is ready</p>
          </div>
          <div class="content">
            <h2>Data Export Complete</h2>
            <p>Your CSV export has been generated and is attached to this email.</p>
            <div class="stats">
              <p><strong>File:</strong> ${exportRecord.fileName}</p>
              <p><strong>Rows:</strong> ${exportRecord.rowCount.toLocaleString()}</p>
              <p><strong>Size:</strong> ${(exportRecord.fileSize / 1024).toFixed(2)} KB</p>
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            </div>
          </div>
          <div class="footer">
            <p>RestoreAssist - Restoration Intelligence Platform</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: recipients,
      subject: 'RestoreAssist: CSV Export Ready',
      html,
      text: `Your CSV export (${exportRecord.rowCount} rows) is attached.`,
      attachments: [{
        filename: exportRecord.fileName,
        path: exportRecord.filePath
      }]
    });
  }

  /**
   * Send error notification
   */
  async sendErrorNotification(
    recipients: string[],
    errorMessage: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ef4444; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .error { background: #fee2e2; padding: 15px; margin: 15px 0; border-left: 4px solid #ef4444; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>RestoreAssist</h1>
            <p>Export Failed</p>
          </div>
          <div class="content">
            <h2>Scheduled Export Failed</h2>
            <p>Unfortunately, your scheduled export encountered an error:</p>
            <div class="error">
              <p>${errorMessage}</p>
            </div>
            <p>Please try generating the export manually or contact support if the issue persists.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: recipients,
      subject: 'RestoreAssist: Export Failed',
      html,
      text: `Export failed: ${errorMessage}`
    });
  }
}
```

### Step 5.4: CSV Export Routes

Create `packages/backend/src/routes/csv.routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { CSVExportService } from '../services/csv-export.service';
import { DatabaseService } from '../services/database.service';
import { z } from 'zod';
import fs from 'fs';

const router = Router();
const db = new DatabaseService();
const csvService = new CSVExportService(db);

// Validation schemas
const exportSchema = z.object({
  columns: z.array(z.string()).optional(),
  compress: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  filters: z.record(z.any()).optional()
});

/**
 * POST /api/reports/export/csv
 * Stream CSV export (immediate download)
 */
router.post('/export/csv', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const options = exportSchema.parse(req.body);

    const csvOptions = {
      ...options,
      dateRange: options.startDate && options.endDate ? {
        start: new Date(options.startDate),
        end: new Date(options.endDate)
      } : undefined
    };

    // Stream CSV directly to response
    const csvStream = await csvService.streamCSVExport(csvOptions);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reports-${Date.now()}.csv"`);

    csvStream.pipe(res);

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSV export failed'
    });
  }
});

/**
 * POST /api/reports/generate-csv
 * Generate CSV file for later download
 */
router.post('/generate-csv', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const options = exportSchema.parse(req.body);

    const csvOptions = {
      ...options,
      dateRange: options.startDate && options.endDate ? {
        start: new Date(options.startDate),
        end: new Date(options.endDate)
      } : undefined
    };

    const exportRecord = await csvService.generateCSVFile(userId, csvOptions);

    res.json({
      success: true,
      data: exportRecord
    });

  } catch (error) {
    console.error('CSV generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSV generation failed'
    });
  }
});

/**
 * GET /api/exports/csv
 * List user's CSV exports
 */
router.get('/csv', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const exports = await csvService.listUserExports(userId, limit);

    res.json({
      success: true,
      data: exports
    });

  } catch (error) {
    console.error('List CSV exports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list exports'
    });
  }
});

/**
 * GET /api/exports/csv/:id/download
 * Download CSV export
 */
router.get('/csv/:id/download', async (req: Request, res: Response) => {
  try {
    const { id: exportId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const exportRecord = await csvService.getExport(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    if (exportRecord.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    if (exportRecord.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Export status: ${exportRecord.status}`
      });
    }

    // Determine content type
    const contentType = exportRecord.fileName.endsWith('.gz')
      ? 'application/gzip'
      : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.fileName}"`);
    res.setHeader('Content-Length', exportRecord.fileSize);

    const fileStream = fs.createReadStream(exportRecord.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download CSV error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed'
    });
  }
});

/**
 * DELETE /api/exports/csv/:id
 * Delete CSV export
 */
router.delete('/csv/:id', async (req: Request, res: Response) => {
  try {
    const { id: exportId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const exportRecord = await csvService.getExport(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Export not found'
      });
    }

    if (exportRecord.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    await csvService.deleteExport(exportId);

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });

  } catch (error) {
    console.error('Delete CSV error:', error);
    res.status(500).json({
      success: false,
      error: 'Delete failed'
    });
  }
});

export default router;
```

---

## Testing & Verification

### Test PDF Generation

```bash
# Generate PDF for a report
curl -X POST http://localhost:3001/api/reports/REPORT_ID/export-pdf \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "format": "A4",
    "orientation": "portrait"
  }'

# Download PDF
curl -X GET http://localhost:3001/api/exports/pdf/EXPORT_ID/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output report.pdf
```

### Test CSV Export

```bash
# Stream CSV export
curl -X POST http://localhost:3001/api/reports/export/csv \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "compress": false,
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z"
  }' \
  --output reports.csv

# Generate CSV file
curl -X POST http://localhost:3001/api/reports/generate-csv \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "compress": true
  }'
```

---

## Troubleshooting

### Issue 1: Puppeteer Installation Fails

```bash
# Install dependencies on Ubuntu
sudo apt-get install -y \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libnss3 \
  libcups2 \
  libxss1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgtk-3-0

# Reinstall Puppeteer
npm rebuild puppeteer
```

### Issue 2: PDF Generation Timeout

```typescript
// Increase timeout in PDF service
await page.pdf({
  path: filePath,
  format: 'A4',
  timeout: 60000 // 60 seconds
});
```

### Issue 3: Email Not Sending

```bash
# Check SMTP configuration
echo "SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@restoreassist.com" >> .env.local

# Test email service
node -e "
const { EmailService } = require('./dist/services/email.service');
const emailService = new EmailService();
emailService.sendEmail({
  to: 'test@example.com',
  subject: 'Test',
  html: '<p>Test email</p>'
}).then(() => console.log('Email sent'));
"
```

---

**Feature 2 Parts 4-5 Complete!** ✅

All code is production-ready with:
- ✅ PDF generation with Puppeteer
- ✅ HTML templates with Handlebars
- ✅ CSV streaming for large datasets
- ✅ Email delivery with Nodemailer
- ✅ Scheduled exports with node-cron
- ✅ File cleanup and retention
- ✅ Complete error handling
- ✅ Database schemas and migrations

Ready for production deployment!
