import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InspectionStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateNIRPDF,
  type NirFloorPlanStatus,
  type NirReportInspectionData,
} from "@/lib/nir-report-generation";
import { generateVerificationChecklist } from "@/lib/nir-verification-checklist";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertInspectionReadable,
  resolveInspectionFinancialReach,
} from "@/lib/auth/assert-tenancy";
import { resolveAreaSqm } from "@/lib/units";
import { claimSketchesToFloors } from "@/lib/reports/claim-sketch-floors";
import { appendSketchPages } from "@/lib/reports/append-sketch-pages";
import { appendPhotoPages } from "@/lib/reports/append-photo-pages";
import {
  photoOwnerFolders,
  prepareReportPhotos,
} from "@/lib/reports/inspection-photos-to-images";
import { reportError } from "@/lib/observability";
import {
  WORKSPACE_OWNER_SELECT,
  workspaceBusiness,
} from "@/lib/reports/workspace-business";
import type { SketchFloor } from "@/lib/generate-sketch-pdf";

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

const REPORT_READY_STATUSES = new Set<InspectionStatus>([
  InspectionStatus.ESTIMATED,
  InspectionStatus.SUBMITTED,
  InspectionStatus.COMPLETED,
]);

// The PDF now downloads the inspection's photos, so the ceiling is set here
// rather than left to a platform default; the photo stage stops well inside it.
export const maxDuration = 60;

const NIR_PHOTO_LIMIT = 500;
const NIR_PHOTO_DEADLINE_MS = 25_000;
const NIR_PHOTO_FETCH_BUDGET_BYTES = 40 * 1024 * 1024;
const MAX_PDF_BYTES = 60 * 1024 * 1024;

// GET — Generate report in requested format (json | pdf | excel)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "json";

    // D-028 / D-023: the assigned technician reads the report on the job they
    // record. The cost estimate is withheld below unless the caller also has
    // the financial reach.
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const inspection = await prisma.inspection.findFirst({
      where: { id },
      include: {
        // Fields consumed via NirEnvironmentalData cast + Excel handler.
        // (Note: cast type uses *Celsius suffixed names that don't match DB
        // columns — pre-existing issue, not in scope for this refactor.)
        environmentalData: {
          select: {
            id: true,
            ambientTemperature: true,
            humidityLevel: true,
            dewPoint: true,
            airCirculation: true,
            recordedAt: true,
          },
        },
        moistureReadings: {
          select: {
            id: true,
            location: true,
            surfaceType: true,
            moistureLevel: true,
            depth: true,
            recordedAt: true,
          },
        },
        affectedAreas: {
          select: {
            id: true,
            roomZoneId: true,
            affectedAreaSqm: true,
            affectedSquareFootage: true,
            waterSource: true,
            timeSinceLoss: true,
            category: true,
            class: true,
          },
        },
        scopeItems: {
          where: { isSelected: true },
          select: {
            id: true,
            itemType: true,
            description: true,
            quantity: true,
            unit: true,
            justification: true,
            isRequired: true,
            isSelected: true,
          },
        },
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            category: true,
            class: true,
            justification: true,
            standardReference: true,
            confidence: true,
          },
        },
        costEstimates: {
          select: {
            id: true,
            category: true,
            description: true,
            quantity: true,
            unit: true,
            rate: true,
            subtotal: true,
            contingency: true,
            total: true,
          },
        },
        photos: {
          orderBy: { timestamp: "asc" },
          select: {
            id: true,
            url: true,
            location: true,
            timestamp: true,
          },
        },
        claimSketches: {
          orderBy: { floorNumber: "asc" },
          take: 50,
          select: {
            floorNumber: true,
            floorLabel: true,
            renderedPngUrl: true,
            sketchData: true,
            moisturePoints: true,
            underlayReferences: {
              select: { verifiedAt: true, verificationJson: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            inspection: {
              select: {
                sketchUnderlayReferences: {
                  select: {
                    floorNumber: true,
                    verifiedAt: true,
                    verificationJson: true,
                  },
                },
              },
            },
          },
        },
        report: {
          include: {
            user: {
              select: {
                businessName: true,
                businessABN: true,
                businessAddress: true,
                businessPhone: true,
                businessEmail: true,
                // RA-7746: the header names the workspace owner's business.
                ...WORKSPACE_OWNER_SELECT,
              },
            },
          },
        },
      },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    if (!REPORT_READY_STATUSES.has(inspection.status)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Inspection must be review-ready before generating report",
        status: 400,
      });
    }

    // Money (rates, subtotals, totals) goes only to the job's owner or a
    // MANAGER / ADMIN of the organisation (D-023 / RA-7771). Stripped before
    // the JSON, PDF, Excel and checklist builders run: the checklist note
    // quotes the total.
    const financialReach = await resolveInspectionFinancialReach(session);
    const canSeeMoney =
      financialReach.ok &&
      (await prisma.inspection.findFirst({
        where: { id, ...financialReach.data },
        select: { id: true },
      })) !== null;

    // Shape the Prisma result into the typed NirReportInspectionData interface.
    // This single cast is the only place `any` escapes — the rest of the file is typed.
    const data = {
      ...inspection,
      costEstimates: canSeeMoney ? inspection.costEstimates : [],
      report: inspection.report && {
        ...inspection.report,
        user: workspaceBusiness(inspection.report.user),
      },
    } as unknown as NirReportInspectionData;

    switch (format.toLowerCase()) {
      case "pdf":
        return generatePDFReport(data, id);
      case "excel":
        return generateExcelReport(data);
      case "json":
      default:
        return generateJSONReport(data, canSeeMoney);
    }
  } catch (error) {
    return fromException(request, error, { stage: "inspection:report" });
  }
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

function generateJSONReport(
  inspection: NirReportInspectionData,
  canSeeMoney: boolean,
) {
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
          dewPointCelsius:
            inspection.environmentalData.dewPointCelsius ?? undefined,
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
    costEstimate: canSeeMoney
      ? {
          items: inspection.costEstimates,
          subtotal,
          contingency,
          total,
          currency: "AUD",
        }
      : null,
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

// ─── PDF photo pages ──────────────────────────────────────────────────────────

type PhotoDropReason =
  | "query_failed"
  | "prepare_failed"
  | "append_failed"
  | "deadline"
  | "busy"
  | "over_size"
  | "notice_failed"
  | "fetch_budget";

class PhotoStageError extends Error {
  constructor(
    readonly reason: PhotoDropReason,
    readonly original: unknown,
  ) {
    super(reason);
  }
}

// Production runs one instance (.do/app.yaml, enforced by
// scripts/ci/check-release-bootstrap.mjs), so every photo stage shares one
// process's memory. One stage runs at a time; it is held until its work
// settles, not until its response is sent.
let photoStageInFlight: Promise<void> | null = null;

/**
 * Appends the inspection's photos to the finished report. The photo stage
 * never fails the report: on any failure the report gets one notice page
 * counting every photo, and if even that fails, the report goes out as it was.
 * Every such outcome is logged with its own reason. Signing is bound to the
 * folders of the inspection row's owner, never the caller's session.
 */
async function appendInspectionPhotos(
  base: Uint8Array,
  inspection: NirReportInspectionData,
  id: string,
): Promise<Uint8Array> {
  const pageOptions = {
    propertyAddress: inspection.propertyAddress ?? undefined,
    reportNumber: inspection.inspectionNumber ?? inspection.id,
  };
  const log = (
    reason: PhotoDropReason,
    error: unknown,
    extra: Record<string, unknown> = {},
  ) =>
    reportError(error, {
      route: "/api/inspections/[id]/report",
      stage: "inspection:report:photos-dropped",
      inspectionId: id,
      reason,
      ...extra,
    });

  let row;
  try {
    row = await prisma.inspection.findFirst({
      where: { id },
      select: {
        userId: true,
        workspaceId: true,
        user: { select: { organizationId: true } },
        _count: { select: { photos: true } },
        photos: {
          select: {
            id: true,
            inspectionId: true,
            url: true,
            thumbnailUrl: true,
            description: true,
            location: true,
            roomType: true,
            mimeType: true,
          },
          orderBy: { timestamp: "asc" },
          take: NIR_PHOTO_LIMIT,
        },
      },
    });
  } catch (error) {
    log("query_failed", error);
    return base;
  }
  const total = row?._count?.photos ?? 0;
  if (!row || total === 0) return base;
  const photoRow = row;

  const notice = async (
    reason: PhotoDropReason,
    error: unknown,
    extra: Record<string, unknown> = {},
  ): Promise<Uint8Array> => {
    log(reason, error, { photoCount: total, ...extra });
    try {
      return await appendPhotoPages(base, [], {
        ...pageOptions,
        missingCount: total,
      });
    } catch (noticeError) {
      log("notice_failed", noticeError, { photoCount: total });
      return base;
    }
  };

  // The deadline covers waiting for the gate as well as the work itself. When
  // it fires, downloads in flight are aborted and new ones are refused.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("deadline");
    }, NIR_PHOTO_DEADLINE_MS);
  });

  try {
    while (photoStageInFlight) {
      const held = photoStageInFlight;
      const waited = await Promise.race([held.then(() => "free" as const), deadline]);
      if (waited === "deadline") {
        return notice("busy", new Error("another NIR photo stage is running"));
      }
    }

    const budget = budgetedFetch(NIR_PHOTO_FETCH_BUDGET_BYTES, controller.signal);
    const work = (async () => {
      let prepared;
      try {
        prepared = await prepareReportPhotos(photoRow.photos, {
          inspectionId: id,
          ownerFolders: photoOwnerFolders(photoRow),
          totalCount: total,
          fetchImpl: budget.fetch,
        });
      } catch (error) {
        throw new PhotoStageError("prepare_failed", error);
      }
      try {
        const bytes = await appendPhotoPages(base, prepared.photos, {
          ...pageOptions,
          missingCount: prepared.missing,
        });
        return { bytes, missing: prepared.missing };
      } catch (error) {
        throw new PhotoStageError("append_failed", error);
      }
    })();
    const release = () => {
      if (photoStageInFlight === settled) photoStageInFlight = null;
    };
    // Also keeps the work's rejection handled once nothing awaits it.
    const settled: Promise<void> = work.then(release, release);
    photoStageInFlight = settled;

    let outcome: Awaited<typeof work> | "deadline";
    try {
      outcome = await Promise.race([work, deadline]);
    } catch (error) {
      const stage =
        error instanceof PhotoStageError
          ? error
          : new PhotoStageError("prepare_failed", error);
      return notice(stage.reason, stage.original);
    }

    if (outcome === "deadline") {
      return notice(
        "deadline",
        new Error(`photo stage passed ${NIR_PHOTO_DEADLINE_MS} ms`),
      );
    }
    if (outcome.bytes.length > MAX_PDF_BYTES) {
      return notice(
        "over_size",
        new Error(`report with photos is ${outcome.bytes.length} bytes`),
        { pdfBytes: outcome.bytes.length },
      );
    }
    if (budget.tripped()) {
      log(
        "fetch_budget",
        new Error(`photo downloads passed ${NIR_PHOTO_FETCH_BUDGET_BYTES} bytes`),
        { photoCount: total, missingCount: outcome.missing },
      );
    }
    return outcome.bytes;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A fetch for one request's photo stage. It stops downloading once
 * `limitBytes` have been received across that request's photos, and once
 * `stop` aborts. Refused photos get a non-ok response, which the photo helper
 * counts as missing, so memory stays bounded however many photos there are.
 */
function budgetedFetch(limitBytes: number, stop: AbortSignal) {
  let received = 0;
  let tripped = false;
  const refuse = () =>
    new Response(null, {
      status: 507,
      statusText: "Photo download refused",
    });

  const budgeted = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    if (stop.aborted || tripped) return refuse();
    const signal = init?.signal ? AbortSignal.any([init.signal, stop]) : stop;
    const res = await fetch(input, { ...init, signal });
    if (!res.ok || !res.body) return res;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (received + size > limitBytes) {
        tripped = true;
        await reader.cancel().catch(() => {});
        return refuse();
      }
      chunks.push(value);
    }
    received += size;
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  return { fetch: budgeted as typeof fetch, tripped: () => tripped };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function generatePDFReport(
  inspection: NirReportInspectionData,
  id: string,
) {
  const floorPlanOutput = await resolveFloorPlanOutput(inspection);
  let reportData = {
    ...inspection,
    floorPlans: floorPlanOutput.map(({ status }) => status),
  };
  let pdfBuffer: Uint8Array = await generateNIRPDF(reportData);
  const includedFloors: SketchFloor[] = [];
  let embeddingFailure = false;

  for (const output of floorPlanOutput) {
    if (!output.floor) continue;

    try {
      pdfBuffer = await appendSketchPages(pdfBuffer, [output.floor], {
        propertyAddress: inspection.propertyAddress ?? undefined,
        reportNumber: inspection.inspectionNumber ?? inspection.id,
      });
      includedFloors.push(output.floor);
    } catch {
      output.status = {
        ...output.status,
        status: "unavailable",
        reason:
          "The stored image could not be embedded at report generation time.",
      };
      output.floor = null;
      embeddingFailure = true;
    }
  }

  // If an image decoded successfully but could not be embedded, rebuild the
  // narrative pages with the corrected status before appending the known-good
  // floors. The finished report must not claim a floor plan is included when
  // its page is absent.
  if (embeddingFailure) {
    reportData = {
      ...inspection,
      floorPlans: floorPlanOutput.map(({ status }) => status),
    };
    pdfBuffer = await generateNIRPDF(reportData);
    pdfBuffer = await appendSketchPages(pdfBuffer, includedFloors, {
      propertyAddress: inspection.propertyAddress ?? undefined,
      reportNumber: inspection.inspectionNumber ?? inspection.id,
    });
  }

  // Photos go on the final buffer, after any rebuild above, so a rebuild can
  // never discard them.
  pdfBuffer = await appendInspectionPhotos(pdfBuffer, inspection, id);

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="NIR-${inspection.inspectionNumber ?? inspection.id}.pdf"`,
    },
  });
}

interface FloorPlanOutput {
  status: NirFloorPlanStatus;
  floor: SketchFloor | null;
}

async function resolveFloorPlanOutput(
  inspection: NirReportInspectionData,
): Promise<FloorPlanOutput[]> {
  const sketches = [...(inspection.claimSketches ?? [])].sort(
    (a, b) => a.floorNumber - b.floorNumber,
  );

  const sketchOutput = await Promise.all(
    sketches.map(async (sketch): Promise<FloorPlanOutput> => {
      const status: NirFloorPlanStatus = {
        label: sketch.floorLabel,
        source: "rendered_sketch",
        status: "unavailable",
      };

      if (!sketch.renderedPngUrl) {
        return {
          status: {
            ...status,
            reason:
              "No rendered sketch image was available at report generation time.",
          },
          floor: null,
        };
      }

      const [floor] = await claimSketchesToFloors([sketch]);
      return floor
        ? { status: { ...status, status: "included" }, floor }
        : {
            status: {
              ...status,
              reason:
                "The stored image could not be retrieved at report generation time.",
            },
            floor: null,
          };
    }),
  );

  // Legacy uploaded reference artwork is never a report source. Only the
  // underlay-free rendered ClaimSketch floors above qualify.
  return sketchOutput;
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
          dewPointCelsius:
            inspection.environmentalData.dewPointCelsius ?? undefined,
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
    value: checklist.passesMinimumStandard ? "YES" : "NO",
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
        areaSqm: resolveAreaSqm(area),
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
      ? "MEETS MINIMUM NIR STANDARD"
      : "DOES NOT YET MEET MINIMUM NIR STANDARD",
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
      verified: item.verified ? "[X] Yes" : "[ ] No",
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
