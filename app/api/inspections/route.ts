import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { randomBytes } from "crypto";

// GET - Get inspections (optionally filtered by reportId, with pagination and search)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

      const where: any = {
        userId: session.user.id,
        reportId: { in: reportIds },
      };

      const total = await prisma.inspection.count({ where });
      const inspections = await prisma.inspection.findMany({
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
      });

      return NextResponse.json({
        inspections,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    }

    if (reportId) {
      // Note: reportId column doesn't exist, so find by property address instead
      // First get the report to find property address
      const report = await prisma.report.findUnique({
        where: { id: reportId },
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
            moistureReadings: true,
            affectedAreas: true,
            scopeItems: true,
            classifications: true,
            costEstimates: true,
            photos: true,
          },
          orderBy: { createdAt: "desc" },
        });

        if (inspection) {
          return NextResponse.json({ inspection });
        }
      }

      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
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
    const where: any = { userId: session.user.id };

    // Status filter — support "active" alias (not COMPLETED/REJECTED)
    if (status) {
      if (status === "active") {
        where.status = { notIn: ["COMPLETED", "REJECTED"] };
      } else {
        where.status = status.toUpperCase();
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
    const orderBy: any = {};
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
    console.error("Error fetching inspections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create new inspection
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.propertyAddress || !body.propertyAddress.trim()) {
      return NextResponse.json(
        { error: "Property address is required" },
        { status: 400 },
      );
    }

    if (!body.propertyPostcode || !body.propertyPostcode.trim()) {
      return NextResponse.json(
        { error: "Property postcode is required" },
        { status: 400 },
      );
    }

    // Validate reportId if provided
    if (body.reportId) {
      const report = await prisma.report.findUnique({
        where: { id: body.reportId },
        select: { id: true, userId: true },
      });

      if (!report) {
        return NextResponse.json(
          { error: "Report not found" },
          { status: 404 },
        );
      }

      // Verify the report belongs to the user
      if (report.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Unauthorized: Report does not belong to user" },
          { status: 403 },
        );
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
        technicianName: body.technicianName
          ? sanitizeString(body.technicianName, 200)
          : null,
        lossDescription: body.lossDescription
          ? sanitizeString(body.lossDescription, 2000)
          : null,
        reportId: body.reportId || null, // Link to report if provided
        userId: session.user.id,
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
          userId: session.user.id,
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
  } catch (error: any) {
    console.error("Error creating inspection:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });

    // Return more detailed error message for debugging
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message || "Failed to create inspection",
        code: error.code || "UNKNOWN_ERROR",
      },
      { status: 500 },
    );
  }
}
