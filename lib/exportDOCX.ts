/**
 * DOCX Export System for RestoreAssist
 *
 * Generates professional Word documents for:
 * - Inspection Reports
 * - Scope of Works
 * - Cost Estimations
 * - Complete Packages
 *
 * Uses Australian English spelling and professional formatting.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableOfContents,
  convertInchesToTwip,
  UnderlineType,
} from 'docx';

// Import types from reportGenerator and costCalculator
import type {
  InspectionReportData,
  ScopeOfWorksData,
  CostBreakdownData,
  PropertyDetails,
  TechnicianReport,
  QuestionResponses,
  EquipmentList,
} from './reportGenerator';

import type {
  CostEstimationResult,
  LabourCostResult,
  EquipmentCostResult,
  ChemicalCostResult,
  FeeCostResult,
  IndustryBenchmark,
} from './costCalculator';

// ============================================================================
// COLOUR SCHEME
// ============================================================================

const COLORS = {
  PRIMARY: '003366',      // Dark blue for headings
  SECONDARY: '0066CC',    // Medium blue for subheadings
  ALERT_RED: 'CC0000',    // Red for warnings
  SUCCESS_GREEN: '006600', // Green for success
  BORDER_GRAY: 'CCCCCC',  // Light gray for borders
  BACKGROUND_GRAY: 'F5F5F5', // Very light gray for shading
  TEXT_BLACK: '000000',   // Black for text
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a styled heading
 */
function createHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel], options?: {
  color?: string;
  pageBreakBefore?: boolean;
  spacing?: { before?: number; after?: number };
}): Paragraph {
  return new Paragraph({
    text: text,
    heading: level,
    spacing: {
      before: options?.spacing?.before ?? 240,
      after: options?.spacing?.after ?? 120,
    },
    pageBreakBefore: options?.pageBreakBefore ?? false,
  });
}

/**
 * Create a normal paragraph
 */
function createParagraph(text: string, options?: {
  bold?: boolean;
  italics?: boolean;
  color?: string;
  alignment?: typeof AlignmentType[keyof typeof AlignmentType];
  spacing?: { before?: number; after?: number };
}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text,
        bold: options?.bold ?? false,
        italics: options?.italics ?? false,
        color: options?.color ?? COLORS.TEXT_BLACK,
      }),
    ],
    alignment: options?.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: options?.spacing?.before ?? 0,
      after: options?.spacing?.after ?? 120,
    },
  });
}

/**
 * Create a bullet point list item
 */
function createBulletPoint(text: string, level: number = 0): Paragraph {
  return new Paragraph({
    text: text,
    bullet: {
      level: level,
    },
    spacing: {
      before: 60,
      after: 60,
    },
  });
}

/**
 * Create a warning/alert text box
 */
function createAlertBox(text: string, title?: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `⚠ ${title.toUpperCase()} ⚠`,
            bold: true,
            color: COLORS.ALERT_RED,
            size: 28,
          }),
        ],
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
          bottom: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
          left: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
          right: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
        },
        shading: {
          type: ShadingType.CLEAR,
          fill: 'FFF0F0',
        },
        spacing: {
          before: 120,
          after: 60,
        },
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text,
          color: COLORS.ALERT_RED,
          bold: true,
        }),
      ],
      border: {
        top: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
        bottom: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
        left: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
        right: { style: BorderStyle.SINGLE, size: 3, color: COLORS.ALERT_RED },
      },
      shading: {
        type: ShadingType.CLEAR,
        fill: 'FFF0F0',
      },
      spacing: {
        before: title ? 0 : 120,
        after: 120,
      },
    })
  );

  return paragraphs;
}

/**
 * Create a simple table
 */
function createTable(
  headers: string[],
  rows: string[][],
  columnWidths?: number[]
): Table {
  const headerCells = headers.map((header, index) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: header,
              bold: true,
              color: 'FFFFFF',
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      ],
      shading: {
        type: ShadingType.CLEAR,
        fill: COLORS.PRIMARY,
      },
      verticalAlign: VerticalAlign.CENTER,
      width: columnWidths?.[index]
        ? { size: columnWidths[index], type: WidthType.PERCENTAGE }
        : undefined,
    })
  );

  const tableRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, index) =>
            new TableCell({
              children: [
                new Paragraph({
                  text: cell,
                  alignment: index === row.length - 1 && cell.includes('$')
                    ? AlignmentType.RIGHT
                    : AlignmentType.LEFT,
                }),
              ],
              width: columnWidths?.[index]
                ? { size: columnWidths[index], type: WidthType.PERCENTAGE }
                : undefined,
            })
        ),
      })
  );

  return new Table({
    rows: [new TableRow({ children: headerCells }), ...tableRows],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_GRAY },
    },
  });
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

/**
 * Create watermark paragraph
 */
function createWatermark(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text,
        color: 'DDDDDD',
        size: 72,
        bold: true,
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: {
      before: 2400,
      after: 2400,
    },
  });
}

// ============================================================================
// INSPECTION REPORT EXPORT
// ============================================================================

/**
 * Export Inspection Report to DOCX
 */
export async function exportInspectionReportToDOCX(
  data: InspectionReportData,
  generatedReport: string
): Promise<Buffer> {
  const sections: (Paragraph | Table | TableOfContents)[] = [];

  // Cover Page
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'WATER DAMAGE INSPECTION REPORT',
          bold: true,
          size: 48,
          color: COLORS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 1200 },
    })
  );

  sections.push(
    createWatermark('PRELIMINARY ASSESSMENT - NOT FINAL ESTIMATE')
  );

  sections.push(
    createParagraph(`Property: ${data.property.propertyAddress}`, {
      bold: true,
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Client: ${data.property.clientName}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Date of Inspection: ${data.property.dateOfInspection}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  // Page Break
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Table of Contents
  sections.push(
    createHeading('TABLE OF CONTENTS', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  sections.push(
    new TableOfContents('Table of Contents', {
      hyperlink: true,
      headingStyleRange: '1-3',
    })
  );

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Property Information Section
  sections.push(
    createHeading('PROPERTY INFORMATION', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  const propertyInfoTable = createTable(
    ['Field', 'Details'],
    [
      ['Client Name', data.property.clientName],
      ['Property Address', data.property.propertyAddress],
      ['Date of Loss', data.property.dateOfLoss],
      ['Date of Inspection', data.property.dateOfInspection],
      ['Source of Water', data.property.lossSource],
      ['Timeline to Discovery', data.property.timelineToDiscovery || 'Not specified'],
      ['Property Type', data.property.propertyType || 'Residential'],
      ['Occupancy Status', data.property.occupancyStatus || 'Owner-occupied'],
      ['Structure Type', data.property.structureType || 'Standard timber frame'],
      ['Construction Year', data.property.constructionYear || 'Not specified'],
    ],
    [40, 60]
  );

  sections.push(propertyInfoTable);

  // Areas Affected
  sections.push(
    createHeading('AREAS AFFECTED', HeadingLevel.HEADING_2)
  );

  data.techReport.areasAffected.forEach((area) => {
    sections.push(createBulletPoint(area));
  });

  // Water Classification
  sections.push(
    createHeading('WATER CLASSIFICATION', HeadingLevel.HEADING_2)
  );

  const classificationTable = createTable(
    ['Classification', 'Result'],
    [
      ['Water Category', data.responses.waterCategory],
      ['Water Class', data.responses.waterClass],
    ],
    [50, 50]
  );

  sections.push(classificationTable);

  // Hazard Flags
  if (data.responses.hazardFlags.length > 0 || data.responses.stopWorkConditions) {
    sections.push(
      createHeading('HAZARD ASSESSMENT', HeadingLevel.HEADING_2)
    );

    if (data.responses.stopWorkConditions) {
      sections.push(
        ...createAlertBox(
          'STOP WORK CONDITION ACTIVE - Site requires specialist assessment before resuming work',
          'CRITICAL ALERT'
        )
      );
    }

    if (data.responses.hazardFlags.length > 0) {
      sections.push(createParagraph('Identified Hazards:', { bold: true }));
      data.responses.hazardFlags.forEach((hazard) => {
        sections.push(createBulletPoint(hazard));
      });
    }

    if (data.responses.electricalHazards) {
      sections.push(createParagraph('Electrical Hazards:', { bold: true }));
      sections.push(createParagraph(data.responses.electricalHazards));
    }
  }

  // Equipment Deployed
  if (data.equipment) {
    sections.push(
      createHeading('EQUIPMENT DEPLOYED', HeadingLevel.HEADING_2)
    );

    if (data.equipment.dehumidifiers.length > 0) {
      sections.push(createParagraph('Dehumidifiers:', { bold: true }));
      data.equipment.dehumidifiers.forEach((dehum) => {
        sections.push(
          createBulletPoint(`${dehum.type}: ${dehum.quantity} units (${dehum.capacity})`)
        );
      });
    }

    if (data.equipment.airMovers.length > 0) {
      sections.push(createParagraph('Air Movers:', { bold: true }));
      data.equipment.airMovers.forEach((mover) => {
        sections.push(
          createBulletPoint(`${mover.type}: ${mover.quantity} units (${mover.cfm})`)
        );
      });
    }

    if (data.equipment.extractionUnits.length > 0) {
      sections.push(createParagraph('Extraction Units:', { bold: true }));
      data.equipment.extractionUnits.forEach((extraction) => {
        sections.push(
          createBulletPoint(`${extraction.type}: ${extraction.quantity} units`)
        );
      });
    }

    if (data.equipment.afdUnits.length > 0) {
      sections.push(createParagraph('Air Filtration Devices (AFDs):', { bold: true }));
      data.equipment.afdUnits.forEach((afd) => {
        sections.push(
          createBulletPoint(`${afd.type}: ${afd.quantity} units (${afd.cfm})`)
        );
      });
    }
  }

  // Recommendations
  sections.push(
    createHeading('RECOMMENDATIONS & NEXT STEPS', HeadingLevel.HEADING_2)
  );

  sections.push(
    createBulletPoint('Continue drying protocol as per IICRC S500 standards')
  );
  sections.push(
    createBulletPoint('Daily monitoring of moisture levels and psychrometric readings')
  );
  sections.push(
    createBulletPoint('Follow-up inspection upon completion of drying process')
  );
  sections.push(
    createBulletPoint('Validation testing required before restoration work commences')
  );

  // Authority Notifications
  if (data.responses.authorityNotifications.length > 0) {
    sections.push(
      createHeading('AUTHORITY NOTIFICATIONS REQUIRED', HeadingLevel.HEADING_2)
    );

    data.responses.authorityNotifications.forEach((authority) => {
      sections.push(createBulletPoint(authority));
    });
  }

  // Create Document
  const doc = new Document({
    creator: 'RestoreAssist',
    title: 'Water Damage Inspection Report',
    description: `Inspection report for ${data.property.propertyAddress}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'RestoreAssist - Water Damage Inspection Report',
                    color: COLORS.SECONDARY,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Page ',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                  }),
                  new TextRun({
                    text: ' of ',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// ============================================================================
// SCOPE OF WORKS EXPORT
// ============================================================================

/**
 * Export Scope of Works to DOCX
 */
export async function exportScopeOfWorksToDOCX(
  data: ScopeOfWorksData,
  generatedScope: string
): Promise<Buffer> {
  const sections: (Paragraph | Table)[] = [];

  // Cover Page
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'SCOPE OF WORKS',
          bold: true,
          size: 48,
          color: COLORS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 1200 },
    })
  );

  sections.push(
    createParagraph(`Water Damage Restoration Project`, {
      bold: true,
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Property: ${data.inspectionReport.property.propertyAddress}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Project Overview
  sections.push(
    createHeading('PROJECT OVERVIEW', HeadingLevel.HEADING_1)
  );

  const projectInfoTable = createTable(
    ['Field', 'Details'],
    [
      ['Client', data.inspectionReport.property.clientName],
      ['Property Address', data.inspectionReport.property.propertyAddress],
      ['Loss Date', data.inspectionReport.property.dateOfLoss],
      ['Loss Source', data.inspectionReport.property.lossSource],
      ['Water Category', data.inspectionReport.responses.waterCategory],
      ['Water Class', data.inspectionReport.responses.waterClass],
    ],
    [40, 60]
  );

  sections.push(projectInfoTable);

  // Timeline
  sections.push(
    createHeading('PROJECT TIMELINE', HeadingLevel.HEADING_2)
  );

  const totalDays =
    data.timeline.emergencyResponseDays +
    data.timeline.dryingDays +
    data.timeline.validationDays +
    data.timeline.licensedTradesDays +
    data.timeline.contentsDays;

  const timelineTable = createTable(
    ['Phase', 'Duration (Days)'],
    [
      ['Phase 1 - Emergency Response', data.timeline.emergencyResponseDays.toString()],
      ['Phase 2 - Drying', data.timeline.dryingDays.toString()],
      ['Phase 3 - Validation', data.timeline.validationDays.toString()],
      ['Phase 4 - Licensed Trades', data.timeline.licensedTradesDays.toString()],
      ['Phase 5 - Contents', data.timeline.contentsDays.toString()],
      ['TOTAL PROJECT DURATION', totalDays.toString()],
    ],
    [70, 30]
  );

  sections.push(timelineTable);

  // Equipment Schedule
  sections.push(
    createHeading('EQUIPMENT SCHEDULE', HeadingLevel.HEADING_2)
  );

  const equipmentRows: string[][] = [];

  data.equipment.dehumidifiers.forEach((dehum) => {
    equipmentRows.push(['Dehumidifier', dehum.type, `${dehum.quantity}`, dehum.capacity]);
  });

  data.equipment.airMovers.forEach((mover) => {
    equipmentRows.push(['Air Mover', mover.type, `${mover.quantity}`, mover.cfm]);
  });

  data.equipment.afdUnits.forEach((afd) => {
    equipmentRows.push(['AFD Unit', afd.type, `${afd.quantity}`, afd.cfm]);
  });

  data.equipment.extractionUnits.forEach((extraction) => {
    equipmentRows.push(['Extraction Unit', extraction.type, `${extraction.quantity}`, '-']);
  });

  const equipmentTable = createTable(
    ['Category', 'Type', 'Quantity', 'Specification'],
    equipmentRows,
    [25, 35, 20, 20]
  );

  sections.push(equipmentTable);

  // Licensed Trades Section
  sections.push(
    createHeading('LICENSED TRADES REQUIRED', HeadingLevel.HEADING_2)
  );

  sections.push(
    createParagraph(
      'The following licensed trades are required for this restoration project. All trades must hold valid QBCC licensing.',
      { italics: true }
    )
  );

  const tradeEntries = Object.entries(data.licensedTrades).filter(([_, details]) => details);

  if (tradeEntries.length > 0) {
    const tradeRows: string[][] = tradeEntries.map(([trade, details]) => [
      trade.charAt(0).toUpperCase() + trade.slice(1).replace(/([A-Z])/g, ' $1').trim(),
      details!.scope,
      details!.estimated ? 'Quote Required' : 'Scope Confirmed',
    ]);

    const tradesTable = createTable(
      ['Trade', 'Scope', 'Status'],
      tradeRows,
      [25, 55, 20]
    );

    sections.push(tradesTable);
  } else {
    sections.push(createParagraph('No licensed trades required at this stage.'));
  }

  // Insurance Breakdown
  sections.push(
    createHeading('INSURANCE CLAIM BREAKDOWN', HeadingLevel.HEADING_2)
  );

  const insuranceTable = createTable(
    ['Claim Component', 'Applicable'],
    [
      ['Building Claim', data.insuranceBreakdown.buildingClaim ? 'Yes' : 'No'],
      ['Contents Claim', data.insuranceBreakdown.contentsClaim ? 'Yes' : 'No'],
      ['Temporary Accommodation', data.insuranceBreakdown.tempAccommodation ? 'Yes' : 'No'],
      ['Business Interruption', data.insuranceBreakdown.businessInterruption ? 'Yes' : 'No'],
    ],
    [70, 30]
  );

  sections.push(insuranceTable);

  // Coordination Notes
  sections.push(
    createHeading('COORDINATION NOTES', HeadingLevel.HEADING_2)
  );

  sections.push(
    createBulletPoint('Daily progress reporting to client and insurer')
  );
  sections.push(
    createBulletPoint('Coordination of licensed trades upon completion of drying phase')
  );
  sections.push(
    createBulletPoint('Documentation and photographic evidence throughout project')
  );
  sections.push(
    createBulletPoint('Compliance with IICRC S500 standards and Australian building codes')
  );
  sections.push(
    createBulletPoint('Change order management and approval process')
  );

  // Exclusions
  sections.push(
    createHeading('EXCLUSIONS', HeadingLevel.HEADING_2)
  );

  sections.push(
    createBulletPoint('Work beyond water damage restoration')
  );
  sections.push(
    createBulletPoint('Pre-existing conditions or defects')
  );
  sections.push(
    createBulletPoint('Upgrading to current building code (unless required)')
  );
  sections.push(
    createBulletPoint('Asbestos removal (specialist required if identified)')
  );
  sections.push(
    createBulletPoint('Structural engineering certification')
  );
  sections.push(
    createBulletPoint('Work not approved by insurer')
  );

  // Create Document
  const doc = new Document({
    creator: 'RestoreAssist',
    title: 'Scope of Works - Water Damage Restoration',
    description: `Scope of Works for ${data.inspectionReport.property.propertyAddress}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'RestoreAssist - Scope of Works',
                    color: COLORS.SECONDARY,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Page ',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                  }),
                  new TextRun({
                    text: ' of ',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// ============================================================================
// COST ESTIMATION EXPORT
// ============================================================================

/**
 * Export Cost Estimation to DOCX
 */
export async function exportCostEstimationToDOCX(
  result: CostEstimationResult,
  propertyAddress: string,
  clientName: string
): Promise<Buffer> {
  const sections: (Paragraph | Table)[] = [];

  // Cover Page
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'COST ESTIMATION',
          bold: true,
          size: 48,
          color: COLORS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 1200 },
    })
  );

  sections.push(
    createParagraph(`Water Damage Restoration`, {
      bold: true,
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Property: ${propertyAddress}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Client: ${clientName}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Cost Summary Overview
  sections.push(
    createHeading('COST SUMMARY OVERVIEW', HeadingLevel.HEADING_1)
  );

  const gstRate = (result.gst.gstRate * 100).toFixed(0);

  const summaryRows: string[][] = [
    ['Labour', formatCurrency(result.labour.totalCost), formatCurrency(result.labour.totalCost * result.gst.gstRate), formatCurrency(result.labour.totalCost * (1 + result.gst.gstRate))],
    ['Equipment Rental', formatCurrency(result.equipment.totalCost), formatCurrency(result.equipment.totalCost * result.gst.gstRate), formatCurrency(result.equipment.totalCost * (1 + result.gst.gstRate))],
    ['Chemical Treatments', formatCurrency(result.chemicals.totalCost), formatCurrency(result.chemicals.totalCost * result.gst.gstRate), formatCurrency(result.chemicals.totalCost * (1 + result.gst.gstRate))],
    ['Fees & Administration', formatCurrency(result.fees.totalFees), formatCurrency(result.fees.totalFees * result.gst.gstRate), formatCurrency(result.fees.totalFees * (1 + result.gst.gstRate))],
  ];

  if (result.modifiers.totalAdjustment !== 0) {
    summaryRows.push([
      'Adjustments & Modifiers',
      formatCurrency(result.modifiers.totalAdjustment),
      formatCurrency(result.modifiers.totalAdjustment * result.gst.gstRate),
      formatCurrency(result.modifiers.totalAdjustment * (1 + result.gst.gstRate)),
    ]);
  }

  summaryRows.push([
    'TOTAL',
    formatCurrency(result.adjustedSubtotal),
    formatCurrency(result.gst.gst),
    formatCurrency(result.grandTotal),
  ]);

  const summaryTable = createTable(
    ['Category', 'Ex-GST', `GST (${gstRate}%)`, 'Inc-GST'],
    summaryRows,
    [40, 20, 20, 20]
  );

  sections.push(summaryTable);

  // Labour Breakdown
  sections.push(
    createHeading('DETAILED LABOUR BREAKDOWN', HeadingLevel.HEADING_2)
  );

  const labourRows: string[][] = [];

  if (result.labour.masterTechnician.totalHours > 0) {
    if (result.labour.masterTechnician.normalHours > 0) {
      labourRows.push([
        'Master Technician (Normal Hours)',
        `${result.labour.masterTechnician.normalHours} hrs`,
        formatCurrency(result.labour.masterTechnician.normalCost),
      ]);
    }
    if (result.labour.masterTechnician.afterHoursWeekday > 0) {
      labourRows.push([
        'Master Technician (After-Hours Weekday)',
        `${result.labour.masterTechnician.afterHoursWeekday} hrs`,
        formatCurrency(result.labour.masterTechnician.afterHoursWeekdayCost),
      ]);
    }
    if (result.labour.masterTechnician.saturday > 0) {
      labourRows.push([
        'Master Technician (Saturday)',
        `${result.labour.masterTechnician.saturday} hrs`,
        formatCurrency(result.labour.masterTechnician.saturdayCost),
      ]);
    }
    if (result.labour.masterTechnician.sunday > 0) {
      labourRows.push([
        'Master Technician (Sunday)',
        `${result.labour.masterTechnician.sunday} hrs`,
        formatCurrency(result.labour.masterTechnician.sundayCost),
      ]);
    }
  }

  if (result.labour.qualifiedTechnician.totalHours > 0) {
    if (result.labour.qualifiedTechnician.normalHours > 0) {
      labourRows.push([
        'Qualified Technician (Normal Hours)',
        `${result.labour.qualifiedTechnician.normalHours} hrs`,
        formatCurrency(result.labour.qualifiedTechnician.normalCost),
      ]);
    }
    if (result.labour.qualifiedTechnician.afterHoursWeekday > 0) {
      labourRows.push([
        'Qualified Technician (After-Hours Weekday)',
        `${result.labour.qualifiedTechnician.afterHoursWeekday} hrs`,
        formatCurrency(result.labour.qualifiedTechnician.afterHoursWeekdayCost),
      ]);
    }
    if (result.labour.qualifiedTechnician.saturday > 0) {
      labourRows.push([
        'Qualified Technician (Saturday)',
        `${result.labour.qualifiedTechnician.saturday} hrs`,
        formatCurrency(result.labour.qualifiedTechnician.saturdayCost),
      ]);
    }
    if (result.labour.qualifiedTechnician.sunday > 0) {
      labourRows.push([
        'Qualified Technician (Sunday)',
        `${result.labour.qualifiedTechnician.sunday} hrs`,
        formatCurrency(result.labour.qualifiedTechnician.sundayCost),
      ]);
    }
  }

  if (result.labour.labourer.totalHours > 0) {
    if (result.labour.labourer.normalHours > 0) {
      labourRows.push([
        'Labourer (Normal Hours)',
        `${result.labour.labourer.normalHours} hrs`,
        formatCurrency(result.labour.labourer.normalCost),
      ]);
    }
    if (result.labour.labourer.afterHoursWeekday > 0) {
      labourRows.push([
        'Labourer (After-Hours Weekday)',
        `${result.labour.labourer.afterHoursWeekday} hrs`,
        formatCurrency(result.labour.labourer.afterHoursWeekdayCost),
      ]);
    }
    if (result.labour.labourer.saturday > 0) {
      labourRows.push([
        'Labourer (Saturday)',
        `${result.labour.labourer.saturday} hrs`,
        formatCurrency(result.labour.labourer.saturdayCost),
      ]);
    }
    if (result.labour.labourer.sunday > 0) {
      labourRows.push([
        'Labourer (Sunday)',
        `${result.labour.labourer.sunday} hrs`,
        formatCurrency(result.labour.labourer.sundayCost),
      ]);
    }
  }

  labourRows.push(['TOTAL LABOUR', `${result.labour.totalHours} hrs`, formatCurrency(result.labour.totalCost)]);

  const labourTable = createTable(
    ['Description', 'Hours', 'Cost (Ex-GST)'],
    labourRows,
    [50, 25, 25]
  );

  sections.push(labourTable);

  // Equipment Breakdown
  sections.push(
    createHeading('DETAILED EQUIPMENT RENTAL BREAKDOWN', HeadingLevel.HEADING_2)
  );

  const equipmentRows: string[][] = [];

  if (result.equipment.dehumidifiers.large.days > 0) {
    equipmentRows.push([
      'Large Dehumidifier',
      `${result.equipment.dehumidifiers.large.days} days`,
      formatCurrency(result.equipment.dehumidifiers.large.cost),
    ]);
  }

  if (result.equipment.dehumidifiers.medium.days > 0) {
    equipmentRows.push([
      'Medium Dehumidifier',
      `${result.equipment.dehumidifiers.medium.days} days`,
      formatCurrency(result.equipment.dehumidifiers.medium.cost),
    ]);
  }

  if (result.equipment.dehumidifiers.desiccant.days > 0) {
    equipmentRows.push([
      'Desiccant Dehumidifier',
      `${result.equipment.dehumidifiers.desiccant.days} days`,
      formatCurrency(result.equipment.dehumidifiers.desiccant.cost),
    ]);
  }

  if (result.equipment.airMovers.axial.days > 0) {
    equipmentRows.push([
      'Axial Air Mover',
      `${result.equipment.airMovers.axial.days} days`,
      formatCurrency(result.equipment.airMovers.axial.cost),
    ]);
  }

  if (result.equipment.airMovers.centrifugal.days > 0) {
    equipmentRows.push([
      'Centrifugal Air Mover',
      `${result.equipment.airMovers.centrifugal.days} days`,
      formatCurrency(result.equipment.airMovers.centrifugal.cost),
    ]);
  }

  if (result.equipment.airMovers.layflat.days > 0) {
    equipmentRows.push([
      'Layflat Air Mover',
      `${result.equipment.airMovers.layflat.days} days`,
      formatCurrency(result.equipment.airMovers.layflat.cost),
    ]);
  }

  if (result.equipment.afd.extraLarge.days > 0) {
    equipmentRows.push([
      'Extra Large AFD',
      `${result.equipment.afd.extraLarge.days} days`,
      formatCurrency(result.equipment.afd.extraLarge.cost),
    ]);
  }

  if (result.equipment.afd.large500cfm.days > 0) {
    equipmentRows.push([
      'Large AFD (500 CFM)',
      `${result.equipment.afd.large500cfm.days} days`,
      formatCurrency(result.equipment.afd.large500cfm.cost),
    ]);
  }

  if (result.equipment.extraction.truckMounted.hours > 0) {
    equipmentRows.push([
      'Truck-Mounted Extraction',
      `${result.equipment.extraction.truckMounted.hours} hrs`,
      formatCurrency(result.equipment.extraction.truckMounted.cost),
    ]);
  }

  if (result.equipment.extraction.electric.hours > 0) {
    equipmentRows.push([
      'Electric Extraction',
      `${result.equipment.extraction.electric.hours} hrs`,
      formatCurrency(result.equipment.extraction.electric.cost),
    ]);
  }

  if (result.equipment.thermalCamera.used) {
    equipmentRows.push([
      'Thermal Camera',
      'Included',
      formatCurrency(result.equipment.thermalCamera.cost),
    ]);
  }

  equipmentRows.push(['TOTAL EQUIPMENT', '-', formatCurrency(result.equipment.totalCost)]);

  const equipmentTable = createTable(
    ['Equipment', 'Duration/Quantity', 'Cost (Ex-GST)'],
    equipmentRows,
    [50, 25, 25]
  );

  sections.push(equipmentTable);

  // Chemical Treatments
  if (result.chemicals.totalCost > 0) {
    sections.push(
      createHeading('CHEMICAL TREATMENT COSTS', HeadingLevel.HEADING_2)
    );

    const chemicalRows: string[][] = [];

    if (result.chemicals.antiMicrobial.sqm > 0) {
      chemicalRows.push([
        'Anti-Microbial Treatment',
        `${result.chemicals.antiMicrobial.sqm} sqm`,
        formatCurrency(result.chemicals.antiMicrobial.cost),
      ]);
    }

    if (result.chemicals.mouldRemediation.sqm > 0) {
      chemicalRows.push([
        'Mould Remediation',
        `${result.chemicals.mouldRemediation.sqm} sqm`,
        formatCurrency(result.chemicals.mouldRemediation.cost),
      ]);
    }

    if (result.chemicals.bioHazard.sqm > 0) {
      chemicalRows.push([
        'Bio-Hazard Treatment',
        `${result.chemicals.bioHazard.sqm} sqm`,
        formatCurrency(result.chemicals.bioHazard.cost),
      ]);
    }

    chemicalRows.push([
      'TOTAL CHEMICALS',
      `${result.chemicals.totalSqm} sqm`,
      formatCurrency(result.chemicals.totalCost),
    ]);

    const chemicalTable = createTable(
      ['Treatment', 'Area', 'Cost (Ex-GST)'],
      chemicalRows,
      [50, 25, 25]
    );

    sections.push(chemicalTable);
  }

  // Industry Comparison
  if (result.benchmarks.length > 0) {
    sections.push(
      createHeading('INDUSTRY COMPARISON', HeadingLevel.HEADING_2)
    );

    const benchmarkRows: string[][] = result.benchmarks.map((benchmark) => [
      benchmark.category,
      formatCurrency(benchmark.yourCost),
      formatCurrency(benchmark.industryAverage),
      `${benchmark.variancePercentage > 0 ? '+' : ''}${benchmark.variancePercentage}%`,
      benchmark.status.toUpperCase(),
    ]);

    const benchmarkTable = createTable(
      ['Category', 'Your Cost', 'Industry Average', 'Variance', 'Status'],
      benchmarkRows,
      [30, 20, 20, 15, 15]
    );

    sections.push(benchmarkTable);
  }

  // Exclusions
  sections.push(
    createHeading('EXCLUSIONS FROM COST BREAKDOWN', HeadingLevel.HEADING_2)
  );

  sections.push(createBulletPoint('Pre-existing damage or defects'));
  sections.push(createBulletPoint('Asbestos removal (separate specialist quote required if identified)'));
  sections.push(createBulletPoint('Structural engineering certification'));
  sections.push(createBulletPoint('Mould remediation beyond preventive treatment'));
  sections.push(createBulletPoint('Contents restoration (if separate claim)'));
  sections.push(createBulletPoint('Upgrades beyond like-for-like restoration'));
  sections.push(createBulletPoint('Work not approved by insurer'));

  // Assumptions
  sections.push(
    createHeading('ASSUMPTIONS AFFECTING COST', HeadingLevel.HEADING_2)
  );

  sections.push(createBulletPoint('Access to property maintained throughout project'));
  sections.push(createBulletPoint('Power and water available on site'));
  sections.push(createBulletPoint('Standard working hours (with specified after-hours work)'));
  sections.push(createBulletPoint('Weather permits outdoor equipment operation'));
  sections.push(createBulletPoint('No concealed damages discovered during demolition'));
  sections.push(createBulletPoint('Insurance approval obtained before commencement'));
  sections.push(createBulletPoint('Licensed trades available within specified timeline'));

  // Disclaimer
  sections.push(
    createHeading('DISCLAIMER', HeadingLevel.HEADING_2)
  );

  sections.push(
    createParagraph(
      'This estimate is based on visual inspection only and represents the best assessment of costs at the time of preparation. Concealed damages may alter the final cost. All costs are subject to insurer approval. RestoreAssist reserves the right to adjust pricing if the scope of work changes. The final invoice will be based on actual work performed and materials used. All work will be completed in compliance with IICRC S500 standards and Australian National Construction Code (NCC) requirements.',
      { italics: true }
    )
  );

  // Create Document
  const doc = new Document({
    creator: 'RestoreAssist',
    title: 'Cost Estimation - Water Damage Restoration',
    description: `Cost Estimation for ${propertyAddress}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'RestoreAssist - Cost Estimation',
                    color: COLORS.SECONDARY,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Page ',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                  }),
                  new TextRun({
                    text: ' of ',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// ============================================================================
// COMPLETE PACKAGE EXPORT
// ============================================================================

/**
 * Export Complete Package to DOCX (all sections combined)
 */
export async function exportCompletePackageToDOCX(
  inspectionData: InspectionReportData,
  scopeData: ScopeOfWorksData,
  costResult: CostEstimationResult
): Promise<Buffer> {
  const sections: (Paragraph | Table)[] = [];

  // Main Cover Page
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'COMPLETE RESTORATION PACKAGE',
          bold: true,
          size: 52,
          color: COLORS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 1200 },
    })
  );

  sections.push(
    createWatermark('PRELIMINARY ASSESSMENT - NOT FINAL ESTIMATE')
  );

  sections.push(
    createParagraph(`Water Damage Restoration Documentation`, {
      bold: true,
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Property: ${inspectionData.property.propertyAddress}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Client: ${inspectionData.property.clientName}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(
    createParagraph(`Date: ${inspectionData.property.dateOfInspection}`, {
      alignment: AlignmentType.CENTER,
    })
  );

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Package Contents
  sections.push(
    createHeading('PACKAGE CONTENTS', HeadingLevel.HEADING_1)
  );

  sections.push(createBulletPoint('Section 1: Inspection Report'));
  sections.push(createBulletPoint('Section 2: Scope of Works'));
  sections.push(createBulletPoint('Section 3: Cost Estimation'));

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Section 1: Inspection Report Summary
  sections.push(
    createHeading('SECTION 1: INSPECTION REPORT', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  sections.push(
    createHeading('Property Information', HeadingLevel.HEADING_2)
  );

  const propertyInfoTable = createTable(
    ['Field', 'Details'],
    [
      ['Client Name', inspectionData.property.clientName],
      ['Property Address', inspectionData.property.propertyAddress],
      ['Date of Loss', inspectionData.property.dateOfLoss],
      ['Date of Inspection', inspectionData.property.dateOfInspection],
      ['Source of Water', inspectionData.property.lossSource],
      ['Water Category', inspectionData.responses.waterCategory],
      ['Water Class', inspectionData.responses.waterClass],
    ],
    [40, 60]
  );

  sections.push(propertyInfoTable);

  sections.push(
    createHeading('Areas Affected', HeadingLevel.HEADING_2)
  );

  inspectionData.techReport.areasAffected.forEach((area) => {
    sections.push(createBulletPoint(area));
  });

  if (inspectionData.responses.hazardFlags.length > 0) {
    sections.push(
      createHeading('Hazard Assessment', HeadingLevel.HEADING_2)
    );

    if (inspectionData.responses.stopWorkConditions) {
      sections.push(
        ...createAlertBox(
          'STOP WORK CONDITION ACTIVE - Site requires specialist assessment',
          'CRITICAL ALERT'
        )
      );
    }

    inspectionData.responses.hazardFlags.forEach((hazard) => {
      sections.push(createBulletPoint(hazard));
    });
  }

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Section 2: Scope of Works Summary
  sections.push(
    createHeading('SECTION 2: SCOPE OF WORKS', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  sections.push(
    createHeading('Project Timeline', HeadingLevel.HEADING_2)
  );

  const totalDays =
    scopeData.timeline.emergencyResponseDays +
    scopeData.timeline.dryingDays +
    scopeData.timeline.validationDays +
    scopeData.timeline.licensedTradesDays +
    scopeData.timeline.contentsDays;

  const timelineTable = createTable(
    ['Phase', 'Duration (Days)'],
    [
      ['Emergency Response', scopeData.timeline.emergencyResponseDays.toString()],
      ['Drying', scopeData.timeline.dryingDays.toString()],
      ['Validation', scopeData.timeline.validationDays.toString()],
      ['Licensed Trades', scopeData.timeline.licensedTradesDays.toString()],
      ['Contents', scopeData.timeline.contentsDays.toString()],
      ['TOTAL', totalDays.toString()],
    ],
    [70, 30]
  );

  sections.push(timelineTable);

  sections.push(
    createHeading('Licensed Trades Required', HeadingLevel.HEADING_2)
  );

  const tradeEntries = Object.entries(scopeData.licensedTrades).filter(([_, details]) => details);

  if (tradeEntries.length > 0) {
    tradeEntries.forEach(([trade, details]) => {
      sections.push(
        createBulletPoint(
          `${trade.charAt(0).toUpperCase() + trade.slice(1).replace(/([A-Z])/g, ' $1').trim()}: ${details!.scope}`
        )
      );
    });
  } else {
    sections.push(createParagraph('No licensed trades required at this stage.'));
  }

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Section 3: Cost Estimation Summary
  sections.push(
    createHeading('SECTION 3: COST ESTIMATION', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  const gstRate = (costResult.gst.gstRate * 100).toFixed(0);

  const summaryRows: string[][] = [
    ['Labour', formatCurrency(costResult.labour.totalCost)],
    ['Equipment Rental', formatCurrency(costResult.equipment.totalCost)],
    ['Chemical Treatments', formatCurrency(costResult.chemicals.totalCost)],
    ['Fees & Administration', formatCurrency(costResult.fees.totalFees)],
  ];

  if (costResult.modifiers.totalAdjustment !== 0) {
    summaryRows.push([
      'Adjustments & Modifiers',
      formatCurrency(costResult.modifiers.totalAdjustment),
    ]);
  }

  summaryRows.push(['Subtotal (Ex-GST)', formatCurrency(costResult.adjustedSubtotal)]);
  summaryRows.push([`GST (${gstRate}%)`, formatCurrency(costResult.gst.gst)]);
  summaryRows.push(['TOTAL (Inc-GST)', formatCurrency(costResult.grandTotal)]);

  const summaryTable = createTable(
    ['Cost Component', 'Amount (AUD)'],
    summaryRows,
    [70, 30]
  );

  sections.push(summaryTable);

  sections.push(
    createHeading('Cost Summary', HeadingLevel.HEADING_2)
  );

  sections.push(
    createParagraph(
      `Total Project Cost: ${formatCurrency(costResult.grandTotal)} (inc. GST)`,
      { bold: true }
    )
  );

  sections.push(
    createParagraph(
      `Estimated Duration: ${totalDays} days`,
      { bold: true }
    )
  );

  sections.push(
    createParagraph(
      `Average Cost per Day: ${formatCurrency(costResult.summary.costPerDay)}`,
      { bold: true }
    )
  );

  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // Final Notes
  sections.push(
    createHeading('IMPORTANT NOTES', HeadingLevel.HEADING_1, {
      pageBreakBefore: false,
    })
  );

  sections.push(
    createParagraph(
      'This complete package provides a comprehensive overview of the water damage restoration project. All work will be completed in accordance with IICRC S500 standards and Australian building regulations.',
      { bold: true }
    )
  );

  sections.push(
    createHeading('Next Steps', HeadingLevel.HEADING_2)
  );

  sections.push(createBulletPoint('Review and approval from client'));
  sections.push(createBulletPoint('Insurance claim submission and approval'));
  sections.push(createBulletPoint('Scheduling of restoration work'));
  sections.push(createBulletPoint('Coordination with licensed trades'));
  sections.push(createBulletPoint('Project commencement upon all approvals'));

  // Create Document
  const doc = new Document({
    creator: 'RestoreAssist',
    title: 'Complete Restoration Package',
    description: `Complete documentation for ${inspectionData.property.propertyAddress}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'RestoreAssist - Complete Restoration Package',
                    color: COLORS.SECONDARY,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Page ',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                  }),
                  new TextRun({
                    text: ' of ',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: sections,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
