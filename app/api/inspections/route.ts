import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { randomBytes } from "crypto";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// GET - Get inspections (optionally filtered by reportId, with pagination and search)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get("reportId");
    const clientId = searchParams.get("clientId");

    if (clientId) {
      // Get pagination parameters
      const page = parseInt(searchParams.get("page") || "1");
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const skip = (page - 1) * limit;

      // Find all reportIds for this client
      const clientReports = await prisma.report.findMany({
        where: { clientId, userId: session.user.id },
        select: { id: true },
      });
      const reportIds = clientReports.map((r: { id: string }) => r.id);

      const where: Prisma.InspectionWhereInput = {
        userId: session.user.id,
        reportId: { in: reportIds },
      };

      const [total, inspections] = await Promise.all([
        prisma.inspection.count({ where }),
        prisma.inspection.findMany({
          where,
          select: {
            id: true,
            inspectionNumber: true,
            propertyAddress: true,
            status: true,
            createdAt: true,
            submittedAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      return NextResponse.json({
        inspections,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    if (reportId) {
      // Note: reportId column doesn't exist, so find by property address instead.
      // RA-1711 — scope the lookup by userId so a probe with a foreign
      // tenant's reportId returns null, not the report's address. Pre-fix
      // the lookup was id-only, leaking propertyAddress + propertyPostcode
      // of any report whose ID an attacker could enumerate.
      const report = await prisma.report.findFirst({
        where: { id: reportId, userId: session.user.id },
        select: { propertyAddress: true, propertyPostcode: true },
      });

      if (report) {
        const inspection = await prisma.inspection.findFirst({
          where: {
            userId: session.user.id,
            propertyAddress: report.propertyAddress,
            ...(report.propertyPostcode
              ? { propertyPostcode: report.propertyPostcode }
              : {}),
          },
          include: {
            environmentalData: true,
            moistureReadings: { take: 500, orderBy: { recordedAt: "desc" } },
            affectedAreas: { take: 100 },
            scopeItems: { take: 500 },
            classifications: { take: 50 },
            costEstimates: { take: 100 },
            photos: { take: 200, orderBy: { timestamp: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        });

        if (inspection) {
          return NextResponse.json({ inspection });
        }
      }

      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // Get pagination parameters
    const cursor = searchParams.get("cursor"); // cursor-based pagination (inspection id)
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100); // Max 100
    const skip = cursor ? 0 : (page - 1) * limit;

    // Get search and filter parameters
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const category = searchParams.get("category"); // e.g. "1", "2", "3"
    const from = searchParams.get("from"); // ISO date string
    const to = searchParams.get("to"); // ISO date string

    // "sort" param: recent | oldest | address (RA-270 friendly names)
    // "sortBy" / "sortOrder" are the legacy low-level params
    const sortParam = searchParams.get("sort");
    let sortBy: string;
    let sortOrder: "asc" | "desc";
    if (sortParam === "oldest") {
      sortBy = "createdAt";
      sortOrder = "asc";
    } else if (sortParam === "address") {
      sortBy = "address";
      sortOrder = "asc";
    } else if (sortParam === "recent" || sortParam) {
      sortBy = "createdAt";
      sortOrder = "desc";
    } else {
      // Legacy sortBy / sortOrder params
      sortBy = searchParams.get("sortBy") || "createdAt";
      sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    }

    // Build where clause
    const where: Prisma.InspectionWhereInput = { userId: session.user.id };

    // Status filter — support "active" alias (not COMPLETED/REJECTED)
    if (status) {
      if (status === "active") {
        where.status = { notIn: ["COMPLETED", "REJECTED"] };
      } else {
        where.status =
          status.toUpperCase() as Prisma.InspectionWhereInput["status"];
      }
    }

    // Search filter (inspection number, property address, technician name)
    if (search && search.trim()) {
      where.OR = [
        { inspectionNumber: { contains: search, mode: "insensitive" } },
        { propertyAddress: { contains: search, mode: "insensitive" } },
        { technicianName: { contains: search, mode: "insensitive" } },
      ];
    }

    // Category filter — filter by InspectionClassification.category
    if (category && category.trim()) {
      where.classifications = {
        some: { category: category.trim() },
      };
    }

    // Date range filter (createdAt)
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          // Include all of the "to" day by setting to end-of-day
          toDate.setHours(23, 59, 59, 999);
          where.createdAt.lte = toDate;
        }
      }
    }

    // Build orderBy clause
    const orderBy: Prisma.InspectionOrderByWithRelationInput = {};
    if (
      sortBy === "createdAt" ||
      sortBy === "submittedAt" ||
      sortBy === "processedAt"
    ) {
      orderBy[sortBy] = sortOrder;
    } else if (sortBy === "address") {
      orderBy.propertyAddress = sortOrder;
    } else {
      orderBy.createdAt = "desc"; // Default
    }

    // Cursor-based pagination: fetch one extra row to determine if there is a next page
    const isCursorMode = Boolean(cursor);
    const fetchLimit = isCursorMode ? limit + 1 : limit;

    // Get total count for page-based pagination (skip when using cursor)
    const total = isCursorMode
      ? null
      : await prisma.inspection.count({ where });

    // Get inspections
    const inspections = await prisma.inspection.findMany({
      where,
      include: {
        environmentalData: true,
        moistureReadings: true,
        affectedAreas: true,
        scopeItems: true,
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        photos: true,
      },
      orderBy,
      ...(isCursorMode
        ? { cursor: { id: cursor! }, skip: 1, take: fetchLimit }
        : { skip, take: fetchLimit }),
    });

    // Determine next cursor
    let nextCursor: string | null = null;
    if (isCursorMode) {
      if (inspections.length > limit) {
        const lastItem = inspections[limit]; // the extra item
        nextCursor = lastItem.id;
        inspections.splice(limit); // remove extra item from results
      }
      return NextResponse.json({ inspections, nextCursor });
    }

    // Page-based mode: also expose nextCursor so clients can switch to "Load More"
    const pages = Math.ceil(total! / limit);
    if (page < pages && inspections.length > 0) {
      nextCursor = inspections[inspections.length - 1].id;
    }

    return NextResponse.json({
      inspections,
      nextCursor,
      pagination: {
        page,
        limit,
        total: total!,
        pages,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

// POST - Create new inspection
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: Idempotency-Key prevents duplicate inspections — a technician
  // on flaky mobile data who retries a submit shouldn't end up with two
  // inspections for the same job (causes invoice/scope chaos downstream).
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      // Validate required fields
      if (!body.propertyAddress || !body.propertyAddress.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Property address is required",
          status: 400,
        });
      }

      if (!body.propertyPostcode || !body.propertyPostcode.trim()) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Property postcode is required",
          status: 400,
        });
      }

      // RA-1120 — accept jurisdiction picker from the inspection form. Only
      // AU and NZ are valid; the schema default is "AU" so legacy callers
      // omitting the field keep working unchanged.
      const ALLOWED_COUNTRIES = ["AU", "NZ"] as const;
      type AllowedCountry = (typeof ALLOWED_COUNTRIES)[number];
      let propertyCountry: AllowedCountry | undefined;
      if (body.propertyCountry !== undefined && body.propertyCountry !== null) {
        if (
          typeof body.propertyCountry !== "string" ||
          !ALLOWED_COUNTRIES.includes(body.propertyCountry as AllowedCountry)
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message: "propertyCountry must be one of: AU, NZ",
            status: 400,
          });
        }
        propertyCountry = body.propertyCountry as AllowedCountry;
      }

      // RA-1029 P1 #7 — accept the IICRC claim type picked at inspection
      // start. Only the 4 IICRC-governed values are valid via this picker;
      // other ClaimType values (CARPET / HVAC / STORM / etc.) are stamped by
      // their dedicated assessment routes.
      const ALLOWED_PICKER_CLAIM_TYPES = [
        "WATER",
        "MOULD",
        "BIOHAZARD",
        "FIRE",
      ] as const;
      type PickerClaimType = (typeof ALLOWED_PICKER_CLAIM_TYPES)[number];
      let pickedClaimType: PickerClaimType | null = null;
      if (body.claimType !== undefined && body.claimType !== null) {
        if (
          typeof body.claimType !== "string" ||
          !ALLOWED_PICKER_CLAIM_TYPES.includes(
            body.claimType as PickerClaimType,
          )
        ) {
          return apiError(request, {
            code: "VALIDATION",
            message:
              "claimType must be one of WATER, MOULD, BIOHAZARD, FIRE (the IICRC-governed picker options)",
            status: 400,
          });
        }
        pickedClaimType = body.claimType as PickerClaimType;
      }

      // Validate reportId if provided
      if (body.reportId) {
        const report = await prisma.report.findUnique({
          where: { id: body.reportId },
          select: { id: true, userId: true },
        });

        if (!report) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Report not found",
            status: 404,
          });
        }

        // Verify the report belongs to the user
        if (report.userId !== userId) {
          return apiError(request, {
            code: "FORBIDDEN",
            message: "Unauthorized: Report does not belong to user",
            status: 403,
          });
        }
      }

      // Generate inspection number (NIR-YYYY-MM-XXXXXX format).
      // Previous implementation used Date.now() + Math.random() which collides under
      // concurrent requests in the same millisecond. randomBytes(3) gives 2^24 (16M)
      // unique values per month with no shared state or clock dependency.
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const sequence = randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
      const inspectionNumber = `NIR-${year}-${month}-${sequence}`;

      // Create inspection
      const inspection = await prisma.inspection.create({
        data: {
          inspectionNumber,
          propertyAddress: sanitizeString(body.propertyAddress, 500),
          propertyPostcode: sanitizeString(body.propertyPostcode, 20),
          ...(propertyCountry ? { propertyCountry } : {}),
          technicianName: body.technicianName
            ? sanitizeString(body.technicianName, 200)
            : null,
          ...(body.lossDescription &&
            ({
              lossDescription: sanitizeString(body.lossDescription, 2000),
            } as any)),
          ...(pickedClaimType ? { claimType: pickedClaimType } : {}),
          reportId: body.reportId || null, // Link to report if provided
          userId,
          status: "DRAFT",
        },
        include: {
          environmentalData: true,
          moistureReadings: true,
          affectedAreas: true,
          scopeItems: true,
        },
      });

      // Create audit log (optional - don't fail if this fails)
      try {
        await prisma.auditLog.create({
          data: {
            inspectionId: inspection.id,
            action: "Inspection created",
            entityType: "Inspection",
            entityId: inspection.id,
            userId,
            changes: JSON.stringify({
              propertyAddress: inspection.propertyAddress,
              propertyPostcode: inspection.propertyPostcode,
            }),
          },
        });
      } catch (auditError) {
        // Log but don't fail the request if audit log creation fails
        console.error("Error creating audit log (non-critical):", auditError);
      }

      return NextResponse.json({ inspection }, { status: 201 });
    } catch (error) {
      // RA-786: do not leak error.message / error.code to clients — fromException handles that.
      return fromException(request, error, { stage: "create" });
    }
  });
}
