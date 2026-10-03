import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InspectionStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getApiSession } from "@/lib/auth/get-api-session";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { randomBytes } from "crypto";
import {
  completeIdempotentSuccessInTransaction,
  getIdempotencyKey,
  withIdempotency,
} from "@/lib/idempotency";
import { isRecentlyIssuedCreationKey } from "@/lib/creation-attempt-key";
import { apiError, fromException } from "@/lib/api-errors";
import {
  assertReportLinkable,
  reportLinkableInTx,
  resolveInspectionReach,
} from "@/lib/auth/assert-tenancy";
import { parseInspectionDate } from "@/lib/parse-date";
import {
  enumEqualityOrIn,
  parseEnumList,
} from "@/lib/validation/parse-enum-list";

class ReportClientChangedError extends Error {}
class IdempotencyReservationLostError extends Error {}
class ReportReachLostError extends Error {}

// GET - Get inspections (optionally filtered by reportId, with pagination and search)
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession(request);

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

    if (searchParams.get("creationStatus") === "1") {
      const keyResult = getIdempotencyKey(request);
      if (!keyResult.ok || !keyResult.key) {
        return apiError(request, {
          code: "VALIDATION", message: "Valid inspection Idempotency-Key required", status: 400,
        });
      }
      const userId = session.user.id;
      const record = await prisma.idempotencyRecord.findUnique({
        where: { cacheKey: `idem:${userId}:${keyResult.key}` },
        select: { scope: true, key: true, status: true, responseStatus: true, responseBody: true, expiresAt: true },
      });
      if (!record || record.scope !== userId || record.key !== keyResult.key || record.expiresAt <= new Date()) {
        const retryable = (!record || (record.scope === userId && record.key === keyResult.key &&
          record.status === "PENDING" && record.expiresAt <= new Date())) &&
          isRecentlyIssuedCreationKey(keyResult.key, "nir-inspection");
        return NextResponse.json({ state: retryable
          ? "retryable_missing" : "missing" });
      }
      if (record.status !== "COMPLETE") return NextResponse.json({ state: "pending" });
      if (record.responseStatus !== 201 || !record.responseBody) {
        return NextResponse.json({ state: "rejected" });
      }
      let savedId: unknown;
      try {
        savedId = JSON.parse(record.responseBody)?.inspection?.id;
      } catch {
        return NextResponse.json({ state: "unconfirmed" });
      }
      if (typeof savedId !== "string" || !savedId) {
        return NextResponse.json({ state: "unconfirmed" });
      }
      // A report-linked job belongs to the report's owner, also when an ADMIN
      // created it, so find it within the caller's read reach, not their own rows.
      const savedReach = await resolveInspectionReach(session);
      if (!savedReach.ok) return NextResponse.json({ state: "unconfirmed" });
      const saved = await prisma.inspection.findFirst({
        where: {
          AND: [
            savedReach.data,
            {
              id: savedId,
              ...(reportId ? { reportId } : {}),
              ...(clientId ? { report: { is: { clientId } } } : {}),
            },
          ],
        },
        select: {
          id: true, claimType: true, propertyAddress: true,
          propertyPostcode: true, inspectionDate: true,
          lossDescription: true, technicianName: true,
        },
      });
      return NextResponse.json(saved
        ? { state: "complete", inspection: saved }
        : { state: "unconfirmed" });
    }

    if (clientId) {
      // Get pagination parameters
      const page = parseInt(searchParams.get("page") || "1");
      const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
      const skip = (page - 1) * limit;

      // Find all reportIds for this client
      const clientReports = await prisma.report.findMany({
        where: { clientId, userId: session.user.id },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 500,
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
      // A matching address is not a link: two reports may cover one property.
      // Same read reach as the list below: a report-linked job belongs to the
      // report's owner, so the ADMIN who linked it must find it again here,
      // or the form starts an empty draft over the owner's work.
      const reportReach = await resolveInspectionReach(session);
      if (!reportReach.ok) {
        return apiError(request, {
          code: "UNAUTHORIZED",
          message: reportReach.reason,
          status: reportReach.status,
        });
      }
      const inspection = await prisma.inspection.findFirst({
        where: { AND: [reportReach.data, { reportId }] },
        include: {
          environmentalData: {
            orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
          },
          moistureReadings: {
            include: { sketchRoom: { select: { id: true, name: true } } },
          },
          affectedAreas: true,
          scopeItems: true,
          classifications: true,
          costEstimates: true,
          photos: true,
        },
      });
      if (inspection) return NextResponse.json({ inspection });

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

    // Build where clause.
    //
    // RA-7582 / D-023: reach is the caller's organisation, not the caller.
    // This was `{ userId: session.user.id }`, which showed an invited
    // technician an empty product and hid their work from the owner.
    //
    // It is held in `AND` deliberately. The search filter below assigns
    // `where.OR = [...]`, so a tenancy clause placed directly on `OR` would be
    // erased by any search and this endpoint would answer with other tenants'
    // rows.
    const reach = await resolveInspectionReach(session);
    if (!reach.ok) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: reach.reason,
        status: reach.status,
      });
    }
    const where: Prisma.InspectionWhereInput = { ...reach.data };

    // RA-7711: Field Mode asks for the signed-in technician's jobs plus the
    // unassigned ones. ADMIN and MANAGER see every job in their tenant scope;
    // the role is read from the DB, not the JWT (RULES #3). The clause is
    // appended to AND, alongside tenancy, so the search filter's `where.OR`
    // assignment below cannot erase it.
    const fieldViewer =
      searchParams.get("assignee") === "me"
        ? await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true },
          })
        : null;
    if (
      searchParams.get("assignee") === "me" &&
      fieldViewer?.role !== "ADMIN" &&
      fieldViewer?.role !== "MANAGER"
    ) {
      const existingAnd = where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : [];
      where.AND = [
        ...existingAnd,
        {
          OR: [{ technicianId: session.user.id }, { technicianId: null }],
        },
      ];
    }

    // Status filter — support "active" alias (not COMPLETED/REJECTED).
    // RA-7567: Field Mode sends several statuses in one query value
    // (`DRAFT,SUBMITTED,…`). Split and validate so Prisma never sees the
    // joined string as a single InspectionStatus (that was a 500).
    if (status) {
      if (status === "active") {
        where.status = { notIn: ["COMPLETED", "REJECTED"] };
      } else {
        const parsed = parseEnumList(status, Object.values(InspectionStatus));
        if (!parsed.ok) {
          return apiError(request, {
            code: "VALIDATION",
            message: `Invalid status: ${parsed.invalid}`,
            status: 400,
          });
        }
        where.status = enumEqualityOrIn(parsed.values);
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

    // The native jobs screen needs only these scalar fields. A full inspection
    // graph belongs on the detail route; fetching it here makes one stale or
    // mismatched child relation prevent every job from appearing on mobile.
    if (searchParams.get("view") === "mobile") {
      const inspections = await prisma.inspection.findMany({
        where,
        select: {
          id: true,
          reportId: true,
          inspectionNumber: true,
          propertyAddress: true,
          propertyPostcode: true,
          inspectionDate: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy,
        ...(isCursorMode
          ? { cursor: { id: cursor! }, skip: 1, take: fetchLimit }
          : { skip, take: fetchLimit }),
      });
      const pages = total === null ? null : Math.ceil(total / limit);
      const hasMore = isCursorMode
        ? inspections.length > limit
        : pages !== null && page < pages;
      if (isCursorMode && hasMore) inspections.splice(limit);
      const nextCursor = hasMore && inspections.length > 0
        ? inspections[inspections.length - 1].id
        : null;
      return NextResponse.json({
        inspections,
        nextCursor,
        pagination: { page, limit, total, pages },
      });
    }

    // Get inspections
    const inspections = await prisma.inspection.findMany({
      where,
      include: {
        // RA-7744: a stable order, so the latest reading is well defined.
        environmentalData: {
          orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
        },
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
        // The cursor is the last item returned. The lookahead row must remain
        // eligible on the next page, whose query skips the cursor itself.
        const lastItem = inspections[limit - 1];
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
      // The wrapper has already validated this header before invoking us.
      const keyResult = getIdempotencyKey(request);
      const creationKey = keyResult.ok ? keyResult.key : null;
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

      if (
        (body.reportId !== undefined &&
          (typeof body.reportId !== "string" || !body.reportId.trim())) ||
        (body.clientId !== undefined &&
          (typeof body.clientId !== "string" || !body.clientId.trim()))
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "reportId and clientId must be non-empty strings",
          status: 400,
        });
      }
      if (body.clientId && !body.reportId && !request.headers.get("Idempotency-Key")) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Idempotency-Key is required for client-linked draft creation",
          status: 400,
        });
      }
      // A missing date means that nobody has recorded attendance yet. Do not
      // infer it from the creation timestamp or from an incident date.
      const inspectionDate = parseInspectionDate(body.inspectionDate);
      if (
        body.inspectionDate !== undefined &&
        body.inspectionDate !== null &&
        body.inspectionDate !== "" &&
        !inspectionDate
      ) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid inspectionDate",
          status: 400,
        });
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
          !ALLOWED_PICKER_CLAIM_TYPES.includes(body.claimType as PickerClaimType)
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

      const requestedClientId: string | null = body.clientId?.trim() ?? null;
      const client = requestedClientId
        ? await prisma.client.findFirst({
            where: { id: requestedClientId, userId },
            select: { id: true, name: true },
          })
        : null;
      if (requestedClientId && !client) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Client not found",
          status: 404,
        });
      }

      // Validate the actual owner and canonical client on an existing report.
      let needsClientLink = false;
      let reportOwnerId: string = userId;
      if (body.reportId) {
        const report = await prisma.report.findUnique({
          where: { id: body.reportId },
          select: {
            id: true,
            userId: true,
            clientId: true,
            propertyAddress: true,
            propertyPostcode: true,
          },
        });

        if (!report) {
          return apiError(request, {
            code: "NOT_FOUND",
            message: "Report not found",
            status: 404,
          });
        }

        // Report-link reach: the creator, or an ADMIN or MANAGER of the
        // creator's organisation (founder decision 02/10/2026, RA-7869). A USER
        // colleague can read the report but cannot create its job.
        const reach = await assertReportLinkable(session, report.id);
        if (!reach.ok) {
          return apiError(request, {
            code: reach.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
            message: reach.reason,
            status: reach.status,
          });
        }
        reportOwnerId = report.userId;
        if (requestedClientId && report.clientId && report.clientId !== requestedClientId) {
          return apiError(request, {
            code: "CONFLICT",
            message: "Report is not linked to the selected client",
            status: 409,
          });
        }
        needsClientLink = Boolean(requestedClientId && !report.clientId);
        // The client lookup above is caller-scoped, so linking would attach the
        // caller's client to a colleague's report. Refuse that with the reason
        // rather than letting the owner-scoped write fail as "client changed".
        if (needsClientLink && report.userId !== userId) {
          return apiError(request, {
            code: "CONFLICT",
            message: "Only the report's creator can set its client",
            status: 409,
          });
        }
        if (
          report.propertyAddress.trim().toLowerCase() !==
            body.propertyAddress.trim().toLowerCase() ||
          (report.propertyPostcode &&
            report.propertyPostcode.trim() !== body.propertyPostcode.trim())
        ) {
          return apiError(request, {
            code: "CONFLICT",
            message: "Inspection property does not match the report",
            status: 409,
          });
        }
        // Report-to-inspection is unique. An ordinary retry must return the
        // existing draft, not create a second job or change its evidence.
        const existing = await prisma.inspection.findUnique({
          where: { reportId: report.id },
          include: {
            environmentalData: true,
            moistureReadings: true,
            affectedAreas: true,
            scopeItems: true,
          },
        });
        if (existing) {
          if (existing.userId !== userId && existing.userId !== reportOwnerId) {
            return apiError(request, {
              code: "CONFLICT",
              message: "This report already has an inspection job",
              status: 409,
            });
          }
          if (needsClientLink) {
            const linked = await prisma.report.updateMany({
              where: { id: report.id, userId, clientId: null },
              data: { clientId: requestedClientId },
            });
            if (linked.count !== 1) {
              return apiError(request, {
                code: "CONFLICT",
                message: "Report client changed; reload before saving",
                status: 409,
              });
            }
          }
          return NextResponse.json({ inspection: existing });
        }
      }

      // Optional client linkage — create a shell Report so inspections appear
      // under the client's CRM history (Report.clientId is the join path).
      let reportId: string | null =
        typeof body.reportId === "string" ? body.reportId : null;
      if (!reportId && client) {
        if (!pickedClaimType) {
          return apiError(request, {
            code: "VALIDATION",
            message: "Select the known claim type before linking a client",
            status: 400,
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
      // Keep a new client report and its one linked job in the same commit.
      // A failed insert must not leave a duplicate shell Report behind.
      const inspection = await prisma.$transaction(async (tx) => {
        // Re-decide write reach under a lock on the caller's role: the
        // pre-check above ran outside this transaction.
        if (body.reportId && !(await reportLinkableInTx(tx, userId, body.reportId))) {
          throw new ReportReachLostError();
        }
        if (reportId && needsClientLink) {
          const linked = await tx.report.updateMany({
            where: { id: reportId, userId, clientId: null },
            data: { clientId: requestedClientId },
          });
          if (linked.count !== 1) throw new ReportClientChangedError();
        }
        if (client && !reportId) {
          const shell = await tx.report.create({
            data: {
              userId,
              clientId: client.id,
              clientName: client.name,
              title: `Inspection — ${sanitizeString(body.propertyAddress, 200)}`,
              propertyAddress: sanitizeString(body.propertyAddress, 500),
              propertyPostcode: sanitizeString(body.propertyPostcode, 20),
              description: body.lossDescription
                ? sanitizeString(body.lossDescription, 2000)
                : null,
              hazardType: pickedClaimType!,
              insuranceType: "UNKNOWN",
              status: "DRAFT",
            },
            select: { id: true },
          });
          reportId = shell.id;
        }
        const created = await tx.inspection.create({
          data: {
            inspectionNumber,
            propertyAddress: sanitizeString(body.propertyAddress, 500),
            propertyPostcode: sanitizeString(body.propertyPostcode, 20),
            inspectionDate,
            technicianName: body.technicianName
              ? sanitizeString(body.technicianName, 200)
              : null,
            lossDescription: body.lossDescription
              ? sanitizeString(body.lossDescription, 2000)
              : null,
            ...(pickedClaimType ? { claimType: pickedClaimType } : {}),
            reportId,
            // A job linked to a report belongs to the report's owner, also when
            // an ADMIN creates it; the ADMIN is recorded in the audit row.
            userId: reportOwnerId,
            status: "DRAFT",
          },
          include: {
            environmentalData: true,
            moistureReadings: true,
            affectedAreas: true,
            scopeItems: true,
          },
        });
        if (creationKey) {
          const completed = await completeIdempotentSuccessInTransaction({
            tx, scope: userId, key: creationKey, method: "POST",
            path: request.nextUrl.pathname, rawBody,
            responseBody: JSON.stringify({ inspection: created }),
            responseStatus: 201,
          });
          if (!completed) throw new IdempotencyReservationLostError();
        }
        return created;
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

      // Seed Stabilisation checklist rows (N/A) so submit isn't blocked by
      // the make-safe gate treating missing rows as incomplete.
      try {
        const { ensureMakeSafeSeeded } = await import(
          "@/lib/compliance/seed-make-safe"
        );
        await ensureMakeSafeSeeded(inspection.id);
      } catch (seedErr) {
        console.error("Error seeding make-safe rows (non-critical):", seedErr);
      }

      return NextResponse.json({ inspection }, {
        status: 201,
        ...(creationKey ? { headers: { "X-RestoreAssist-Idempotency-Completed-In-Transaction": "true" } } : {}),
      });
    } catch (error) {
      if (error instanceof IdempotencyReservationLostError) {
        const response = apiError(request, {
          code: "CONFLICT",
          message: "Inspection creation could not be verified; check its status before retrying",
          status: 409,
        });
        response.headers.set("X-RestoreAssist-Idempotency-Uncertain", "true");
        return response;
      }
      if (error instanceof ReportReachLostError) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Report not found",
          status: 404,
        });
      }
      if (error instanceof ReportClientChangedError) {
        return apiError(request, {
          code: "CONFLICT",
          message: "Report client changed; reload before saving",
          status: 409,
        });
      }
      // RA-786: do not leak error.message / error.code to clients — fromException handles that.
      return fromException(request, error, { stage: "create" });
    }
  }, { successCompletedInHandler: "when-marked" });
}
