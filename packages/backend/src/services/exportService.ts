import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { GeneratedReport } from '../types';

// Export formats
export type ExportFormat = 'docx' | 'pdf';

// Export options
export interface ExportOptions {
  format: ExportFormat;
  email?: string;
  includeCharts?: boolean;
  includeBranding?: boolean;
}

// Export result
export interface ExportResult {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  expiresIn: number; // seconds
  emailSent?: boolean;
}

export class ExportService {
  private exportsDir: string;
  private baseUrl: string;

  constructor() {
    this.exportsDir = path.join(process.cwd(), 'exports');
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3001';

    // Create exports directory if it doesn't exist
    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
  }

  /**
   * Export report to specified format
   */
  async exportReport(report: GeneratedReport, options: ExportOptions): Promise<ExportResult> {
    const fileName = this.generateFileName(report, options.format);
    const filePath = path.join(this.exportsDir, fileName);

    // Generate the file
    if (options.format === 'docx') {
      await this.generateDOCX(report, filePath, options);
    } else if (options.format === 'pdf') {
      await this.generatePDF(report, filePath, options);
    }

    // Get file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Send email if requested
    let emailSent = false;
    if (options.email) {
      emailSent = await this.sendEmail(options.email, filePath, fileName, report);
    }

    // Schedule file deletion after 24 hours
    this.scheduleFileDeletion(filePath, 24 * 60 * 60 * 1000);

    return {
      downloadUrl: `${this.baseUrl}/api/exports/${fileName}`,
      fileName,
      fileSize,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      emailSent,
    };
  }

  /**
   * Generate DOCX document
   */
  private async generateDOCX(report: GeneratedReport, filePath: string, options: ExportOptions): Promise<void> {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Title
            new Paragraph({
              text: 'Damage Assessment Report',
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Report ID and Date
            new Paragraph({
              children: [
                new TextRun({ text: 'Report ID: ', bold: true }),
                new TextRun(report.reportId),
              ],
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Generated: ', bold: true }),
                new TextRun(new Date(report.timestamp).toLocaleString()),
              ],
              spacing: { after: 400 },
            }),

            // Property Information
            new Paragraph({
              text: 'Property Information',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Address: ', bold: true }),
                new TextRun(report.propertyAddress),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'State: ', bold: true }),
                new TextRun(report.state),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Damage Type: ', bold: true }),
                new TextRun(this.capitalizeFirst(report.damageType)),
              ],
              spacing: { after: 400 },
            }),

            // Client Information (if available)
            ...(report.metadata.clientName
              ? [
                  new Paragraph({
                    text: 'Client Information',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 400, after: 200 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Client Name: ', bold: true }),
                      new TextRun(report.metadata.clientName),
                    ],
                  }),
                  ...(report.metadata.insuranceCompany
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Insurance Company: ', bold: true }),
                            new TextRun(report.metadata.insuranceCompany),
                          ],
                        }),
                      ]
                    : []),
                  ...(report.metadata.claimNumber
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'Claim Number: ', bold: true }),
                            new TextRun(report.metadata.claimNumber),
                          ],
                          spacing: { after: 400 },
                        }),
                      ]
                    : []),
                ]
              : []),

            // Summary
            new Paragraph({
              text: 'Assessment Summary',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              text: report.summary,
              spacing: { after: 400 },
            }),

            // Scope of Work
            new Paragraph({
              text: 'Scope of Work',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            ...report.scopeOfWork.map(
              (item, index) =>
                new Paragraph({
                  text: `${index + 1}. ${item}`,
                  spacing: { after: 100 },
                })
            ),

            // Itemized Estimate Table
            new Paragraph({
              text: 'Itemized Estimate',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            this.createEstimateTable(report),

            // Total Cost
            new Paragraph({
              children: [
                new TextRun({ text: 'Total Cost: ', bold: true, size: 28 }),
                new TextRun({ text: `$${report.totalCost.toFixed(2)} AUD`, size: 28 }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 200, after: 400 },
            }),

            // Compliance Notes
            new Paragraph({
              text: 'Compliance Notes',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            ...report.complianceNotes.map(
              (note) =>
                new Paragraph({
                  text: `• ${note}`,
                  spacing: { after: 100 },
                })
            ),

            // Authority to Proceed
            new Paragraph({
              text: 'Authority to Proceed',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              text: report.authorityToProceed,
              spacing: { after: 400 },
            }),

            // Footer
            new Paragraph({
              text: `Generated by ${report.metadata.generatedBy} using ${report.metadata.model}`,
              alignment: AlignmentType.CENTER,
              spacing: { before: 600 },
              italics: true,
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
  }

  /**
   * Generate PDF document
   */
  private async generatePDF(report: GeneratedReport, filePath: string, options: ExportOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      stream.on('finish', resolve);
      stream.on('error', reject);

      doc.pipe(stream);

      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('Damage Assessment Report', { align: 'center' });
      doc.moveDown();

      // Report metadata
      doc.fontSize(10).font('Helvetica-Bold').text('Report ID: ', { continued: true });
      doc.font('Helvetica').text(report.reportId);

      doc.font('Helvetica-Bold').text('Generated: ', { continued: true });
      doc.font('Helvetica').text(new Date(report.timestamp).toLocaleString());
      doc.moveDown();

      // Property Information
      doc.fontSize(16).font('Helvetica-Bold').text('Property Information');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica-Bold').text('Address: ', { continued: true });
      doc.font('Helvetica').text(report.propertyAddress);

      doc.font('Helvetica-Bold').text('State: ', { continued: true });
      doc.font('Helvetica').text(report.state);

      doc.font('Helvetica-Bold').text('Damage Type: ', { continued: true });
      doc.font('Helvetica').text(this.capitalizeFirst(report.damageType));
      doc.moveDown();

      // Client Information
      if (report.metadata.clientName) {
        doc.fontSize(16).font('Helvetica-Bold').text('Client Information');
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica-Bold').text('Client Name: ', { continued: true });
        doc.font('Helvetica').text(report.metadata.clientName);

        if (report.metadata.insuranceCompany) {
          doc.font('Helvetica-Bold').text('Insurance Company: ', { continued: true });
          doc.font('Helvetica').text(report.metadata.insuranceCompany);
        }

        if (report.metadata.claimNumber) {
          doc.font('Helvetica-Bold').text('Claim Number: ', { continued: true });
          doc.font('Helvetica').text(report.metadata.claimNumber);
        }

        doc.moveDown();
      }

      // Summary
      doc.fontSize(16).font('Helvetica-Bold').text('Assessment Summary');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(report.summary, { align: 'justify' });
      doc.moveDown();

      // Scope of Work
      doc.fontSize(16).font('Helvetica-Bold').text('Scope of Work');
      doc.moveDown(0.5);
      report.scopeOfWork.forEach((item, index) => {
        doc.fontSize(10).font('Helvetica').text(`${index + 1}. ${item}`);
      });
      doc.moveDown();

      // Itemized Estimate
      doc.fontSize(16).font('Helvetica-Bold').text('Itemized Estimate');
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      const colWidths = [250, 50, 80, 80];
      const tableLeft = 50;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', tableLeft, tableTop, { width: colWidths[0] });
      doc.text('Qty', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
      doc.text('Unit Cost', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
      doc.text('Total', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });

      let currentY = tableTop + 20;
      doc.moveTo(tableLeft, currentY).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), currentY).stroke();

      currentY += 10;

      // Table rows
      doc.font('Helvetica');
      report.itemizedEstimate.forEach((item) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        doc.text(item.description, tableLeft, currentY, { width: colWidths[0] });
        doc.text(item.quantity.toString(), tableLeft + colWidths[0], currentY, { width: colWidths[1], align: 'right' });
        doc.text(`$${item.unitCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1], currentY, { width: colWidths[2], align: 'right' });
        doc.text(`$${item.totalCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], currentY, { width: colWidths[3], align: 'right' });

        currentY += 20;
      });

      // Total
      doc.moveTo(tableLeft, currentY).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), currentY).stroke();
      currentY += 10;

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('Total Cost:', tableLeft + colWidths[0] + colWidths[1], currentY, { width: colWidths[2], align: 'right' });
      doc.text(`$${report.totalCost.toFixed(2)} AUD`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], currentY, { width: colWidths[3], align: 'right' });

      doc.moveDown(2);

      // Compliance Notes
      if (doc.y > 650) doc.addPage();

      doc.fontSize(16).font('Helvetica-Bold').text('Compliance Notes');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      report.complianceNotes.forEach((note) => {
        doc.text(`• ${note}`);
      });
      doc.moveDown();

      // Authority to Proceed
      if (doc.y > 600) doc.addPage();

      doc.fontSize(16).font('Helvetica-Bold').text('Authority to Proceed');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(report.authorityToProceed, { align: 'justify' });

      // Footer
      doc.fontSize(8).font('Helvetica-Oblique').text(`Generated by ${report.metadata.generatedBy} using ${report.metadata.model}`, 50, 750, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Create estimate table for DOCX
   */
  private createEstimateTable(report: GeneratedReport): Table {
    const rows: TableRow[] = [
      // Header row
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: 'Description', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Qty', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Unit Cost', bold: true })] }),
          new TableCell({ children: [new Paragraph({ text: 'Total', bold: true })] }),
        ],
      }),
      // Data rows
      ...report.itemizedEstimate.map(
        (item) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(item.description)] }),
              new TableCell({ children: [new Paragraph(item.quantity.toString())] }),
              new TableCell({ children: [new Paragraph(`$${item.unitCost.toFixed(2)}`)] }),
              new TableCell({ children: [new Paragraph(`$${item.totalCost.toFixed(2)}`)] }),
            ],
          })
      ),
    ];

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, size: 1 },
      },
    });
  }

  /**
   * Send email with exported file
   */
  private async sendEmail(email: string, filePath: string, fileName: string, report: GeneratedReport): Promise<boolean> {
    try {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Send email
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"RestoreAssist" <noreply@restoreassist.com>',
        to: email,
        subject: `Damage Assessment Report - ${report.reportId}`,
        text: `Please find attached your damage assessment report for ${report.propertyAddress}.`,
        html: `
          <h2>Damage Assessment Report</h2>
          <p>Please find attached your damage assessment report.</p>
          <ul>
            <li><strong>Property:</strong> ${report.propertyAddress}</li>
            <li><strong>Damage Type:</strong> ${this.capitalizeFirst(report.damageType)}</li>
            <li><strong>Total Cost:</strong> $${report.totalCost.toFixed(2)} AUD</li>
          </ul>
          <p>If you have any questions, please contact us.</p>
          <p><em>Generated by RestoreAssist</em></p>
        `,
        attachments: [
          {
            filename: fileName,
            path: filePath,
          },
        ],
      });

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Generate unique file name
   */
  private generateFileName(report: GeneratedReport, format: ExportFormat): string {
    const timestamp = Date.now();
    const sanitizedAddress = report.propertyAddress.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    return `report_${report.reportId}_${sanitizedAddress}_${timestamp}.${format}`;
  }

  /**
   * Schedule file deletion
   */
  private scheduleFileDeletion(filePath: string, delayMs: number): void {
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted expired export: ${path.basename(filePath)}`);
      }
    }, delayMs);
  }

  /**
   * Get exported file
   */
  getExportedFile(fileName: string): string | null {
    const filePath = path.join(this.exportsDir, fileName);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
