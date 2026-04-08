import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateNIRPDF,
  type NirReportInspectionData,
} from "@/lib/nir-report-generation";
import { generateVerificationChecklist } from "@/lib/nir-verification-checklist";

// Dynamic import for ExcelJS to handle cases where it's not installed
let ExcelJS: typeof import("exceljs") | null = null;
try {
  ExcelJS = require("exceljs");
} catch {
  console.warn("ExcelJS not installed. Excel export will use JSON format.");
}

const AU_DATE = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("en-AU") : "—";

const AU_DATETIME = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleString("en-AU") : "—";

// GET — Generate report in requested format (json | pdf | excel)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "json";

    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id },
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: { where: { isSelected: true } },
        classifications: { orderBy: { createdAt: "desc" }, take: 1 },
        costEstimates: true,
        photos: { orderBy: { timestamp: "asc" } },
        report: {
          include: {
            user: {
              select: {
                businessName: true,
                businessABN: true,
                businessAddress: true,
                businessPhone: true,
                businessEmail: true,
              },
            },
          },
        },
      },
    });

    if (!inspection) {
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    }

    if (inspection.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Inspection must be completed before generating report" },
        { status: 400 },
      );
    }

    // Shape the Prisma result into the typed NirReportInspectionData interface.
    // This single cast is the only place `any` escapes — the rest of the file is typed.
    const data = inspection as unknown as NirReportInspectionData;

    switch (format.toLowerCase()) {
      case "pdf":
        return generatePDFReport(data);
      case "excel":
        return generateExcelReport(data);
      case "json":
      default:
        return generateJSONReport(data);
    }
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

function generateJSONReport(inspection: NirReportInspectionData) {
  const checklist = generateVerificationChecklist({
    id: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    status: inspection.status,
    propertyAddress: inspection.propertyAddress,
    propertyPostcode: inspection.propertyPostcode,
    inspectionDate: inspection.inspectionDate,
    completedAt: inspection.completedAt,
    updatedAt: inspection.updatedAt,
    technicianName: inspection.technicianName,
    environmentalData: inspection.environmentalData
      ? {
          ambientTemperatureCelsius:
            inspection.environmentalData.ambientTemperatureCelsius,
          humidityPercent: inspection.environmentalData.humidityPercent,
          dewPointCelsius: inspection.environmentalData.dewPointCelsius ?? undefined,
        }
      : null,
    moistureReadings: inspection.moistureReadings,
    affectedAreas: inspection.affectedAreas,
    classifications: inspection.classifications as any,
    scopeItems: inspection.scopeItems as any,
    costEstimates: inspection.costEstimates.map((c) => ({
      total: c.total,
      category: c.category ?? undefined,
    })),
    photos: inspection.photos,
  });

  const subtotal = inspection.costEstimates.reduce((s, i) => s + i.subtotal, 0);
  const contingency = inspection.costEstimates.reduce(
    (s, i) => s + (i.contingency ?? 0),
    0,
  );
  const total = inspection.costEstimates.reduce((s, i) => s + i.total, 0);

  const report = {
    inspection: {
      id: inspection.id,
      inspectionNumber: inspection.inspectionNumber,
      propertyAddress: inspection.propertyAddress,
      propertyPostcode: inspection.propertyPostcode,
      inspectionDate: inspection.inspectionDate,
      technicianName: inspection.technicianName,
      status: inspection.status,
    },
    environmentalData: inspection.environmentalData
      ? {
          ambientTemperatureCelsius:
            inspection.environmentalData.ambientTemperatureCelsius,
          humidityPercent: inspection.environmentalData.humidityPercent,
          dewPointCelsius: inspection.environmentalData.dewPointCelsius,
          airCirculation: inspection.environmentalData.airCirculation,
        }
      : null,
    moistureReadings: inspection.moistureReadings,
    affectedAreas: inspection.affectedAreas,
    classification: inspection.classifications[0] ?? null,
    scopeItems: inspection.scopeItems,
    costEstimate: {
      items: inspection.costEstimates,
      subtotal,
      contingency,
      total,
      currency: "AUD",
    },
    photos: inspection.photos.map((photo) => ({
      url: photo.url,
      location: photo.location,
      timestamp: photo.timestamp,
      category: photo.category,
    })),
    verificationChecklist: {
      passesMinimumStandard: checklist.passesMinimumStandard,
      items: checklist.items,
      standardsCitations: checklist.standardsCitations,
      supplementaryWarnings: checklist.supplementaryWarnings,
      generatedAt: checklist.generatedAt,
    },
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(report);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function generatePDFReport(inspection: NirReportInspectionData) {
  const pdfBuffer = await generateNIRPDF(inspection);

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber ?? inspection.id}.pdf"`,
    },
  });
}

// ─── EXCEL ────────────────────────────────────────────────────────────────────

async function generateExcelReport(inspection: NirReportInspectionData) {
  const checklist = generateVerificationChecklist({
    id: inspection.id,
    inspectionNumber: inspection.inspectionNumber,
    status: inspection.status,
    propertyAddress: inspection.propertyAddress,
    propertyPostcode: inspection.propertyPostcode,
    inspectionDate: inspection.inspectionDate,
    completedAt: inspection.completedAt,
    updatedAt: inspection.updatedAt,
    technicianName: inspection.technicianName,
    environmentalData: inspection.environmentalData
      ? {
          ambientTemperatureCelsius:
            inspection.environmentalData.ambientTemperatureCelsius,
          humidityPercent: inspection.environmentalData.humidityPercent,
          dewPointCelsius: inspection.environmentalData.dewPointCelsius ?? undefined,
        }
      : null,
    moistureReadings: inspection.moistureReadings,
    affectedAreas: inspection.affectedAreas,
    classifications: inspection.classifications as any,
    scopeItems: inspection.scopeItems as any,
    costEstimates: inspection.costEstimates.map((c) => ({
      total: c.total,
      category: c.category ?? undefined,
    })),
    photos: inspection.photos,
  });

  // Fallback to JSON if ExcelJS is not installed
  if (!ExcelJS) {
    console.warn("ExcelJS not available, returning JSON format");
    return NextResponse.json(
      {
        message: "ExcelJS not installed — returning JSON",
        summary: {
          inspectionNumber: inspection.inspectionNumber,
          propertyAddress: inspection.propertyAddress,
          postcode: inspection.propertyPostcode,
          inspectionDate: AU_DATE(inspection.inspectionDate),
          technician: inspection.technicianName ?? "N/A",
          category: inspection.classifications[0]?.category ?? "N/A",
          class: inspection.classifications[0]?.class ?? "N/A",
          passesMinimumStandard: checklist.passesMinimumStandard,
        },
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber ?? inspection.id}.json"`,
        },
      },
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RestoreAssist";
  workbook.created = new Date();

  // ── Summary sheet ──────────────────────────────────────────────────────────

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 55 },
  ];

  summarySheet.addRow({
    field: "Inspection Number",
    value: inspection.inspectionNumber,
  });
  summarySheet.addRow({
    field: "Property Address",
    value: inspection.propertyAddress,
  });
  summarySheet.addRow({
    field: "Postcode",
    value: inspection.propertyPostcode,
  });
  summarySheet.addRow({
    field: "Inspection Date",
    value: AU_DATE(inspection.inspectionDate),
  });
  summarySheet.addRow({
    field: "Technician",
    value: inspection.technicianName ?? "N/A",
  });
  summarySheet.addRow({ field: "Status", value: inspection.status });
  summarySheet.addRow({
    field: "Meets Min. Standard",
    value: checklist.passesMinimumStandard ? "YES ✓" : "NO ✗",
  });

  if (inspection.classifications.length > 0) {
    const cls = inspection.classifications[0];
    summarySheet.addRow({ field: "Category", value: cls.category });
    summarySheet.addRow({ field: "Class", value: cls.class });
    summarySheet.addRow({ field: "Justification", value: cls.justification });
    summarySheet.addRow({
      field: "Standards Ref.",
      value: cls.clauseRefs?.join("; ") ?? cls.standardReference,
    });
    if (cls.confidence != null) {
      summarySheet.addRow({
        field: "Confidence",
        value: `${Math.round(cls.confidence * 100)}%`,
      });
    }
  }

  // ── Environmental Data sheet (°C) ──────────────────────────────────────────

  if (inspection.environmentalData) {
    const envSheet = workbook.addWorksheet("Environmental Data");
    envSheet.columns = [
      { header: "Parameter", key: "parameter", width: 30 },
      { header: "Value", key: "value", width: 20 },
      { header: "Unit", key: "unit", width: 10 },
    ];

    const env = inspection.environmentalData;
    envSheet.addRow({
      parameter: "Ambient Temperature",
      value: env.ambientTemperatureCelsius,
      unit: "°C",
    });
    envSheet.addRow({
      parameter: "Relative Humidity",
      value: env.humidityPercent,
      unit: "%",
    });
    if (env.dewPointCelsius != null) {
      envSheet.addRow({
        parameter: "Dew Point",
        value: env.dewPointCelsius,
        unit: "°C",
      });
    }
    if (env.airCirculation != null) {
      envSheet.addRow({
        parameter: "Air Circulation",
        value: env.airCirculation ? "Yes" : "No",
        unit: "",
      });
    }
  }

  // ── Moisture Readings sheet ────────────────────────────────────────────────

  if (inspection.moistureReadings.length > 0) {
    const moistureSheet = workbook.addWorksheet("Moisture Readings");
    moistureSheet.columns = [
      { header: "Location", key: "location", width: 25 },
      { header: "Surface Type", key: "surfaceType", width: 20 },
      { header: "Moisture Level %", key: "moistureLevel", width: 18 },
      { header: "Depth", key: "depth", width: 15 },
      { header: "Recorded At", key: "recordedAt", width: 22 },
    ];

    inspection.moistureReadings.forEach((r) => {
      moistureSheet.addRow({
        location: r.location,
        surfaceType: r.surfaceType ?? "—",
        moistureLevel: r.moistureLevel,
        depth: r.depth ?? "—",
        recordedAt: r.recordedAt ? AU_DATETIME(r.recordedAt) : "—",
      });
    });
  }

  // ── Affected Areas sheet (m²) ──────────────────────────────────────────────

  if (inspection.affectedAreas.length > 0) {
    const areasSheet = workbook.addWorksheet("Affected Areas");
    areasSheet.columns = [
      { header: "Room / Zone", key: "roomZone", width: 25 },
      { header: "Area (m²)", key: "areaSqm", width: 15 },
      { header: "Water Source", key: "waterSource", width: 20 },
      { header: "Time Since Loss h", key: "timeSinceLoss", width: 20 },
      { header: "Category", key: "category", width: 12 },
      { header: "Class", key: "class", width: 12 },
    ];

    inspection.affectedAreas.forEach((area) => {
      areasSheet.addRow({
        roomZone: area.roomZoneId,
        areaSqm: area.affectedSquareFootage,
        waterSource: area.waterSource ?? "—",
        timeSinceLoss: area.timeSinceLoss ?? "—",
        category: area.category ?? "N/A",
        class: area.class ?? "N/A",
      });
    });
  }

  // ── Scope Items sheet ──────────────────────────────────────────────────────

  if (inspection.scopeItems.length > 0) {
    const scopeSheet = workbook.addWorksheet("Scope Items");
    scopeSheet.columns = [
      { header: "Item Type", key: "itemType", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Unit", key: "unit", width: 12 },
      { header: "Justification", key: "justification", width: 50 },
      { header: "Standards Ref.", key: "standardReference", width: 30 },
    ];

    inspection.scopeItems.forEach((item) => {
      scopeSheet.addRow({
        itemType: item.itemType ?? "",
        description: item.description,
        quantity: item.quantity ?? "",
        unit: item.unit ?? "",
        justification: item.justification ?? "",
        standardReference: item.standardReference ?? "",
      });
    });
  }

  // ── Cost Estimate sheet (AUD) ──────────────────────────────────────────────

  if (inspection.costEstimates.length > 0) {
    const costSheet = workbook.addWorksheet("Cost Estimate");
    costSheet.columns = [
      { header: "Category", key: "category", width: 20 },
      { header: "Description", key: "description", width: 40 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Unit", key: "unit", width: 12 },
      { header: "Rate (AUD)", key: "rate", width: 14 },
      { header: "Subtotal", key: "subtotal", width: 14 },
      { header: "Contingency", key: "contingency", width: 14 },
      { header: "Total (AUD)", key: "total", width: 14 },
    ];

    inspection.costEstimates.forEach((item) => {
      costSheet.addRow({
        category: item.category ?? "",
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? "",
        rate: item.rate,
        subtotal: item.subtotal,
        contingency: item.contingency ?? 0,
        total: item.total,
      });
    });

    const subtotal = inspection.costEstimates.reduce(
      (s, i) => s + i.subtotal,
      0,
    );
    const contingency = inspection.costEstimates.reduce(
      (s, i) => s + (i.contingency ?? 0),
      0,
    );
    const total = inspection.costEstimates.reduce((s, i) => s + i.total, 0);

    costSheet.addRow({});
    const totalsRow = costSheet.addRow({
      description: "TOTALS (AUD)",
      subtotal,
      contingency,
      total,
    });
    totalsRow.font = { bold: true };
  }

  // ── Verification Checklist sheet ───────────────────────────────────────────

  const checklistSheet = workbook.addWorksheet("Verification Checklist");
  checklistSheet.columns = [
    { header: "Tier", key: "tier", width: 14 },
    { header: "Item", key: "item", width: 50 },
    { header: "Verified", key: "verified", width: 12 },
    { header: "Clause Ref.", key: "clauseRef", width: 22 },
    { header: "Notes", key: "notes", width: 60 },
  ];

  const passRow = checklistSheet.addRow({
    tier: "",
    item: checklist.passesMinimumStandard
      ? "✓ MEETS MINIMUM NIR STANDARD"
      : "✗ DOES NOT YET MEET MINIMUM NIR STANDARD",
    verified: "",
    clauseRef: "",
    notes: "",
  });
  passRow.font = { bold: true };
  passRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: checklist.passesMinimumStandard ? "FFD4EDDA" : "FFF8D7DA",
    },
  };
  checklistSheet.addRow({});

  checklist.items.forEach((item) => {
    checklistSheet.addRow({
      tier: item.tier,
      item: item.item,
      verified: item.verified ? "✓ Yes" : "□ No",
      clauseRef: item.clauseRef ?? "",
      notes: item.notes ?? "",
    });
  });

  if (checklist.supplementaryWarnings.length > 0) {
    checklistSheet.addRow({});
    checklistSheet.addRow({ item: "FOLLOW-UP REQUIRED", notes: "" }).font = {
      bold: true,
    };
    checklist.supplementaryWarnings.forEach((w) => {
      checklistSheet.addRow({ item: "", notes: w });
    });
  }

  // ── IICRC Standards Citations sheet ───────────────────────────────────────
  // NEW — not in v1. Used by insurer audit teams to verify standards compliance.

  const citationsSheet = workbook.addWorksheet("IICRC Standards Citations");
  citationsSheet.columns = [
    { header: "Standard", key: "standard", width: 15 },
    { header: "Clause", key: "clauseRef", width: 22 },
    { header: "Field", key: "field", width: 40 },
    { header: "Status", key: "status", width: 12 },
  ];

  citationsSheet.addRow({
    standard: "IICRC Standards Referenced in this Report",
    clauseRef: "",
    field: "",
    status: "",
  }).font = { bold: true };
  citationsSheet.addRow({});

  checklist.standardsCitations.forEach((c) => {
    const row = citationsSheet.addRow({
      standard: c.standard,
      clauseRef: c.clauseRef,
      field: c.field,
      status: c.status,
    });
    if (c.status === "MISSING") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF3CD" },
      };
    }
  });

  // ── Generate buffer ────────────────────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber ?? inspection.id}.xlsx"`,
    },
  });
}
